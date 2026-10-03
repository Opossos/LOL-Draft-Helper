// Shared setup: open index.html from disk with outside services blocked and a prepared localStorage.
const path=require("path");
const {expect}=require("@playwright/test");

const APP="file://"+path.resolve(__dirname,"..","index.html");

// Supabase, champion icons and role images are not needed for the tests; blocking them keeps runs fast and offline.
// With a fake database (see fakeDb) Supabase requests go there instead.
async function block(page,db){
  await page.route(/ddragon\.leagueoflegends\.com|emoji\.gg/,r=>r.abort());
  await page.route(/supabase\.co/,db?db.handler:r=>r.abort());
}

// A tiny stand-in for the Supabase tables: no password, empty notes and champion edits, and a scouts table in memory.
// Pages opened with the same fakeDb share it, like teammates on the same site.
// ranks: answers of the riot-rank function by Riot ID; without it the function counts as not deployed (404)
function fakeDb({ranks}={}){
  const tables={scouts:new Map(),notes:new Map()},rows=tables.scouts;
  const handler=async route=>{
    const req=route.request(),u=new URL(req.url()),m=req.method();
    const json=b=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(b)});
    if(u.pathname.endsWith("/rpc/pw_status"))return json("open");
    if(u.pathname.endsWith("/functions/v1/riot-rank")){
      if(!ranks)return route.fulfill({status:404,body:"not found"});
      return json({ranks:JSON.parse(req.postData()).players.map(p=>({riotId:p.riotId,...(ranks[p.riotId]||{tier:"UNRANKED"})}))});
    }
    const T=tables[u.pathname.split("/").pop()];
    if(T){
      // id=eq.x or id=in.("x","y")
      const f=u.searchParams.get("id"),ids=!f?null:f.startsWith("eq.")?[f.slice(3)]:JSON.parse("["+f.slice(4,-1)+"]");
      if(m==="GET")return json([...T.values()].filter(r=>!ids||ids.includes(r.id)));
      if(m==="POST"){[].concat(JSON.parse(req.postData())).forEach(r=>T.set(r.id,{...T.get(r.id),...r}));return route.fulfill({status:201,body:""})}
      if(m==="DELETE"){(ids||[]).forEach(id=>T.delete(id));return route.fulfill({status:204,body:""})}
    }
    if(m==="GET")return json([]);
    return route.fulfill({status:201,body:""});
  };
  return{rows,tables,handler};
}

async function openApp(page,store={},{db}={}){
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await block(page,db);
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

module.exports={APP,block,fakeDb,openApp,restart,player,myTeam,draft,isPhone};
