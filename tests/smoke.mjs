// 冒烟测试：两部模拟 iPhone（妈妈 + 小陈）共用一个假的同步后端，
// 按 CLAUDE-HANDOVER 第 6 节的验收清单逐项检查。
// 用法：在仓库根目录 `node tests/smoke.mjs`（需要 playwright）。截图存到 SHOTS 目录。
import { createRequire } from "module";
import http from "http";
import fs from "fs";
import path from "path";
const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SHOTS = process.env.SHOTS || path.join(ROOT, "tests", "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const H = "testhousehold000000000000000000";

// —— 静态文件服务 ——
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// —— 假的 Supabase：和 mp_pull / mp_push 一样的行为 ——
const db = new Map();
const feedback = [];
const pushSubs = [], notifyCalls = [];
let clock = Date.parse("2026-01-01T00:00:00Z");
const tick = () => new Date((clock += 1)).toISOString();
async function fakeSupabase(route) {
  const url = route.request().url();
  const body = JSON.parse(route.request().postData() || "{}");
  if (body.h !== H) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "unknown household" }) });
  if (url.endsWith("/rpc/mp_push_sub")) { pushSubs.push(body); return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }); }
  if (url.endsWith("/rpc/mp_feedback_add")) { feedback.push(body); return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }); }
  if (url.endsWith("/rpc/mp_push")) {
    for (const x of body.items) db.set(x.id, { id: x.id, data: x.data, deleted: !!x.deleted, by: x.by, at: tick() });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, now: tick() }) });
  }
  const since = body.since;
  const items = [...db.values()].filter((i) => (since ? i.at > since : !i.deleted));
  return route.fulfill({ contentType: "application/json", body: JSON.stringify({ now: tick(), items }) });
}

// 让模拟手机的「当地时间」固定在白天（10–15 点）或晚上（20–22 点），结果不受跑测试的时刻影响
function tzWithLocalHour(lo, hi) {
  const h = new Date().getUTCHours();
  for (let k = -11; k <= 14; k++) { const lh = (h + k + 24) % 24; if (lh >= lo && lh <= hi) return k >= 0 ? `Etc/GMT-${k}` : `Etc/GMT+${-k}`; }
  return "UTC";
}
const DAY_TZ = tzWithLocalHour(8, 11), NOON_TZ = tzWithLocalHour(13, 17), NIGHT_TZ = tzWithLocalHour(20, 22);
const results = [];
let lastAudio = null;
const aiCalls = { photo: [], tts: 0, suggest: [] };
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? "✓ " : "✗ ") + name + (detail ? " — " + detail : "")); }

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] }); // 假麦克风：录音测试用
async function phone(me, tz) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "zh-CN", permissions: ["microphone", "notifications"], timezoneId: tz || DAY_TZ });
  await ctx.route("**/rest/v1/rpc/**", fakeSupabase);
  // 假的通知服务：浏览器测试里没有真的推送服务，换成假的订阅
  await ctx.route("**/functions/v1/mp-notify", (r) => {
    const b = JSON.parse(r.request().postData() || "{}"); notifyCalls.push(b);
    return r.fulfill({ contentType: "application/json", body: JSON.stringify(b.task === "key" ? { key: "BM8UquHy02WmXbkFYJuqn6R5r9p8MvvTVvnsuj7jP_kmpH5DlVtQUUq7DM5DQubQZ6cO7mLQ81BwihblGn_KyWY" } : { sent: 1 }) });
  });
  await ctx.addInitScript(() => {
    let sub = null;
    const mk = () => ({ endpoint: "https://push.example/fake", toJSON: () => ({ endpoint: "https://push.example/fake", keys: { p256dh: "x", auth: "y" } }), unsubscribe: async () => { sub = null; return true; } });
    if (window.Notification) {
      let perm = "default";
      Object.defineProperty(Notification, "permission", { get: () => perm, configurable: true });
      Notification.requestPermission = async () => { perm = "granted"; return perm; };
    }
    if (window.PushManager) {
      PushManager.prototype.subscribe = async function () { sub = mk(); return sub; };
      PushManager.prototype.getSubscription = async function () { return sub; };
    }
  });
  await ctx.route("**/image.pollinations.ai/**", (r) => r.abort()); // 测「配不出图」时的暖色方块
  // 假的 AI：句子里带「AI测试」时假装 Qwen 听懂了；其他时候假装还没开通（走本地规则）
  await ctx.route("**/functions/v1/mp-ai", (r) => {
    const b = JSON.parse(r.request().postData() || "{}");
    if (b.task === "intent" && /AI测试/.test(b.text || "")) {
      const day = (b.days || [])[3].split(" ")[0];
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ reply: "周几不在家，想吃卤牛肉", actions: [
        { type: "home", date: day, dish: "", on: false, level: 2, qty: "" },
        { type: "wish", date: "", dish: "卤牛肉", on: true, level: 3, qty: "" } ] }) });
    }
    if (b.task === "photo") { aiCalls.photo.push(b.name); return r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "photo_failed" }) }); }
    if (b.task === "tts") { aiCalls.tts++; return r.fulfill({ contentType: "application/json", body: JSON.stringify({ url: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=" }) }); }
    if (b.task === "transcribe") {
      const wav = Buffer.from(b.audio || "", "base64");
      lastAudio = { riff: wav.slice(0, 4).toString(), wave: wav.slice(8, 12).toString(), rate: wav.length > 28 ? wav.readUInt32LE(24) : 0, bytes: wav.length, mime: b.mime };
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ text: "我周五不在家吃饭。" }) });
    }
    if (b.task === "recipe" && b.name === "酸汤肥牛") return r.fulfill({ contentType: "application/json", body: JSON.stringify({ cat: "meat", ings: ["肥牛卷 400克", "金针菇 1 把", "黄灯笼辣椒酱"], steps: ["金针菇焯水铺碗底。", "酸汤烧开下肥牛。", "浇在金针菇上。"], prep: "" }) });
    if (b.task === "suggest") {
      aiCalls.suggest.push({ style: b.style, meal: b.meal, avoid: b.avoid || [] });
      const names = { "川菜": ["水煮牛肉", "宫保鸡丁", "鱼香茄子", "回锅肉"], "粤菜": ["干炒牛河", "蜜汁叉烧", "豉汁蒸排骨", "蚝油菜心"] }[b.style] || ["酸菜炒肉丝", "香菜拌牛肉", "番茄炒蛋", "蒜蓉粉丝蒸扇贝"];
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ dishes: names.map((n) => ({ name: n, blurb: n + "很下饭", cat: "meat", ings: ["主料 300克", "姜 3 片"], steps: ["切好。", "下锅炒熟。"], prep: "" })) }) });
    }
    return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "no_key" }) });
  });
  await ctx.route("**/api.open-meteo.com/**", (r) => { // 假天气，不连外网
    const time = []; for (let i = -1; i < 9; i++) { const d = new Date(); d.setDate(d.getDate() + i); time.push(d.toISOString().slice(0, 10)); }
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ daily: { time, weather_code: time.map(() => 1), temperature_2m_max: time.map(() => 18), temperature_2m_min: time.map(() => 9) } }) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/pollinations|net::ERR_FAILED|status of 50[23]/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${BASE}/?h=${H}&me=${me}`);
  await page.waitForTimeout(600);
  return { page, errors, ctx };
}
const syncBoth = async (...pages) => { for (const p of pages) await p.evaluate(() => MPStore.syncNow()); for (const p of pages) await p.evaluate(() => MPStore.syncNow()); await pages[0].waitForTimeout(200); };

const mom = await phone("mom");
const chen = await phone("chen");
const M = mom.page, C = chen.page;

// 1. 妈妈屏顶部两个大按钮，手动切换
check("妈妈屏有「定计划 / 照着做」两个按钮", (await M.locator("#tab-plan").isVisible()) && (await M.locator("#tab-cook").isVisible()));
await M.click("#tab-cook");
check("点「照着做」切到做饭页", await M.locator("#cook-area").isVisible() && !(await M.locator("#plan-area").isVisible()));
await M.click("#tab-plan");
check("点「定计划」切回来", await M.locator("#plan-area").isVisible());

// 起步菜谱已放进同步库
await syncBoth(M, C);
check("起步菜谱写进同步库（一次）", db.has("meta:seeded") && db.has("dish:乌冬面") && db.has("dish:清蒸鲈鱼"));

// 妈妈屏：「周几」在「妈妈定晚饭」里面，不在最上面
check("妈妈屏「周几」在「妈妈定晚饭」那块里", await M.evaluate(() => document.getElementById("day-strip").closest(".sec").innerText.includes("这一天吃什么")));
const bfBox = await M.locator("#breakfast").boundingBox();
const dnBox = await M.locator("#dinner-plan").boundingBox();
check("定计划：早饭是晚饭上面的一小条，不放照片", await M.locator("#breakfast").isVisible() && (await M.locator("#breakfast .bs-one").count()) === 4 && (await M.locator("#breakfast img").count()) === 0 && bfBox.height < 230 && bfBox.y < dnBox.y, Math.round(bfBox.height) + "px");
check("早饭图标换成日出", /🌅/.test(await M.locator("#breakfast").innerText()) && !/🥣/.test(await M.content()));
const bfNames = await M.locator("#breakfast .bs-one b").allInnerTexts();
check("按人排：Vicky、小陈在前", bfNames.join("、") === "Vicky、小陈、爸爸、妈妈", bfNames.join("、"));
// 妈妈只能换自己的早饭
check("妈妈屏早饭只能换自己的（一个「换我的」）", (await M.locator("#breakfast button").count()) === 1);
check("白天打开「定计划」，默认是今天", /今天/.test(await M.locator("#day-strip .day-big .db-rel").innerText()) && !(await M.locator("#day-strip .day-big.not-today").count()));
await M.locator("#day-strip .day-chip").nth(1).click(); await M.waitForTimeout(100); // 明天
await M.locator("#day-strip").screenshot({ path: `${SHOTS}/15-not-today.png` });
check("看的不是今天：大标题写明「看的不是今天」", /看的不是今天/.test(await M.locator("#day-strip .day-big").innerText()));
await M.locator("#breakfast button").click();
await M.locator(".sheet .pick-card", { hasText: "蒸饺" }).click();
await M.locator(".sheet .sheet-cta").first().click();
await M.waitForTimeout(150);
check("妈妈换好自己的早饭", /蒸饺/.test(await M.locator("#breakfast").innerText()));

check("日期下面有天气", /天气：/.test(await M.locator("#plan-meta").innerText()));

// 3. 妈妈屏谁在家：只显示，不能点；都在家写「都在家吃饭」
check("都在家时写「都在家吃饭」", /都在家吃饭/.test(await M.locator("#people").innerText()));
check("妈妈屏谁在家没有按钮", (await M.locator("#people button").count()) === 0);
check("没有写「4人吃饭」", !/4\s*人吃饭/.test(await M.locator("#people").innerText()));
await M.screenshot({ path: `${SHOTS}/01-mom-plan.png` });

// 4. 家里人屏：逐天点早饭，没有绿色批量按钮；有本周菜单 tab 和买菜
check("小陈打开就是家里人那屏", await C.locator("#view-family").isVisible());
check("没有「一次点好几天」批量按钮", !(await C.content()).includes("一次点好几天"));
check("家里人屏第一块是「在不在家吃饭」", await C.evaluate(() => document.querySelector("#family-main .sec").innerText.includes("在家吃饭吗")));
check("在不在家：默认都在家，折成一行", /都在家吃饭/.test(await C.locator("#fam-home .home-sum").innerText()) && (await C.locator("#fam-home .home-day").count()) === 0);
await C.locator("#fam-home .fold-btn").click(); await C.waitForTimeout(100);
check("在不在家：展开后 7 天都能点", (await C.locator("#fam-home .home-day").count()) === 7);
check("我的早饭默认折起来", !(await C.locator("#fam-breakfast").isVisible()));
await C.click("#fam-bf-toggle");
check("早饭按天一排排列（7 天）", (await C.locator("#fam-breakfast .d-row").count()) === 7);
await C.locator("#fam-breakfast .d-row").nth(0).locator("button").click();
await C.locator(".sheet .pick-card", { hasText: "馄饨" }).click();
check("选上的早饭有绿框和「✓ 选了」", /选了/.test(await C.locator(".sheet .pick-card.picked").innerText()));
await C.locator(".sheet .sheet-cta").first().click();
await C.waitForTimeout(120);
check("点好就定好今天早饭", /馄饨/.test(await C.locator("#fam-breakfast .d-row").nth(0).innerText()));
// 早饭能点好几样（后天：豆浆 + 烧卖）
await C.locator("#fam-breakfast .d-row").nth(2).locator("button").click();
await C.locator(".sheet .pick-card", { hasText: "豆浆" }).click();
await C.locator(".sheet .pick-card", { hasText: "烧卖" }).click();
check("一次能选好几样", (await C.locator(".sheet .pick-card.picked").count()) === 2 && /豆浆、烧卖/.test(await C.locator(".sheet .sheet-cta").first().innerText()));
await C.locator(".sheet .sheet-cta").first().click();
await C.waitForTimeout(120);
check("我的早饭里写着两样", /豆浆、烧卖/.test(await C.locator("#fam-breakfast .d-row").nth(2).innerText()));
check("有「本周菜单」页签", /本周菜单/.test(await C.locator("#dtab-menu").innerText()));
check("家里人版没有 1 2 3 编号", !/[0-9] · /.test(await C.locator("#family-main").innerText()));
check("家里人版样式和妈妈版统一：页签在最上面、日期下面有节气暖心话", await C.evaluate(() => { const sc = document.querySelector("#view-family .screen-scroll"); return sc.firstElementChild.classList.contains("switch") && !!document.querySelector("#fam-meta .dm-warm"); }));
await C.click("#dtab-menu");
await C.waitForTimeout(150);
check("本周菜单里能选周几看妈妈做什么，默认今天", (await C.locator("#fam-day-strip .day-chip").count()) === 7 && /今天/.test(await C.locator("#fam-day-strip .day-chip.on").innerText()));
const tm = await C.locator("#fam-today-menu").innerText();
check("本周菜单：晚饭在上，早饭只显示自己的，别人的折起来", /晚饭/.test(tm) && /我的早饭/.test(tm) && /其他人的早饭（\d 份）/.test(tm) && !/妈妈的/.test(tm), tm.replace(/\n/g, " ").slice(0, 120));
await C.screenshot({ path: `${SHOTS}/02b-family-today.png` });
await C.click("#dtab-order");
check("底部有「买菜」", await C.locator("#nav-buy").isVisible());
// 小陈明天不在家
await C.locator("#fam-home .home-day").nth(1).click();
await C.waitForTimeout(150);
check("点一下就改成明天不在家", /不在家/.test(await C.locator("#fam-home .home-day").nth(1).innerText()));
// 早饭总开关：关掉就不用点
await C.locator("#fam-bf-switch .switch-btn").click();
await C.waitForTimeout(150);
check("关掉「我吃早饭」：早饭那块收起来、不用点", /不吃早饭/.test(await C.locator("#fam-bf-switch").innerText()) && !(await C.locator("#fam-breakfast").isVisible()));
await C.locator("#fam-bf-switch .switch-btn").click();
await C.waitForTimeout(150);
// 小陈点想吃：红烧肉 · 超想吃
await C.click("#fam-order-btn");
await C.locator(".sheet .pick-card", { hasText: "红烧肉" }).click();
await C.waitForTimeout(120);
await C.locator(".sheet .crave-btn.lv3").click();
await C.waitForTimeout(150);
check("想吃带程度标签", /超想吃/.test(await C.locator("#fam-wishes").innerText()));
// 加客人：默认折叠，展开默认选周六
check("加客人默认折叠", !(await C.locator("#guest-body").isVisible()));
await C.click("#guest-fold-btn");
check("展开后默认选周六", /周六/.test(await C.locator("#guest-day-row .g-day-btn.on").innerText()));
await C.fill("#guest-name", "姑姑一家");
await C.click("#guest-add-btn");
await C.screenshot({ path: `${SHOTS}/02-family.png` });

// 同步：小陈的改动出现在妈妈手机上
await syncBoth(C, M);
await M.locator("#day-strip .day-chip").nth(1).click(); // 明天
const people = await M.locator("#people").innerText();
check("同步：妈妈看到小陈明天不在家", /小陈不在家/.test(people), people.replace(/\n/g, " "));
check("同步：妈妈看到小陈超想吃红烧肉", /红烧肉/.test(await M.locator("#wishes").innerText()));
check("同步：家里动态有小陈的记录", /小陈/.test(await M.locator("#view-today .history-box").innerText()));

// 2. 定计划能定整周（今天 + 其他天）
await M.locator("#day-strip .day-chip").nth(0).click();
await M.locator("#dinner-plan .plan-empty").click();
await M.locator(".sheet .pick-card", { hasText: "红烧肉" }).first().click();
await M.waitForTimeout(120);
await M.locator("#day-strip .day-chip").nth(3).click();
await M.locator("#dinner-plan .plan-empty").click();
await M.locator(".sheet .pick-card", { hasText: "清蒸鲈鱼" }).first().click();
await M.waitForTimeout(120);
await M.locator("#dinner-plan .add-dish").click();
await M.locator(".sheet .pick-card", { hasText: "青菜汤" }).first().click();
await M.waitForTimeout(120);
const wishTxt = await M.locator("#wishes").innerText();
check("想吃的菜排进晚饭后标「已安排」", /红烧肉[\s\S]*已安排 · 今天/.test(wishTxt), wishTxt.replace(/\n/g, " ").slice(0, 80));
check("想吃里 Vicky、小陈排在前面", wishTxt.indexOf("Vicky") < wishTxt.indexOf("爸爸") && wishTxt.indexOf("小陈") < wishTxt.indexOf("爸爸"));
check("页签下面没有重复的小标签", (await M.locator("#plan-area .day-when").count()) === 0 && (await C.locator("#fam-when").count()) === 0);
const decided = await M.locator("#day-strip .day-chip .dc-st.ok").count();
check("一周里定了好几天的晚饭", decided === 2, decided + " 天");
check("一顿能定好几道（妈妈自己决定）", (await M.locator("#dinner-plan .dish-row").count()) === 2);
// 照着做：只看今天，大图大名，做好了 → 从最近想吃拿掉
check("妈妈一打开 App（还在定计划）就提前准备声音", aiCalls.tts >= 1, aiCalls.tts + " 次");
await M.click("#tab-cook");
await M.waitForTimeout(2200);
const ttsBefore = aiCalls.tts;
check("一打开照着做就提前准备好声音", ttsBefore >= 1, ttsBefore + " 次");
await M.click("#read-btn"); await M.waitForTimeout(500);
check("点「读给我听」直接用准备好的，不用再等", aiCalls.tts === ttsBefore, aiCalls.tts + " 次");
check("读给我听：先请 Qwen 真人声音", aiCalls.tts >= 1 && /今天在家吃饭/.test(await M.locator("#read-panel").innerText()));
// 声音还没准备好（刚换了别的日子）：马上用手机自带的声音读，不让妈妈等
await M.click("#read-btn"); await M.waitForTimeout(100); // 先停掉上一次
await M.evaluate(() => { window.__spoke = 0; window.speechSynthesis.speak = () => { window.__spoke++; }; });
await M.locator("#cook-strip .day-chip").nth(3).click();
const ttsMid = aiCalls.tts;
await M.click("#read-btn"); await M.waitForTimeout(400);
check("声音还没准备好：马上用手机声音读，不等", await M.evaluate(() => window.__spoke) === 1);
await M.waitForTimeout(600);
check("同时在后台准备真人声音，下次用", aiCalls.tts > ttsMid, (aiCalls.tts - ttsMid) + " 次");
await M.click("#read-btn"); await M.waitForTimeout(100);
await syncBoth(M, C);
await M.locator("#cook-strip .day-chip").nth(2).click(); await M.waitForTimeout(150);
const tmrMorning = await M.locator("#morning").innerText();
check("照着做：点了两样早饭，两样都列出来、写谁要吃", /豆浆/.test(tmrMorning) && /烧卖/.test(tmrMorning) && /小陈要吃/.test(tmrMorning), tmrMorning.replace(/\n/g, " ").slice(0, 120));
await M.locator("#cook-strip .day-chip").nth(0).click(); await M.waitForTimeout(150);
check("照着做能看一整周（7 天），默认今天", (await M.locator("#cook-strip .day-chip").count()) === 7 && /今天/.test(await M.locator("#cook-strip .day-chip.on").innerText()));
const bigBox = await M.locator("#cook-strip .day-big").boundingBox(), smallBox = await M.locator("#cook-strip .day-chip").first().boundingBox();
check("照着做：正在看的那天是大块，其他天小块", bigBox && smallBox && bigBox.width > smallBox.width * 2 && /今天/.test(await M.locator("#cook-strip .day-big").innerText()));
check("日子不用横着滑也全看得到", await M.evaluate(() => { const g = document.querySelector("#cook-strip .day-grid"); return g.scrollWidth <= g.clientWidth + 1; }));
check("照着做里有今天的红烧肉", /红烧肉/.test(await M.locator("#morning").innerText()));
check("照着做里有今天的早饭（小陈的馄饨）", /馄饨/.test(await M.locator("#morning").innerText()));
check("没点早饭的人默认鸡蛋三明治", /鸡蛋三明治/.test(await M.locator("#morning").innerText()));
const bfCards = await M.locator("#morning .m-card").first().locator(".m-dish").allInnerTexts();
check("照着做：一样的早饭合并成一张，写谁要吃", bfCards.length === 2 && bfCards.some((t) => /鸡蛋三明治 × 3 份/.test(t) && /要吃/.test(t)), bfCards.map((t) => t.replace(/\n/g, " ")).join(" | "));
await M.screenshot({ path: `${SHOTS}/03-mom-cook.png` });
await M.locator(".m-dish", { hasText: "红烧肉" }).locator(".done-btn").click();
await M.click("#tab-plan");
check("做好了 → 从最近想吃拿掉", !/红烧肉/.test(await M.locator("#wishes").innerText()));
await syncBoth(M, C);
check("同步：小陈那边的想吃也没了", !/红烧肉/.test(await C.locator("#fam-wishes").innerText()));

// 客人：妈妈屏只有那天才显示
let guestDayIdx = await M.evaluate(() => { const ds = []; for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() + i); ds.push(d.getDay()); } return ds.indexOf(6); });
await M.locator("#day-strip .day-chip").nth(guestDayIdx === 0 ? 1 : 0).click();
check("没客人那天妈妈屏不显示客人", !(await M.locator("#guests-mom").isVisible()));
await M.locator("#day-strip .day-chip").nth(guestDayIdx).click();
check("客人那天妈妈屏显示客人", /姑姑一家/.test(await M.locator("#guests-mom").innerText()));

// 5. 菜谱：按「鱼」找；每道菜点得进做法
await M.click("#nav-menu");
check("菜谱分早饭 / 晚饭两个页签", (await M.locator("#menu-tabs button").count()) === 2 && /晚饭/.test(await M.locator("#menu-tabs button.on").innerText()));
await M.locator("#menu-tabs button", { hasText: "早饭" }).click();
check("早饭页签只有早饭菜", /乌冬面/.test(await M.locator("#menu-list").innerText()) && !/红烧肉/.test(await M.locator("#menu-list").innerText()));
await M.locator("#menu-tabs button", { hasText: "晚饭" }).click();
await M.locator(".filter-chip", { hasText: "鱼" }).click();
const fishText = await M.locator("#menu-list").innerText();
check("点「鱼」列出鱼的做法", ["清蒸鲈鱼", "红烧带鱼", "松鼠桂鱼", "鱼头豆腐汤"].every((n) => fishText.includes(n)) && !fishText.includes("红烧肉"));
await M.locator(".menu-row", { hasText: "红烧带鱼" }).locator(".mn-name").click();
const recBtns = await M.locator(".sheet .rec-grid .mini-btn").allInnerTexts();
check("做法页下面的小按钮：先改内容再改照片，两个一排", /改配料做法/.test(recBtns[0]) && /写详细点/.test(recBtns[1]) && /换照片/.test(recBtns[2]), recBtns.join(" | "));
check("按钮写「返回」不写「回去」", !/回去/.test(await M.locator(".sheet").innerText()) && /返回/.test(await M.locator(".sheet").innerText()));
check("点菜名打开做法（配料 + 步骤）", (await M.locator(".sheet .ing-list li").count()) > 2 && /怎么做/.test(await M.locator(".sheet").innerText()));
check("做法页有 7 天可以选", (await M.locator(".sheet .g-day-btn").count()) === 7);
await M.locator(".sheet .g-day-btn").nth(4).click(); await M.waitForTimeout(200);
await M.locator(".sheet .g-day-btn").nth(5).click(); await M.waitForTimeout(200);
check("做法页一次定进好几天", (await M.locator(".sheet .g-day-btn.on").count()) === 2 && /红烧带鱼/.test(await M.evaluate(() => JSON.stringify([4, 5].map((i) => { const d = new Date(); d.setDate(d.getDate() + i); const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); return MPStore.get("dinner:" + iso); })))));
await M.screenshot({ path: `${SHOTS}/04-recipe.png` });
await M.locator(".sheet .sheet-close").last().click();
await M.locator(".filter-chip", { hasText: "猪肉" }).click();
const porkText = await M.locator("#menu-list").innerText();
check("「猪肉」里有红烧肉，没有混进鱼", porkText.includes("红烧肉") && !porkText.includes("清蒸鲈鱼"));
await M.locator(".filter-chip", { hasText: "青菜" }).click();
const leafyText = await M.locator("#menu-list").innerText();
check("「青菜」和瓜果分开：有青菜汤，没有番茄炒蛋", leafyText.includes("青菜汤") && !leafyText.includes("番茄炒蛋"));
const chips = await M.locator(".filter-chip").allInnerTexts();
check("分类有鸡鸭、虾蟹这些（不再全塞进「肉」）", chips.some((c) => /瓜果/.test(c)) && !chips.some((c) => /^🥩 肉$/.test(c.trim())), chips.join(" "));
await M.locator(".filter-chip", { hasText: "全部" }).click();
await M.waitForTimeout(300);
const pork = M.locator(".menu-row", { hasText: "红烧肉" }).locator("img.dish-photo");
check("自带实拍照片：红烧肉显示照片", (await pork.count()) === 1 && /photos\/braised-pork\.jpg$/.test(await pork.getAttribute("src")));
const loaded = await M.evaluate(async () => Promise.all(Object.values(window.MP_PHOTOS).map(async (p) => {
  try { const r = await fetch(p.file); const b = await createImageBitmap(await r.blob()); return r.ok && b.width >= 300; } catch (e) { return false; }
})));
check("每张自带照片都能打开", loaded.length >= 20 && loaded.every(Boolean), loaded.filter(Boolean).length + "/" + loaded.length + " 张");
const brokenNames = await M.evaluate(() => Object.entries(window.MP_PHOTOS).filter(([n, p]) => !p.file || !p.author || !p.license).map(([n]) => n));
check("每张自带照片都有作者和授权", brokenNames.length === 0, brokenNames.join(","));
check("没有自带照片、也配不出图的菜显示暖色方块（不留破图）", (await M.locator(".menu-row", { hasText: "红烧带鱼" }).locator(".dish-tile").count()) === 1 || "红烧带鱼" in (await M.evaluate(() => window.MP_PHOTOS)));

// 7. 悬浮话筒：妈妈屏各页都可见
for (const v of ["today", "menu", "buy", "profile"]) {
  await M.click("#nav-" + v);
  check("语音助手在妈妈屏「" + v + "」页可见", await M.locator("#voice-fab").isVisible());
}
check("家里人屏也有语音助手", await C.locator("#voice-fab").isVisible() && /语音助手/.test(await C.locator("#voice-fab").innerText()));

// 6. 买菜：「自己加的」默认折起；Weee 按钮 44px、16.5px、橙色
await M.click("#nav-buy");
check("「自己加的」默认折起", !(await M.locator("#custom-body").isVisible()) && (await M.locator("#custom-toggle").getAttribute("aria-expanded")) === "false");
const tog = await M.locator("#custom-toggle").evaluate((e) => { const s = getComputedStyle(e); return { h: e.getBoundingClientRect().height, f: s.fontSize }; });
check("展开按钮 46px 高、16px 字", Math.round(tog.h) === 46 && tog.f === "16px", JSON.stringify(tog));
const foldLooks = await M.evaluate(() => [...document.querySelectorAll("button.fold-btn, #custom-toggle, #buy-toggle")].filter((b) => b.offsetParent).map((b) => getComputedStyle(b).fontSize + "|" + getComputedStyle(b).borderRadius));
check("所有折叠是同一个样子", foldLooks.length >= 2 && new Set(foldLooks).size === 1, foldLooks.join(" "));
await M.click("#custom-toggle");
check("点开才出现常买和输入框", await M.locator("#staple-row").isVisible() && await M.locator("#custom-name").isVisible());
const weee = M.locator("#buy-list .weee-link").first();
const ws = await weee.evaluate((e) => { const s = getComputedStyle(e); return { h: e.getBoundingClientRect().height, f: s.fontSize, w: s.fontWeight, bg: s.backgroundImage, href: e.href }; });
check("Weee 按钮 44px 高、16.5px 粗字、橙色", Math.round(ws.h) === 44 && ws.f === "16.5px" && +ws.w >= 800 && /240, 115, 42/.test(ws.bg), JSON.stringify({ h: ws.h, f: ws.f, w: ws.w }));
check("Weee 按钮去搜对应食材", /sayweee\.com\/zh\/search\?keyword=/.test(ws.href), ws.href);
const buyText = await M.locator("#buy-list").innerText();
check("买菜按定好的菜自动合并（有五花肉、鲈鱼）", /五花肉/.test(buyText) && /鲈鱼/.test(buyText));
await M.locator("#buy-list .buy-row", { hasText: "五花肉" }).locator(".b-name").click();
await M.waitForTimeout(150);
check("买到了点一下划掉", /买好了/.test(await M.locator("#buy-list .buy-row", { hasText: "五花肉" }).innerText()));
await M.locator(".staple-chip", { hasText: "牛奶" }).locator("span").first().click();
await syncBoth(M, C);
await C.click("#nav-buy");
const egg = M.locator("#buy-list .buy-row", { hasText: "鸡蛋" }).first();
const before = +(await M.locator("#buy-badge").innerText() || 0);
await egg.locator(".nn-btn").click(); await M.waitForTimeout(150);
check("每样料都有「不用买」，点了就变灰、不算进没买的", /不用买/.test(await M.locator("#buy-list .buy-row.skipped").first().innerText()) && +(await M.locator("#buy-badge").innerText() || 0) === before - 1);
await M.click("#buy-toggle"); await M.waitForTimeout(100);
check("「做菜要买的」能折起来，折起时写着几样没买", !(await M.locator("#buy-list").isVisible()) && /样/.test(await M.locator("#buy-toggle").innerText()));
await M.click("#buy-toggle"); await M.waitForTimeout(100);
check("同步：小陈的买菜页也看到牛奶、五花肉已买", /牛奶/.test(await C.locator("#custom-list").innerText()) && /买好了/.test(await C.locator("#buy-list .buy-row", { hasText: "五花肉" }).innerText()));
await M.screenshot({ path: `${SHOTS}/05-buy.png`, fullPage: false });
await M.locator("#buy-list .weee-link").first().scrollIntoViewIfNeeded();
await M.screenshot({ path: `${SHOTS}/06-buy-weee.png` });

// 8. 底部只有一个「家里动态」（每屏一处，在最下面）
await M.click("#nav-today");
check("妈妈屏只有一个「家里动态」", (await M.locator("#view-today .activity-sec").count()) === 1);
const order = await M.evaluate(() => { const secs = [...document.querySelectorAll("#view-today .sec")]; return secs.findIndex((s) => s.classList.contains("activity-sec")) >= secs.length - 2; });
check("「家里动态」在页面最下面", order);
const feedLink = M.locator("#view-today .history-box .dish-link-txt").first();
check("家里动态里的菜名能点", (await feedLink.count()) > 0);
if (await feedLink.count()) {
  const dn = await feedLink.textContent();
  await feedLink.scrollIntoViewIfNeeded(); await feedLink.click();
  await M.waitForTimeout(300);
  check("点动态里的菜名打开做法", (await M.locator(".sheet").innerText()).includes(dn), dn);
  await M.keyboard.press("Escape"); await M.evaluate(() => document.querySelector(".sheet-close")?.click());
  await M.waitForTimeout(300);
}
await M.locator("#view-today .activity-sec").screenshot({ path: `${SHOTS}/feed.png` });
check("家里动态里提到的人用颜色标出来，句子中间不插头像", (await M.locator("#view-today .history-box .who-ref").count()) > 0 && (await M.locator("#view-today .history-box .act-main img, #view-today .history-box .act-main .mini-av").count()) === 0);

// 语音助手（妈妈）：AI 没开通时用本地规则听懂 → 确认页 → 写入
await M.click("#voice-fab", { force: true }); // 按钮有呼吸动画
const wd = await M.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 2); return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()]; });
await M.fill(".sheet .assist-input", wd + "做鱼，后天还要蒸水蛋");
await M.locator(".sheet .sheet-cta").click();
await M.waitForSelector(".sheet .vp-item");
check("说话后先弹确认页", /对吗/.test(await M.locator(".sheet h3").innerText()));
check("「做鱼」直接对上妈妈菜谱里的「鱼」", /鱼/.test(await M.locator(".sheet .vp-item").first().innerText()));
await M.screenshot({ path: `${SHOTS}/07-voice-confirm.png` });
await M.locator(".sheet .sheet-cta").click();
await M.locator("#day-strip .day-chip").nth(2).click();
const d2 = await M.locator("#dinner-plan").innerText();
check("确认后排进那天的晚饭", /鱼/.test(d2) && /蒸水蛋/.test(d2), d2.replace(/\n/g, " "));

// 语音助手（家里人）：本地规则听懂好几件事
await C.click("#voice-fab", { force: true });
await C.fill(".sheet .assist-input", "我明天不在家吃饭，超想吃红烧带鱼，还要买酱油");
await C.locator(".sheet .sheet-cta").click();
await C.waitForSelector(".sheet .vp-item");
const acts = await C.locator(".sheet .vp-item").allInnerTexts();
check("家里人说一句话听懂 3 件事（不在家 / 想吃 / 买菜）", acts.length === 3 && /明天不在家/.test(acts[0]) && /红烧带鱼/.test(acts[1]) && /酱油/.test(acts[2]), acts.join(" | "));
await C.screenshot({ path: `${SHOTS}/10-assistant.png` });
await C.locator(".sheet .sheet-cta").click();
await C.waitForTimeout(200);
check("确认后都办好了", /明天不在家/.test(await C.locator("#fam-home .home-sum").innerText()) && /红烧带鱼/.test(await C.locator("#fam-wishes").innerText()));
// 语音助手走 AI（假 Qwen）
await C.click("#voice-fab", { force: true });
await C.fill(".sheet .assist-input", "AI测试 那天不回来吃，想吃卤牛肉");
await C.locator(".sheet .sheet-cta").click();
await C.waitForSelector(".sheet .vp-item");
check("AI 听懂的结果也先给人确认", (await C.locator(".sheet .vp-item").count()) === 2 && /卤牛肉/.test(await C.locator(".sheet").innerText()));
await C.locator(".sheet .sheet-close").last().click();
// 语音助手：点「说话」→ 手机录音 → 转成 16k WAV 交给 Qwen 听写 → 自动接着听懂
await C.click("#voice-fab", { force: true });
await C.locator(".sheet .vp-mic").click();
await C.waitForSelector("#rec-bar:not([hidden])");
check("点说话后出现「正在听」红条", /正在听/.test(await C.locator("#rec-bar").innerText()));
await C.waitForTimeout(1500);
await C.locator("#rec-bar").click();
await C.waitForSelector(".sheet .vp-item", { timeout: 15000 });
await C.locator(".sheet .sheet-close").last().click();
// 说完停一下就自动结束：换成「先说 1.2 秒、然后安静」的假声音
await C.evaluate(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new AudioContext(), osc = ctx.createOscillator(), g = ctx.createGain(), dst = ctx.createMediaStreamDestination();
    g.gain.value = 0; osc.frequency.value = 220; osc.connect(g); g.connect(dst); osc.start();
    setTimeout(() => { g.gain.value = 0.6; }, 600); setTimeout(() => { g.gain.value = 0; }, 1800);
    return dst.stream;
  };
});
await C.click("#voice-fab", { force: true });
await C.locator(".sheet .vp-mic").click();
await C.waitForSelector("#rec-bar:not([hidden])");
const autoT0 = Date.now();
await C.waitForSelector(".sheet .vp-item", { timeout: 9000 }).catch(() => {});
check("说完停一下，不用点就自动结束", (await C.locator(".sheet .vp-item").count()) > 0, (Date.now() - autoT0) + "ms");
check("录音转成 16k 单声道 WAV 发给 Qwen", lastAudio && lastAudio.riff === "RIFF" && lastAudio.wave === "WAVE" && lastAudio.rate === 16000 && lastAudio.bytes > 20000, JSON.stringify(lastAudio));
check("听写回来的字自动接着听懂：周五不在家", /(周五|明天|今天|后天)不在家吃饭/.test(await C.locator(".sheet .vp-item").first().innerText()), await C.locator(".sheet").innerText().then((t) => t.slice(0, 80).replace(/\n/g, " ")));
await C.locator(".sheet .sheet-close").last().click();
// 加新菜：AI 写配料和做法
await C.click("#nav-menu");
await C.click("#menu-add-btn");
await C.fill(".sheet input.add-input", "酸汤肥牛");
await C.locator(".sheet .ai-btn").click();
await C.waitForTimeout(300);
check("加新菜：AI 写好配料和做法", /肥牛卷 400克/.test(await C.locator(".sheet textarea").first().inputValue()) && /酸汤/.test(await C.locator(".sheet textarea").nth(1).inputValue()));
await C.locator(".sheet .sheet-close").last().click();

// 在「加新菜」那页说了一整句话：要听懂是「明天晚饭做红烧肉」，不能把整句话当成菜名
const tmrIso = await M.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); });
await M.click("#nav-menu");
await M.click("#menu-add-btn");
await M.fill(".sheet input.add-input", "明天晚上还是吃红烧肉");
await M.locator(".sheet .sheet-cta").click();
await M.waitForSelector(".sheet .vp-item");
const sentTxt = await M.locator(".sheet .vp-item").first().innerText();
check("菜名那格里写了一句话：听懂成「明天晚饭做红烧肉」", /明天晚饭做「红烧肉」/.test(sentTxt) && /菜谱里有的/.test(sentTxt) && (await M.locator(".sheet .vp-item img").count()) === 1, sentTxt.replace(/\n/g, " "));
await M.locator(".sheet .sheet-cta").click(); await M.waitForTimeout(300);
check("排进了明天晚饭，没有建出一道叫整句话的菜", (await M.evaluate((d) => MPStore.get("dinner:" + d).dishes.includes("红烧肉"), tmrIso)) && ![...db.keys()].some((k) => k.startsWith("dish:") && /明天|还是/.test(k)));
check("办完以后上面出现「撤销」", await M.locator("#undo-bar").isVisible() && /撤销/.test(await M.locator("#undo-bar .ub-btn").innerText()));
// 撤销：说错了（后天晚饭做东坡肉，一道新菜）→ 点撤销 → 晚饭改回去，新菜也没了，动态里那条也拿掉
const d2Iso = await M.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 2); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); });
const before2 = await M.evaluate((d) => JSON.stringify((MPStore.get("dinner:" + d) || {}).dishes || []), d2Iso);
await M.click("#menu-add-btn");
await M.fill(".sheet input.add-input", "后天晚饭做东坡肉");
await M.locator(".sheet .sheet-cta").click();
await M.waitForSelector(".sheet .vp-item");
check("新菜在确认页标着「新菜，会加进菜谱」", /新菜，会加进菜谱/.test(await M.locator(".sheet .vp-item").first().innerText()));
await M.locator(".sheet .sheet-cta").click(); await M.waitForTimeout(300);
const mid2 = await M.evaluate((d) => [MPStore.get("dinner:" + d).dishes.includes("东坡肉"), !!MPStore.get("dish:东坡肉")], d2Iso);
await M.locator("#undo-bar .ub-btn").click(); await M.waitForTimeout(300);
const after2 = await M.evaluate((d) => [JSON.stringify((MPStore.get("dinner:" + d) || {}).dishes || []), !!MPStore.get("dish:东坡肉"), MPStore.list("log:").some((l) => /东坡肉/.test(l.data.text || ""))], d2Iso);
check("点「撤销」：晚饭改回原样，新菜和动态也拿掉", mid2[0] && mid2[1] && after2[0] === before2 && !after2[1] && !after2[2] && !(await M.locator("#undo-bar").isVisible()), JSON.stringify([mid2, after2]));
// 没说哪天：「还是吃清蒸鲈鱼」也认得出是菜谱里的菜
await M.click("#menu-add-btn");
await M.fill(".sheet input.add-input", "还是吃清蒸鲈鱼吧");
await M.locator(".sheet .sheet-cta").click();
await M.waitForSelector(".sheet .vp-item");
check("「还是吃清蒸鲈鱼吧」认出是菜谱里的清蒸鲈鱼", /晚饭做「清蒸鲈鱼」/.test(await M.locator(".sheet .vp-item").first().innerText()));
await M.locator(".sheet .sheet-close").last().click();
// 只写一个真的新菜名：照原来的走，不打扰
await M.click("#menu-add-btn");
await M.fill(".sheet input.add-input", "佛跳墙");
await M.locator(".sheet .sheet-cta").click(); await M.waitForTimeout(200);
check("只写一个新菜名，还是照原来的加新菜", /加进晚饭菜谱/.test(await M.locator(".sheet").innerText()) && /佛跳墙/.test(await M.locator(".sheet").innerText()));
await M.locator(".sheet .sheet-close").last().click();
// 输入框旁边的小话筒：说一整句也听得懂（假听写回来的是「我周五不在家吃饭。」）
await C.evaluate(() => { delete navigator.mediaDevices.getUserMedia; });
await C.click("#nav-menu");
await C.click("#menu-add-btn");
await C.locator(".sheet .name-row .voice-btn").click();
await C.waitForSelector("#rec-bar:not([hidden])");
await C.waitForTimeout(1200);
await C.locator("#rec-bar").click();
await C.waitForSelector(".sheet .vp-item", { timeout: 15000 });
check("加新菜页的小话筒说整句话：听懂成「周五不在家」，不是菜名", /(周五|明天|今天|后天)不在家吃饭/.test(await C.locator(".sheet .vp-item").first().innerText()));
await C.locator(".sheet .sheet-close").last().click();
// 买菜那格也一样
await M.click("#nav-buy");
if (!(await M.locator("#custom-name").isVisible())) await M.click("#custom-toggle");
await M.fill("#custom-name", "后天晚饭做番茄炒蛋");
await M.click("#custom-add-btn");
await M.waitForSelector(".sheet .vp-item");
check("买菜那格写了一句话也听懂", /后天晚饭做「番茄炒蛋」/.test(await M.locator(".sheet .vp-item").first().innerText()) && !/后天晚饭/.test(await M.locator("#custom-list").innerText()));
await M.locator(".sheet .sheet-close").last().click();
await M.click("#nav-today");

// 9. 全中文；没有中英文混写（菜名、人名 Vicky 和品牌名 Weee 除外）
const visible = await M.locator("body").innerText();
const eng = (visible.match(/[A-Za-z]{2,}/g) || []).filter((w) => !["Vicky", "Weee"].includes(w));
check("界面没有英文混写", eng.length === 0, eng.join(","));

// 通知：首页有提示条；「我的」里能打开
await M.click("#nav-today"); await M.waitForTimeout(150);
check("首页有「打开通知」提示条（说清楚通知什么）", await M.locator("#view-today .notify-banner").isVisible() && /有人点|家里人点/.test(await M.locator("#view-today .notify-banner").innerText()));
// 想吃新的早饭：家里还没有的 → 进「大家最近想吃」→ 妈妈标「家里有了」→ 进菜谱 → 妈妈标「吃完了」
await C.click("#nav-today"); await C.click("#dtab-order"); await C.waitForTimeout(150);
if (!(await C.locator("#fam-breakfast").isVisible())) await C.click("#fam-bf-toggle");
await C.locator("#fam-breakfast .d-row").nth(3).locator("button").click();
check("点早饭最下面是「想吃新的早饭」，不再直接写进那天", await C.locator(".sheet .bf-new-btn").isVisible() && !/写下来/.test(await C.locator(".sheet").innerText()));
await C.locator(".sheet .bf-new-btn").click();
await C.fill("#bf-wish-input", "生煎包");
await C.locator(".sheet .sheet-cta").click(); await C.waitForTimeout(200);
await syncBoth(C, M);
check("新早饭不定进哪天，也还不在早饭菜谱里", !/生煎包/.test(await C.locator("#fam-breakfast").innerText()) && db.get("dish:生煎包").data.stock === "wish");
await M.click("#nav-today"); await M.click("#tab-plan"); await M.waitForTimeout(150);
const bfChip = M.locator("#wishes .chip", { hasText: "生煎包" });
check("妈妈在「大家最近想吃」里看到生煎包，带早饭标记", /🌅 早饭/.test(await bfChip.innerText()));
await bfChip.click();
check("点开有「加到买菜清单」和「家里有了」", /加到买菜清单/.test(await M.locator(".sheet").innerText()) && /家里有了/.test(await M.locator(".sheet").innerText()));
await M.locator(".sheet .sheet-cta").click(); await M.waitForTimeout(200);
await syncBoth(M, C);
const haveLog = [...db.values()].find((x) => x.id.startsWith("log:") && /生煎包家里有了/.test(x.data.text || ""));
check("家里有了：从想吃里拿掉，只通知想吃的人（小陈）", !/生煎包/.test(await M.locator("#wishes").innerText()) && haveLog && haveLog.data.to.join() === "chen" && !db.get("dish:生煎包").data.stock, haveLog && JSON.stringify(haveLog.data.to));
await C.locator("#fam-breakfast .d-row").nth(3).locator("button").click();
await C.locator(".sheet .pick-card", { hasText: "生煎包" }).click();
await C.locator(".sheet .sheet-cta").first().click(); await C.waitForTimeout(150);
check("家里有了以后，想吃的人自己选哪天吃", /生煎包/.test(await C.locator("#fam-breakfast .d-row").nth(3).innerText()));
await syncBoth(C, M);
await M.click("#nav-menu"); await M.locator("#menu-tabs button", { hasText: "早饭" }).click();
await M.locator(".menu-row", { hasText: "生煎包" }).locator(".stock-btn").click(); await M.waitForTimeout(200);
await syncBoth(M, C);
const outLog = [...db.values()].find((x) => x.id.startsWith("log:") && /生煎包吃完了/.test(x.data.text || ""));
check("妈妈点「吃完了」：变灰，提醒点了的人换一样", /吃完了/.test(await M.locator(".menu-row", { hasText: "生煎包" }).innerText()) && outLog && outLog.data.to.join() === "chen" && /换一样/.test(await C.locator("#fam-breakfast .d-row").nth(3).innerText()));
await C.locator("#fam-breakfast .d-row").nth(0).locator("button").click();
check("吃完了的早饭家里人点不了", (await C.locator(".sheet .pick-card.out", { hasText: "生煎包" }).count()) === 1);
await C.locator(".sheet .sheet-close").last().click();
await C.click("#nav-menu"); await C.locator("#menu-tabs button", { hasText: "早饭" }).click();
check("「吃完了」按钮只有妈妈有", (await C.locator(".stock-btn").count()) === 0);
await M.locator(".menu-row", { hasText: "生煎包" }).locator(".stock-btn").click(); await M.waitForTimeout(150);
check("妈妈点「又有了」就恢复", !/吃完了，等再买/.test(await M.locator(".menu-row", { hasText: "生煎包" }).innerText()));
await M.locator("#menu-tabs button", { hasText: "晚饭" }).click(); await C.locator("#menu-tabs button", { hasText: "晚饭" }).click();
await M.click("#nav-today"); await C.click("#nav-today");
// 我的：换人、反馈
await M.click("#nav-profile");
await M.locator("#notify-sec .sheet-cta").click();
await M.waitForTimeout(600);
check("打开通知：手机订阅交给后台（记着是妈妈）", pushSubs.some((p) => p.who === "mom" && p.enable === true && /push.example/.test(p.sub.endpoint)), JSON.stringify(pushSubs).slice(0, 160));
check("打开后马上发一条试试，「我的」里显示已打开", notifyCalls.some((c) => c.task === "test" && c.who === "mom") && /已经打开/.test(await M.locator("#notify-sec").innerText()));
check("打开后首页提示条不见了", !(await M.locator("#view-today .notify-banner").isVisible()));
await M.screenshot({ path: `${SHOTS}/08-profile.png` });
check("「我的」页有图片来源", /图片来源/.test(await M.locator("#credits-sec").innerText()));
check("「我的」页有发给家里人的链接", (await M.locator("#share-sec .share-row").count()) === 4);
await M.locator("#view-profile [data-fb-slot] input").fill("字再大一点");
await M.locator("#view-profile [data-fb-slot] .sheet-cta").click();
await syncBoth(M, C);
check("反馈直接送到后台（带名字）", feedback.some((f) => f.who === "mom" && f.msg === "字再大一点"));
check("反馈不留在 App 里给家里人看", (await M.locator(".fb-list, .fb-item").count()) === 0 && ![...db.keys()].some((k) => k.startsWith("fb:")));

// 刷新后数据还在（不是 demo，不会恢复原样）
await M.reload(); await M.waitForTimeout(500);
await M.locator("#day-strip .day-chip").nth(0).click();
check("刷新后计划还在", /红烧肉/.test(await M.locator("#dinner-plan").innerText()));

// 图标
check("主屏图标是原创的（不引用外站图）", !(await M.content()).includes("homeflavors") && !(await M.content()).includes("halfphoto"));

// 第一次打开（没有 me）：问这部手机是谁的
const fresh = await browser.newContext({ ...devices["iPhone 13"] });
await fresh.route("**/rest/v1/rpc/**", fakeSupabase);
const F = await fresh.newPage();
await F.goto(`${BASE}/?h=${H}`);
check("第一次打开问「这部手机是谁的」", await F.locator("#welcome").isVisible());
await F.screenshot({ path: `${SHOTS}/00-welcome.png` });
// 没有家庭密钥：本机模式提示
const local = await browser.newContext({ ...devices["iPhone 13"] });
const L = await local.newPage();
await L.goto(`${BASE}/?me=vicky`);
check("没有链接密钥时提示还没连上同步", /还没连上全家同步/.test(await L.locator("#sync-bar").innerText()));

// 想吃的排最上 + 感谢的话
await C.click("#nav-menu");
await C.locator("#menu-tabs button", { hasText: "晚饭" }).click();
await C.locator(".menu-row", { hasText: "小酥肉" }).locator(".want-btn").click();
check("点菜时有感谢的话可以选", (await C.locator(".sheet .thanks-chip").count()) === 3);
await C.locator(".sheet .thanks-chip", { hasText: "妈妈辛苦啦" }).click();
await C.locator(".sheet .crave-btn.lv2").click();
await C.waitForTimeout(200);
const wantedRows = await C.locator("#menu-list .menu-row.wanted .mn-name").allInnerTexts();
const firstRows = await C.locator("#menu-list .menu-row .mn-name").allInnerTexts();
check("想吃的菜排在菜谱最上面（越想吃越靠上）", wantedRows.some((t) => /小酥肉/.test(t)) && firstRows.slice(0, wantedRows.length).join("|") === wantedRows.join("|") && /超想吃|❤️/.test(wantedRows[0]), wantedRows.join(" | ").replace(/\n/g, " "));
check("想吃带着那句感谢的话", /妈妈辛苦啦/.test(await C.locator("#fam-wishes").innerText()));
// 加新菜：排在上面，加完问想不想吃
await C.click("#menu-add-btn");
await C.fill(".sheet input.add-input", "酸菜鱼");
await C.locator(".sheet .sheet-cta").click();
await C.locator(".sheet .sheet-cta").click();
check("加完新菜问「你想吃吗」", /你想吃吗/.test(await C.locator(".sheet h3").innerText()));
await C.locator(".sheet .sheet-close").first().click();
await C.waitForTimeout(200);
const rowsNow = await C.locator("#menu-list .menu-row .mn-name").allInnerTexts();
const nWanted = await C.locator("#menu-list .menu-row.wanted").count();
check("新加的菜排在上面（想吃的之后）", /酸菜鱼/.test(rowsNow[nWanted]), rowsNow.slice(0, nWanted + 1).join(" | ").replace(/\n/g, " "));
await C.screenshot({ path: `${SHOTS}/09-menu-family.png` });

check("没照片的菜自动请 AI 画，有自带照片的不画", aiCalls.photo.length > 0 && !aiCalls.photo.includes("红烧肉") && aiCalls.photo.includes("小酥肉"), aiCalls.photo.slice(0, 6).join("、"));
check("同一道菜不重复请 AI 画", new Set(aiCalls.photo).size === aiCalls.photo.length, aiCalls.photo.length + " 次");
// 晚上 7 点以后：照着做、本周菜单都从明天开始
const night = await phone("mom", NIGHT_TZ);
await night.page.click("#tab-cook");
await night.page.waitForTimeout(200);
const firstChip = await night.page.locator("#cook-strip .day-chip").first().innerText();
check("晚上 7 点后，照着做从明天开始（今天挪走）", /明天/.test(firstChip) && /明天/.test(await night.page.locator("#cook-strip .day-chip.on").innerText()) && /明天/.test(await night.page.locator("#cook-when").innerText()), NIGHT_TZ + " " + firstChip.replace(/\n/g, " "));
// 晚上 7 点后：今天没点「做好了」的菜，问做了吗；还没做可以选改到哪天
const NP = night.page;
await NP.click("#tab-plan");
await NP.evaluate(() => { const d = new Date(); const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); window.__today = iso; MPStore.put("dinner:" + iso, { dishes: ["土豆丝", "地三鲜"] }); });
await NP.waitForTimeout(300);
check("晚上 7 点后问「今天的菜做了吗」", await NP.locator("#tonight-check").isVisible() && (await NP.locator("#tonight-check .tc-row").count()) === 2);
await NP.locator("#tonight-check .tc-row", { hasText: "土豆丝" }).locator(".tc-no").click();
check("点「还没做，改天」弹出来选哪天（6 天）", (await NP.locator(".sheet .g-day-btn").count()) === 6 && /改到哪天/.test(await NP.locator(".sheet").innerText()));
await NP.locator(".sheet .g-day-btn").nth(2).click(); await NP.waitForTimeout(250);
const moved = await NP.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 3); const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); return [MPStore.get("dinner:" + window.__today).dishes.join(), MPStore.get("dinner:" + iso).dishes.join()]; });
check("选了哪天就改到哪天", moved[0] === "地三鲜" && /土豆丝/.test(moved[1]), moved.join(" | "));
await NP.locator("#tonight-check .tc-yes").click(); await NP.waitForTimeout(250);
check("点「做了」就不再问", !(await NP.locator("#tonight-check").isVisible()));
await night.ctx.close();
const nightFam = await phone("chen", NIGHT_TZ);
await nightFam.page.click("#dtab-menu"); await nightFam.page.waitForTimeout(150);
check("晚上 7 点后，本周菜单也从明天开始", /明天/.test(await nightFam.page.locator("#fam-day-strip .day-chip.on").innerText()));
await nightFam.ctx.close();
const noonFam = await phone("chen", NOON_TZ);
await noonFam.page.waitForSelector("#view-family:not([hidden])");
await noonFam.page.click("#fam-bf-toggle");
const firstBf = await noonFam.page.locator("#fam-breakfast .d-row").first().innerText();
check("过了中午 12 点，我的早饭从明天开始", /明天/.test(firstBf) && !/今天/.test(firstBf), NOON_TZ + " " + firstBf.replace(/\n/g, " "));
check("「晚饭我想吃什么」改名了", /晚饭我想吃什么/.test(await noonFam.page.locator("#family-main").innerText()));
check("每个功能区是一张有颜色的卡片", (await noonFam.page.locator("#view-family .card-sec").count()) >= 5);
await noonFam.ctx.close();
const amFam = await phone("chen", DAY_TZ);
await amFam.page.waitForSelector("#view-family:not([hidden])");
await amFam.page.click("#fam-bf-toggle");
check("中午以前，我的早饭从今天开始", /今天/.test(await amFam.page.locator("#fam-breakfast .d-row").first().innerText()), DAY_TZ);
await amFam.page.screenshot({ path: `${SHOTS}/fam-cards.png`, fullPage: false });
await amFam.ctx.close();

// 第三批反馈：定晚饭能说/写菜名；帮我想新菜先选口味（川菜、粤菜…）
await M.click("#nav-today"); await M.click("#tab-plan"); await M.waitForTimeout(150);
await M.locator("#day-strip .day-chip").nth(5).click(); await M.waitForTimeout(100);
await M.locator("#dinner-plan .plan-empty, #dinner-plan .add-dish").first().click();
check("定晚饭有说菜名/写菜名的框和话筒", await M.locator(".sheet .name-row .add-input").isVisible() && await M.locator(".sheet .name-row .voice-btn").isVisible());
await M.fill(".sheet .name-row .add-input", "带鱼");
check("写「带鱼」，菜谱里的红烧带鱼跳出来", await M.locator(".sheet .found-box .pick-card", { hasText: "红烧带鱼" }).count() === 1);
await M.fill(".sheet .name-row .add-input", "红烧");
await M.screenshot({ path: `${SHOTS}/11a-mom-search.png` });
check("写「红烧」也找得到红烧带鱼", await M.locator(".sheet .found-box .pick-card", { hasText: "红烧带鱼" }).count() === 1);
await M.fill(".sheet .name-row .add-input", "黄焖鸡");
const addNewBtn = M.locator(".sheet .found-box .sheet-cta", { hasText: "加新菜「黄焖鸡」" });
check("菜谱里没有的，出「加新菜」按钮", await addNewBtn.count() === 1);
await addNewBtn.click(); await M.waitForTimeout(150);
check("新菜加进菜谱、定进这天的晚饭", /黄焖鸡/.test(await M.locator("#dinner-plan").innerText()) && await M.evaluate(() => !!MPStore.get("dish:黄焖鸡")));
await M.locator("#dinner-plan .add-dish").click();
await M.locator(".sheet .rec-inline").click();
await M.waitForSelector(".sheet .rec-styles");
check("帮我想新菜先给口味选择", (await M.locator(".sheet .style-chip").allInnerTexts()).join(" ").includes("川菜") && (await M.locator(".sheet .style-chip").allInnerTexts()).join(" ").includes("粤菜"));
await M.locator(".sheet .style-chip", { hasText: "川菜" }).click();
await M.waitForSelector(".sheet .rec-card >> text=水煮牛肉");
const lastSug = aiCalls.suggest[aiCalls.suggest.length - 1];
check("选川菜就请 AI 想川菜，避开菜谱里已有的", lastSug.style === "川菜" && lastSug.avoid.includes("红烧带鱼") && lastSug.avoid.includes("黄焖鸡"), JSON.stringify({ style: lastSug.style, n: lastSug.avoid.length }));
await M.locator(".sheet .rec-card", { hasText: "水煮牛肉" }).locator(".want-btn").click(); await M.waitForTimeout(150);
check("在定晚饭里挑中的新菜直接定进这天", /水煮牛肉/.test(await M.locator("#dinner-plan").innerText()));
await M.screenshot({ path: `${SHOTS}/11-mom-add-dish.png` });
await C.click("#nav-today"); await C.click("#dtab-order"); await C.waitForTimeout(150);
await C.click("#fam-order-btn");
check("家里人「晚饭我想吃」里也有帮我想新菜", await C.locator(".sheet .rec-inline").isVisible());
await C.locator(".sheet .rec-inline").click();
await C.waitForSelector(".sheet .rec-styles");
await C.locator(".sheet .style-chip", { hasText: "粤菜" }).click();
await C.waitForSelector(".sheet .rec-card >> text=干炒牛河");
await C.screenshot({ path: `${SHOTS}/12-suggest.png` });
await C.locator(".sheet .rec-card", { hasText: "干炒牛河" }).locator(".want-btn").click(); await C.waitForTimeout(120);
check("家里人挑中新菜，接着选有多想吃", /干炒牛河/.test(await C.locator(".sheet h3").innerText()) && await C.locator(".sheet .crave-btn").count() > 0);
await C.locator(".sheet .crave-btn").first().click(); await C.waitForTimeout(120);

// 晚上看了「明天」，放下手机，过了 1 小时以上再拿起来：回到默认那天，不停在「明天」
await M.click("#nav-today"); await M.click("#tab-plan"); await M.waitForTimeout(100);
await M.locator("#day-strip .day-chip").nth(3).click(); await M.waitForTimeout(100);
await M.evaluate(() => {
  const setHidden = (v) => { Object.defineProperty(document, "hidden", { configurable: true, get: () => v }); document.dispatchEvent(new Event("visibilitychange")); };
  setHidden(true);
  const real = Date.now; Date.now = () => real() + 2 * 3600 * 1000;
  setHidden(false);
  Date.now = real;
});
await M.waitForTimeout(300);
check("离开 1 小时以上再回来，日子回到今天", /今天/.test(await M.locator("#day-strip .day-big .db-rel").innerText()));
// 选菜的单子：上面有分类，按想吃/常做排
await M.locator("#dinner-plan .plan-empty, #dinner-plan .add-dish").first().click();
const fchips = await M.locator(".sheet .dish-grid-wrap .filter-chip").allInnerTexts();
check("定晚饭的菜单子上面有分类", fchips.length >= 3 && /全部/.test(fchips[0]), fchips.join(" "));
await M.locator(".sheet .dish-grid-wrap .filter-chip", { hasText: "鱼" }).click();
const fishOnly = await M.locator(".sheet .dish-grid-wrap .pick-card .pk-name").allInnerTexts();
check("点「鱼」只剩鱼", fishOnly.length > 0 && fishOnly.every((t) => /鱼/.test(t)), fishOnly.join(" ").replace(/\n/g, " ").slice(0, 80));
await M.screenshot({ path: `${SHOTS}/13-mom-picker.png` });
await M.locator(".sheet .sheet-close").last().click();
await C.click("#nav-today"); await C.click("#dtab-order"); await C.waitForTimeout(150);
await C.click("#fam-order-btn");
const firstRowBox = await C.locator(".sheet .name-row").boundingBox(), gridBox = await C.locator(".sheet .dish-grid-wrap").boundingBox();
check("家里人「晚饭想吃什么」：输入框在最上面，下面有分类", firstRowBox.y < gridBox.y && (await C.locator(".sheet .dish-grid-wrap .filter-chip").count()) >= 3);
await C.fill(".sheet .name-row .add-input", "排骨");
check("家里人写菜名，菜谱里的马上跳出来", (await C.locator(".sheet .found-box .pick-card").count()) >= 1);
await C.screenshot({ path: `${SHOTS}/14-fam-picker.png` });
await C.locator(".sheet .sheet-close").last().click();

// 新菜：家里后来加的、还没吃过的标「新」；吃过（做好了，或者定的那天过去了）就不标
await M.click("#nav-menu"); await M.waitForTimeout(150);
await M.locator("#menu-tabs button", { hasText: "晚饭" }).click(); await M.waitForTimeout(150);
check("菜谱里：新加还没吃过的菜标「新」", await M.locator(".menu-row", { hasText: "酸菜鱼" }).locator(".new-tag").count() === 1);
check("菜谱里：原来就有的菜不标「新」", await M.locator(".menu-row", { hasText: "红烧带鱼" }).locator(".new-tag").count() === 0);
await M.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); MPStore.put("dinner:" + iso, { dishes: ["酸菜鱼"] }); });
await M.click("#nav-today"); await M.waitForTimeout(1000); await M.click("#nav-menu"); await M.waitForTimeout(150);
await M.locator("#menu-tabs button", { hasText: "晚饭" }).click(); await M.waitForTimeout(150);
check("定在昨天吃过了，就不再标「新」", await M.locator(".menu-row", { hasText: "酸菜鱼" }).locator(".new-tag").count() === 0);
check("还没吃过的新菜（定在以后）继续标「新」", await M.locator(".menu-row", { hasText: "黄焖鸡" }).locator(".new-tag").count() === 1);
await M.locator(".menu-row", { hasText: "黄焖鸡" }).screenshot({ path: `${SHOTS}/16-new-tag.png` });

// 「下周四晚上吃火鸡」：是下个礼拜的周四，不是今天（以前今天是周四时会排进今天）
const nextWk = await M.evaluate(() => {
  const t = new Date(), a = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const mon = new Date(a); mon.setDate(a.getDate() - ((a.getDay() + 6) % 7) + 7);
  const thu = new Date(mon); thu.setDate(mon.getDate() + 3);
  const f = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  return { thu: f(thu), diff: Math.round((thu - a) / 86400000) };
});
await M.click("#nav-menu");
await M.click("#menu-add-btn");
await M.fill(".sheet input.add-input", "下周四晚上吃火鸡");
await M.locator(".sheet .sheet-cta").click();
await M.waitForSelector(".sheet .vp-item");
const nwTxt = await M.locator(".sheet .vp-item").first().innerText();
check("「下周四晚上吃火鸡」听懂成下周四，不是今天", nextWk.diff >= 7 ? /下周四晚饭做「火鸡」/.test(nwTxt) : /晚饭做「火鸡」/.test(nwTxt) && !/今天/.test(nwTxt), nwTxt.replace(/\n/g, " "));
await M.locator(".sheet .sheet-cta").click(); await M.waitForTimeout(300);
check("火鸡定进了下周四", await M.evaluate((d) => { const x = MPStore.get("dinner:" + d); return !!x && x.dishes.includes("火鸡"); }, nextWk.thu), nextWk.thu);
check("今天没有被排进火鸡", await M.evaluate(() => { const t = new Date(); const d = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); const x = MPStore.get("dinner:" + d); return !x || !x.dishes.includes("火鸡"); }));
await M.click("#nav-today"); await M.click("#tab-plan"); await M.waitForTimeout(200);
const stripTxt = await M.locator("#day-strip .day-grid").innerText();
check("排到下周四的晚饭，在选日子里看得到（写「下周四」）", nextWk.diff < 7 || (/下周四/.test(stripTxt) && /✓ 已定/.test(stripTxt)), stripTxt.replace(/\n/g, " ").slice(-60));
await M.locator("#day-strip").screenshot({ path: `${SHOTS}/17-next-week.png` });

check("妈妈手机没有脚本报错", mom.errors.length === 0, mom.errors.join(" | "));
check("小陈手机没有脚本报错", chen.errors.length === 0, chen.errors.join(" | "));

await browser.close();
server.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
