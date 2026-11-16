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
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? "✓ " : "✗ ") + name + (detail ? " — " + detail : "")); }

const browser = await chromium.launch();
async function phone(me) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "zh-CN" });
  await ctx.route("**/rest/v1/rpc/**", fakeSupabase);
  await ctx.route("**/image.pollinations.ai/**", (r) => r.abort()); // 测「配不出图」时的暖色方块
  await ctx.route("**/api.open-meteo.com/**", (r) => { // 假天气，不连外网
    const time = []; for (let i = 0; i < 8; i++) { const d = new Date(); d.setDate(d.getDate() + i); time.push(d.toISOString().slice(0, 10)); }
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ daily: { time, weather_code: time.map(() => 1), temperature_2m_max: time.map(() => 18), temperature_2m_min: time.map(() => 9) } }) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/pollinations|net::ERR_FAILED/.test(m.text())) errors.push(m.text()); });
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

// 4. 家里人屏：逐天点早饭，没有绿色批量按钮；有今日菜单 tab 和买菜
check("小陈打开就是家里人那屏", await C.locator("#view-family").isVisible());
check("没有「一次点好几天」批量按钮", !(await C.content()).includes("一次点好几天"));
check("早饭按天一排排列（7 天）", (await C.locator("#fam-breakfast .d-row").count()) === 7);
await C.locator("#fam-breakfast .d-row").nth(0).locator("button").click();
await C.locator(".sheet .pick-card", { hasText: "馄饨" }).click();
await C.waitForTimeout(120);
check("点一下就定好今天早饭", /馄饨/.test(await C.locator("#fam-breakfast .d-row").nth(0).innerText()));
check("有「今日菜单」页签", await C.locator("#dtab-menu").isVisible());
check("底部有「买菜」", await C.locator("#nav-buy").isVisible());
// 小陈明天不在家
await C.locator("#fam-tonight .home-btn").click();
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
await M.locator(".filter-chip", { hasText: "鱼" }).click();
const fishText = await M.locator("#menu-list").innerText();
check("点「鱼」列出鱼的做法", ["清蒸鲈鱼", "红烧带鱼", "松鼠桂鱼", "鱼头豆腐汤"].every((n) => fishText.includes(n)) && !fishText.includes("红烧肉"));
await M.locator(".menu-row", { hasText: "红烧带鱼" }).locator(".mn-name").click();
check("点菜名打开做法（配料 + 步骤）", (await M.locator(".sheet .ing-list li").count()) > 2 && /怎么做/.test(await M.locator(".sheet").innerText()));
check("做法页能直接定进晚饭", /定进.*晚饭/.test(await M.locator(".sheet .sheet-cta").innerText()));
await M.screenshot({ path: `${SHOTS}/04-recipe.png` });
await M.locator(".sheet .sheet-close").last().click();
check("没配出图时显示暖色方块（不留破图）", (await M.locator("#menu-list .dish-tile").count()) > 0 && (await M.locator("#menu-list img.dish-photo").count()) === 0);

// 7. 悬浮话筒：妈妈屏各页都可见
for (const v of ["today", "menu", "buy", "profile"]) {
  await M.click("#nav-" + v);
  check("悬浮话筒在妈妈屏「" + v + "」页可见", await M.locator("#voice-fab").isVisible());
}
check("家里人屏没有悬浮话筒", !(await C.locator("#voice-fab").isVisible()));

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
check("同步：小陈的买菜页也看到牛奶、五花肉已买", /牛奶/.test(await C.locator("#custom-list").innerText()) && /买好了/.test(await C.locator("#buy-list .buy-row", { hasText: "五花肉" }).innerText()));
await M.screenshot({ path: `${SHOTS}/05-buy.png`, fullPage: false });
await M.locator("#buy-list .weee-link").first().scrollIntoViewIfNeeded();
await M.screenshot({ path: `${SHOTS}/06-buy-weee.png` });

// 8. 底部只有一个「家里动态」（每屏一处，在最下面）
await M.click("#nav-today");
check("妈妈屏只有一个「家里动态」", (await M.locator("#view-today .activity-sec").count()) === 1);
const order = await M.evaluate(() => { const secs = [...document.querySelectorAll("#view-today .sec")]; return secs.findIndex((s) => s.classList.contains("activity-sec")) >= secs.length - 2; });
check("「家里动态」在页面最下面", order);

// 悬浮话筒：语音定计划（打字代替说话）→ 确认页 → 写入
await M.click("#voice-fab", { force: true }); // 按钮有呼吸动画
const wd = await M.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 2); return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()]; });
await M.fill(".sheet input.add-input", wd + "做鱼，后天还要蒸水蛋");
await M.locator(".sheet .sheet-cta").click();
check("说话后先弹确认页", /对吗/.test(await M.locator(".sheet h3").innerText()));
await M.locator(".sheet .vp-cand", { hasText: "清蒸鲈鱼" }).first().click();
await M.screenshot({ path: `${SHOTS}/07-voice-confirm.png` });
await M.locator(".sheet .sheet-cta").click();
await M.locator(".day-chip").nth(2).click();
const d2 = await M.locator("#dinner-plan").innerText();
check("确认后排进那天的晚饭", /清蒸鲈鱼/.test(d2) && /蒸水蛋/.test(d2), d2.replace(/\n/g, " "));

// 9. 全中文；没有中英文混写（菜名、人名 Vicky 和品牌名 Weee 除外）
const visible = await M.locator("body").innerText();
const eng = (visible.match(/[A-Za-z]{2,}/g) || []).filter((w) => !["Vicky", "Weee"].includes(w));
check("界面没有英文混写", eng.length === 0, eng.join(","));

// 我的：换人、反馈
await M.click("#nav-profile");
await M.screenshot({ path: `${SHOTS}/08-profile.png` });
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

check("妈妈手机没有脚本报错", mom.errors.length === 0, mom.errors.join(" | "));
check("小陈手机没有脚本报错", chen.errors.length === 0, chen.errors.join(" | "));

await browser.close();
server.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
