// Draft board, champion menu, notes, champion editor, consider list and remembered open sections.
const {test,expect}=require("@playwright/test");
const {openApp,restart}=require("./helpers");

test("loads without errors and without sideways scrolling",async({page})=>{
  const errors=await openApp(page);
  await expect(page.locator("#board")).toContainText("Blue team");
  const w=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  expect(w).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("a full draft follows the pick and ban order, clear draft empties it",async({page})=>{
  const errors=await openApp(page);
  await page.click("#ro");
  // order: 6 bans, 6 picks, 4 bans, 4 picks
  const names=["Zed","Ahri","Yasuo","Vayne","Teemo","Darius","Lee Sin","Viego","Orianna","Syndra","Jinx","Caitlyn","Kai'Sa","Ezreal","Lux","Morgana","Thresh","Nautilus","Garen","Leona"];
  for(const n of names)await page.locator(`#grid .ch[data-n="${n}"]`).click();
  const st=await page.evaluate(()=>JSON.parse(localStorage.getItem("lolDraft")).st);
  expect(st.bb).toEqual(["Zed","Yasuo","Teemo","Ezreal","Morgana"]);
  expect(st.rb).toEqual(["Ahri","Vayne","Darius","Kai'Sa","Lux"]);
  expect(st.bp).toEqual(["Lee Sin","Syndra","Jinx","Nautilus","Garen"]);
  expect(st.rp).toEqual(["Viego","Orianna","Caitlyn","Thresh","Leona"]);
  await page.click("#ro");
  await page.click("#reset");
  await page.click("#cfm-y");
  await expect(page.locator("#board .slot.f")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the champion menu opens every time and marks ban candidates",async({page})=>{
  await openApp(page,{lolDr:{ro:true}});
  for(const n of ["Ahri","Zed","Teemo"]){
    await page.locator(`#grid .ch[data-n="${n}"]`).click({button:"right"});
    await expect(page.locator("#cm")).toBeVisible();
    await page.locator('#cm [data-m="ban"]').click();
    await expect(page.locator("#cm")).toBeHidden();
  }
  const mk=await page.evaluate(()=>JSON.parse(localStorage.getItem("lolDraft")).mk);
  expect(mk.ban).toEqual(["Ahri","Zed","Teemo"]);
});

test("a pairs note can be saved; the champion list closes after a choice",async({page})=>{
  await openApp(page);
  await page.click('[data-nty="syn"]');
  await page.fill("#na","Orianna");await page.press("#na","Enter");
  await page.fill("#nb","Malphite");await page.press("#nb","Enter");
  // the list must not stay open over the Save button
  await expect(page.locator("#nb ~ .cbl")).toBeHidden();
  await page.click("#nadd");
  await expect(page.locator("#nmsg")).toHaveText("1 notes saved.");
  const rel=await page.evaluate(()=>JSON.parse(localStorage.getItem("lolRel")));
  expect(rel.syn).toEqual([["Orianna","Malphite"]]);
  const again=await restart(page);
  await expect(again.locator("#nlist")).toContainText("Malphite");
});

test("champion editor keeps the first tick after choosing a champion",async({page})=>{
  await openApp(page);
  await page.locator('summary:has-text("Edit champion data")').click();
  await page.fill("#ec","Rell");await page.press("#ec","Enter");
  await page.locator('#ef label:has-text("Follow-up engage")').click();
  await expect(page.locator('#ef input[value="f"]')).toBeChecked();
  await page.click("#esave");
  await expect(page.locator("#emsg")).toHaveText("Saved.");
  const o=await page.evaluate(()=>JSON.parse(localStorage.getItem("lolChamps")));
  expect(o.Rell.t).toContain("f");
});

test("consider: add with Enter, remove right away, add by typing the full name",async({page})=>{
  await openApp(page);
  await page.fill("#cq","Jinx");await page.press("#cq","Enter");
  await expect(page.locator("#cres .cc")).toHaveCount(1);
  await page.locator("#cres .cc [data-cx]").click();
  await expect(page.locator("#cres .cc")).toHaveCount(0);
  await page.fill("#cq","Lux");
  await page.locator('h2:has-text("Fearless bans")').click();
  await expect(page.locator("#cres .cc")).toHaveCount(1);
});

test("closed sections stay closed after a reload",async({page})=>{
  await openApp(page);
  const card=page.locator('details:has(> summary h2:text-is("Consider champions"))');
  await card.locator("> summary").click();
  await expect(card).not.toHaveAttribute("open","");
  const again=await restart(page);
  await expect(again.locator('details:has(> summary h2:text-is("Consider champions"))')).not.toHaveAttribute("open","");
});
