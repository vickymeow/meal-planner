// 早饭晚饭的 AI 助手（Supabase Edge Function）
// - task "recipe"：给一道家常菜写配料（带份量）和做法
// - task "intent"：把一句话（语音转的字）变成 App 里要做的事
// - task "transcribe"：录音转文字（主屏 App 里浏览器自带的语音识别常常用不了）
// - task "photo"：给一道菜生成一张写实菜品照（通义万相 / Qwen-Image），存进 mp-photos，写进家里的同步库
// - task "tts"：把一段话读出来（Qwen 语音合成，温柔女声），返回音频地址
// - task "diag"：检查 key 和模型能不能用（不返回 key 本身）
// 用阿里云百炼 Qwen（OpenAI 兼容接口）；连接方式照旧版早饭 App（云函数 breakfast）实测能用的写法：
//   - key：先用 Token Plan（DASHSCOPE_API_KEY，sk-sp- 开头，包月），用不了再用按量付费的 QWEN_API_KEY（阿里云代金券自动抵扣）
//   - Token Plan 的 key 以 sk-sp- 开头，走 token-plan 专属地址；普通 key 走 dashscope-intl
//   - 对话必须带 enable_thinking: false（Qwen3 默认会先思考，JSON 模式下容易出错）
//   - 语音用 qwen-audio-3.0-asr-flash，走百炼原生接口，parameters.format 必填
// 可选设置：QWEN_BASE_URL / DASHSCOPE_BASE_URL（地址）、QWEN_MODEL / QWEN_CHAT_MODEL（对话模型）、QWEN_ASR_MODEL（语音模型）
// 只接受带正确家庭密钥（h）的请求。
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const env = (k: string) => (Deno.env.get(k) || "").trim().replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "");
const SG_TP = "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";
const BJ_TP = "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";
const INTL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const SET_BASE = (env("QWEN_BASE_URL") || env("DASHSCOPE_BASE_URL")).replace(/\/+$/, "");
// 可用的 key：Token Plan 的（sk-sp- 开头，包月）优先，按量付费的在后（去重、去空）
const KEYS = [{ src: "QWEN_API_KEY", key: env("QWEN_API_KEY") }, { src: "DASHSCOPE_API_KEY", key: env("DASHSCOPE_API_KEY") }]
  .filter((k, i, a) => k.key && a.findIndex((x) => x.key === k.key) === i)
  .sort((a, b) => Number(b.key.startsWith("sk-sp-")) - Number(a.key.startsWith("sk-sp-")));
function basesFor(key: string) {
  if (SET_BASE) return [SET_BASE];
  return key.startsWith("sk-sp-") ? [SG_TP, BJ_TP] : [INTL, SG_TP];
}
const CHAT_MODEL = env("QWEN_MODEL") || env("QWEN_CHAT_MODEL");
const CHAT_CANDIDATES = [CHAT_MODEL, "qwen3.8-flash", "qwen3.6-flash", "qwen3.7-plus", "qwen3.6-plus", "qwen-flash", "qwen-turbo", "qwen-plus"]
  .filter((x, i, a) => x && a.indexOf(x) === i);
const ASR_CANDIDATES = [env("QWEN_ASR_MODEL"), "qwen-audio-3.0-asr-flash", "qwen3-asr-flash"].filter((x, i, a) => x && a.indexOf(x) === i);
// 记住能用的组合，下次直接用
let good: { key: string; src: string; base: string; model: string } | null = null;
let goodAsr: { key: string; base: string; model: string } | null = null;

class HttpErr extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function chatOnce(key: string, base: string, model: string, messages: unknown[], jsonMode: boolean) {
  const body: Record<string, unknown> = { model, stream: false, enable_thinking: false, temperature: 0.2, messages };
  if (jsonMode) body.response_format = { type: "json_object" };
  const r = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) throw new HttpErr(r.status, `${model}@${new URL(base).host}: ${r.status} ${txt.slice(0, 200)}`);
  return String(JSON.parse(txt)?.choices?.[0]?.message?.content || "");
}
// 依次试：key → 地址 → 模型；401 换地址/换 key，404（套餐里没有这个模型）换模型
async function chat(messages: unknown[], jsonMode: boolean): Promise<string> {
  if (good) {
    try { return await chatOnce(good.key, good.base, good.model, messages, jsonMode); }
    catch (e) { if (!(e instanceof HttpErr) || ![401, 403, 404].includes(e.status)) throw e; good = null; }
  }
  let last: unknown = null;
  for (const k of KEYS) {
    for (const base of basesFor(k.key)) {
      let authFailed = false;
      for (const model of CHAT_CANDIDATES) {
        try {
          const out = await chatOnce(k.key, base, model, messages, jsonMode);
          good = { key: k.key, src: k.src, base, model };
          return out;
        } catch (e) {
          last = e;
          console.error("qwen chat failed", (e as Error).message);
          const st = (e as HttpErr).status;
          if (st === 401 || st === 403) { authFailed = true; break; } // 这个地址不认这把 key
          if (st === 400 && jsonMode && /response_format|json/i.test((e as Error).message)) {
            return chat(messages, false); // 不支持 JSON 模式：不带格式要求再来
          }
          if (st !== 404 && st !== 400) throw e;
        }
      }
      if (!authFailed) break; // 地址认 key 但模型都不行，不用再换地址
    }
  }
  throw last || new Error("no key");
}
async function askJSON(system: string, user: string, schema: unknown) {
  const content = await chat([
    { role: "system", content: system + "\n\n只输出一个 JSON 对象，不要输出其他文字。JSON 必须符合这个 JSON Schema：\n" + JSON.stringify(schema) },
    { role: "user", content: user },
  ], true);
  const m = String(content).match(/\{[\s\S]*\}/);
  if (!m) throw new HttpErr(502, "no json in reply");
  return JSON.parse(m[0]);
}

// ---- 录音转文字（百炼原生接口）----
async function asrOnce(key: string, base: string, model: string, b64: string, mime: string, fmt: string) {
  const url = new URL(base).origin + "/api/v1/services/aigc/multimodal-generation/generation";
  const body = { model, input: { messages: [{ role: "user", content: [{ audio: `data:${mime};base64,${b64}` }] }] }, parameters: { format: fmt, sample_rate: 16000, language_hints: ["zh"] } };
  const r = await fetch(url, { method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json" }, body: JSON.stringify(body) });
  const raw = await r.text();
  let text = "";
  try { const j = JSON.parse(raw); text = String(j.text || j.sentence?.text || j.output?.text || j.output?.sentence?.text || j.output?.choices?.[0]?.message?.content?.[0]?.text || "").trim(); } catch { /* 不是 JSON */ }
  return { ok: r.ok, status: r.status, text, raw };
}
async function transcribe(b64: string, mime: string): Promise<{ text: string } | { error: string; status: number }> {
  const fmt = /wav/.test(mime) ? "wav" : /webm/.test(mime) ? "webm" : /ogg/.test(mime) ? "ogg" : /mpeg|mp3/.test(mime) ? "mp3" : /aac/.test(mime) ? "aac" : "mp4";
  const tries: { key: string; base: string; model: string }[] = [];
  if (goodAsr) tries.push(goodAsr);
  for (const k of KEYS) for (const base of basesFor(k.key)) for (const model of ASR_CANDIDATES) tries.push({ key: k.key, base, model });
  let lastErr = "";
  for (const t of tries) {
    const r = await asrOnce(t.key, t.base, t.model, b64, mime, fmt);
    if (r.ok) { goodAsr = t; return r.text ? { text: r.text } : { error: "no_speech", status: 422 }; }
    lastErr = `${t.model}@${new URL(t.base).host}: ${r.status} ${r.raw.slice(0, 200)}`;
    console.error("qwen asr failed", lastErr);
    if (r.status === 400 && !/url error|model/i.test(r.raw)) return { error: "no_speech", status: 422 }; // 接口通了，但没听到人声
  }
  return { error: "asr_failed", status: 502 };
}

// ---- 百炼原生接口（生图、语音合成）：先用 Token Plan（包月），用不了再用按量付费的 key（代金券抵扣）----
function nativeTries() {
  const out: { key: string; origin: string }[] = [];
  for (const k of KEYS) for (const base of basesFor(k.key)) {
    const origin = new URL(base).origin;
    if (!out.some((x) => x.key === k.key && x.origin === origin)) out.push({ key: k.key, origin });
  }
  return out;
}
async function nativePost(t: { key: string; origin: string }, path: string, body: unknown, async = false) {
  const headers: Record<string, string> = { authorization: "Bearer " + t.key, "content-type": "application/json" };
  if (async) headers["X-DashScope-Async"] = "enable";
  const r = await fetch(t.origin + path, { method: "POST", headers, body: JSON.stringify(body) });
  const raw = await r.text();
  let j: any = null; try { j = JSON.parse(raw); } catch { /* */ }
  return { ok: r.ok, status: r.status, j, raw };
}
const IMG_SYNC = [env("QWEN_IMAGE_MODEL"), "qwen-image-plus", "qwen-image"].filter((x, i, a) => x && a.indexOf(x) === i);
const IMG_ASYNC = ["wan2.2-t2i-flash", "wan2.2-t2i-plus", "wanx2.1-t2i-turbo"];
let goodImg: { t: { key: string; origin: string }; model: string; async: boolean } | null = null;
// 生成一张图，返回临时图片地址（24 小时内有效）
async function genImage(prompt: string): Promise<string> {
  const combos: { t: { key: string; origin: string }; model: string; async: boolean }[] = [];
  if (goodImg) combos.push(goodImg);
  for (const t of nativeTries()) {
    for (const m of IMG_ASYNC) combos.push({ t, model: m, async: true });
    for (const m of IMG_SYNC) combos.push({ t, model: m, async: false });
  }
  let last = "";
  for (const c of combos) {
    if (!c.async) {
      const r = await nativePost(c.t, "/api/v1/services/aigc/multimodal-generation/generation", {
        model: c.model, input: { messages: [{ role: "user", content: [{ text: prompt }] }] },
        parameters: { size: "1328*1328", watermark: false, prompt_extend: false, negative_prompt: "文字, 水印, logo, 人手, 人脸, 卡通, 插画" },
      });
      const url = r.j?.output?.choices?.[0]?.message?.content?.find?.((x: any) => x.image)?.image;
      if (r.ok && url) { goodImg = c; return url; }
      last = `${c.model}@${new URL(c.t.origin).host}: ${r.status} ${r.raw.slice(0, 160)}`;
    } else {
      const r = await nativePost(c.t, "/api/v1/services/aigc/text2image/image-synthesis", {
        model: c.model, input: { prompt, negative_prompt: "文字, 水印, logo, 人手, 人脸, 卡通, 插画" },
        parameters: { size: "1024*768", n: 1, watermark: false },
      }, true);
      const id = r.j?.output?.task_id;
      if (!r.ok || !id) { last = `${c.model}@${new URL(c.t.origin).host}: ${r.status} ${r.raw.slice(0, 160)}`; console.error("img failed", last); continue; }
      for (let i = 0; i < 40; i++) { // 最多等 60 秒
        await new Promise((res) => setTimeout(res, 1500));
        const q = await fetch(c.t.origin + "/api/v1/tasks/" + id, { headers: { authorization: "Bearer " + c.t.key } });
        const qj: any = await q.json().catch(() => ({}));
        const st = qj?.output?.task_status;
        if (st === "SUCCEEDED") { const url = qj.output.results?.[0]?.url; if (url) { goodImg = c; return url; } break; }
        if (st === "FAILED" || st === "UNKNOWN" || st === "CANCELED") { last = `${c.model}: ${st} ${JSON.stringify(qj.output).slice(0, 160)}`; break; }
      }
    }
    console.error("img failed", last);
  }
  throw new HttpErr(502, "image: " + last);
}
const TTS_MODELS = [env("QWEN_TTS_MODEL"), "qwen3-tts-flash", "qwen-tts"].filter((x, i, a) => x && a.indexOf(x) === i);
const TTS_VOICE = env("QWEN_TTS_VOICE") || "Cherry";
let goodTts: { t: { key: string; origin: string }; model: string } | null = null;
async function tts(text: string): Promise<string> {
  const combos: { t: { key: string; origin: string }; model: string }[] = [];
  if (goodTts) combos.push(goodTts);
  for (const t of nativeTries()) for (const m of TTS_MODELS) combos.push({ t, model: m });
  let last = "";
  for (const c of combos) {
    const r = await nativePost(c.t, "/api/v1/services/aigc/multimodal-generation/generation", {
      model: c.model, input: { text, voice: TTS_VOICE, language_type: "Chinese" },
    });
    const url = String(r.j?.output?.audio?.url || "").replace(/^http:\/\//, "https://"); // 网站是 https，音频也要 https
    if (r.ok && url) { goodTts = c; return url; }
    last = `${c.model}@${new URL(c.t.origin).host}: ${r.status} ${r.raw.slice(0, 160)}`;
    console.error("tts failed", last);
  }
  throw new HttpErr(502, "tts: " + last);
}
async function sha1(s: string) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

const RECIPE_SCHEMA = {
  type: "object",
  properties: {
    cat: { type: "string", enum: ["fish", "meat", "egg", "tofu", "veg", "staple"] },
    ings: { type: "array", items: { type: "string" } },
    steps: { type: "array", items: { type: "string" } },
    prep: { type: "string" },
  },
  required: ["cat", "ings", "steps", "prep"],
  additionalProperties: false,
};

const INTENT_SCHEMA = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["home", "wish", "dinner", "breakfast", "buy", "bf_switch"] },
          date: { type: "string" },
          dish: { type: "string" },
          on: { type: "boolean" },
          level: { type: "integer", enum: [1, 2, 3] },
          qty: { type: "string" },
        },
        required: ["type", "date", "dish", "on", "level", "qty"],
        additionalProperties: false,
      },
    },
    reply: { type: "string" },
  },
  required: ["actions", "reply"],
  additionalProperties: false,
};

const INTENT_RULES = `你是一个家庭做饭 App 里的语音助手。家里 4 个人：妈妈（做饭的人）、爸爸、Vicky（女儿）、小陈。
你会收到一句中文口语（可能是语音转的字，有错别字），以及说话的人、今天往后 7 天的日期、菜谱里的菜名。
把这句话拆成 App 能执行的动作，只用下面这几种：
- home：说话的人某天在不在家吃饭。on=true 在家，on=false 不在家。date 必填。
- wish：说话的人想吃某道菜（不绑定日子）。dish 必填；level 1=想吃 2=很想吃 3=超想吃，没说就 2。
- dinner：把某道菜定进某天晚饭。只有说话的人是妈妈时才用；date 和 dish 必填。
- breakfast：说话的人某天早饭吃什么。date 和 dish 必填。
- buy：加进买菜清单。dish 写要买的东西，qty 写份量（没说就空）。
- bf_switch：说话的人以后吃不吃早饭。on=true 吃，on=false 不吃。
规则：
- date 只能用给你的日期（YYYY-MM-DD），「今天」「明天」「周三」「这周末」要换成对应日期；一句话涉及好几天就拆成好几个动作。用不到的字段：date 和 dish 和 qty 填空字符串，on 填 true，level 填 2。
- 菜名尽量对上菜谱里已有的菜名（比如「鱼」「红烧肉」）；对不上就用说话人的原话里的菜名，去掉「做」「吃」「来个」这类字。
- 家里人（不是妈妈）说「周二晚上做鱼」这种，当成 wish（想吃），不要用 dinner。
- 听不懂或者跟吃饭无关，actions 给空数组。
- reply：用一句很短的中文复述你听懂的内容，给老人看，不要超过 30 个字。`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const h = String(body?.h || "");
  if (h.length < 24) return json({ error: "unknown household" }, 403);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: home } = await sb.from("mp_households").select("id").eq("id", h).maybeSingle();
  if (!home) return json({ error: "unknown household" }, 403);

  if (!KEYS.length) return json({ error: "no_key" }, 503);

  // 诊断：试一句话，报告哪把 key、哪个地址、哪个模型能用（不返回 key 本身）
  if (body.task === "diag") {
    const keys = KEYS.map((k) => ({ src: k.src, length: k.key.length, tokenPlan: k.key.startsWith("sk-sp-"), startsWithSk: k.key.startsWith("sk-") }));
    try {
      const reply = await chat([{ role: "user", content: "回复一个字：好" }], false);
      return json({ ok: true, keys, using: good && { src: good.src, base: good.base, model: good.model }, reply: reply.slice(0, 20) });
    } catch (e) {
      return json({ ok: false, keys, error: (e as Error).message.slice(0, 300) });
    }
  }
  if (body.task === "transcribe") {
    const b64 = String(body.audio || "").replace(/^data:[^,]*,/, "");
    if (b64.length < 600) return json({ error: "no_speech" }, 422);
    if (b64.length > 8_000_000) return json({ error: "too_long" }, 413);
    const r = await transcribe(b64, String(body.mime || "audio/mp4"));
    return "text" in r ? json(r) : json({ error: r.error }, r.status);
  }

  // 生成菜品照：存进 mp-photos，再写进家里的同步库（全家手机都能看到）
  if (body.task === "photo") {
    const name = String(body.name || "").trim().slice(0, 30);
    if (!name) return json({ error: "no name" }, 400);
    const hint = String(body.hint || "").slice(0, 160);
    // 先让 Qwen 用一句话描述这道菜做好后的样子（菜名不一定看得出来，比如小酥肉是炸的肉条）
    let looks = "";
    try {
      looks = (await chat([{ role: "user", content: `用一句话（40 字以内）描述中国家常菜「${name}」做好后盛在盘里的样子：形状、颜色、配菜，只写看得见的。${hint ? "用料：" + hint : ""}` }], false)).replace(/\s+/g, " ").slice(0, 80);
    } catch { /* 描述不出来就只用菜名 */ }
    const prompt = `一道中国家常菜「${name}」的实拍照片。${looks || (hint ? "主要用料：" + hint + "。" : "")}盛在家里常用的盘子或碗里，放在木头餐桌上，暖色自然光，俯拍略带角度，看起来新鲜好吃，像手机随手拍的真实照片，画面里只有这道菜，没有文字。`;
    try {
      const tmp = await genImage(prompt);
      const img = await fetch(tmp);
      if (!img.ok) throw new HttpErr(502, "download " + img.status);
      let type = img.headers.get("content-type") || "image/png";
      let bytes = new Uint8Array(await img.arrayBuffer());
      // 缩到 720 宽、转 JPEG，手机上加载快（一张约 80KB）；转不了就存原图
      try {
        // 用到才加载（纯 WebAssembly 版）；加载失败只是不压缩，不影响别的功能
        const { Image } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
        const im = await Image.decode(bytes);
        if (im.width > 720) im.resize(720, Image.RESIZE_AUTO);
        bytes = await im.encodeJPEG(80);
        type = "image/jpeg";
      } catch (e) { console.error("compress failed", (e as Error).message); }
      const path = `${h}/${await sha1(name + Date.now())}.${type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : "png"}`;
      const up = await sb.storage.from("mp-photos").upload(path, bytes, { contentType: type, upsert: true });
      if (up.error) throw new HttpErr(502, "upload " + up.error.message);
      const src = sb.storage.from("mp-photos").getPublicUrl(path).data.publicUrl;
      await sb.rpc("mp_push", { h, items: [{ id: "photo:" + name, data: { src, ai: true, t: Date.now() }, by: "ai" }] });
      return json({ src, looks, bytes: bytes.length });
    } catch (e) {
      console.error("photo error", (e as Error).message);
      await sb.rpc("mp_push", { h, items: [{ id: "photo:" + name, data: { failed: true, t: Date.now() }, by: "ai" }] });
      return json({ error: "photo_failed" }, 502);
    }
  }
  // 读出来：返回音频地址
  if (body.task === "tts") {
    const text = String(body.text || "").trim().slice(0, 500);
    if (!text) return json({ error: "no text" }, 400);
    try { return json({ url: await tts(text) }); }
    catch (e) { console.error("tts error", (e as Error).message); return json({ error: "tts_failed" }, 502); }
  }

  let system: string, user: string, schema: Record<string, unknown>;
  if (body.task === "recipe") {
    const name = String(body.name || "").slice(0, 40);
    if (!name) return json({ error: "no name" }, 400);
    system = "你帮一位中国妈妈写家常菜谱。全部用简体中文，份量按一家 4 口。";
    user = `菜名：${name}（${body.meal === "breakfast" ? "早饭" : "晚饭"}）
写出：
- cat：主料分类，fish 鱼 / meat 肉（含鸡鸭虾）/ egg 蛋 / tofu 豆腐 / veg 青菜素菜 / staple 主食面点
- ings：5 到 8 样配料，每样写成「名字 份量」，名字和份量之间一个空格，比如「排骨 500克」「姜」（调料可以不写份量）
- steps：3 到 5 步做法，每步一句短话，老人一看就懂
- prep：需要提前买或提前备的，一句短话；不需要就空字符串`;
    schema = RECIPE_SCHEMA;
  } else if (body.task === "intent") {
    const text = String(body.text || "").slice(0, 300);
    if (!text) return json({ error: "no text" }, 400);
    system = INTENT_RULES;
    user = JSON.stringify({
      说话的人: String(body.me || ""),
      今天往后7天: (body.days || []).slice(0, 7),
      早饭菜谱: (body.breakfast || []).slice(0, 80),
      晚饭菜谱: (body.dinner || []).slice(0, 120),
      这句话: text,
    });
    schema = INTENT_SCHEMA;
  } else {
    return json({ error: "unknown task" }, 400);
  }

  try {
    const out: any = await askJSON(system, user, schema);
    if (body.task === "recipe") {
      out.ings = (Array.isArray(out.ings) ? out.ings : []).map(String).slice(0, 12);
      out.steps = (Array.isArray(out.steps) ? out.steps : []).map(String).slice(0, 8);
      out.prep = String(out.prep || "");
      if (!["fish", "meat", "egg", "tofu", "veg", "staple"].includes(out.cat)) out.cat = "veg";
    } else {
      out.actions = (Array.isArray(out.actions) ? out.actions : []).filter((a: any) => a && ["home", "wish", "dinner", "breakfast", "buy", "bf_switch"].includes(a.type));
      out.reply = String(out.reply || "");
    }
    return json(out);
  } catch (e) {
    const status = (e as any)?.status;
    console.error("mp-ai error", status, (e as Error)?.message);
    return json({ error: "ai_failed", status: status || null }, 502);
  }
});
