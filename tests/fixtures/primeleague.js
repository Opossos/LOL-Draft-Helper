// Made-up primeleague.gg pages with the same structure the app and the bookmark read.
// No real teams or players: team "Test Team" (id 500001) against "Foe Esports" (id 600001).
const B="https://www.primeleague.gg/de/leagues";
const TEAM="500001-test-team",FOE="600001-foe-esports";
const SPLITS={
  spring:{id:"3220",slug:"3220-spring-split-202526",name:"Spring '25/26",league:"prm"},
  fall:{id:"3227",slug:"3227-fall-split-202627",name:"Fall '26/27",league:"prm"},
  cup:{id:"3228",slug:"3228-26-open-qualifier",name:"Kanji '26 OQ",league:"kanji"}
};
const PLAYERS=[
  {u:"1001-alpha",nick:"Alpha",riot:"Alpha#EUW"},
  {u:"1002-beta",nick:"Beta",riot:"Beta#EUW"},
  {u:"1003-gamma",nick:"Gamma",riot:"Gamma#EUW"}
];
const splitBase=s=>`${B}/${s.league}/${s.slug}`;
const teamUrl=s=>`${splitBase(s)}/teams/${TEAM}`;
const generalUrl=`${B}/teams/${TEAM}`;
const matchUrl=id=>`${B}/matches/${id}-test-team-vs-foe-esports`;

const page=(body,{cls="",title="Prime League",alt=""}={})=>`<!doctype html><html lang="de"><head><title>${title}</title>${alt?`<link rel="alternate" href="${alt}" hreflang="de">`:""}</head><body class="${cls}"><div id="page-body">${body}</div></body></html>`;
const crumbs=s=>`<ul class="breadcrumbs"><li class="breadcrumbs-item"><a href="${B}">Turniere</a></li><li class="breadcrumbs-item"><a href="${splitBase(s)}"><span>${s.name}</span></a></li></ul>`;

// a split page of the team: roster plus match rows; played rows show a score, spring uses both plain and spoiler-protected scores
function splitPage(s,matches){
  const roster=PLAYERS.map(p=>`<li><a href="${splitBase(s)}/users/${p.u}"><h3>${p.nick}</h3></a><div class="txt-info"><span class="gameaccount" title="League of Legends » LoL Riot ID (EU West)"><span class="gameaccount-name">${p.riot}</span></span><span class="txt-status-positive">Bestätigter Spieler</span></div></li>`).join("");
  const rows=matches.map(m=>`<li><div class="txt-info">${m.day}</div><table><tbody><tr><td><a href="${matchUrl(m.id)}">TT</a></td><td><a href="${matchUrl(m.id)}">${m.score==null?`<span class="itime" data-time="${m.time}"></span>`:m.spoiler?`<span class="antispoiler-score"><span>Score</span><span>${m.score}</span></span>`:m.score}</a></td><td><a href="${matchUrl(m.id)}">FOE</a></td></tr></tbody></table></li>`).join("");
  return page(`${crumbs(s)}<ul class="content-portrait-head-info"><li><a href="${generalUrl}">Test Team</a></li></ul><ul class="section-block content-portrait-grid-l">${roster}</ul><ul class="league-stage-matches">${rows}</ul>`,{cls:`body-leagues body-${s.league} body-teams`,title:`Test Team in ${s.name}`});
}
// the team's overview page links every split it played, newest first, the cup included
function generalPage(){
  const links=[SPLITS.cup,SPLITS.fall,SPLITS.spring].map(s=>`<a href="${teamUrl(s)}" class="btn">Mehr Details</a>`).join("");
  return page(`<h1>Test Team (TT)</h1>${links}`,{cls:"body-leagues body-teams"});
}
// a player page of one split with their most played champions
function userPage(s,p,champs){
  const w=champs.map(([n,g,wins,kda])=>`<li><div class="widget"><div class="widget-head"><h3 class="widget-head-title">${n}</h3><div class="txt-subtitle">${g} Spiele</div></div><div class="quick-info"><div><div class="qi-value">${wins} / ${g-wins} (${Math.round(wins/g*100)}%)</div></div><div><div class="qi-value">${kda}</div></div></div></div></li>`).join("");
  return page(`${crumbs(s)}<h1>${s.name}: ${p.nick}</h1><div class="content-portrait-head"><span class="gameaccount-name">${p.riot}</span></div><div id="user-league-heroes"><ul>${w}</ul></div>`,{cls:"body-leagues body-users"});
}
// a played match: per game both sides, their colour (blue/red), result, bans and the five players with champions
function matchPage(id,{us=1,games}){
  const them=3-us,side=k=>k===us?{tid:TEAM,name:"Test Team",short:"TT"}:{tid:FOE,name:"Foe Esports",short:"FOE"};
  const head=[1,2].map(k=>`<div class="content-match-head-team side-${k}"><a href="${B}/teams/${side(k).tid}"><img alt="${side(k).name}"></a><h2>${side(k).short}</h2></div>`).join("");
  const sec=games.map(g=>{
    const colour=k=>(k===us?g.ourSide:g.ourSide==="b"?"r":"b");
    const hs=[1,2].map(k=>`<div class="submatch-lol-head-side side-${k} color-${colour(k)}"><div class="submatch-lol-team-result ${(k===us)===g.win?"win":"loss"}"></div></div>`).join("");
    const bans=[1,2].map(k=>`<div class="submatch-lol-base-side side-${k}"><div class="submatch-lol-bans">${(k===us?g.bans:g.obans).map(c=>`<img alt="${c}">`).join("")}</div></div>`).join("");
    const pls=[1,2].map(k=>(k===us?g.picks:g.opicks).map((c,i)=>`<div class="submatch-lol-player side-${k} row-${i+1}"><span class="submatch-lol-player-name">${k===us?(["Alpha#EUW","Beta#EUW","Gamma#EUW","Delta#EUW","Echo#EUW"][i]):"Foe"+i+"#EUW"}</span><span class="submatch-lol-player-champion"><img alt="${c}"></span><span class="submatch-lol-player-kda">${i+1}/2/3</span></div>`).join("")).join("");
    return`<section class="league-match-sub-lol"><div class="submatch-lol-head">${hs}</div><div class="submatch-lol-base">${bans}</div>${pls}</section>`;
  }).join("");
  return page(`${crumbs(SPLITS.spring)}<div class="content-match-head">${head}<span class="txt-score">${games.filter(g=>g.win).length}:${games.filter(g=>!g.win).length}</span></div><span class="tztime" data-time="1779037200"></span><div class="txt-subtitle">Spieltag 1</div>${sec}`,{cls:"body-leagues body-matches",alt:matchUrl(id)});
}

const G1={win:true,ourSide:"b",bans:["Zed","Ahri"],obans:["Jinx","Thresh"],picks:["Aatrox","Lee Sin","Orianna","Kai'Sa","Rell"],opicks:["Renekton","Vi","Syndra","Ezreal","Leona"]};
const G2={win:false,ourSide:"r",bans:["Yasuo"],obans:["Lux"],picks:["Gnar","Sejuani","Azir","Jinx","Nautilus"],opicks:["Jax","Viego","Ahri","Caitlyn","Braum"]};

// every URL the bookmark may load, mapped to its page
function site(){
  const p={};
  p[generalUrl]=generalPage();
  p[teamUrl(SPLITS.spring)]=splitPage(SPLITS.spring,[
    {id:"900001",day:"(Spieltag 1)",score:"1:1"},
    {id:"900002",day:"(Spieltag 2)",score:"2:0",spoiler:true},
    {id:"900003",day:"(Spieltag 3)",score:null,time:1}
  ]);
  p[teamUrl(SPLITS.fall)]=splitPage(SPLITS.fall,[{id:"910001",day:"(Spieltag 1)",score:null,time:4102444800}]);
  p[teamUrl(SPLITS.cup)]=splitPage(SPLITS.cup,[]);
  PLAYERS.forEach((pl,i)=>{
    p[`${splitBase(SPLITS.spring)}/users/${pl.u}`]=userPage(SPLITS.spring,pl,[[["Aatrox","Lee Sin","Orianna"][i],6,4,"3.10"],["Gnar",2,1,"2.00"]]);
    p[`${splitBase(SPLITS.fall)}/users/${pl.u}`]=userPage(SPLITS.fall,pl,[]);
  });
  p[matchUrl("900001")]=matchPage("900001",{us:1,games:[G1,G2]});
  p[matchUrl("900002")]=matchPage("900002",{us:2,games:[G1,{...G1,ourSide:"r"}]});
  p[matchUrl("900003")]=matchPage("900003",{us:1,games:[]});
  return p;
}

module.exports={site,teamUrl,generalUrl,matchUrl,SPLITS,PLAYERS,TEAM};
