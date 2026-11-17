// 早饭晚饭的通知（Supabase Edge Function，Web Push）
// - task "key"：给手机通知用的公钥（手机订阅时要）。要家庭密钥 h。
// - task "test"：给自己的手机发一条试试。要家庭密钥 h 和 who。
// - task "log"：数据库触发器叫的。有人在家里动态里留了一条，按规则发给该知道的人：
//     妈妈：有人点了想吃的、改了在不在家、定了早饭
//     家里人：妈妈定了或改了晚饭
// - task "reminder"：定时任务每小时叫一次；家里时间晚上 9 点那一次，提醒明天早饭还没点的人
// 签名用的密钥第一次用时自己生成，存在 mp_secrets 表里（手机读不到，也不进仓库）。
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const TZ = Deno.env.get("MP_TZ") || "America/Los_Angeles"; // 家在 Burlingame
const SITE = Deno.env.get("MP_SITE") || "https://meal-planner-vickymeow.vercel.app";
const NAMES: Record<string, string> = { mom: "妈妈", dad: "爸爸", vicky: "Vicky", chen: "小陈" };
const FAMILY = ["vicky", "chen", "dad"];

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function secret(k: string) {
  const { data } = await sb.from("mp_secrets").select("v").eq("k", k).maybeSingle();
  return data?.v as string | undefined;
}
let vapid: { publicKey: string; privateKey: string } | null = null;
async function getVapid() {
  if (vapid) return vapid;
  let pub = await secret("vapid_public"), priv = await secret("vapid_private");
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    // 两部手机同时第一次用：只认先写进去的那一对
    await sb.from("mp_secrets").upsert([{ k: "vapid_public", v: k.publicKey }, { k: "vapid_private", v: k.privateKey }], { onConflict: "k", ignoreDuplicates: true });
    pub = await secret("vapid_public"); priv = await secret("vapid_private");
  }
  vapid = { publicKey: pub!, privateKey: priv! };
  webpush.setVapidDetails(SITE, vapid.publicKey, vapid.privateKey);
  return vapid;
}

// 发给某家某些人的所有手机；手机已经退订的（404/410）顺手删掉
async function sendTo(h: string, people: string[], msg: { title: string; body: string; tag?: string }) {
  if (!people.length) return { sent: 0 };
  await getVapid();
  const { data: subs } = await sb.from("mp_push_subs").select("endpoint, who, sub").eq("household", h).in("who", people);
  let sent = 0;
  for (const s of subs || []) {
    const payload = JSON.stringify({ ...msg, url: `${SITE}/?h=${h}&me=${s.who}` });
    try {
      await webpush.sendNotification(s.sub as any, payload, { TTL: 6 * 3600, urgency: "high" });
      sent++;
      await sb.from("mp_push_subs").update({ last_ok: new Date().toISOString() }).eq("endpoint", s.endpoint);
    } catch (e) {
      const code = (e as any)?.statusCode;
      console.error("push failed", code, String((e as any)?.body || (e as Error).message).slice(0, 200));
      if (code === 404 || code === 410) await sb.from("mp_push_subs").delete().eq("endpoint", s.endpoint);
    }
  }
  return { sent };
}

// 动态里这一条要告诉谁
function routeLog(who: string, text: string): { to: string[]; tag: string } | null {
  if (who !== "mom") {
    if (/点了想吃|在家吃饭|不在家吃饭|早饭/.test(text)) return { to: ["mom"], tag: /早饭/.test(text) ? "bf" : /在家/.test(text) ? "home" : "wish" };
    return null;
  }
  if (/晚饭/.test(text)) return { to: FAMILY, tag: "dinner" };
  return null;
}

function localParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

async function item(h: string, id: string) {
  const { data } = await sb.from("mp_items").select("data, deleted").eq("household", h).eq("id", id).maybeSingle();
  return data && !data.deleted ? data.data as any : null;
}

// 晚上 9 点多：明天在家、吃早饭、但还没点的人，提醒一下
async function reminder(force = false, onlyH?: string) {
  const now = localParts(new Date());
  if (!force && now.hour !== 21) return { skipped: true, hour: now.hour };
  const tmr = localParts(new Date(Date.now() + 24 * 3600 * 1000)).date;
  let q = sb.from("mp_push_subs").select("household, who").in("who", FAMILY);
  if (onlyH) q = q.eq("household", onlyH);
  const { data: subs } = await q;
  const pairs = [...new Set((subs || []).map((s) => s.household + "|" + s.who))];
  let sent = 0;
  for (const pr of pairs) {
    const [h, who] = pr.split("|");
    const off = await item(h, "bfoff:" + who);
    if (off?.v) continue;
    const home = await item(h, `home:${tmr}:${who}`);
    if (home && home.v === false) continue;
    const bf = await item(h, `bf:${tmr}:${who}`);
    if (bf && (bf.dish || (bf.dishes && bf.dishes.length))) continue;
    const r = await sendTo(h, [who], { title: "明天早饭还没点", body: `${NAMES[who] || ""}，明天早饭想吃什么？点一下告诉妈妈（不点就做鸡蛋三明治）`, tag: "bf-remind" });
    sent += r.sent;
  }
  return { sent, tomorrow: tmr };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  // 数据库触发器和定时任务：用后台口令
  if (body.task === "log" || body.task === "reminder") {
    const tok = await secret("notify_token");
    if (!tok || body.token !== tok) return json({ error: "forbidden" }, 403);
    if (body.task === "reminder") return json(await reminder());
    const log = body.log || {}, h = String(body.h || "");
    // 动态里写明了要告诉谁（比如「生煎包家里有了」只告诉想吃的人）
    const direct = (Array.isArray(log.to) ? log.to : []).filter((p: unknown) => typeof p === "string" && NAMES[p as string]);
    const r = direct.length ? { to: direct as string[], tag: "stock" } : routeLog(String(log.who || ""), String(log.text || ""));
    if (!r) return json({ skipped: true });
    const to = r.to.filter((p) => p !== log.who);
    const name = NAMES[log.who] || "家里";
    const text = String(log.text || "").slice(0, 120);
    return json(await sendTo(h, to, { title: "爱心厨房", body: direct.length ? text : name + text, tag: r.tag }));
  }

  // 手机来的：要家庭密钥
  const h = String(body?.h || "");
  if (h.length < 24) return json({ error: "unknown household" }, 403);
  const { data: home } = await sb.from("mp_households").select("id").eq("id", h).maybeSingle();
  if (!home) return json({ error: "unknown household" }, 403);

  if (body.task === "key") return json({ key: (await getVapid()).publicKey });
  if (body.task === "test") {
    const who = String(body.who || "");
    return json(await sendTo(h, [who], { title: "爱心厨房", body: "通知打开了 ✓ 以后有事会这样告诉你", tag: "test" }));
  }
  return json({ error: "unknown task" }, 400);
});
