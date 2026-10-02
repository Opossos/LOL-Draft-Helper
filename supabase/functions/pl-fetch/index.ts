// pl-fetch: loads one primeleague.gg page for the draft helper, which can't read
// other sites from the browser. Only /de|en/leagues/ pages are allowed.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-password",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const ALLOW = /^https:\/\/www\.primeleague\.gg\/(de|en)\/leagues\/[\w\-\/.%?=&]*$/;

// same password check as the app: pw_status returns "open" (no password), "ok" or "bad"
async function allowed(req: Request) {
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) return true;
  const h: Record<string, string> = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };
  const pw = req.headers.get("x-app-password");
  if (pw) h["x-app-password"] = pw;
  try {
    const r = await fetch(url + "/rest/v1/rpc/pw_status", { method: "POST", headers: h, body: "{}" });
    if (!r.ok) return true; // no password function in this project
    const st = await r.json();
    return st === "open" || st === "ok";
  } catch {
    return true;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  if (!(await allowed(req))) return json({ error: "Wrong app password." }, 401);
  let target = "";
  try {
    target = String((await req.json()).url || "");
  } catch {
    return json({ error: "Send JSON like {\"url\": \"https://www.primeleague.gg/de/leagues/...\"}." }, 400);
  }
  if (!ALLOW.test(target)) return json({ error: "Only primeleague.gg league pages are allowed." }, 400);
  try {
    const r = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; draft-helper scouting)",
        "Accept": "text/html",
        "Accept-Language": "de,en;q=0.8",
      },
      redirect: "follow",
    });
    const html = r.ok ? await r.text() : "";
    return json({ status: r.status, html });
  } catch (e) {
    return json({ error: "Could not reach primeleague.gg: " + String(e) }, 502);
  }
});
