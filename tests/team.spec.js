// Tier lists, what your players can pick, and how that drives suggestions, combos, filters and flex tags.
const {test,expect}=require("@playwright/test");
const {openApp,restart,player,myTeam,draft}=require("./helpers");

const team=()=>myTeam([
  player("TopGuy","T",["Aatrox","Gragas"],{unsure:["Malphite"],learn:["Gwen"]}),
  player("Jungler","J",["Lee Sin","Gragas"]),
  player("Mid","M",["Orianna"]),
  player("Bot","B",["Jinx"]),
  player("Supp","S",[],{champs:[{n:"Leona",g:20,wr:50,kda:2}]})
]);
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem("lolScouts"))[0].data);

test.describe("tier lists",()=>{
  test("tap modes move a champion between tier list, not confident and learning",async({page})=>{
    const errors=await openApp(page,{lolDr:{so:true},lolScouts:team()});
    await expect(page.locator("#tmode button")).toHaveText(["Tier list","Not confident","Learning"]);
    await page.click('[data-tmode="pool"]');
    await page.click('#tgrid [data-tpk="Darius"]');
    await expect(page.locator("#tmsg")).toHaveText("Darius added as #3.");
    await page.click('[data-tmode="unsure"]');
    await page.click('#tgrid [data-tpk="Aatrox"]');
    await expect(page.locator("#tmsg")).toHaveText("Aatrox moved from the tier list to not confident.");
    await page.click('[data-tmode="learn"]');
    await page.click('#tgrid [data-tpk="Gwen"]');
    await expect(page.locator("#tmsg")).toHaveText("Gwen taken out of learning.");
    const p=(await stored(page))[0];
    expect(p.pool).toEqual(["Gragas","Darius"]);
    expect(p.unsure).toEqual(["Malphite","Aatrox"]);
    expect(p.learn).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test("everything outside the tier list and not confident is greyed out as can't play",async({page})=>{
    await openApp(page,{lolDr:{so:true},lolScouts:team()});
    await expect(page.locator('#tgrid [data-tpk="Aatrox"]')).not.toHaveClass(/out/);
    await expect(page.locator('#tgrid [data-tpk="Malphite"]')).toHaveClass(/un/);
    await expect(page.locator('#tgrid [data-tpk="Gwen"]')).toHaveClass(/lr/);
    await expect(page.locator('#tgrid [data-tpk="Garen"]')).toHaveClass(/out/);
    await expect(page.locator("#tpe")).toContainText("can only pick tier list and not confident champions");
  });

  test("old can't play lists are ignored and dropped on the next change",async({page})=>{
    const t=team();t[0].data[0].cant=["Teemo"];
    await openApp(page,{lolDr:{so:true},lolScouts:t});
    await page.click('[data-tmode="pool"]');
    await page.click('#tgrid [data-tpk="Darius"]');
    expect((await stored(page))[0].cant).toBeUndefined();
  });

  test("flex in the tier lists means two or more players have the champion",async({page})=>{
    await openApp(page,{lolDr:{so:true},lolScouts:team()});
    await expect(page.locator('#tgrid [data-tpk="Gragas"] .fx')).toHaveCount(1);
    await expect(page.locator('#tgrid [data-tpk="Aatrox"] .fx')).toHaveCount(0);
    await expect(page.locator('#tgrid [data-tpk="Akali"] .fx')).toHaveCount(0);
  });
});

test.describe("suggestions",()=>{
  test("combos use tier list and not confident champions but not learning ones",async({page})=>{
    await openApp(page,{lolDr:{so:true},lolScouts:team(),lolRel:{syn:[["Malphite","Orianna"],["Malphite","Gwen"],["Gwen","Orianna"]],weak:[],strong:[]}});
    const card=page.locator('[data-k="sc-mine"]');
    await expect(card).toContainText("Malphite");
    await expect(card).toContainText("Not confident");
    await expect(card).toContainText("Tier #1");
    await expect(card).not.toContainText("Gwen");
  });

  test("best picks only offer champions your players can pick, with team flex",async({page})=>{
    await openApp(page,{lolDr:{lo:true},lolScouts:team()});
    const names=await page.locator("#an .sg.bp button > span").allTextContents();
    const allowed=["Aatrox","Gragas","Malphite","Lee Sin","Orianna","Jinx","Leona"];
    expect(names.length).toBeGreaterThan(0);
    for(const n of names)expect(allowed.some(a=>n.startsWith(a))).toBe(true);
    await expect(page.locator('#an .sg.bp button[data-addmine="Gragas"] .fx')).toHaveCount(1);
    await expect(page.locator('#an .sg.bp button[data-addmine="Gwen"]')).toHaveCount(0);
  });

  test("after the jungler locks in, Gragas is no longer a team flex",async({page})=>{
    await openApp(page,{lolDr:{lo:true},lolScouts:team(),lolDraft:draft({bp:["Lee Sin"]})});
    await expect(page.locator('#an .sg.bp button[data-addmine="Gragas"]')).toHaveCount(1);
    await expect(page.locator('#an .sg.bp button[data-addmine="Gragas"] .fx')).toHaveCount(0);
  });

  test("tapping a role in Your team limits best picks to that role, tapping again clears it",async({page})=>{
    await openApp(page,{lolDr:{lo:true},lolDraft:draft({bp:["Gragas"]})});
    await page.click('button.lu[data-sr="S"]');
    await expect(page.locator("#an h3").first()).toContainText("Best picks now for Support");
    const why=await page.locator("#an .sg.bp button em i:first-child").allTextContents();
    expect(why.length).toBeGreaterThan(0);
    for(const w of why)expect(w).toBe("fills support");
    await page.click('button.lu[data-sr="S"]');
    await expect(page.locator("#an h3").first()).toHaveText("Best picks now");
  });

  test("low damage champions count less and engage is split in main and follow-up",async({page})=>{
    await openApp(page,{lolDr:{lo:true},lolDraft:draft({bp:["Rell","Jinx","Orianna"]})});
    await expect(page.locator("#an .dm").first()).toHaveAttribute("aria-label","43% AD, 57% AP");
    const on=await page.locator("#an .tr").first().locator("span.y").allTextContents();
    expect(on).toContain("Main engage");
    expect(on).toContain("Follow-up engage");
  });

  test("only follow-up engage gets its own warning",async({page})=>{
    await openApp(page,{lolDr:{lo:true},lolDraft:draft({bp:["Orianna","Jinx","Ahri"]})});
    await expect(page.locator("#an")).toContainText("Only follow-up engage");
  });
});

test.describe("champion panel",()=>{
  test("type filters combine: AD matches any damage type chosen, tags must all match",async({page})=>{
    await openApp(page,{lolDr:{ro:true},lolCF:["e","A"]});
    const names=await page.locator("#grid .ch").evaluateAll(e=>e.map(x=>x.dataset.n));
    expect(names).toEqual(expect.arrayContaining(["Jarvan IV","Vi","Ornn"]));
    expect(names).not.toContain("Leona");
    expect(names).not.toContain("Jinx");
  });

  test("my team filter keeps champions your players can pick",async({page})=>{
    await openApp(page,{lolDr:{ro:true},lolCF:["my"],lolScouts:team()});
    const names=await page.locator("#grid .ch").evaluateAll(e=>e.map(x=>x.dataset.n));
    expect(names.sort()).toEqual(["Aatrox","Gragas","Jinx","Lee Sin","Leona","Malphite","Orianna"]);
  });

  test("the icons button is gone and the filter choice is remembered",async({page})=>{
    await openApp(page,{lolDr:{ro:true}});
    await expect(page.locator("#icons")).toHaveCount(0);
    if(await page.locator("#cffb").isVisible())await page.click("#cffb");
    await page.click('[data-cf="t"]');
    const again=await restart(page);
    await expect(again.locator('[data-cf="t"]')).toHaveAttribute("aria-pressed","true");
  });

  test("flex shows while a champion still fits two open roles",async({page})=>{
    await openApp(page,{lolDr:{ro:true},lolDraft:draft({bp:["Gragas","Jinx"]})});
    await expect(page.locator('#grid .ch[data-n="Akali"] .fx')).toHaveCount(1);
  });

  test("no flex once only one role is open",async({page})=>{
    await openApp(page,{lolDr:{ro:true},lolDraft:draft({bp:["Gragas","Jinx","Ahri","Leona"]})});
    await expect(page.locator('#grid .ch[data-n="Akali"]')).toBeVisible();
    await expect(page.locator("#grid .ch .fx")).toHaveCount(0);
  });
});
