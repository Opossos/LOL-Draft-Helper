// Shared setup: open index.html from disk with outside services blocked and a prepared localStorage.
const path=require("path");
const {expect}=require("@playwright/test");

const APP="file://"+path.resolve(__dirname,"..","index.html");

// Supabase, champion icons and role images are not needed for the tests; blocking them keeps runs fast and offline.
async function block(page){
  await page.route(/supabase\.co|ddragon\.leagueoflegends\.com|emoji\.gg/,r=>r.abort());
}

// Opens the app with the given localStorage entries (objects are stored as JSON) and collects page errors.
async function openApp(page,store={}){
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await block(page);
  // seed localStorage before the app's own scripts run, once per test, so reloads inside a test keep the app's data
  const seed=Math.random().toString(36).slice(2);
  // the mark lives in window.name, which survives reloads in the same tab (localStorage can read empty for a moment after one)
  await page.addInitScript(([s,id])=>{
    if(window.name==="seeded:"+id)return;
    localStorage.clear();
    for(const[k,v]of Object.entries(s))localStorage.setItem(k,typeof v==="string"?v:JSON.stringify(v));
    window.name="seeded:"+id;
  },[store,seed]);
  await page.goto(APP);
  await expect(page.locator("#board")).not.toBeEmpty();
  return errors;
}

// A player of your team: pool = tier list, unsure = not confident, learn = learning.
const player=(name,role,pool=[],more={})=>({id:name,name,region:"euw",role,champs:[],active:true,pool,...more});
const myTeam=players=>[{id:"my-team",name:"My team",data:players}];
const draft=(st,more={})=>({st:{bp:[],rp:[],bb:[],rb:[],...st},...more});

const isPhone=page=>page.viewportSize().width<500;

// "Survives a reload": copies everything the app saved and opens it in a fresh page.
// (A plain reload in automated Chromium sometimes drops the newest localStorage writes, so tests do not rely on it.)
async function restart(page){
  await page.waitForTimeout(500); // saves that wait a moment, like open sections, finish first
  const saved=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
  const fresh=await page.context().newPage();
  await openApp(fresh,saved);
  return fresh;
}

module.exports={APP,block,openApp,restart,player,myTeam,draft,isPhone};
