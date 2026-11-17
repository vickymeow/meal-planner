// 早饭晚饭的 AI 助手（Supabase Edge Function）
// - task "recipe"：给一道家常菜写配料（带份量）和做法
// - task "intent"：把一句话（语音转的字）变成 App 里要做的事
// 用阿里云百炼 Qwen 的 Token Plan（OpenAI 兼容接口）。
// 在 Supabase 后台 Edge Functions → Secrets 里设：
//   QWEN_API_KEY   必填：Token Plan 的 API Key
//   QWEN_BASE_URL  可选：默认新加坡 Token Plan；国内的 key 用 https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
//   QWEN_MODEL     可选：默认 qwen3.7-plus，以 Token Plan 控制台里显示的模型名为准
// 只接受带正确家庭密钥（h）的请求。
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const BASE_URL = (Deno.env.get("QWEN_BASE_URL") || "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, "");
const MODEL = Deno.env.get("QWEN_MODEL") || "qwen3.7-plus";

// 让模型只回 JSON：在提示里给出格式，再用 response_format json_object 兜住
async function askJSON(system: string, user: string, schema: unknown) {
  const res = await fetch(BASE_URL + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + Deno.env.get("QWEN_API_KEY") },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system + "\n\n只输出一个 JSON 对象，不要输出其他文字。JSON 必须符合这个 JSON Schema：\n" + JSON.stringify(schema) },
        { role: "user", content: user },
      ],
    }),
  });
  const txt = await res.text();
  if (!res.ok) throw Object.assign(new Error(txt.slice(0, 300)), { status: res.status });
  const content = JSON.parse(txt)?.choices?.[0]?.message?.content || "";
  const m = String(content).match(/\{[\s\S]*\}/);
  if (!m) throw Object.assign(new Error("no json in reply"), { status: 502 });
  return JSON.parse(m[0]);
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

  if (!Deno.env.get("QWEN_API_KEY")) return json({ error: "no_key" }, 503);

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
