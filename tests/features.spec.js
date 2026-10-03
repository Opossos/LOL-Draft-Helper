// Undo, lane matchups, Fearless series with saved games, the champion page, backup and restore, and the live draft.
const {test,expect}=require("@playwright/test");
const {openApp,restart,fakeDb,player,myTeam,draft}=require("./helpers");

const saved=(page,k)=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||"null"),k);
const pick=(page,n)=>page.locator(`#grid .ch[data-n="${n}"]`).click();
const game=(id,mine,foe,res,more={})=>({id,at:Date.parse("2026-09-0"+id.slice(-1)+"T18:00:00Z"),n:1,ser:"s1",me:"b",res,opp:"Foe Esports",st:{bp:mine,rp:foe,bb:[],rb:[]},...more});

test.describe("undo",()=>{
  test("takes back picks one by one, also with Ctrl+Z, and brings a cleared draft back",async({page})=>{
    const errors=await openApp(page,{lolDr:{ro:true}});
    await expect(page.locator("#undo")).toBeDisabled();
    await pick(page,"Zed");await pick(page,"Ahri");
    await page.click("#undo");
    expect((await saved(page,"lolDraft")).st).toMatchObject({bb:["Zed"],rb:[]});
    await page.keyboard.press("Control+z");
    expect((await saved(page,"lolDraft")).st.bb).toEqual([]);
    await expect(page.locator("#undo")).toBeDisabled();
    await pick(page,"Teemo");
    await page.click("#ro");
    await page.click("#reset");await page.click("#cfm-y");
    await expect(page.locator("#board .ban.f")).toHaveCount(0);
    await page.click("#undo");
    await expect(page.locator("#board .ban.f")).toHaveText(["Teemo"]);
    expect(errors).toEqual([]);
  });

  test("Ctrl+Z inside a text field is left to the field",async({page})=>{
    await openApp(page,{lolDraft:draft({bb:["Zed"]})});
    await page.click("#reset");await page.click("#cfm-y");
    await page.fill("#nsearch","abc");
    await page.press("#nsearch","Control+z");
    expect((await saved(page,"lolDraft")).st.bb).toEqual([]);
  });
});

test("each pick shows the enemy in its role and your note on that matchup",async({page})=>{
  await openApp(page,{lolRel:{syn:[],weak:[],strong:[["Darius","Garen"]]},lolDraft:draft({bp:["Darius","Jinx"],rp:["Garen","Ahri"]})});
  const blue=page.locator("#board .side.b .slot.f"),red=page.locator("#board .side.r .slot.f");
  await expect(blue.nth(0).locator("em.vs")).toHaveText("vs Garen · strong");
  await expect(blue.nth(0).locator("em.vs")).toHaveClass(/good/);
  await expect(red.nth(0).locator("em.vs")).toHaveText("vs Darius · weak");
  await expect(red.nth(0).locator("em.vs")).toHaveClass(/bad/);
  // nobody in the same role yet: no matchup line
  await expect(blue.nth(1).locator("em.vs")).toHaveCount(0);
});

test.describe("Fearless series and saved games",()=>{
  test("Next game saves the game, makes its picks Fearless bans and starts game 2",async({page})=>{
    const errors=await openApp(page,{lolDraft:draft({bp:["Aatrox","Lee Sin"],rp:["Garen"],bb:["Zed"]})});
    await page.click("#ngame");
    await expect(page.locator("#gdlg")).toBeVisible();
    await expect(page.locator("#gdt")).toHaveText("Save game 1");
    await page.fill("#gdo","Foe Esports");
    await page.locator("#gdlg button",{hasText:"Won"}).click();
    await expect(page.locator("#board .slot.f")).toHaveCount(0);
    await expect(page.locator("#gno")).toHaveText("Game 2");
    expect((await saved(page,"lolFear")).sort()).toEqual(["Aatrox","Garen","Lee Sin"]);
    const g=(await saved(page,"lolGames"))[0];
    expect(g).toMatchObject({n:1,res:"w",opp:"Foe Esports",me:"b",st:{bp:["Aatrox","Lee Sin"],rp:["Garen"],bb:["Zed"]}});
    await expect(page.locator("#lmsg")).toContainText("Game 1 saved");
    // undo brings the draft and the Fearless list of before back
    await page.click("#undo");
    await expect(page.locator("#board .slot.f")).toHaveCount(3);
    expect(await saved(page,"lolFear")).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("the opponent carries over and New series starts again",async({page})=>{
    await openApp(page,{lolDraft:draft({bp:["Aatrox"]})});
    await page.click("#ngame");await page.fill("#gdo","Foe Esports");
    await page.locator("#gdlg button",{hasText:"Lost"}).click();
    // an empty board is not saved
    await page.click("#ngame");
    await expect(page.locator("#lmsg")).toContainText("Pick champions first");
    await expect(page.locator("#gdlg")).toBeHidden();
    await page.click("[data-auto]");await page.click('#tg [data-t="bp"]');
    await page.click("#ro");await pick(page,"Zed");await page.click("#ro");
    await page.click("#ngame");
    await expect(page.locator("#gdt")).toHaveText("Save game 2");
    await expect(page.locator("#gdo")).toHaveValue("Foe Esports");
    await page.locator("#gdlg button",{hasText:"Cancel"}).click();
    await expect(page.locator("#gdlg")).toBeHidden();
    expect(await saved(page,"lolGames")).toHaveLength(1);
    await page.click("#nser");await page.click("#cfm-y");
    await expect(page.locator("#gno")).toHaveText("");
    expect(await saved(page,"lolFear")).toEqual([]);
  });

  test("saved games add up to records per pick, pair and enemy champion",async({page})=>{
    await openApp(page,{lolGames:[game("g1",["Aatrox","Lee Sin"],["Garen"],"w"),game("g2",["Aatrox","Lee Sin"],["Darius"],"w"),game("g3",["Aatrox"],["Garen"],"l")]});
    const card=page.locator("#gmc");
    await card.locator("> summary").click();
    await expect(page.locator("#gmcount")).toHaveText("3");
    await expect(card).toContainText("Record: 2W 1L");
    const row=t=>card.locator(".gst",{hasText:t});
    await expect(row("Aatrox").first()).toContainText("2W 1L");
    await expect(card.locator(".gst",{hasText:"Aatrox + Lee Sin"})).toContainText("2W 0L");
    // change a result and delete a game
    const g3=card.locator('details.gm[data-k="gm:g3"]');
    await g3.locator("> summary").click();
    await g3.locator("button",{hasText:"Won"}).click();
    await expect(card).toContainText("Record: 3W 0L");
    await card.locator("details.gm").first().locator("button",{hasText:"Delete"}).click();
    await page.click("#cfm-y");
    await expect(page.locator("#gmcount")).toHaveText("2");
  });

  test("Prime League games of a scouted team can be counted too",async({page})=>{
    const pl={id:"t1",name:"Our PL team",data:[],matches:[{id:"m1",games:[
      {w:true,ps:[{c:"Aatrox",row:1}],ops:[{c:"Garen",row:1}],bans:[],obans:[]},
      {w:false,ps:[{c:"Aatrox",row:1}],ops:[{c:"Darius",row:1}],bans:[],obans:[]}]}]};
    await openApp(page,{lolGames:[game("g1",["Aatrox"],["Garen"],"w")],lolScouts:[...myTeam([]),pl]});
    const card=page.locator("#gmc");
    await card.locator("> summary").click();
    await expect(card).toContainText("Record: 1W 0L");
    await card.locator("#gpl").selectOption("t1");
    await expect(card).toContainText("Record: 2W 1L");
    await card.locator('[data-gf="pl"]').click();
    await expect(card).toContainText("Record: 1W 1L");
    await expect(card.locator("details.gm")).toHaveCount(0);
  });
});

test.describe("champion page",()=>{
  test("shows notes, your players and scouted players, and its buttons act on the draft",async({page})=>{
    const enemy={id:"e1",name:"Foe Esports",data:[{id:"x",name:"FoeMid",role:"M",active:true,champs:[{n:"Ahri",g:30,wr:60,kda:3}]}]};
    await openApp(page,{lolDr:{ro:true},lolRel:{syn:[["Ahri","Lee Sin"]],weak:[["Ahri","Kassadin"]],strong:[]},
      lolScouts:[...myTeam([player("Mid","M",["Orianna","Ahri"])]),enemy]});
    await page.locator('#grid .ch[data-n="Ahri"]').click({button:"right"});
    await page.locator('#cm [data-m="page"]').click();
    const d=page.locator("#chp");
    await expect(d).toBeVisible();
    await expect(d.locator(".cn")).toHaveText("Ahri");
    await expect(d).toContainText("Tier list #2");
    await expect(d).toContainText("FoeMid");
    await expect(d.locator('[data-chp="Kassadin"]')).toBeVisible();
    // a note opens that champion's page
    await d.locator('[data-chp="Lee Sin"]').click();
    await expect(d.locator(".cn")).toHaveText("Lee Sin");
    await d.locator('[data-ban="Lee Sin"]').click();
    await expect(d).toBeHidden();
    expect((await saved(page,"lolDraft")).st.bb).toEqual(["Lee Sin"]);
  });

  test("picked champions on the board open their page from the menu",async({page})=>{
    await openApp(page,{lolDraft:draft({bp:["Jinx"]})});
    await page.locator("#board .slot.f").first().click({button:"right"});
    await expect(page.locator("#cm button")).toHaveText(["Champion page"]);
    await page.locator('#cm [data-m="page"]').click();
    await expect(page.locator("#chp .cn")).toHaveText("Jinx");
    await expect(page.locator("#chp")).toContainText("Picked by blue");
    await page.locator("#chp button",{hasText:"Close"}).click();
    // the pick is still there
    await expect(page.locator("#board .slot.f")).toHaveCount(1);
  });
});

test.describe("backup",()=>{
  const all={lolRel:{syn:[["Orianna","Malphite"]],weak:[],strong:[]},lolChamps:{Rell:{r:["S"],d:"P",t:"tecf"}},
    lolScouts:myTeam([player("TopGuy","T",["Aatrox"])]),lolGames:[game("g1",["Aatrox"],["Garen"],"w")],lolFear:["Zed"],lolDraft:draft({bp:["Jinx"]})};

  test("the download holds notes, champion edits, teams, games and the draft",async({page})=>{
    await openApp(page,all);
    await page.locator("#bkc > summary").click();
    const [dl]=await Promise.all([page.waitForEvent("download"),page.click("#bkdl")]);
    expect(dl.suggestedFilename()).toMatch(/^draft-helper-backup-\d{4}-\d\d-\d\d\.json$/);
    const o=JSON.parse(require("fs").readFileSync(await dl.path(),"utf8"));
    expect(o.app).toBe("lol-draft-helper");
    expect(o.notes.syn).toEqual([["Orianna","Malphite"]]);
    expect(o.champs.Rell.t).toBe("tecf");
    expect(o.teams.find(t=>t.id==="my-team").data[0].pool).toEqual(["Aatrox"]);
    expect(o.games.map(g=>g.id)).toEqual(["g1"]);
    expect(o.fear).toEqual(["Zed"]);
    expect(o.draft.st.bp).toEqual(["Jinx"]);
  });

  test("restoring the text on an empty device brings everything back",async({page,browser})=>{
    await openApp(page,all);
    await page.locator("#bkc > summary").click();
    await page.click("#bkcp");
    const text=await page.locator("#bkt").inputValue();
    const other=await browser.newContext(),empty=await other.newPage();
    await openApp(empty);
    await empty.locator("#bkc > summary").click();
    await empty.locator("#bkt").fill(text);
    await empty.click("#bkrs");
    await expect(empty.locator("#cfm-t")).toContainText("1 notes, 1 teams, 1 champion edits, 1 saved games, the draft");
    await empty.click("#cfm-y");
    await expect(empty.locator("#bkmsg")).toHaveText("Restored: 1 new notes, 1 teams, 1 games.");
    expect((await saved(empty,"lolRel")).syn).toEqual([["Orianna","Malphite"]]);
    expect((await saved(empty,"lolChamps")).Rell.t).toBe("tecf");
    expect((await saved(empty,"lolScouts"))[0].data[0].pool).toEqual(["Aatrox"]);
    expect((await saved(empty,"lolGames"))[0].id).toBe("g1");
    expect(await saved(empty,"lolFear")).toEqual(["Zed"]);
    await expect(empty.locator("#board .side.b .slot.f")).toHaveCount(1);
    // and it is still there after a restart
    const again=await restart(empty);
    await expect(again.locator("#gmcount")).toHaveText("1");
    await other.close();
  });

  test("an old notes backup works and anything else is refused",async({page})=>{
    await openApp(page);
    await page.locator("#bkc > summary").click();
    await page.locator("#bkt").fill('{"some":"thing"}');
    await page.click("#bkrs");
    await expect(page.locator("#bkmsg")).toHaveText("That is not a backup of this app.");
    await page.locator("#bkt").fill(JSON.stringify({syn:[["Lux","Zed"]],weak:[],strong:[]}));
    await page.click("#bkrs");await page.click("#cfm-y");
    await expect(page.locator("#bkmsg")).toContainText("1 new notes");
  });
});

test.describe("live draft",()=>{
  test("without the shared database it explains why it can't start",async({page})=>{
    await openApp(page);
    await page.click("#live");
    await expect(page.locator("#lmsg")).toHaveText("Live draft needs the shared database, which is not reachable right now.");
    await expect(page.locator("#live")).toHaveAttribute("aria-pressed","false");
  });

  test("two devices with Live on see each other's picks",async({browser})=>{
    const db=fakeDb();
    const ctxA=await browser.newContext(),ctxB=await browser.newContext();
    const a=await ctxA.newPage(),b=await ctxB.newPage();
    await openApp(a,{lolDr:{ro:true}},{db});
    await a.click("#live");
    await expect(a.locator("#lmsg")).toContainText("your draft is now shared");
    await pick(a,"Zed");
    await expect.poll(()=>db.rows.get("live:draft")?.data[0].live.st.bb).toEqual(["Zed"]);
    // the second device joins and takes over the shared draft
    await openApp(b,{lolDr:{ro:true}},{db});
    await b.click("#live");
    await expect(b.locator("#lmsg")).toContainText("you joined");
    await expect(b.locator("#board .side.b .ban.f")).toHaveText(["Zed"]);
    await pick(b,"Ahri");
    await expect(a.locator("#board .side.r .ban.f")).toHaveText(["Ahri"],{timeout:8000});
    // undo on one device reaches the other one too
    await a.click("#ro");await a.click("#undo");
    await expect(b.locator("#board .side.r .ban.f")).toHaveCount(0,{timeout:8000});
    // saved games and the live draft are not teams
    await b.click("#so");
    await expect(b.locator("#tbar")).not.toContainText("Live draft");
    await ctxA.close();await ctxB.close();
  });

  test("a saved game goes to the shared database",async({page})=>{
    const db=fakeDb();
    await openApp(page,{lolDraft:draft({bp:["Aatrox"]})},{db});
    await page.click("#ngame");
    await page.locator("#gdlg button",{hasText:"Won"}).click();
    await expect(page.locator("#lmsg")).toContainText("saved for everyone");
    const row=[...db.rows.values()].find(r=>r.id.startsWith("game:"));
    expect(row.data[0].game.st.bp).toEqual(["Aatrox"]);
    expect(await saved(page,"lolGames")).toEqual([]);
  });
});

test.describe("default notes",()=>{
  const sw=(page,k)=>page.locator(`[data-dng="${k}"]`);

  test("there are default counters for (almost) every champion",async({page})=>{
    await openApp(page);
    await page.locator("#dnc > summary").click();
    const [on,total]=(await page.locator("#dncount").textContent()).match(/\d+/g).map(Number);
    expect(on).toBe(total);
    expect(total).toBeGreaterThan(400);
    // a champion that had none before
    await page.fill("#dnq","Aatrox");
    await expect(page.locator("#dnl")).toContainText("Fiora is strong against Aatrox");
  });

  test("whole kinds of default notes switch off and on and stay that way",async({page,context})=>{
    const db=fakeDb();
    await openApp(page,{},{db});
    await page.locator("#dnc > summary").click();
    await expect(sw(page,"k")).toHaveText("On");
    await sw(page,"k").click();
    await expect(sw(page,"k")).toHaveText("Off");
    await expect(sw(page,"p")).toHaveText("On");
    const off=[...db.tables.notes.values()].filter(r=>r.t==="off").map(r=>r.a);
    expect(off.every(id=>id.startsWith("k-"))).toBe(true);
    expect(off.length).toBeGreaterThan(300);
    // combos and pairs off together, so pairs are off too
    await sw(page,"tp").click();
    await expect(sw(page,"tp")).toHaveText("Off");
    await expect(sw(page,"p")).toHaveText("Off");
    await expect(page.locator("#dncount")).toHaveText(/^0 of/);
    // pairs back on: combos and pairs are partly on
    await sw(page,"p").click();
    await expect(sw(page,"p")).toHaveText("On");
    await expect(page.locator("#dng .dn").nth(2)).toContainText(/\d+ of \d+ on/);
    // the switches are shared: someone else opening the site sees them the same way
    const again=await context.newPage();
    await openApp(again,{},{db});
    await again.locator("#dnc > summary").click();
    await expect(sw(again,"k")).toHaveText("Off");
    await expect(sw(again,"p")).toHaveText("On");
  });

  test("with default counters off, counter picks come only from your own notes",async({page})=>{
    const db=fakeDb();
    db.tables.notes.set("strong:Fiora:Malphite",{id:"strong:Fiora:Malphite",t:"strong",a:"Fiora",b:"Malphite"});
    await openApp(page,{lolDraft:draft({rp:["Malphite"]})},{db});
    await page.locator("#dnc > summary").click();
    await page.click("#lo");
    const card=page.locator('#an details[data-k="counters"]');
    await expect(card).toContainText("Vel'Koz");
    await expect(card).toContainText("Fiora");
    await page.click("#lo");
    await sw(page,"k").click();
    await page.click("#lo");
    await expect(card).not.toContainText("Vel'Koz");
    await expect(card).toContainText("Fiora");
  });
});
