// riot-rank: solo queue rank (tier, division, LP, wins, losses) for up to 10 Riot IDs, for the draft helper.
// Uses the same app password as the database: the request's x-app-password header is checked with pw_status.
// Secret: RIOT_API_KEY (Supabase → Edge Functions → Secrets). Deploy with Verify JWT turned off, like riot-stats.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-app-password",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PLATFORM: Record<string, string> = { euw: "euw1", eune: "eun1", na: "na1", kr: "kr", br: "br1", lan: "la1", las: "la2", oce: "oc1", tr: "tr1", ru: "ru", jp: "jp1" };
const REGIONAL: Record<string, string> = { euw: "europe", eune: "europe", tr: "europe", ru: "europe", kr: "asia", jp: "asia", na: "americas", br: "americas", lan: "americas", las: "americas", oce: "americas" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// the same password check as the tables: "open" (no password set), "ok" (right password) or "bad"
async function allowed(req: Request): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) return false;
  const pw = req.headers.get("x-app-password") || "";
  const r = await fetch(url + "/rest/v1/rpc/pw_status", {
    method: "POST",
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", ...(pw ? { "x-app-password": pw } : {}) },
    body: "{}",
  });
  if (!r.ok) return false;
  const s = await r.json();
  return s === "open" || s === "ok";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const KEY = Deno.env.get("RIOT_API_KEY");
  if (!KEY) return json({ error: "The RIOT_API_KEY secret is missing." }, 500);
  if (!(await allowed(req))) return json({ error: "Wrong or missing app password." }, 401);
  let body: { players?: { riotId?: string; region?: string }[] } = {};
  try { body = await req.json(); } catch { return json({ error: "Send JSON." }, 400); }
  const players = (body.players || []).slice(0, 10);
  // Riot allows a development key 20 requests per second: on a rate limit wait (up to 10 s) and try again, twice
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const riot = async (u: string) => {
    for (let i = 0; ; i++) {
      const r = await fetch(u, { headers: { "X-Riot-Token": KEY } });
      const wait = +(r.headers.get("Retry-After") || 1);
      if (r.status !== 429 || i === 2 || wait > 10) return r;
      await sleep(wait * 1000 + 200);
    }
  };
  const out = [];
  for (const p of players) {
    if (out.length) await sleep(120);
    const id = String(p.riotId || "").trim(), region = PLATFORM[String(p.region)] ? String(p.region) : "euw";
    const [name, tag] = id.split("#");
    if (!name || !tag) { out.push({ riotId: id, error: "not a Riot ID" }); continue; }
    const a = await riot(`https://${REGIONAL[region]}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
    if (a.status === 429) return json({ ranks: out, limited: true, retry: +(a.headers.get("Retry-After") || 60) });
    if (!a.ok) { out.push({ riotId: id, error: a.status === 404 ? "not found" : "Riot error " + a.status }); continue; }
    const { puuid } = await a.json();
    const l = await riot(`https://${PLATFORM[region]}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`);
    if (l.status === 429) return json({ ranks: out, limited: true, retry: +(l.headers.get("Retry-After") || 60) });
    if (!l.ok) { out.push({ riotId: id, error: "Riot error " + l.status }); continue; }
    const solo = (await l.json()).find((e: { queueType: string }) => e.queueType === "RANKED_SOLO_5x5");
    out.push(solo
      ? { riotId: id, tier: solo.tier, div: solo.rank, lp: solo.leaguePoints, w: solo.wins, l: solo.losses }
      : { riotId: id, tier: "UNRANKED" });
  }
  return json({ ranks: out });
});
