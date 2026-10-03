// Prime League: the bookmark collects pages on (made-up) primeleague.gg pages, the app imports the paste.
const {test,expect}=require("@playwright/test");
const {openApp,fakeDb}=require("./helpers");
const PL=require("./fixtures/primeleague");

// serve the made-up site and remember which pages the bookmark asked for
async function serveSite(context){
  const pages=PL.site(),asked=[];
  await context.route(/^https:\/\/www\.primeleague\.gg\//,r=>{
    const u=r.request().url().split("#")[0];asked.push(u);
    return pages[u]?r.fulfill({status:200,contentType:"text/html",body:pages[u]}):r.fulfill({status:404,body:"not found"});
  });
  return asked;
}

// the bookmark's code, taken from the app exactly as the user drags it to the bookmarks bar
async function bookmarkCode(context){
  const app=await context.newPage();
  await openApp(app);
  const href=await app.locator("#plbm").getAttribute("href");
  await app.close();
  return decodeURIComponent(href.slice("javascript:".length));
}

// runs the bookmark on a team page and returns the copied paste
async function runBookmark(context,start){
  const code=await bookmarkCode(context);
  const pl=await context.newPage();
  await pl.goto(start);
  await pl.evaluate(c=>{(0,eval)(c)},code);
  await expect(pl.getByRole("button",{name:"Copy"})).toBeVisible({timeout:20000});
  const msg=await pl.locator("div:has(> button)").last().textContent();
  await pl.getByRole("button",{name:"Copy"}).click();
  const data=await pl.evaluate(()=>navigator.clipboard.readText());
  await pl.close();
  return{data,msg};
}

async function importPaste(page,data){
  await page.click('[data-stab="scout"]');
  await page.evaluate(s=>{document.getElementById("plimp").open=true;const e=document.getElementById("plsrc");e.value=s;e.dispatchEvent(new Event("input"))},data);
  await expect(page.locator("#plprev")).toContainText("played matches");
  const preview=await page.locator("#plprev").textContent();
  await page.click("#plgb");
  await expect(page.locator("#scmsg")).toContainText("Updated Test Team");
  return preview;
}
const scouted=page=>page.evaluate(()=>JSON.parse(localStorage.getItem("lolScouts")).find(t=>t.id!=="my-team"));

test.describe("bookmark and import",()=>{
  test.beforeEach(async({context})=>{
    await context.grantPermissions(["clipboard-read","clipboard-write"],{origin:"https://www.primeleague.gg"});
  });

  test("started on the fall page it skips the cup and finds the played spring matches",async({context})=>{
    const asked=await serveSite(context);
    const {data,msg}=await runBookmark(context,PL.teamUrl(PL.SPLITS.fall));
    expect(msg).toContain("2 played matches");
    expect(asked.some(u=>u.includes("/kanji/"))).toBe(false);
    const b=JSON.parse(data);
    expect(b.plbundle).toBe(1);
    const urls=b.pages.map(p=>p.u);
    expect(urls).toContain(PL.matchUrl("900001"));
    expect(urls).toContain(PL.matchUrl("900002")); // score behind spoiler markup still counts
    expect(urls).not.toContain(PL.matchUrl("900003")); // no score: not played
  });

  test("the paste imports players, their split champions and both matches with sides",async({context,page})=>{
    await serveSite(context);
    const {data}=await runBookmark(context,PL.teamUrl(PL.SPLITS.spring));
    await openApp(page,{lolDr:{so:true}});
    const preview=await importPaste(page,data);
    expect(preview).toContain("3 players");
    const t=await scouted(page);
    expect(t.name).toBe("Test Team");
    const alpha=t.data.find(p=>p.name==="Alpha#EUW");
    expect(alpha.pls["3220"].c.map(c=>c.n)).toContain("Aatrox");
    const ms=t.matches.filter(m=>!m.stub).sort((a,b)=>a.id.localeCompare(b.id));
    expect(ms.map(m=>m.id)).toEqual(["900001","900002"]);
    expect(ms[0].games.map(g=>g.side)).toEqual(["b","r"]);
    expect(ms[0].games[0].ps.map(p=>p.c)).toContain("Aatrox");
    expect(ms[0].games[0].ops.map(p=>p.c)).toContain("Renekton");
    expect(ms[1].games[0].side).toBe("b"); // we were the right-hand team in this match
  });

  test("a role with one player makes them active, a role with two or more leaves all on the bench",async({context,page})=>{
    await serveSite(context);
    const {data}=await runBookmark(context,PL.teamUrl(PL.SPLITS.spring));
    // the team is already known with a second top laner
    const known={id:"t1",name:"Test Team",pl:PL.generalUrl,matches:[],data:[{id:"s",name:"Sub#EUW",region:"euw",role:"T",champs:[],active:true}]};
    await openApp(page,{lolDr:{so:true},lolScouts:[{id:"my-team",name:"My team",data:[]},known]});
    await importPaste(page,data);
    const t=await scouted(page),by=n=>t.data.find(p=>p.name===n);
    expect(by("Alpha#EUW")).toMatchObject({role:"T",active:false});
    expect(by("Sub#EUW")).toMatchObject({role:"T",active:false});
    expect(by("Beta#EUW")).toMatchObject({role:"J",active:true});
    expect(by("Gamma#EUW")).toMatchObject({role:"M",active:true});
    expect(t.data.filter(p=>p.former).every(p=>!p.active)).toBe(true);
    const card=n=>page.locator("#scp details.pc",{hasText:n}).locator(".pn");
    await expect(card("Alpha#EUW")).toContainText("Bench");
    await expect(card("Beta#EUW")).toContainText("Active");
    // you pick the top laner
    await page.locator("#scp details.pc",{hasText:"Alpha#EUW"}).locator("[data-pact]").click();
    await expect(card("Alpha#EUW")).toContainText("Active");
  });

  test("with nobody marked active, every player shows as not active",async({page})=>{
    const t={id:"t1",name:"Foe",matches:[],data:[{id:"a",name:"A#EUW",region:"euw",role:"T",champs:[],active:false},{id:"b",name:"B#EUW",region:"euw",role:"J",champs:[],active:false}]};
    await openApp(page,{lolDr:{so:true,eo:true},lolScouts:[{id:"my-team",name:"My team",data:[]},t]});
    await page.click('[data-stab="scout"]');
    const tags=page.locator("#scp details.pc .pn .tag",{hasText:/^(Active|Bench)$/});
    await expect(tags).toHaveText(["Bench","Bench"]);
    await expect(page.locator("#sclu .lu.none")).toHaveCount(5);
    await page.click("#eb");
    await expect(page.locator("#en")).toContainText("Nobody in Foe is marked active yet");
  });

  test("the import reads each player's solo queue rank and shows it on their card",async({context,page})=>{
    await serveSite(context);
    const {data}=await runBookmark(context,PL.teamUrl(PL.SPLITS.spring));
    const db=fakeDb({ranks:{"Alpha#EUW":{tier:"GRANDMASTER",div:"I",lp:2000,w:120,l:90},"Beta#EUW":{tier:"DIAMOND",div:"II",lp:45,w:30,l:20}}});
    await openApp(page,{lolDr:{so:true}},{db});
    await importPaste(page,data);
    await expect(page.locator("#scmsg")).toContainText("Ranks read for 3 players");
    const card=n=>page.locator("#scp details.pc",{hasText:n});
    await expect(card("Alpha#EUW").locator(".tag.rk")).toHaveText("Grandmaster · 2000 LP");
    await expect(card("Beta#EUW").locator(".tag.rk")).toHaveText("Diamond II · 45 LP");
    await expect(card("Gamma#EUW").locator(".tag.rk")).toHaveText("Unranked");
    // saved with the team, and former players are not asked for
    const t=[...db.rows.values()].find(r=>r.name==="Test Team");
    expect(t.data.find(p=>p.name==="Alpha#EUW").rank).toMatchObject({tier:"GRANDMASTER",lp:2000,w:120});
    expect(t.data.filter(p=>p.former).every(p=>!p.rank)).toBe(true);
  });

  test("after Riot's rate limit the rank import waits and reads the rest",async({context,page})=>{
    await serveSite(context);
    const {data}=await runBookmark(context,PL.teamUrl(PL.SPLITS.spring));
    const db=fakeDb({limitOnce:true,ranks:{"Alpha#EUW":{tier:"GOLD",div:"IV",lp:10},"Beta#EUW":{tier:"SILVER",div:"I",lp:90},"Gamma#EUW":{tier:"BRONZE",div:"II",lp:0}}});
    await openApp(page,{lolDr:{so:true}},{db});
    await importPaste(page,data);
    await expect(page.locator("#scmsg")).toContainText("Ranks read for 3 players.",{timeout:10000});
    await expect(page.locator("#scp .tag.rk")).toHaveCount(3);
  });

  test("players without a rank are named, and Update ranks reads them again",async({context,page})=>{
    await serveSite(context);
    const {data}=await runBookmark(context,PL.teamUrl(PL.SPLITS.spring));
    const ranks={"Alpha#EUW":{tier:"GOLD",div:"IV",lp:10},"Beta#EUW":{tier:"SILVER",div:"I",lp:90},"Gamma#EUW":{error:"not found"}};
    const db=fakeDb({ranks});
    await openApp(page,{lolDr:{so:true}},{db});
    await importPaste(page,data);
    await expect(page.locator("#scmsg")).toContainText("Ranks read for 2 players. No rank for Gamma#EUW (Riot ID not found).");
    // Gamma fixed their Riot ID, Alpha climbed
    ranks["Gamma#EUW"]={tier:"PLATINUM",div:"III",lp:5};ranks["Alpha#EUW"]={tier:"GOLD",div:"III",lp:20};
    await page.click("#rkup");
    await expect(page.locator("#scmsg")).toHaveText("Ranks read for 3 players.");
    await expect(page.locator("#scp details.pc",{hasText:"Gamma#EUW"}).locator(".tag.rk")).toHaveText("Platinum III · 5 LP");
    await expect(page.locator("#scp details.pc",{hasText:"Alpha#EUW"}).locator(".tag.rk")).toHaveText("Gold III · 20 LP");
  });

  test("without the riot-rank function the import still works and says why ranks are missing",async({context,page})=>{
    await serveSite(context);
    const {data}=await runBookmark(context,PL.teamUrl(PL.SPLITS.spring));
    await openApp(page,{lolDr:{so:true}},{db:fakeDb()});
    await importPaste(page,data);
    await expect(page.locator("#scmsg")).toContainText("the riot-rank function is not deployed");
    await expect(page.locator("#scp .tag.rk")).toHaveCount(0);
  });

  test("matches show sides, enemy and ban icons, and splits fold",async({context,page})=>{
    await serveSite(context);
    const {data}=await runBookmark(context,PL.teamUrl(PL.SPLITS.spring));
    await openApp(page,{lolDr:{so:true}});
    await importPaste(page,data);
    const card=page.locator('[data-k="sc-pl"]');
    const split=card.locator("details.plsp").first();
    await expect(split.locator("> summary")).toContainText("Spring '25/26");
    await expect(split).toHaveAttribute("open","");
    const match=split.locator("details.plmi").first();
    await expect(match.locator(".plsides .plside")).toHaveCount(2);
    await match.locator("> summary").click();
    await expect(match.locator(".plgh .plside").first()).toHaveText(/Blue side|Red side/);
    await expect(match.locator(".plvs").first()).toContainText("vs");
    // icon images are blocked in tests, so check the ban entries rather than their size
    await expect(match.locator('.plbi [title="Zed"]').first()).toBeAttached();
    await expect(match.locator('.plbi [title="Jinx"]').first()).toBeAttached();
    await split.locator("> summary").click();
    await expect(split).not.toHaveAttribute("open","");
  });
});

test("an old paste without match pages explains how to get them",async({page})=>{
  const pages=PL.site();
  const only=[PL.teamUrl(PL.SPLITS.spring),PL.generalUrl];
  const data=JSON.stringify({plbundle:1,team:PL.teamUrl(PL.SPLITS.spring),pages:only.map(u=>({u,h:pages[u]}))});
  await openApp(page,{lolDr:{so:true}});
  await importPaste(page,data);
  await expect(page.locator("#scmsg")).toContainText("2 played matches were not in the paste");
});

test.describe("your own team",()=>{
  test.beforeEach(async({context})=>{
    await context.grantPermissions(["clipboard-read","clipboard-write"],{origin:"https://www.primeleague.gg"});
  });

  test("the bookmark paste imports into My team: matches, splits, players found by name",async({context,page})=>{
    await serveSite(context);
    const {data}=await runBookmark(context,PL.teamUrl(PL.SPLITS.spring));
    const mine=[{id:"a",name:"Alpha",region:"euw",role:"T",champs:[{n:"Garen",g:12,wr:58,kda:2.4}],active:true,pool:["Aatrox"]},
                {id:"b",name:"Bee",riot:"Beta#EUW",region:"euw",role:"J",champs:[],active:true,pool:["Lee Sin"]}];
    await openApp(page,{lolDr:{so:true},lolScouts:[{id:"my-team",name:"My team",data:mine}]});
    await expect(page.locator('[data-stab="my"]')).toHaveAttribute("aria-pressed","true");
    await expect(page.locator("#tth")).toHaveText("Your team on Prime League");
    await expect(page.locator("#tbar")).toBeHidden();
    await page.evaluate(s=>{document.getElementById("plimp").open=true;const e=document.getElementById("plsrc");e.value=s;e.dispatchEvent(new Event("input"))},data);
    await expect(page.locator("#plgb")).toHaveText("Import into your team");
    await page.click("#plgb");
    await expect(page.locator("#scmsg")).toContainText("Updated My team");
    const teams=await page.evaluate(()=>JSON.parse(localStorage.getItem("lolScouts")));
    expect(teams.map(t=>t.id)).toEqual(["my-team"]); // no scouted team was made
    const my=teams[0];
    expect(my.matches.filter(m=>!m.stub).map(m=>m.id).sort()).toEqual(["900001","900002"]);
    const alpha=my.data.find(p=>p.id==="a");
    expect(alpha.riot).toBe("Alpha#EUW");          // matched by name and given the Riot ID
    expect(alpha.pool).toEqual(["Aatrox"]);        // tier list kept
    expect(alpha.pls["3220"].c.map(c=>c.n)).toContain("Aatrox");
    const gamma=my.data.find(p=>p.riot==="Gamma#EUW");
    // the only mid player in the team plays; Delta and Echo only played before (former) and stay on the bench
    expect(gamma).toMatchObject({name:"Gamma",role:"M",active:true,pool:[]});
    expect(my.data.filter(p=>p.former).every(p=>!p.active)).toBe(true);
    expect(alpha.active).toBe(true);
    // the match list shows in My team
    await expect(page.locator('#scpl [data-k="sc-pl"]')).toBeVisible();
    // and each player's card shows their Prime League champions
    const card=page.locator('#scp details.pc[data-k="sp:a"]');
    await expect(card.locator("details.psec").first().locator("> summary")).toContainText("Prime League");
    await expect(card.locator(".plt").first()).toContainText("Aatrox");
    // like scouted players: Prime League above, Ranked below
    await expect(card.locator("details.psec > summary")).toHaveText([/^Prime League/,/^Ranked/]);
    await expect(card.locator('details.psec[data-k="prk:a"]')).toContainText("Garen");
    // saved games can count your team's Prime League games
    await page.click("#so");
    await page.locator("#gmc > summary").click();
    await page.locator("#gpl").selectOption("my-team");
    await expect(page.locator("#gpl option:checked")).toHaveText("Your team");
    await expect(page.locator("#gmc")).toContainText("Record: 3W 1L");
    // the champion page shows your team's record with a champion
    await page.locator('[data-chp="Aatrox"]').first().click();
    await expect(page.locator("#chp")).toContainText("Your team in Prime League");
    await expect(page.locator("#chp")).toContainText("Played: 3W 0L");
  });
});
