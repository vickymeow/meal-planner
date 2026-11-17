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
let clock = Date.parse("2026-01-01T00:00:00Z");
const tick = () => new Date((clock += 1)).toISOString();
async function fakeSupabase(route) {
  const url = route.request().url();
  const body = JSON.parse(route.request().postData() || "{}");
  if (body.h !== H) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "unknown household" }) });
  if (url.endsWith("/rpc/mp_push")) {
    for (const x of body.items) db.set(x.id, { id: x.id, data: x.data, deleted: !!x.deleted, by: x.by, at: tick() });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, now: tick() }) });
  }
  const since = body.since;
  const items = [...db.values()].filter((i) => (since ? i.at > since : !i.deleted));
  return route.fulfill({ contentType: "application/json", body: JSON.stringify({ now: tick(), items }) });
}

const results = [];
let lastAudio = null;
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? "✓ " : "✗ ") + name + (detail ? " — " + detail : "")); }

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] }); // 假麦克风：录音测试用
async function phone(me) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "zh-CN", permissions: ["microphone"] });
  await ctx.route("**/rest/v1/rpc/**", fakeSupabase);
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
    if (b.task === "transcribe") {
      const wav = Buffer.from(b.audio || "", "base64");
      lastAudio = { riff: wav.slice(0, 4).toString(), wave: wav.slice(8, 12).toString(), rate: wav.length > 28 ? wav.readUInt32LE(24) : 0, bytes: wav.length, mime: b.mime };
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ text: "我周五不在家吃饭。" }) });
    }
    if (b.task === "recipe" && b.name === "酸汤肥牛") return r.fulfill({ contentType: "application/json", body: JSON.stringify({ cat: "meat", ings: ["肥牛卷 400克", "金针菇 1 把", "黄灯笼辣椒酱"], steps: ["金针菇焯水铺碗底。", "酸汤烧开下肥牛。", "浇在金针菇上。"], prep: "" }) });
    return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "no_key" }) });
  });
  await ctx.route("**/api.open-meteo.com/**", (r) => { // 假天气，不连外网
    const time = []; for (let i = 0; i < 8; i++) { const d = new Date(); d.setDate(d.getDate() + i); time.push(d.toISOString().slice(0, 10)); }
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ daily: { time, weather_code: time.map(() => 1), temperature_2m_max: time.map(() => 18), temperature_2m_min: time.map(() => 9) } }) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/pollinations|net::ERR_FAILED|status of 503/.test(m.text())) errors.push(m.text()); });
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
check("妈妈屏「周几」在「妈妈定晚饭」那块里", await M.evaluate(() => document.getElementById("day-strip").closest(".sec").innerText.includes("妈妈定晚饭")));
check("那天的早饭默认折起来", !(await M.locator("#breakfast").isVisible()));
await M.click("#bf-fold");
// 妈妈只能换自己的早饭
check("妈妈屏早饭卡只有妈妈自己那行能换", (await M.locator("#breakfast .bf-row button").count()) === 1);
await M.locator("#breakfast .bf-row button").click();
await M.locator(".sheet .pick-card", { hasText: "蒸饺" }).click();
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
await C.waitForTimeout(120);
check("点一下就定好今天早饭", /馄饨/.test(await C.locator("#fam-breakfast .d-row").nth(0).innerText()));
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
await M.locator(".day-chip").nth(1).click(); // 明天
const people = await M.locator("#people").innerText();
check("同步：妈妈看到小陈明天不在家", /小陈不在家/.test(people), people.replace(/\n/g, " "));
check("同步：妈妈看到小陈超想吃红烧肉", /红烧肉/.test(await M.locator("#wishes").innerText()));
check("同步：家里动态有小陈的记录", /小陈/.test(await M.locator("#view-today .history-box").innerText()));

// 2. 定计划能定整周（今天 + 其他天）
await M.locator(".day-chip").nth(0).click();
await M.locator("#dinner-plan .plan-empty").click();
await M.locator(".sheet .pick-card", { hasText: "红烧肉" }).first().click();
await M.waitForTimeout(120);
await M.locator(".day-chip").nth(3).click();
await M.locator("#dinner-plan .plan-empty").click();
await M.locator(".sheet .pick-card", { hasText: "清蒸鲈鱼" }).first().click();
await M.waitForTimeout(120);
await M.locator("#dinner-plan .add-dish").click();
await M.locator(".sheet .pick-card", { hasText: "青菜汤" }).first().click();
await M.waitForTimeout(120);
const decided = await M.locator(".day-chip .dc-st.ok").count();
check("一周里定了好几天的晚饭", decided === 2, decided + " 天");
check("一顿能定好几道（妈妈自己决定）", (await M.locator("#dinner-plan .dish-row").count()) === 2);
// 照着做：只看今天，大图大名，做好了 → 从最近想吃拿掉
await M.click("#tab-cook");
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
await M.locator(".day-chip").nth(guestDayIdx === 0 ? 1 : 0).click();
check("没客人那天妈妈屏不显示客人", !(await M.locator("#guests-mom").isVisible()));
await M.locator(".day-chip").nth(guestDayIdx).click();
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
check("点菜名打开做法（配料 + 步骤）", (await M.locator(".sheet .ing-list li").count()) > 2 && /怎么做/.test(await M.locator(".sheet").innerText()));
check("做法页有 7 天可以选", (await M.locator(".sheet .g-day-btn").count()) === 7);
await M.locator(".sheet .g-day-btn").nth(4).click(); await M.waitForTimeout(200);
await M.locator(".sheet .g-day-btn").nth(5).click(); await M.waitForTimeout(200);
check("做法页一次定进好几天", (await M.locator(".sheet .g-day-btn.on").count()) === 2 && /红烧带鱼/.test(await M.evaluate(() => JSON.stringify([4, 5].map((i) => { const d = new Date(); d.setDate(d.getDate() + i); const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); return MPStore.get("dinner:" + iso); })))));
await M.screenshot({ path: `${SHOTS}/04-recipe.png` });
await M.locator(".sheet .sheet-close").last().click();
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
check("「自己加的」默认折起", !(await M.locator("#custom-body").isVisible()) && (await M.locator("#custom-toggle").innerText()).includes("展开"));
const tog = await M.locator("#custom-toggle").evaluate((e) => { const s = getComputedStyle(e); return { h: e.getBoundingClientRect().height, f: s.fontSize }; });
check("展开按钮 46px 高、16px 字", Math.round(tog.h) === 46 && tog.f === "16px", JSON.stringify(tog));
await M.click("#custom-toggle");
check("点「展开 ▼」才出现常买和输入框", await M.locator("#staple-row").isVisible() && await M.locator("#custom-name").isVisible());
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
check("「做菜要买的」能折起来", !(await M.locator("#buy-list").isVisible()) && await M.locator("#buy-fold-sum").isVisible());
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
await M.locator(".day-chip").nth(2).click();
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
check("点说话后出现「正在听…说完点这里」红条", /正在听/.test(await C.locator("#rec-bar").innerText()));
await C.waitForTimeout(1500);
await C.locator("#rec-bar").click();
await C.waitForSelector(".sheet .vp-item", { timeout: 15000 });
check("录音转成 16k 单声道 WAV 发给 Qwen", lastAudio && lastAudio.riff === "RIFF" && lastAudio.wave === "WAVE" && lastAudio.rate === 16000 && lastAudio.bytes > 20000, JSON.stringify(lastAudio));
check("听写回来的字自动接着听懂：周五不在家", /周五不在家吃饭/.test(await C.locator(".sheet .vp-item").first().innerText()), await C.locator(".sheet").innerText().then((t) => t.slice(0, 80).replace(/\n/g, " ")));
await C.locator(".sheet .sheet-close").last().click();
// 加新菜：AI 写配料和做法
await C.click("#nav-menu");
await C.click("#menu-add-btn");
await C.fill(".sheet input.add-input", "酸汤肥牛");
await C.locator(".sheet .ai-btn").click();
await C.waitForTimeout(300);
check("加新菜：AI 写好配料和做法", /肥牛卷 400克/.test(await C.locator(".sheet textarea").first().inputValue()) && /酸汤/.test(await C.locator(".sheet textarea").nth(1).inputValue()));
await C.locator(".sheet .sheet-close").last().click();

// 9. 全中文；没有中英文混写（菜名、人名 Vicky 和品牌名 Weee 除外）
const visible = await M.locator("body").innerText();
const eng = (visible.match(/[A-Za-z]{2,}/g) || []).filter((w) => !["Vicky", "Weee"].includes(w));
check("界面没有英文混写", eng.length === 0, eng.join(","));

// 我的：换人、反馈
await M.click("#nav-profile");
await M.screenshot({ path: `${SHOTS}/08-profile.png` });
check("「我的」页有图片来源", /图片来源/.test(await M.locator("#credits-sec").innerText()));
check("「我的」页有发给家里人的链接", (await M.locator("#share-sec .share-row").count()) === 4);
await M.locator("#view-profile [data-fb-slot] input").fill("字再大一点");
await M.locator("#view-profile [data-fb-slot] .sheet-cta").click();
await syncBoth(M, C);
check("反馈带名字，两处共用一份", /妈妈：字再大一点/.test(await M.locator("#view-today .fb-list").innerText()));

// 刷新后数据还在（不是 demo，不会恢复原样）
await M.reload(); await M.waitForTimeout(500);
await M.locator(".day-chip").nth(0).click();
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

check("妈妈手机没有脚本报错", mom.errors.length === 0, mom.errors.join(" | "));
check("小陈手机没有脚本报错", chen.errors.length === 0, chen.errors.join(" | "));

await browser.close();
server.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
