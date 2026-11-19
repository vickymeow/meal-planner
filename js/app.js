// 早饭晚饭 · 一家人好好吃饭
// 界面照 mock v19；数据全部走 MPStore（同步到全家每部手机）。
(function () {
  "use strict";
  var D = window.MP_DATA, S = window.MPStore, CFG = window.MP_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };

  // ---------- 小工具 ----------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function trim(s) { return String(s || "").replace(/^\s+|\s+$/g, ""); }
  function rnd() { return Math.random().toString(36).slice(2, 8); }
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function btn(cls, text, onClick, label) {
    var b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = text;
    if (label) b.setAttribute("aria-label", label);
    if (onClick) b.addEventListener("click", onClick);
    return b;
  }

  // ---------- 日期 ----------
  var WD = ["日", "一", "二", "三", "四", "五", "六"];
  function iso(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function fromIso(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function todayIso() { return iso(new Date()); }
  function tomorrowIso() { return iso(addDays(new Date(), 1)); }
  function dayInfo(id) {
    var d = fromIso(id), t = new Date();
    var diff = Math.round((d - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000);
    return {
      id: id, date: d,
      short: (d.getDay() === 0 ? "周日" : "周" + WD[d.getDay()]),
      num: String(d.getDate()),
      md: (d.getMonth() + 1) + "月" + d.getDate() + "日",
      weekday: "星期" + WD[d.getDay()],
      rel: diff === 0 ? "今天" : diff === 1 ? "明天" : diff === 2 ? "后天" : "",
      wk: weekOffset(d) // 0 这周，1 下周，2 下下周（周一开始算）
    };
  }
  function days() { var out = [], t = new Date(); for (var i = 0; i < 7; i++) out.push(iso(addDays(t, i))); return out; }
  // 说话、听懂用的日子：两个礼拜（「下周四」也认得）
  function days14() { var out = [], t = new Date(); for (var i = 0; i < 14; i++) out.push(iso(addDays(t, i))); return out; }
  // 做饭看的日子：晚上 7 点以后，今天的饭做完了，从明天开始排
  var CUTOFF_HOUR = 19;
  function cookBaseIso() { var n = new Date(); return iso(n.getHours() >= CUTOFF_HOUR ? addDays(n, 1) : n); }
  // 早饭：过了中午 12 点，今天的早饭就过去了，从明天开始排
  var BF_CUTOFF_HOUR = 12;
  function bfDays() { var n = new Date(), b = n.getHours() >= BF_CUTOFF_HOUR ? addDays(n, 1) : n, out = []; for (var i = 0; i < 7; i++) out.push(iso(addDays(b, i))); return out; }
  // 选日子：一般 7 天；两个礼拜里更后面的日子已经定了晚饭（比如「下周四吃火鸡」），就一直排到那天，看得到
  function cookDays() {
    var b = fromIso(cookBaseIso()), n = 7;
    for (var j = 7; j < 14; j++) if (typeof S !== "undefined" && dinner(iso(addDays(b, j))).length) n = j + 1;
    var out = []; for (var i = 0; i < n; i++) out.push(iso(addDays(b, i)));
    return out;
  }
  function eveLabel(id) { var d = dayInfo(id); return d.rel === "今天" ? "今晚" : d.rel === "明天" ? "明晚" : d.rel === "后天" ? "后天晚上" : d.short + "晚上"; }
  // 一个礼拜以后的日子写清楚是「下周几」，不然「周四」会跟这周的周四搞混
  function dayName(id) { var d = dayInfo(id); if (d.rel) return d.rel; var diff = Math.round((d.date - fromIso(todayIso())) / 86400000); return diff >= 7 ? (d.wk === 2 ? "下下" : "下") + d.short : d.short; }
  function weekOffset(d) {
    var t = new Date(), a = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    var monA = addDays(a, -((a.getDay() + 6) % 7)), monD = addDays(d, -((d.getDay() + 6) % 7));
    return Math.round((monD - monA) / (7 * 86400000));
  }

  // ---------- 人 ----------
  function person(id) { for (var i = 0; i < D.PEOPLE.length; i++) if (D.PEOPLE[i].id === id) return D.PEOPLE[i]; return null; }
  function pname(id) { var p = person(id); return p ? p.name : (id || "家里"); }
  function avatarSrc(pid) { var a = S.get("avatar:" + pid); return a && a.src; }
  function avatarHTML(p, cls) {
    var src = avatarSrc(p.id);
    if (src) return '<img class="avatar avatar-img ' + (cls || "") + '" src="' + esc(src) + '" alt="' + esc(p.name) + '的头像">';
    return '<div class="avatar ' + p.cls + " " + (cls || "") + '">' + esc(p.initial) + "</div>";
  }

  // ---------- 界面状态（只在这部手机） ----------
  var ui = {
    me: null,
    view: "today",
    mode: LS.get("mp:mode", "plan"),
    planDay: cookBaseIso(), // 晚上 7 点以前默认今天，7 点以后默认明天（跟「照着做」一样）
    famTab: "order",
    filter: "all",
    guestOpen: false,
    guestDay: null,
    guestCount: 2,
    customOpen: false,
    homeOpen: false,
    famDay: null,
    cookDay: null,
    famBfOpen: false,
    othersBfOpen: false,
    buyOpen: true,
    menuTab: "dinner"
  };
  function isMom() { return ui.me === "mom"; }

  // ---------- 数据读取 ----------
  function seeded() { return !!S.get("meta:seeded"); }
  function allDishes() {
    var list = seeded() ? S.list("dish:").map(function (x) { return x.data; })
      : D.SEED_DISHES.map(function (d, i) { return Object.assign({ order: i }, d); });
    return list.filter(function (d) { return d && d.name; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function newOrder() { return -Math.round(Date.now() / 1000); } // 新加的菜排在最前面
  // 有人想吃的排最上面（越想吃越靠上），其余按菜谱顺序
  function wantLevel(name) { return wishes().filter(function (w) { return w.dish === name; }).reduce(function (m, w) { return Math.max(m, w.level || 1); }, 0); }
  function sortWanted(list) {
    var lv = {}; list.forEach(function (d) { lv[d.name] = wantLevel(d.name); });
    return list.slice().sort(function (a, b) { return (lv[b.name] - lv[a.name]) || ((a.order || 0) - (b.order || 0)); });
  }
  // 早饭的库存：stock 没写 = 家里有；"wish" = 有人想吃、家里还没有（不进菜谱）；"out" = 吃完了（菜谱里变灰，不能点）
  function stockOf(name) { var d = dish(name); return (d && d.stock) || ""; }
  function menuFor(meal) { return sortWanted(allDishes().filter(function (d) { return (d.meal === meal || d.meal === "both") && d.stock !== "wish"; })); }
  function dish(name) { var all = allDishes(); for (var i = 0; i < all.length; i++) if (all[i].name === name) return all[i]; return null; }
  function isDinnerDish(name) { var d = dish(name); return !d || d.meal !== "breakfast"; }
  function ingsFor(name) { var d = dish(name); return d && d.ings && d.ings.length ? d.ings : [name, "葱", "姜", "蒜"]; }
  function stepsFor(name) {
    var d = dish(name); if (d && d.steps && d.steps.length) return d.steps;
    return ["配料洗净切好，按家里人数准备。", "热锅下油，先炒主料，再放配菜和调味。", "尝一下咸淡，合适就出锅。"];
  }
  // 菜的分类：先看菜名，菜名看不出来再看头两样主料
  var TAG_RULES = [
    ["beef", /牛|羊|肥牛/],
    ["chicken", /鸡|鸭|鹅/],
    ["fish", /鱼|带鱼/],
    ["shrimp", /虾|蟹|贝|蛤|蚝|海鲜/],
    ["egg", /蛋/],
    ["tofu", /豆腐|豆干|腐竹|千张|豆浆|豆花/],
    ["leafy", /青菜|白菜|菠菜|生菜|油麦|空心菜|芥兰|菜心|西兰花|韭菜|芹菜|苋菜|茼蒿|包菜|卷心菜|娃娃菜/],
    ["root", /萝卜|土豆|茄子|番茄|西红柿|黄瓜|丝瓜|冬瓜|南瓜|苦瓜|山药|藕|玉米|洋葱|青椒|辣椒|豆角|四季豆|地三鲜|芋/],
    ["soup", /汤|羹/],
    ["staple", /饭|面|粉$|米粉|河粉|饺|包$|包子|馄饨|饼|粥|吐司|烧卖|三明治|糯米|油条|年糕|粽/]
  ];
  function tagsOf(text) {
    // 先去掉会误判的词：鸡蛋不是鸡，鱼香不是鱼，虾皮只是配料，牛奶不是牛肉
    var t = String(text || "").replace(/鸡蛋|蛋清|蛋黄/g, "蛋").replace(/鸡精|鸡粉|鱼香|鱼露|蒸鱼豉油|虾皮|虾米|牛奶|面粉|淀粉|粉丝|米粉蒸|蒸肉米粉/g, " ");
    var out = [];
    TAG_RULES.forEach(function (r) { if (r[1].test(t)) out.push(r[0]); });
    // 猪肉：排骨、五花、肉末这些；名字里只说「肉」又不是牛羊鸡鸭的，也算猪肉
    var meatOther = out.indexOf("beef") !== -1 || out.indexOf("chicken") !== -1;
    if (/猪|五花|里脊|肉末|肉馅|肉丝|肉片|腊肠|香肠|火腿|培根|蹄|肘/.test(t) && !/牛里脊/.test(t) || (/排骨|肉/.test(t) && !meatOther)) out.unshift("pork");
    return out;
  }
  var OLD_CAT = { meat: "pork", veg: "leafy" };
  function dishTags(d) {
    if (!d) return [];
    var tags = tagsOf(d.name);
    var main = tags.filter(function (x) { return x !== "soup" && x !== "staple"; });
    // 主食（面、饭、饺子）只从配料里补肉和海鲜，不补蛋和菜：不然乌冬面会跑到「蛋」里
    var MEATY = ["pork", "beef", "chicken", "fish", "shrimp"];
    var isStaple = tags.indexOf("staple") !== -1;
    if (!main.length) (d.ings || []).slice(0, 2).forEach(function (i) { tagsOf(String(i).replace(/\s.*$/, "")).forEach(function (x) { if (tags.indexOf(x) === -1 && x !== "soup" && x !== "staple" && (!isStaple || MEATY.indexOf(x) !== -1)) tags.push(x); }); });
    if (!tags.length && d.cat) tags.push(OLD_CAT[d.cat] || d.cat);
    return tags;
  }
  function guessCat(name) { return tagsOf(name)[0] || "leafy"; }
  function catLabel(id) { return (D.CATS.filter(function (c) { return c.id === id; })[0] || {}).label || ""; }

  function isHome(date, pid) { var h = S.get("home:" + date + ":" + pid); return !(h && h.v === false); }
  // 按人排的地方统一顺序：Vicky、小陈在前（妈妈最关心他们点了什么），然后爸爸、妈妈
  var SHOW_ORDER = ["vicky", "chen", "dad", "mom"];
  function peopleInOrder() { return D.PEOPLE.slice().sort(function (a, b) { return SHOW_ORDER.indexOf(a.id) - SHOW_ORDER.indexOf(b.id); }); }
  function homePeople(date) { return peopleInOrder().filter(function (p) { return isHome(date, p.id); }); }
  // 这道菜这一周排在哪天晚饭（没排就是空）
  function plannedDay(name) { var ds = days(); for (var i = 0; i < ds.length; i++) if (dinner(ds[i]).indexOf(name) !== -1) return ds[i]; return null; }
  function guests(date) { return S.list("guest:").map(function (x) { return Object.assign({ id: x.id }, x.data); }).filter(function (g) { return g.date === date; }); }
  function allGuests() { var ds = days(); return S.list("guest:").map(function (x) { return Object.assign({ id: x.id }, x.data); }).filter(function (g) { return ds.indexOf(g.date) !== -1; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }); }
  function guestCount(date) { return guests(date).reduce(function (s, g) { return s + (g.count || 1); }, 0); }
  function guestText(date) { return guests(date).map(function (g) { return g.label + " " + g.count + "位"; }).join("、"); }
  function totalPeople(date) { return homePeople(date).length + guestCount(date); }
  // 早饭可以点好几样：存成 { dishes: [...], dish: 第一样 }（dish 留着给旧版本看）
  function bfPicks(date, pid) { var b = S.get("bf:" + date + ":" + pid); if (!b) return []; return (b.dishes && b.dishes.length) ? b.dishes.slice() : (b.dish ? [b.dish] : []); }
  function bfPick(date, pid) { var l = bfPicks(date, pid); return l.length ? l.join("、") : null; }
  function saveBf(date, pid, list) { S.put("bf:" + date + ":" + pid, { dish: list[0], dishes: list }); }
  // 某天的早饭：在家的人每人一份。没点的默认做鸡蛋三明治。
  function bfOff(pid) { var x = S.get("bfoff:" + pid); return !!(x && x.v); }
  function bfList(date) {
    return homePeople(date).map(function (p) {
      if (bfOff(p.id)) return { person: p.id, name: D.BF_SKIP, kind: "skip" };
      var picks = bfPicks(date, p.id);
      if (!picks.length) return [{ person: p.id, name: D.BF_FALLBACK, kind: "fallback" }];
      if (picks[0] === D.BF_SKIP) return [{ person: p.id, name: D.BF_SKIP, kind: "skip" }];
      if (picks[0] === D.BF_ANY) return [{ person: p.id, name: D.BF_ANY, kind: "any" }];
      return picks.map(function (n) { return { person: p.id, name: n, kind: "pick" }; }); // 一样一行
    }).reduce(function (a, b) { return a.concat(Array.isArray(b) ? b : [b]); }, []);
  }
  function bfPeopleCount(date) { var seen = {}; bfList(date).forEach(function (it) { if (it.kind !== "skip") seen[it.person] = 1; }); return Object.keys(seen).length; }
  function dinner(date) { var x = S.get("dinner:" + date); return (x && x.dishes) || []; }
  function setDinner(date, list) { S.put("dinner:" + date, { dishes: list }); }
  function wishes() {
    return S.list("wish:").map(function (x) { return Object.assign({ id: x.id }, x.data); })
      .sort(function (a, b) { return (b.level || 1) - (a.level || 1) || (a.t || 0) - (b.t || 0); });
  }
  function wishOf(name) { var w = wishes().filter(function (w) { return w.dish === name; }); return w[0] || null; }
  function craveOf(level) { for (var i = 0; i < D.CRAVES.length; i++) if (D.CRAVES[i].level === level) return D.CRAVES[i]; return D.CRAVES[0]; }
  function craveTag(level) { var c = craveOf(level || 1); return '<span class="crave-tag lv' + c.level + '" aria-label="想吃程度：' + c.label + '">' + c.emoji + " " + c.label + "</span>"; }

  // ---------- 动态 ----------
  // to：这条动态要特别通知谁（不写就按默认规则）
  function log(text, who, to) {
    var t = Date.now(), d = { t: t, who: who === undefined ? ui.me : who, text: text };
    if (to && to.length) d.to = to;
    S.put("log:" + t + "-" + rnd(), d);
  }
  function pruneLogs() {
    var logs = S.list("log:").sort(function (a, b) { return (b.data.t || 0) - (a.data.t || 0); });
    var cut = Date.now() - 30 * 86400000;
    var old = logs.filter(function (l, i) { return i >= 150 || (l.data.t || 0) < cut; });
    if (old.length) S.putMany(old.slice(0, 100).map(function (l) { return { id: l.id, deleted: true }; }));
  }
  function timeLabel(t) {
    var d = new Date(t), now = new Date();
    var hm = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    if (iso(d) === iso(now)) return "今天 " + hm;
    if (iso(d) === iso(addDays(now, -1))) return "昨天 " + hm;
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + hm;
  }
  // 动态里：菜名能点开做法，提到的人带小头像
  function actDot(p) {
    if (!p) return '<span class="act-dot act-home" aria-hidden="true">🏠</span>';
    var src = avatarSrc(p.id);
    if (src) return '<img class="act-dot act-img" src="' + esc(src) + '" alt="" aria-hidden="true">';
    return '<span class="act-dot act-' + p.id + '" aria-hidden="true">' + esc(p.initial) + "</span>";
  }
  function richText(text) {
    var names = allDishes().map(function (d) { return d.name; }).filter(function (n) { return n && n.length > 1; });
    var tokens = names.map(function (n) { return { k: "dish", s: n }; })
      .concat(D.PEOPLE.map(function (p) { return { k: "p", s: p.name, p: p }; }))
      .sort(function (a, b) { return b.s.length - a.s.length; });
    var out = "", i = 0, str = String(text || "");
    while (i < str.length) {
      var hit = null;
      for (var j = 0; j < tokens.length; j++) if (str.substr(i, tokens[j].s.length) === tokens[j].s) { hit = tokens[j]; break; }
      if (!hit) { out += esc(str[i]); i++; continue; }
      if (hit.k === "dish") out += '<span class="dish-link-txt" role="button" tabindex="0" data-dish="' + esc(hit.s) + '">' + esc(hit.s) + "</span>";
      else out += '<span class="who-ref act-c-' + hit.p.id + '">' + esc(hit.s) + "</span>";
      i += hit.s.length;
    }
    return out;
  }
  function renderHistory() {
    var logs = S.list("log:").map(function (x) { return x.data; }).sort(function (a, b) { return (b.t || 0) - (a.t || 0); }).slice(0, 20);
    document.querySelectorAll(".history-box").forEach(function (box) {
      if (!box.dataset.wired) {
        box.dataset.wired = "1";
        var go = function (e) { var t = e.target.closest && e.target.closest(".dish-link-txt"); if (t) { e.stopPropagation(); openRecipe(t.getAttribute("data-dish")); } };
        box.addEventListener("click", go);
        box.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(e); } });
      }
      if (!logs.length) { box.innerHTML = '<div class="act-item"><span class="act-main">还没有动态。谁点了菜、定了饭，这里马上能看到。</span></div>'; return; }
      box.innerHTML = logs.map(function (l, i) {
        var p = person(l.who);
        return '<div class="act-item">' + actDot(p) + '<span class="act-main">' + (p ? "<b>" + esc(p.name) + "</b>" : "") + richText(l.text) +
          '<small style="display:block;font-size:12.5px;color:#a08b6d;font-weight:600">' + timeLabel(l.t) + "</small></span>" +
          (i === 0 ? '<span class="act-new">最新</span>' : "") + "</div>";
      }).join("");
    });
  }

  // ---------- 提示 ----------
  var toastTimer = null;
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  // ---------- 撤销：把一次操作里改过的东西都记下来，点「撤销」就全部改回去 ----------
  var undoRec = null, undoTimer = null;
  (function () {
    var putMany = S.putMany;
    S.putMany = function (list) {
      if (undoRec) list.forEach(function (x) {
        if (!(x.id in undoRec)) { var cur = S.get(x.id); undoRec[x.id] = cur === undefined ? undefined : JSON.parse(JSON.stringify(cur)); }
      });
      return putMany.call(S, list);
    };
  })();
  function undoStart() { undoRec = {}; }
  // 操作做完：上面出一条提示，带「撤销」按钮，10 秒后自己消失
  function undoOffer(msg) {
    var rec = undoRec; undoRec = null;
    if (!rec || !Object.keys(rec).length) { toast(msg); return; }
    var bar = $("undo-bar");
    if (!bar) { bar = el("div", "undo-bar"); bar.id = "undo-bar"; bar.setAttribute("role", "status"); $("screen").appendChild(bar); }
    bar.innerHTML = '<span class="ub-txt">' + esc(msg) + "</span>";
    bar.appendChild(btn("ub-btn", "撤销", function () {
      S.putMany(Object.keys(rec).map(function (id) { return rec[id] === undefined ? { id: id, deleted: true } : { id: id, data: rec[id] }; }));
      bar.hidden = true; clearTimeout(undoTimer);
      toast("撤销了，改回原来的样子");
    }, "撤销刚才的操作"));
    bar.hidden = false;
    clearTimeout(undoTimer); undoTimer = setTimeout(function () { bar.hidden = true; }, 10000);
  }

  // ---------- 照片 ----------
  var failedImg = {};
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function autoPhoto(name) {
    var prompt = name + "，中式家常菜，Chinese home cooking dish, appetizing food photo, served in a bowl or plate, top-down, warm natural light, no text";
    return "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?width=640&height=480&nologo=true&seed=" + hash(name);
  }
  var photoQueue = [], photoBusy = false;
  var DEVICE = LS.get("mp:dev", null) || (function () { var d = rnd() + rnd(); LS.set("mp:dev", d); return d; })();
  function needsPhoto(name) {
    var p = S.get("photo:" + name);
    if (p && p.src) return false;
    if ((window.MP_PHOTOS || {})[name]) return false;
    // 正在生成（别的手机也算）或刚失败过：先不重复要
    if (p && p.pending && Date.now() - (p.t || 0) < 3 * 60 * 1000) return false;
    if (p && p.failed && Date.now() - (p.t || 0) < 24 * 3600 * 1000) return false;
    return true;
  }
  function queueAiPhotos() {
    if (!S.household() || S.status() !== "ok" || CFG.aiPhotos === false) return;
    allDishes().forEach(function (d) { if (needsPhoto(d.name) && photoQueue.indexOf(d.name) === -1) photoQueue.push(d.name); });
    nextAiPhoto();
  }
  function nextAiPhoto() {
    if (photoBusy) return;
    var name = photoQueue.shift();
    while (name && !needsPhoto(name)) name = photoQueue.shift();
    if (!name) return;
    photoBusy = true;
    // 先认领：同步 → 写「我在画」→ 等一下再同步，标记还是自己的才画（几部手机同时开着也只画一次）
    var me = DEVICE + ":" + Date.now();
    function release() { photoBusy = false; setTimeout(nextAiPhoto, 1500); }
    S.syncNow().then(function () {
      if (!needsPhoto(name)) return release();
      S.put("photo:" + name, { pending: true, t: Date.now(), dev: me });
      return new Promise(function (res) { setTimeout(res, 2500); }).then(S.syncNow).then(function () {
        var p = S.get("photo:" + name);
        if (!p || p.dev !== me) return release();
        var d = dish(name);
        return ai("photo", { name: name, hint: d && d.ings ? d.ings.slice(0, 5).map(function (x) { return x.split(/\s+/)[0]; }).join("、") : "" })
          .catch(function () {})
          .then(function () { S.syncNow(); release(); });
      });
    });
  }
  function photoSrc(name) {
    var p = S.get("photo:" + name);
    if (p && p.src && !failedImg[p.src]) return p.src;
    // App 自带的实拍照片（有授权，作者见「我的」→「图片来源」）
    var b = (window.MP_PHOTOS || {})[name];
    if (b && b.file && !failedImg[b.file]) return b.file;
    if (CFG.autoPhotos === false) return null;
    var a = autoPhoto(name);
    return failedImg[a] ? null : a;
  }
  function tileHTML(name, cls) {
    var d = dish(name), e = d && D.CAT_EMOJI[dishTags(d)[0]];
    return '<div class="dish-tile ' + (cls || "") + '" aria-hidden="true">' + esc(name.charAt(0) || e || "菜") + "</div>";
  }
  function dishMedia(name, cls) {
    var src = photoSrc(name);
    if (!src) return tileHTML(name, cls);
    return '<img class="dish-photo ' + (cls || "") + '" src="' + esc(src) + '" alt="' + esc(name) + '" loading="lazy" decoding="async" data-dish="' + esc(name) + '" data-cls="' + esc(cls || "") + '">';
  }
  // 图片加载失败：换成暖色方块，不留破图
  document.addEventListener("error", function (e) {
    var t = e.target;
    if (!t || t.tagName !== "IMG" || !t.classList.contains("dish-photo")) return;
    failedImg[t.getAttribute("src")] = true;
    var tmp = document.createElement("div");
    tmp.innerHTML = tileHTML(t.getAttribute("data-dish") || "", t.getAttribute("data-cls") || "");
    var tile = tmp.firstChild;
    var clickable = t.classList.contains("dish-click");
    t.replaceWith(tile);
    var name = t.getAttribute("data-dish");
    if (clickable && name) dishClick(tile, name);
  }, true);

  function resizeImage(file, max, quality) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = reject;
      r.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var s = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", quality));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }
  var photoTarget = null;
  function pickPhoto(target) { photoTarget = target; $("photo-file").click(); }
  $("photo-file").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f || !photoTarget) return;
    var tgt = photoTarget; photoTarget = null;
    var isAvatar = tgt.kind === "avatar";
    resizeImage(f, isAvatar ? 256 : 720, isAvatar ? 0.82 : 0.75).then(function (src) {
      if (isAvatar) { S.put("avatar:" + tgt.id, { src: src }); toast("头像换好了！"); }
      else { S.put("photo:" + tgt.id, { src: src }); toast("照片换好了：" + tgt.id); if (sheetIsOpen()) openRecipe(tgt.id); }
    }).catch(function () { toast("这张照片打不开，换一张试试"); });
  });

  // 所有菜名、照片都能点进做法
  function dishClick(node, name) {
    if (!node) return;
    node.classList.add("dish-click");
    node.setAttribute("role", "button"); node.setAttribute("tabindex", "0");
    node.setAttribute("aria-label", "看「" + name + "」的做法");
    node.addEventListener("click", function (e) { e.stopPropagation(); openRecipe(name); });
    node.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openRecipe(name); } });
  }
  function dishClickRow(row, name) {
    dishClick(row.querySelector("img, .dish-tile"), name);
    dishClick(row.querySelector(".dish-info, .bf-name, .m-name, .s-dish, .mn-name"), name);
  }

  // ---------- 说话输入 ----------
  var MIC_SVG = '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="17" y="4" width="14" height="24" rx="7" fill="#205c43"/><rect x="20.5" y="8" width="3.5" height="10" rx="1.75" fill="#bfe3cf"/><path d="M10 22a14 14 0 0 0 28 0" stroke="#205c43" stroke-width="4.5" stroke-linecap="round"/><path d="M24 36v6M16 44h16" stroke="#205c43" stroke-width="4.5" stroke-linecap="round"/></svg>';
  // 说话输入：优先「手机录音 → Qwen 转文字」（主屏 App 里也能用）；不行再用浏览器自带的语音识别；再不行用键盘上的 🎤
  var recState = null;
  function canRecord() { return !!(S.household() && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder && (window.AudioContext || window.webkitAudioContext)); }
  function startVoice(input, after) {
    if (recState) { stopRecording(); return; }
    if (canRecord()) { recordVoice(input, after); return; }
    browserVoice(input, after);
  }
  function browserVoice(input, after) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast("点输入框，再点键盘上的话筒说话"); input.focus(); return; }
    try {
      var rec = new SR();
      rec.lang = "zh-CN"; rec.interimResults = false; rec.maxAlternatives = 1;
      toast("在听了，说吧…");
      rec.onresult = function (ev) {
        var txt = ev.results[0][0].transcript.replace(/[。．.！!]$/g, "");
        input.value = txt;
        toast("听到了：「" + txt + "」");
        if (after) setTimeout(after, 400);
      };
      rec.onerror = function () { toast("没听清，点键盘上的话筒也能说"); input.focus(); };
      rec.start();
    } catch (e) { toast("点输入框，再点键盘上的话筒说话"); input.focus(); }
  }
  function recBar(text, onClick) {
    var bar = $("rec-bar");
    if (!bar) { bar = el("button", "rec-bar"); bar.id = "rec-bar"; bar.type = "button"; $("screen").appendChild(bar); bar.addEventListener("click", function () { if (bar._click) bar._click(); }); }
    bar.innerHTML = text; bar._click = onClick; bar.hidden = !text;
  }
  // 说完自动停：听到说话以后，安静约 2.5 秒才结束（1.6 秒太短，话没说完就被截断）；一直没出声，8 秒后也结束
  function watchSilence(ctx, stream, onSilence) {
    try {
      var src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
      an.fftSize = 1024; src.connect(an);
      var buf = new Float32Array(an.fftSize), t0 = Date.now(), noise = 0, n = 0, spoke = false, quietSince = 0;
      var iv = setInterval(function () {
        an.getFloatTimeDomainData(buf);
        var sum = 0; for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        var rms = Math.sqrt(sum / buf.length), now = Date.now();
        if (now - t0 < 400) { noise += rms; n++; return; } // 先听一下周围有多吵
        var floor = n ? noise / n : 0, th = Math.max(0.015, floor * 2.5);
        if (rms > th) { spoke = true; quietSince = 0; }
        else if (spoke) { if (!quietSince) quietSince = now; if (now - quietSince > 2500) { clearInterval(iv); onSilence(); } }
        else if (now - t0 > 8000) { clearInterval(iv); onSilence(); }
      }, 100);
      return function () { clearInterval(iv); try { src.disconnect(); } catch (e) {} };
    } catch (e) { return function () {}; }
  }
  function recordVoice(input, after) {
    // 在点的那一下就建好声音环境（iPhone 要求）
    var AC = window.AudioContext || window.webkitAudioContext, actx = null;
    try { actx = new AC(); if (actx.resume) actx.resume(); } catch (e) { actx = null; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var chunks = [], mr;
      try { mr = new MediaRecorder(stream); } catch (e) { stream.getTracks().forEach(function (t) { t.stop(); }); if (actx) actx.close(); browserVoice(input, after); return; }
      var unwatch = actx ? watchSilence(actx, stream, stopRecording) : function () {};
      recState = { mr: mr, stream: stream, timer: setTimeout(stopRecording, 20000) };
      mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = function () {
        unwatch(); if (actx) { try { actx.close(); } catch (e) {} }
        stream.getTracks().forEach(function (t) { t.stop(); });
        clearTimeout(recState && recState.timer); recState = null;
        recBar('⏳ 正在听写…', null);
        var blob = new Blob(chunks, { type: mr.mimeType || "audio/mp4" });
        toWav16k(blob).then(function (b64) {
          return ai("transcribe", { audio: b64, mime: "audio/wav" });
        }).then(function (r) {
          recBar("", null);
          var txt = String(r.text || "").replace(/[。．.！!]$/g, "");
          input.value = txt;
          toast("听到了：「" + txt + "」");
          if (after) setTimeout(after, 300);
        }).catch(function (e) {
          recBar("", null);
          toast(e && e.code === "no_speech" ? "没听清，靠近手机再说一次" : "说话没成功，点输入框用键盘上的 🎤 说");
          input.focus();
        });
      };
      mr.start();
      recBar('<span class="rec-dot"></span> 正在听…说完停一下就好', stopRecording);
    }).catch(function () {
      if (actx) { try { actx.close(); } catch (e) {} }
      toast("要允许用麦克风才能说话；也可以点键盘上的 🎤");
      browserVoice(input, after);
    });
  }
  function stopRecording() { if (recState && recState.mr.state !== "inactive") recState.mr.stop(); }
  // 录音转成 16k 单声道 WAV（Qwen 语音识别最稳的格式）
  function toWav16k(blob) {
    var AC = window.AudioContext || window.webkitAudioContext;
    return blob.arrayBuffer().then(function (buf) {
      var ctx = new AC();
      return new Promise(function (res, rej) { ctx.decodeAudioData(buf, res, rej); }).then(function (audio) {
        try { ctx.close(); } catch (e) {}
        var rate = 16000, len = Math.max(1, Math.round(audio.duration * rate));
        var off = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, len, rate);
        var src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start(0);
        return off.startRendering();
      });
    }).then(function (rendered) {
      var pcm = rendered.getChannelData(0), n = pcm.length;
      var out = new DataView(new ArrayBuffer(44 + n * 2));
      function w(o, str) { for (var i = 0; i < str.length; i++) out.setUint8(o + i, str.charCodeAt(i)); }
      w(0, "RIFF"); out.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
      out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
      out.setUint32(24, 16000, true); out.setUint32(28, 32000, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
      w(36, "data"); out.setUint32(40, n * 2, true);
      for (var i = 0; i < n; i++) { var v = Math.max(-1, Math.min(1, pcm[i])); out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
      var bytes = new Uint8Array(out.buffer), bin = "";
      for (var j = 0; j < bytes.length; j += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(j, j + 0x8000));
      return btoa(bin);
    });
  }
  // plain = true：只听写（比如反馈），不去听懂
  function voiceButton(input, label, plain) {
    var b = el("button", "voice-btn", MIC_SVG); b.type = "button";
    b.setAttribute("aria-label", label || "说话输入");
    b.addEventListener("click", function () { startVoice(input, plain ? null : function () { routeIfSentence(input.value); }); });
    return b;
  }

  // ---------- 弹层 ----------
  var sheetWrap = $("sheet-wrap"), sheet = $("sheet");
  function sheetIsOpen() { return sheetWrap.classList.contains("open"); }
  function openSheet() { sheetWrap.classList.add("open"); sheet.scrollTop = 0; }
  function closeSheet() { sheetWrap.classList.remove("open"); sheet.innerHTML = ""; }
  sheetWrap.addEventListener("click", function (e) { if (e.target === sheetWrap) closeSheet(); });
  function closeBtn(text) { return btn("sheet-close", text || "返回", closeSheet); }
  function pickCard(name, sub, onPick) {
    var b = el("button", "pick-card", dishMedia(name) + '<span class="pk-name">' + esc(name) + (sub ? '<span class="pk-from">' + esc(sub) + "</span>" : "") + "</span>");
    b.type = "button"; b.addEventListener("click", onPick);
    return b;
  }
  function confirmPanel(title, sub, big, yesText, onYes, onNo) {
    sheet.innerHTML = "<h3>" + esc(title) + '</h3><p class="sheet-sub">' + esc(sub) + "</p>" +
      '<div class="read-panel" style="font-size:24px;font-weight:800;text-align:center">' + esc(big) + "</div>";
    sheet.appendChild(btn("sheet-cta", yesText, onYes));
    sheet.appendChild(btn("sheet-close", "不对，返回改", onNo));
    sheet.appendChild(closeBtn("取消"));
    sheet.scrollTop = 0;
  }

  // ---------- 日期下面：节气 · 天气 · 一句暖心话 ----------
  var WMO = [[0, "☀️ 晴"], [1, "🌤️ 晴间多云"], [2, "⛅ 多云"], [3, "☁️ 阴"], [48, "🌫️ 有雾"], [57, "🌦️ 毛毛雨"], [61, "🌧️ 小雨"], [63, "🌧️ 中雨"], [67, "🌧️ 大雨"], [77, "🌨️ 下雪"], [82, "🌦️ 阵雨"], [86, "🌨️ 阵雪"], [99, "⛈️ 雷雨"]];
  function weatherText(id) {
    var w = LS.get("mp:weather", null);
    if (!w || !w.daily || !w.daily.time) return null;
    var i = w.daily.time.indexOf(id); if (i === -1) return null;
    var code = w.daily.weather_code[i], label = "";
    for (var k = 0; k < WMO.length; k++) { if (code <= WMO[k][0]) { label = WMO[k][1]; break; } }
    return label + " · " + Math.round(w.daily.temperature_2m_min[i]) + "–" + Math.round(w.daily.temperature_2m_max[i]) + "℃";
  }
  // 取天气：没取到就过一会儿再试（最多 4 次），切回 App 时也再试；不会因为失败一次就一整天没有
  var weatherTries = 0, weatherBusy = false;
  function loadWeather() {
    var c = CFG.weather || {};
    if (c.latitude == null || c.longitude == null || weatherBusy) return;
    var w = LS.get("mp:weather", null);
    if (w && w.day === todayIso() && w.daily && w.daily.time && w.daily.time.indexOf(todayIso()) !== -1) return;
    weatherBusy = true;
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    fetch("https://api.open-meteo.com/v1/forecast?latitude=" + c.latitude + "&longitude=" + c.longitude +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=8", { signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) {
        if (!j || !j.daily || !j.daily.time) throw new Error("empty");
        LS.set("mp:weather", { day: todayIso(), daily: j.daily }); weatherTries = 0; renderAll();
      })
      .catch(function () { if (++weatherTries < 4) setTimeout(loadWeather, 15000 * weatherTries); })
      .then(function () { clearTimeout(timer); weatherBusy = false; });
  }
  function dayMetaHTML(id) {
    var st = D.solarTerm(fromIso(id));
    var term = st.isToday ? "今天" + st.current : st.current;
    var extra = st.daysToNext === 1 ? " · 明天" + st.next : st.daysToNext <= 3 ? " · " + st.daysToNext + "天后" + st.next : "";
    var w = weatherText(id);
    return '<div class="dm-row"><span class="dm-ico" aria-hidden="true">🌿</span><span><b>节气：' + esc(term) + "</b>" + esc(extra) + "</span></div>" +
      (w ? '<div class="dm-row"><span class="dm-ico" aria-hidden="true">🌤️</span><span><b>天气：</b>' + esc(w) + "</span></div>" : "") +
      '<div class="dm-warm">💛 ' + esc(D.warmLine(fromIso(id))) + "</div>";
  }

  // =====================================================================
  //  妈妈屏 · 定计划
  // =====================================================================
  // 「周几」一排：妈妈屏和家里人屏都用
  // 选日子：正在看的那天一个大块（看得清），下面 7 天小块（好点），位置固定不跳
  function dayStrip(box, sel, onPick, list) {
    box.innerHTML = "";
    box.classList.add("day-pick");
    var ds = list || days();
    var sd = dayInfo(sel), sdec = dinner(sel).length > 0;
    var notToday = sel !== todayIso();
    var big = el("div", "day-big" + (notToday ? " not-today" : ""), '<span class="db-rel">' + esc(sd.rel || (dayName(sel) !== sd.short ? dayName(sel) : sd.weekday)) + "</span>" +
      '<span class="db-date">' + esc(sd.md + " " + sd.weekday) + "</span>" +
      (notToday ? '<span class="db-note">看的不是今天</span>' : "") +
      '<span class="db-st' + (sdec ? " ok" : "") + '">' + (sdec ? "晚饭已定 ✓" : "晚饭还没定") + "</span>");
    big.setAttribute("aria-live", "polite");
    box.appendChild(big);
    var grid = el("div", "day-grid");
    ds.forEach(function (id) {
      var d = dayInfo(id), decided = dinner(id).length > 0;
      var b = el("button", "day-chip" + (sel === id ? " on" : ""),
        '<span class="dc-top">' + esc(dayName(id)) + "</span>" +
        '<span class="dc-date">' + (d.rel ? d.short + " · " : "") + d.num + "日</span>" +
        '<span class="dc-st' + (decided ? " ok" : "") + '">' + (decided ? "✓ 已定" : "未定") + "</span>");
      b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(sel === id));
      b.setAttribute("aria-label", d.md + d.weekday + (decided ? "，晚饭已定" : "，晚饭未定"));
      b.addEventListener("click", function () { onPick(id); });
      grid.appendChild(b);
    });
    box.appendChild(grid);
  }
  function renderDayStrip() {
    var ds = cookDays(); // 晚上 7 点后，今天就过去了，从明天开始
    if (ds.indexOf(ui.planDay) === -1) ui.planDay = cookBaseIso();
    dayStrip($("day-strip"), ui.planDay, function (id) { ui.planDay = id; renderMomPlan(); }, ds);
    var t = dayInfo(todayIso()), cur = dayInfo(ui.planDay);
    $("plan-date").textContent = "今天 " + t.md + " " + t.weekday;
    $("plan-meta").innerHTML = dayMetaHTML(todayIso());
    $("sel-day").textContent = cur.md + " " + cur.weekday + (cur.rel ? "（" + cur.rel + "）" : "");
  }
  // 谁在家：妈妈屏只看，不能点。都在家就一句「都在家吃饭」。
  function renderPeople() {
    var id = ui.planDay, eve = eveLabel(id);
    var away = D.PEOPLE.filter(function (p) { return !isHome(id, p.id); });
    var gc = guestCount(id);
    var html = '<div class="home-line"><span>🏠 ' + eve + (away.length || gc ? " <b>" + totalPeople(id) + " 人</b>吃饭" : "都在家吃饭") + "</span>";
    away.forEach(function (p) { html += '<span class="away-tag">' + esc(p.name) + "不在家</span>"; });
    $("people").innerHTML = html + "</div>";
    var gbox = $("guests-mom"), list = guests(id);
    if (!list.length) { gbox.hidden = true; gbox.innerHTML = ""; return; }
    gbox.hidden = false;
    gbox.innerHTML = '<div class="guest-banner" role="status"><span class="gb-ico" aria-hidden="true">🎉</span><div class="gb-main"><b>' + eve + "有客人来</b>" +
      list.map(function (g) { return '<span class="gb-item">' + esc(g.label) + " · " + g.count + " 位</span>"; }).join("") +
      '<div class="gb-sub">一共 ' + totalPeople(id) + " 人吃饭</div></div></div>";
  }
  function wishChip(w, canRemove) {
    var pd = w.meal === "breakfast" ? null : plannedDay(w.dish);
    var chip = el("span", "chip" + (pd ? " planned" : ""), esc(w.dish) + (w.meal === "breakfast" ? '<span class="bf-wish-tag">🌅 早饭</span>' : pd ? '<span class="planned-tag">✓ 已安排 · ' + esc(dayName(pd)) + "</span>" : craveTag(w.level)) + (w.msg && !pd ? '<span class="wish-msg">' + esc(w.msg) + "</span>" : ""));
    if (w.meal === "breakfast") {
      chip.classList.add("dish-click"); chip.setAttribute("role", "button"); chip.setAttribute("tabindex", "0");
      chip.addEventListener("click", function () { openBfWish(w.dish); });
    } else dishClick(chip, w.dish);
    if (canRemove) {
      var x = btn("x", "×", function (e) {
        e.stopPropagation();
        S.del(w.id);
        toast("已拿掉：" + w.dish);
      }, "拿掉" + w.dish);
      chip.appendChild(x);
    }
    return chip;
  }
  function renderWishes() {
    var box = $("wishes"); box.innerHTML = "";
    var all = wishes();
    peopleInOrder().forEach(function (p) {
      var mine = all.filter(function (w) { return w.person === p.id; });
      // 还没安排的在前，已经排进晚饭的在后
      mine = mine.filter(function (w) { return !plannedDay(w.dish); }).concat(mine.filter(function (w) { return plannedDay(w.dish); }));
      if (p.id === "mom" && !mine.length) return;
      var g = el("div", "wish-group", '<div class="wish-who">' + esc(p.name) + " <span>想吃妈妈做的</span></div>");
      if (!mine.length) g.appendChild(el("div", "wish-none", "最近还没点"));
      else { var chips = el("div", "chips"); mine.forEach(function (w) { chips.appendChild(wishChip(w, true)); }); g.appendChild(chips); }
      box.appendChild(g);
    });
  }
  // 所有折叠都用同一个样子：整行一条，收起时左边写里面有什么，右边 ▼；展开后写「收起」，右边 ▲
  function setFold(b, open, closedHTML, openText) {
    b.classList.add("fold-btn");
    b.innerHTML = '<span class="fb-txt">' + (open ? esc(openText || "收起") : closedHTML) + '</span><span class="fb-ic" aria-hidden="true">' + (open ? "▲" : "▼") + "</span>";
    b.setAttribute("aria-expanded", String(!!open));
  }
  function foldBtn(open, closedHTML, openText, onClick) { var b = btn("fold-btn", "", onClick); setFold(b, open, closedHTML, openText); return b; }
  // 定计划里的早饭：在晚饭上面，小小一条（大家自己点的，妈妈看一眼就行）
  function renderMomBreakfast() {
    var id = ui.planDay, box = $("breakfast"); box.innerHTML = "";
    var list = bfList(id), people = homePeople(id);
    var head = el("div", "bs-hd", "<span>🌅 早饭 · 大家自己点的</span>");
    if (isHome(id, ui.me)) head.appendChild(btn("mini-btn", "换我的", function () { openBreakfast(id); }, "换我自己的早饭"));
    box.appendChild(head);
    var body = el("div", "bs-bd");
    if (!people.length) body.textContent = "这天没人在家吃早饭";
    people.forEach(function (p) {
      var mine = list.filter(function (it) { return it.person === p.id; });
      var kind = mine[0] ? mine[0].kind : "skip";
      var one = el("span", "bs-one", '<b class="act-c-' + p.id + '">' + esc(p.name) + "</b> ");
      if (kind === "skip") one.appendChild(el("span", "bs-none", "不吃"));
      else if (kind === "any") one.appendChild(document.createTextNode("随便"));
      else mine.forEach(function (it, i) {
        if (i) one.appendChild(document.createTextNode("、"));
        var a = el("span", "dish-link-txt", esc(it.name)); dishClick(a, it.name); one.appendChild(a);
        if (it.kind === "fallback") one.appendChild(el("span", "fallback-tag", "默认"));
        if (stockOf(it.name) === "out") one.appendChild(el("span", "out-tag", "吃完了"));
      });
      body.appendChild(one);
    });
    box.appendChild(body);
  }
  function renderMomDinner() {
    var box = $("dinner-plan"); box.innerHTML = "";
    var id = ui.planDay, list = dinner(id);
    var card = el("div", "plan-card" + (list.length ? " decided" : ""), '<div class="plan-meal">晚饭</div>');
    if (!list.length) {
      card.appendChild(btn("plan-empty", "＋ 定" + dayName(id) + "的晚饭", function () { openDinnerPicker(null); }));
      card.appendChild(btn("random-btn", "🎲 随便，帮妈妈挑一道", function () { randomDish(id); }));
    } else {
      list.forEach(function (name, idx) {
        var w = wishOf(name), d = dish(name);
        var row = el("div", "dish-row",
          dishMedia(name) +
          '<div class="dish-info"><div class="dish-name">' + esc(name) + newTag(name) + "</div>" +
          '<div class="dish-from">' + (w ? esc(pname(w.person)) + "想吃的 " + craveTag(w.level) : "妈妈定的") + "</div>" +
          (d && d.prep ? '<span class="prep-tag">⏰ ' + esc(d.prep) + "</span>" : "") + "</div>");
        dishClickRow(row, name);
        var acts = el("div", "dish-acts");
        acts.appendChild(btn("mini-btn", "换一道", function () { openDinnerPicker(idx); }));
        acts.appendChild(btn("mini-btn danger", "不要了", function () {
          var cur = dinner(id).slice(); var i = cur.indexOf(name); if (i !== -1) cur.splice(i, 1);
          setDinner(id, cur);
          log("拿掉了" + dayName(id) + "晚饭：" + name);
          toast("拿掉了：" + name);
        }));
        row.appendChild(acts);
        card.appendChild(row);
      });
      var gc = guestCount(id);
      card.appendChild(el("div", "plan-serves", "给 " + totalPeople(id) + " 个人吃" + (gc ? "（含客人 " + gc + " 位）" : "")));
      card.appendChild(btn("add-dish", "＋ 再加一道", function () { openDinnerPicker(null); }));
      card.appendChild(btn("random-btn", "🎲 随便，再来一道", function () { randomDish(id); }));
    }
    box.appendChild(card);
  }
  function addDinner(id, name, how) {
    var cur = dinner(id).slice();
    if (cur.indexOf(name) !== -1) { toast("这道已经定上了"); return false; }
    cur.push(name); setDinner(id, cur);
    log((how || "定了") + dayName(id) + "晚饭：" + name);
    return true;
  }
  function randomDish(id) {
    var have = dinner(id);
    var pool = menuFor("dinner").map(function (d) { return d.name; }).filter(function (n) { return have.indexOf(n) === -1; });
    if (!pool.length) { toast("菜谱里的菜都定上了"); return; }
    var name = pool[Math.floor(Math.random() * pool.length)];
    addDinner(id, name, "用「随便」定了");
    toast("随便挑了：" + name);
  }
  function openDinnerPicker(replaceIdx) {
    var id = ui.planDay, d = dayInfo(id);
    sheet.innerHTML = "<h3>" + (replaceIdx === null ? "定" + dayName(id) + "的晚饭" : "换一道") + '</h3><p class="sheet-sub">' + d.md + " " + d.weekday + "，点一下就定。</p>";
    var have = dinner(id);
    function choose(name) {
      var cur = dinner(id).slice();
      if (cur.indexOf(name) !== -1) { toast("这道已经定上了"); return; }
      if (replaceIdx === null || replaceIdx >= cur.length) cur.push(name); else cur[replaceIdx] = name;
      setDinner(id, cur);
      log("定了" + dayName(id) + "晚饭：" + name);
      closeSheet();
      toast(dayName(id) + "晚饭定了：" + name);
    }
    // 说或写菜名：菜谱里有的先跳出来点；没有就加一道新的
    var srow = el("div", "name-row");
    var sin = el("input", "add-input"); sin.type = "text"; sin.placeholder = "说或写菜名，比如：红烧肉"; sin.setAttribute("aria-label", "菜名");
    var smic = el("button", "voice-btn", MIC_SVG); smic.type = "button"; smic.setAttribute("aria-label", "说菜名");
    smic.addEventListener("click", function () { startVoice(sin, function () { if (routeIfSentence(sin.value)) return; sin.value = cleanDish(sin.value); showFound(); }); });
    srow.appendChild(sin); srow.appendChild(smic);
    sheet.appendChild(srow);
    var found = el("div", "found-box");
    sheet.appendChild(found);
    var rest = el("div");
    function showFound() {
      var q = cleanDish(sin.value);
      found.innerHTML = ""; rest.hidden = !!q;
      if (!q) return;
      var ms = findDishes(q, "dinner");
      if (ms.length) {
        found.appendChild(el("h4", null, "菜谱里有，点一下就定"));
        var g = el("div", "pick-grid");
        ms.slice(0, 6).forEach(function (n) { g.appendChild(pickCard(n, have.indexOf(n) !== -1 ? "已经定上了" : null, function () { choose(n); })); });
        found.appendChild(g);
      } else found.appendChild(el("p", "sheet-sub", "菜谱里还没有「" + q + "」。"));
      if (!dish(q)) found.appendChild(btn("sheet-cta", isSentence(sin.value) ? "听懂这句话，帮我办" : "＋ 加新菜「" + q + "」，定进" + dayName(id), function () {
        if (routeIfSentence(sin.value)) return;
        newDish(q, "dinner", guessCat(q), [], []);
        fillRecipeLater(q, "dinner");
        choose(q);
      }));
    }
    sin.addEventListener("input", showFound);
    rest.appendChild(btn("rec-inline", "✨ 帮我想新菜", function () {
      openRecommend({ meal: "dinner", pickText: "要这道，定进" + dayName(id), onPick: function (r) { addRec(r); choose(r.name); }, back: function () { openDinnerPicker(replaceIdx); } });
    }));
    sheet.appendChild(rest);
    var ws = wishes().filter(function (w) { return have.indexOf(w.dish) === -1 && w.meal !== "breakfast"; });
    if (ws.length) {
      rest.appendChild(el("h4", null, "从「最近想吃」里挑"));
      var g1 = el("div", "pick-grid");
      ws.forEach(function (w) { var c = craveOf(w.level); g1.appendChild(pickCard(w.dish, pname(w.person) + "想吃 · " + c.emoji + " " + c.label, function () { choose(w.dish); })); });
      rest.appendChild(g1);
    }
    rest.appendChild(el("h4", null, "从菜谱里挑"));
    var wished = ws.map(function (w) { return w.dish; });
    rest.appendChild(dishGrid({ meal: "dinner", skip: function (n) { return have.indexOf(n) !== -1 || wished.indexOf(n) !== -1; }, onPick: choose }));
    sheet.appendChild(closeBtn("先不定，返回"));
    openSheet();
  }

  // =====================================================================
  //  妈妈屏 · 照着做（只看今天）
  // =====================================================================
  function finishDish(date, key, name) {
    var ops = [{ id: "done:" + date + ":" + key, data: { t: Date.now() } }];
    var ws = wishes().filter(function (w) { return w.dish === name; });
    ws.forEach(function (w) { ops.push({ id: w.id, deleted: true }); });
    S.putMany(ops);
    log("做好了" + name + " · 谢谢妈妈");
    toast("谢谢妈妈！" + name + "做好了" + (ws.length ? "，已从「最近想吃」拿掉" : ""));
  }
  function renderCook() {
    if (!ui.cookDay || cookDays().indexOf(ui.cookDay) === -1) ui.cookDay = cookBaseIso();
    var id = ui.cookDay, d = dayInfo(id);
    dayStrip($("cook-strip"), id, function (x) { ui.cookDay = x; renderCook(); $("read-panel").hidden = true; }, cookDays());
    $("cook-when").textContent = d.rel || d.short;
    $("cook-date").textContent = d.md + " " + d.weekday;
    $("cook-meta").innerHTML = dayMetaHTML(id);
    if (!reading) $("read-btn").textContent = "🔊 把" + dayName(id) + "的安排读给我听";
    prepareTts();
    var box = $("morning"); box.innerHTML = "";
    var bfCard = el("div", "m-card", '<div class="plan-meal">早饭 · 热一下就行</div>');
    var bfs = bfList(id).filter(function (it) { return it.kind !== "skip"; });
    if (!bfs.length) bfCard.appendChild(el("div", "m-empty", dayName(id) + "不用做早饭。"));
    // 一样的早饭合并成一张：写上谁要吃，几份
    var groups = [], byName = {};
    bfs.forEach(function (it) {
      var name = it.kind === "any" ? "随便" : it.name;
      if (!byName[name]) { byName[name] = { name: name, kind: it.kind, people: [], fallback: [] }; groups.push(byName[name]); }
      byName[name].people.push(it.person);
      if (it.kind === "fallback") byName[name].fallback.push(it.person);
    });
    groups.forEach(function (g) {
      var key = "bf:" + g.name, done = !!S.get("done:" + id + ":" + key);
      var who = g.people.map(pname).join("、");
      var note = g.kind === "any" ? " · 妈妈看着做" : g.fallback.length === g.people.length ? " · 没点，默认做这个" : g.fallback.length ? " · " + g.fallback.map(pname).join("、") + "没点，默认" : "";
      var wrap = el("div", "m-dish" + (done ? " done" : ""),
        (g.kind === "any" ? '<div class="dish-tile hero" aria-hidden="true">随</div>' : dishMedia(g.name, "hero")) +
        '<div class="m-name">' + esc(g.name) + (g.people.length > 1 ? '<span class="m-count"> × ' + g.people.length + " 份</span>" : "") + "</div>" +
        '<div class="m-serves">' + esc(who) + "要吃" + esc(note) + "</div>");
      if (g.kind !== "any") dishClickRow(wrap, g.name);
      wrap.appendChild(btn("done-btn", done ? "✓ 热好了" : "热好了", function () { if (!done) finishDish(id, key, g.name); }));
      bfCard.appendChild(wrap);
    });
    box.appendChild(bfCard);
    var dnCard = el("div", "m-card", '<div class="plan-meal">晚饭</div>');
    var dn = dinner(id);
    if (!dn.length) dnCard.appendChild(el("div", "m-empty", "晚饭还没定，到「定计划」定一下。"));
    dn.forEach(function (name) {
      var key = "dn:" + name, done = !!S.get("done:" + id + ":" + key);
      var wrap = el("div", "m-dish" + (done ? " done" : ""),
        dishMedia(name, "hero") + '<div class="m-name">' + esc(name) + "</div>" +
        '<div class="m-serves">' + totalPeople(id) + " 个人吃" + (guestCount(id) ? "（含客人 " + guestCount(id) + " 位）" : "") + "</div>");
      dishClickRow(wrap, name);
      wrap.appendChild(btn("done-btn", done ? "✓ 做好了" : "做好了", function () { if (!done) finishDish(id, key, name); }));
      dnCard.appendChild(wrap);
    });
    box.appendChild(dnCard);
    var away = D.PEOPLE.filter(function (p) { return !isHome(id, p.id); }).map(function (p) { return p.name; });
    $("today-line").innerHTML = esc(dayName(id)) + "在家：" + esc(homePeople(id).map(function (p) { return p.name; }).join("、") || "没人") +
      (away.length ? "<br>" + esc(away.join("、")) + "不在家" : "") +
      (guestCount(id) ? "<br>🎉 有客人：" + esc(guestText(id)) : "");
  }
  function todayScript() {
    var id = ui.cookDay || cookBaseIso(), dn0 = dayName(id);
    var g = {}, order = [];
    bfList(id).filter(function (it) { return it.kind !== "skip"; }).forEach(function (it) { var n = it.kind === "any" ? "随便" : it.name; if (!g[n]) { g[n] = []; order.push(n); } g[n].push(pname(it.person)); });
    var bf = order.map(function (n) { return n + (g[n].length > 1 ? g[n].length + "份" : "") + "，" + g[n].join("、") + "吃"; }).join("；");
    var dn = dinner(id);
    return dn0 + "在家吃饭的有" + homePeople(id).map(function (p) { return p.name; }).join("、") + "，一共 " + totalPeople(id) + " 个人" +
      (guestCount(id) ? "，其中客人 " + guestCount(id) + " 位" : "") + "。\n早饭，加热就行：" + (bf || "不用做") + "。\n晚饭：" + (dn.length ? dn.join("、") : "还没定") + "。";
  }
  var reading = false;
  var readAudio = null;
  function stopReading() {
    reading = false;
    try { speechSynthesis.cancel(); } catch (e) {}
    if (readAudio) { try { readAudio.pause(); } catch (e) {} }
    $("read-btn").textContent = "🔊 再读一遍";
  }
  function phoneVoice(text) {
    if (!window.speechSynthesis) { stopReading(); return; }
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN"; u.rate = 0.9;
      u.onend = stopReading;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { stopReading(); }
  }
  // 提前把要读的话变成声音存着，点了马上读（不用等几秒）
  var ttsCache = { text: "", url: "", t: 0, pending: null }, ttsTimer = null;
  function ttsFresh(text) { return ttsCache.text === text && ttsCache.url && Date.now() - ttsCache.t < 6 * 3600 * 1000; }
  function getTts(text) {
    if (ttsFresh(text)) return Promise.resolve(ttsCache.url);
    if (ttsCache.pending && ttsCache.pending.text === text) return ttsCache.pending.p;
    var p = ai("tts", { text: text.replace(/\n/g, "") }).then(function (r) {
      ttsCache.text = text; ttsCache.url = r.url; ttsCache.t = Date.now(); ttsCache.pending = null;
      try { var pre = new Audio(); pre.preload = "auto"; pre.src = r.url; ttsCache.pre = pre; } catch (e) {}
      return r.url;
    }, function (e) { ttsCache.pending = null; throw e; });
    ttsCache.pending = { text: text, p: p };
    return p;
  }
  // 妈妈的手机一打开、或者菜/早饭有改动，就提前准备好要读的话（服务器也会存着，下次直接拿）
  function prepareTts() {
    if (ttsTimer) return; // 已经在等了：页面再刷新也不重新计时，不然一直准备不上
    if (!isMom() || !S.household() || reading || document.hidden) return;
    ttsTimer = setTimeout(function () {
      ttsTimer = null;
      if (!isMom() || reading) return;
      var t = todayScript(); if (!ttsFresh(t)) getTts(t).catch(function () {});
    }, 1500);
  }
  $("read-btn").addEventListener("click", function () {
    var b = $("read-btn"), panel = $("read-panel");
    if (reading) { stopReading(); return; }
    var text = todayScript();
    panel.hidden = false; panel.textContent = text;
    reading = true; b.textContent = "⏹ 停，别读了";
    // iPhone 要在点按的那一下就「开」声音，之后才能放：先放一段无声的
    if (!readAudio) { readAudio = new Audio(); readAudio.preload = "auto"; }
    readAudio.onended = stopReading;
    readAudio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";
    try { readAudio.play().catch(function () {}); } catch (e) {}
    // 真人声音准备好了就马上读；还没好就先用手机自带的声音读，不让妈妈等（真人声音在后台接着准备，下次用）
    if (!S.household() || !ttsFresh(text)) {
      phoneVoice(text);
      if (S.household()) getTts(text).catch(function () {});
      return;
    }
    readAudio.src = ttsCache.url;
    var pr = readAudio.play();
    if (pr && pr.catch) pr.catch(function () { if (reading) phoneVoice(text); });
  });

  function showMode(mode) {
    ui.mode = mode; LS.set("mp:mode", mode);
    $("plan-area").hidden = mode !== "plan";
    $("cook-area").hidden = mode === "plan";
    $("tab-plan").classList.toggle("on", mode === "plan");
    $("tab-cook").classList.toggle("on", mode !== "plan");
    $("tab-plan").setAttribute("aria-selected", String(mode === "plan"));
    $("tab-cook").setAttribute("aria-selected", String(mode !== "plan"));
  }
  $("tab-plan").addEventListener("click", function () { showMode("plan"); });
  $("tab-cook").addEventListener("click", function () { showMode("cook"); prepareTts(); });

  // 5. 晚上 7 点以后：今天的晚饭还没点「做好了」的，问一句做了吗
  function renderTonightCheck() {
    var box = $("tonight-check"); box.innerHTML = "";
    var today = todayIso(), late = new Date().getHours() >= CUTOFF_HOUR;
    var left = late ? dinner(today).filter(function (n) { return !S.get("done:" + today + ":dn:" + n); }) : [];
    box.hidden = !left.length;
    if (!left.length) return;
    box.appendChild(el("h2", "sec-title", '<span class="sec-ic" aria-hidden="true">❓</span>今天的菜做了吗'));
    left.forEach(function (name) {
      var ws = wishes().filter(function (w) { return w.dish === name; });
      var row = el("div", "tc-row", '<div class="tc-name">' + esc(name) + (ws.length ? "<small>" + esc(ws.map(function (w) { return pname(w.person); }).join("、")) + "想吃的</small>" : "") + "</div>");
      var acts = el("div", "tc-acts");
      acts.appendChild(btn("tc-yes", "✓ 做了", function () { finishDish(today, "dn:" + name, name); }));
      acts.appendChild(btn("tc-no", "还没做，改天", function () { openMoveDinner(today, name); }));
      row.appendChild(acts); box.appendChild(row);
    });
  }
  // 今天没做的菜：选改到哪天
  function openMoveDinner(from, name) {
    sheet.innerHTML = "<h3>「" + esc(name) + "」改到哪天做？</h3>" + '<p class="sheet-sub">点一天就改过去。</p>';
    var g = el("div", "g-day-row");
    days().filter(function (id) { return id !== from; }).forEach(function (id) {
      var d = dayInfo(id), dn = dinner(id);
      var b2 = el("button", "g-day-btn", '<span class="t-top">' + esc(d.rel || d.short) + '</span><span class="t-sub">' + (d.rel ? d.short + " · " : "") + d.num + "日<br>" + (dn.length ? esc(dn.join("、")) : "晚饭还没定") + "</span>");
      b2.type = "button";
      b2.addEventListener("click", function () {
        var t = dinner(from).filter(function (x) { return x !== name; }), n2 = dinner(id).slice();
        if (n2.indexOf(name) === -1) n2.push(name);
        S.putMany([{ id: "dinner:" + from, data: { dishes: t } }, { id: "dinner:" + id, data: { dishes: n2 } }]);
        log("把" + name + "改到" + dayName(id) + "晚饭");
        closeSheet(); toast(name + " 改到" + dayName(id) + "了");
      });
      g.appendChild(b2);
    });
    sheet.appendChild(g);
    sheet.appendChild(btn("sheet-close", "这周不做了，从今天拿掉", function () {
      setDinner(from, dinner(from).filter(function (x) { return x !== name; }));
      log("拿掉了今天晚饭：" + name); closeSheet(); toast("拿掉了：" + name);
    }));
    sheet.appendChild(closeBtn("先不改，返回"));
    openSheet();
  }
  function renderMomPlan() { renderTonightCheck(); renderDayStrip(); renderPeople(); renderWishes(); renderMomBreakfast(); renderMomDinner(); }

  // =====================================================================
  //  家里人屏（Vicky / 小陈 / 爸爸）
  // =====================================================================
  function renderFamily() {
    if (isMom()) return;
    var me = ui.me, t = dayInfo(todayIso());
    $("fam-date").textContent = "今天 " + t.md + " " + t.weekday;
    $("fam-meta").innerHTML = dayMetaHTML(todayIso());
    // 1 · 这几天在不在家：默认都在家，不在家时再展开选
    var hb = $("fam-home"); hb.innerHTML = "";
    var awayDays = days().filter(function (id) { return !isHome(id, me); });
    hb.appendChild(el("div", "home-sum" + (awayDays.length ? " away" : ""), awayDays.length
      ? "🚶 " + esc(awayDays.map(function (id) { return dayName(id); }).join("、")) + "不在家吃，其他天都在家"
      : "🏠 这几天都在家吃饭 ✓"));
    hb.appendChild(foldBtn(ui.homeOpen, awayDays.length ? "改一下哪天不在家" : "有几天不在家？点这里选", "收起", function () { ui.homeOpen = !ui.homeOpen; renderFamily(); }));
    if (ui.homeOpen) {
      var grid = el("div", "home-days big");
      days().forEach(function (id) {
        var h = isHome(id, me), d = dayInfo(id);
        var b = el("button", "home-day" + (h ? "" : " off"), "<b>" + (d.rel || d.short) + "</b><small>" + d.num + "日</small><span>" + (h ? "✓ 在家吃" : "不在家") + "</span>");
        b.type = "button"; b.setAttribute("aria-label", d.md + (h ? "在家吃饭，点一下改成不在家" : "不在家，点一下改成在家吃饭"));
        b.addEventListener("click", function () { toggleHome(id); });
        grid.appendChild(b);
      });
      hb.appendChild(grid);
    }
    // 2 · 我的早饭：总开关 + 可折叠
    var off = bfOff(me);
    var sw = $("fam-bf-switch"); sw.innerHTML = "";
    var swRow = el("div", "bf-switch", '<span class="bs-txt">' + (off ? "我不吃早饭，不用点" : "我吃早饭") + "</span>");
    var tg = el("button", "switch-btn" + (off ? "" : " on"), "<span></span>"); tg.type = "button";
    tg.setAttribute("role", "switch"); tg.setAttribute("aria-checked", String(!off)); tg.setAttribute("aria-label", "我吃早饭");
    tg.addEventListener("click", function () {
      S.put("bfoff:" + me, { v: !off });
      log(off ? "要吃早饭了" : "不吃早饭了");
      toast(off ? "好了，记得点早饭" : "好了，妈妈不用做你的早饭");
    });
    swRow.appendChild(tg); sw.appendChild(swRow);
    var bft = $("fam-bf-toggle");
    bft.hidden = off;
    var homeDays = bfDays().filter(function (id) { return isHome(id, me); });
    var picked = homeDays.filter(function (id) { return bfPick(id, me); });
    setFold(bft, ui.famBfOpen, picked.length === homeDays.length ? "这几天的早饭都点好了 ✓" : "在家 " + homeDays.length + " 天，还有 " + (homeDays.length - picked.length) + " 天没点（没点的默认鸡蛋三明治）", "收起");
    $("fam-bf-body").hidden = off || !ui.famBfOpen;
    var bf = $("fam-breakfast"); bf.innerHTML = "";
    bfDays().forEach(function (id) {
      var d = dayInfo(id), home = isHome(id, me), pick = bfPick(id, me);
      var label = !home ? '<span class="s-dish away">这天不在家</span>'
        : pick ? '<span class="s-dish">' + esc(pick) + (bfPicks(id, me).some(function (n) { return stockOf(n) === "out"; }) ? '<span class="out-tag">有的吃完了，换一样</span>' : "") + "</span>" : '<span class="s-dish none">还没点</span>';
      var row = el("div", "d-row", '<span class="s-day">' + d.short + "<small>" + (d.rel ? d.rel + " · " : "") + d.num + "日</small></span>" + label);
      if (home && pick && pick !== D.BF_ANY && pick !== D.BF_SKIP && bfPicks(id, me).length === 1) dishClick(row.querySelector(".s-dish"), pick);
      if (home) row.appendChild(btn("mini-btn", pick ? "换一道" : "选早饭", function () { openBreakfast(id); }, "点" + d.short + "的早饭"));
      bf.appendChild(row);
    });
    // 3 · 想吃
    var wbox = $("fam-wishes"); wbox.innerHTML = "";
    var mine = wishes().filter(function (w) { return w.person === me; });
    var g = el("div", "wish-group", '<div class="wish-who">' + esc(pname(me)) + " <span>想吃妈妈做的</span></div>");
    if (!mine.length) g.appendChild(el("div", "wish-none", "还没点，点上面大按钮挑一道。"));
    else { var chips = el("div", "chips"); mine.forEach(function (w) { chips.appendChild(wishChip(w, true)); }); g.appendChild(chips); }
    wbox.appendChild(g);
    renderGuests();
    renderFamilyToday();
  }
  $("fam-bf-toggle").addEventListener("click", function () { ui.famBfOpen = !ui.famBfOpen; renderFamily(); });
  function toggleHome(id) {
    var now = !isHome(id, ui.me);
    S.put("home:" + id + ":" + ui.me, { v: now });
    log((now ? dayName(id) + "在家吃饭" : dayName(id) + "不在家吃饭"));
    toast(now ? "好了，妈妈知道你" + dayName(id) + "在家" : "好了，妈妈知道你" + dayName(id) + "不在家");
  }
  function setBreakfast(id, name) { setBreakfastList(id, [name]); }
  function setBreakfastList(id, list) {
    saveBf(id, ui.me, list);
    var txt = list.join("、");
    log("定了" + dayName(id) + "早饭：" + txt);
    closeSheet();
    toast(dayName(id) + "早饭：" + txt);
  }
  // 从做法页「当早饭」：加进那天的早饭里（已经点了的也保留）
  function addBreakfast(id, name) {
    var cur = bfPicks(id, ui.me).filter(function (n) { return n !== D.BF_ANY && n !== D.BF_SKIP; });
    if (cur.indexOf(name) === -1) cur.push(name);
    setBreakfastList(id, cur);
  }
  // 点早饭：可以点好几样，点一下选上、再点一下取消，最后点「就这些」
  function openBreakfast(id, keep) {
    var d = dayInfo(id), cur = bfPicks(id, ui.me);
    var sel = keep || cur.filter(function (n) { return n !== D.BF_ANY && n !== D.BF_SKIP; });
    sheet.innerHTML = "<h3>" + d.short + "（" + d.md + "）早饭吃什么？</h3>" + '<p class="sheet-sub">可以点好几样：点一下选上，再点一下取消。</p>';
    var g = el("div", "pick-grid");
    var save = btn("sheet-cta", "", function () {
      if (!sel.length) { toast("先点一样，或者点「随便」"); return; }
      setBreakfastList(id, sel.slice());
    });
    function refresh() { save.textContent = sel.length ? "就这些：" + sel.join("、") : "先点一样"; save.disabled = !sel.length; }
    menuFor("breakfast").forEach(function (dd) {
      var on = sel.indexOf(dd.name) !== -1;
      if (dd.stock === "out") {
        var oc = pickCard(dd.name, "吃完了，等妈妈再买", function () { toast(dd.name + "吃完了，先选别的"); });
        oc.classList.add("out"); oc.setAttribute("aria-disabled", "true"); g.appendChild(oc);
        var oi = sel.indexOf(dd.name); if (oi !== -1) sel.splice(oi, 1);
        return;
      }
      var c = pickCard(dd.name, on ? "✓ 选了" : null, function () {
        var i = sel.indexOf(dd.name), now = i === -1;
        if (now) sel.push(dd.name); else sel.splice(i, 1);
        c.classList.toggle("picked", now); c.setAttribute("aria-pressed", String(now));
        var f = c.querySelector(".pk-from");
        if (now && !f) c.querySelector(".pk-name").appendChild(el("span", "pk-from", "✓ 选了"));
        if (!now && f) f.remove();
        refresh();
      });
      c.classList.toggle("picked", on); c.setAttribute("aria-pressed", String(on));
      g.appendChild(c);
    });
    sheet.appendChild(g);
    refresh();
    sheet.appendChild(save);
    var sp = el("div", "bf-special");
    [D.BF_ANY, D.BF_SKIP].forEach(function (n) {
      sp.appendChild(btn(cur[0] === n ? "on" : "", n === D.BF_ANY ? "🤲 随便" : "🙅 今天不吃", function () { setBreakfast(id, n); }));
    });
    sheet.appendChild(sp);
    sheet.appendChild(el("h4", null, "上面没有？"));
    sheet.appendChild(btn("plan-empty bf-new-btn", "🌅 想吃新的早饭（家里还没有的）", function () { openNewBfWish(function () { openBreakfast(id, sel); }); }));
    sheet.appendChild(closeBtn("先不定，返回"));
    openSheet();
  }
  // ---------- 想吃新的早饭（家里还没有的）：不定哪天，进「大家最近想吃」，妈妈准备好了再进菜谱 ----------
  function addBfWish(name) {
    name = trim(name);
    var d = dish(name);
    if (d && (d.meal === "breakfast" || d.meal === "both") && !d.stock) { toast("「" + name + "」家里有，直接点就行"); return false; }
    if (wishes().some(function (w) { return w.person === ui.me && w.dish === name; })) { toast("「" + name + "」你已经说过想吃了"); return false; }
    var ops = [{ id: "wish:" + Date.now() + "-" + rnd(), data: { person: ui.me, dish: name, level: 2, meal: "breakfast", t: Date.now() } }];
    if (!d) ops.push({ id: "dish:" + name, data: { name: name, meal: "breakfast", cat: guessCat(name), ings: [], steps: [], order: newOrder(), stock: "wish" } });
    S.putMany(ops);
    log("想吃新的早饭：" + name);
    toast("告诉妈妈了：想吃「" + name + "」。家里有了会通知你");
    return true;
  }
  function openNewBfWish(backTo) {
    sheet.innerHTML = "<h3>想吃什么新的早饭？</h3>" + '<p class="sheet-sub">家里还没有的。不定哪天，妈妈买到或做好了会通知你。</p>';
    var row = el("div", "name-row");
    var input = el("input", "add-input"); input.type = "text"; input.placeholder = "比如：生煎包"; input.setAttribute("aria-label", "想吃的新早饭"); input.id = "bf-wish-input";
    row.appendChild(input); row.appendChild(voiceButton(input, "说话说想吃的早饭"));
    sheet.appendChild(row);
    sheet.appendChild(btn("sheet-cta", "告诉妈妈我想吃", function () {
      var name = trim(input.value);
      if (!name) { toast("先写想吃什么"); input.focus(); return; }
      if (routeIfSentence(name)) return;
      if (addBfWish(name)) closeSheet();
    }));
    sheet.appendChild(btn("sheet-close", "返回", backTo || closeSheet));
    openSheet();
  }
  // 点「大家最近想吃」里的早饭：妈妈可以加进买菜清单，或者标「家里有了」
  function openBfWish(name) {
    var ws = wishes().filter(function (w) { return w.dish === name && w.meal === "breakfast"; });
    var who = ws.map(function (w) { return pname(w.person); }).join("、");
    sheet.innerHTML = "<h3>" + esc(name) + "</h3>" + '<p class="sheet-sub">' + esc(who || "有人") + "想吃的早饭，家里还没有。</p>";
    if (isMom()) {
      sheet.appendChild(btn("sheet-close", "🛒 加到买菜清单", function () { addCustom(name, ""); closeSheet(); }));
      sheet.appendChild(btn("sheet-cta", "✓ 家里有了，可以点了", function () {
        var d = dish(name) || { name: name, meal: "breakfast", cat: guessCat(name), ings: [], steps: [], order: newOrder() };
        var nd = Object.assign({}, d, { meal: d.meal === "dinner" ? "both" : d.meal }); delete nd.stock;
        var ops = [{ id: "dish:" + name, data: nd }];
        ws.forEach(function (w) { ops.push({ id: w.id, deleted: true }); });
        S.putMany(ops);
        log(name + "家里有了，可以点早饭了", undefined, ws.map(function (w) { return w.person; }));
        closeSheet(); toast("好了，" + (who || "大家") + "会收到通知");
      }));
    } else {
      sheet.appendChild(el("div", "assist-hint", "妈妈买到或做好了，会通知想吃的人。"));
    }
    sheet.appendChild(btn("sheet-close", "看做法", function () { openRecipe(name); }));
    sheet.appendChild(closeBtn("返回"));
    openSheet();
  }
  // 妈妈：吃完了 / 又有了
  function setStock(name, out) {
    var d = dish(name); if (!d) return;
    var nd = Object.assign({}, d); if (out) nd.stock = "out"; else delete nd.stock;
    S.put("dish:" + name, nd);
    if (out) {
      var hit = {}; bfDays().forEach(function (id) { D.PEOPLE.forEach(function (p) { if (p.id !== ui.me && bfPicks(id, p.id).indexOf(name) !== -1) hit[p.id] = 1; }); });
      log(name + "吃完了，点了这样早饭的换一样", undefined, Object.keys(hit));
      toast(name + "：标成吃完了");
    } else { log(name + "又有了，可以点早饭了"); toast(name + "：又可以点了"); }
  }
  var THANKS = ["谢谢妈妈", "妈妈辛苦啦", "最爱妈妈做的"];
  function addWish(name, level, msg) {
    var dup = wishes().some(function (w) { return w.person === ui.me && w.dish === name; });
    if (dup) { toast("「" + name + "」你已经点过了"); return; }
    msg = msg || THANKS[0];
    S.put("wish:" + Date.now() + "-" + rnd(), { person: ui.me, dish: name, level: level, msg: msg, t: Date.now() });
    var c = craveOf(level);
    log("点了想吃：" + name + " · " + c.label + " · " + msg);
    toast("点好了！" + c.emoji + "「" + name + "」 " + msg + " ❤️");
  }
  // asking：刚加完新菜时问「你想吃吗」
  function openCravePicker(name, asking) {
    if (wishes().some(function (w) { return w.person === ui.me && w.dish === name; })) { toast("「" + name + "」你已经点过了"); closeSheet(); return; }
    var msg = THANKS[0];
    sheet.innerHTML = "<h3>" + (asking ? "「" + esc(name) + "」加好了，你想吃吗？" : "有多想吃「" + esc(name) + "」？") + "</h3>" + '<p class="sheet-sub">点一下就行，想吃的会排在菜谱最上面。</p>';
    D.CRAVES.forEach(function (c) {
      var b = el("button", "crave-btn lv" + c.level, '<span class="cb-emoji" aria-hidden="true">' + c.emoji + '</span><span class="cb-txt">' + c.label + "<small>" + c.desc + "</small></span>");
      b.type = "button"; b.setAttribute("aria-label", "想吃程度：" + c.label);
      b.addEventListener("click", function () { closeSheet(); addWish(name, c.level, msg); });
      sheet.appendChild(b);
    });
    sheet.appendChild(el("h4", null, "跟妈妈说一句"));
    var tr = el("div", "thanks-row");
    THANKS.forEach(function (t) {
      var b = btn("thanks-chip" + (t === msg ? " on" : ""), "💛 " + t, function () { msg = t; tr.querySelectorAll(".thanks-chip").forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); });
      tr.appendChild(b);
    });
    sheet.appendChild(tr);
    if (asking) sheet.appendChild(btn("sheet-close", "不用，先放进菜谱", closeSheet));
    else { sheet.appendChild(btn("sheet-close", "← 返回再挑", openOrderSheet)); sheet.appendChild(closeBtn("不点了")); }
    openSheet();
  }
  function openOrderSheet() {
    sheet.innerHTML = "<h3>" + esc(pname(ui.me)) + "，晚饭想吃什么？</h3>" + '<p class="sheet-sub">说或写菜名，或者从下面挑一道，再选有多想吃。</p>';
    var mine = wishes().filter(function (w) { return w.person === ui.me; }).map(function (w) { return w.dish; });
    function want(name) { if (mine.indexOf(name) !== -1) { toast("已经点过了"); return; } openCravePicker(name); }
    var row = el("div", "name-row");
    var input = el("input", "add-input"); input.type = "text"; input.placeholder = "比如：冬瓜排骨汤"; input.setAttribute("aria-label", "想吃的菜名");
    var mic = el("button", "voice-btn", MIC_SVG); mic.type = "button"; mic.setAttribute("aria-label", "说话说菜名");
    mic.addEventListener("click", function () { startVoice(input, function () { if (routeIfSentence(input.value)) return; input.value = cleanDish(input.value); showFound(); }); });
    row.appendChild(input); row.appendChild(mic);
    sheet.appendChild(row);
    var found = el("div", "found-box"); sheet.appendChild(found);
    var rest = el("div"); sheet.appendChild(rest);
    function showFound() {
      var q = cleanDish(input.value);
      found.innerHTML = ""; rest.hidden = !!q;
      if (!q) return;
      var ms = findDishes(q, "dinner");
      if (ms.length) {
        found.appendChild(el("h4", null, "菜谱里有"));
        var g = el("div", "pick-grid");
        ms.slice(0, 6).forEach(function (n) { g.appendChild(pickCard(n, mine.indexOf(n) !== -1 ? "已经点过了" : null, function () { want(n); })); });
        found.appendChild(g);
      }
      if (!dish(q)) found.appendChild(btn("sheet-cta", isSentence(input.value) ? "听懂这句话，帮我办" : "想吃「" + q + "」（菜谱里没有，加进去）", function () {
        if (routeIfSentence(input.value)) return;
        confirmPanel("对吗？", "想吃这道：", q, "对，下一步选有多想吃", function () {
          if (!dish(q)) newDish(q, "dinner", guessCat(q), [], [], true);
          openCravePicker(q);
        }, openOrderSheet);
      }));
    }
    input.addEventListener("input", showFound);
    rest.appendChild(btn("rec-inline", "✨ 帮我想新菜", function () {
      openRecommend({ meal: "dinner", pickText: "想吃这道", onPick: function (r) { addRec(r); openCravePicker(r.name, true); }, back: openOrderSheet });
    }));
    rest.appendChild(el("h4", null, "从菜谱里挑"));
    rest.appendChild(dishGrid({ meal: "dinner", sub: function (d) { return mine.indexOf(d.name) !== -1 ? "已经点过了" : null; }, onPick: want }));
    sheet.appendChild(closeBtn("不点了，返回"));
    openSheet();
  }
  function showFamTab(which) {
    ui.famTab = which;
    $("family-main").hidden = which !== "order";
    $("family-today").hidden = which === "order";
    $("dtab-order").classList.toggle("on", which === "order");
    $("dtab-menu").classList.toggle("on", which !== "order");
    $("dtab-order").setAttribute("aria-selected", String(which === "order"));
    $("dtab-menu").setAttribute("aria-selected", String(which !== "order"));
  }
  $("dtab-order").addEventListener("click", function () { showFamTab("order"); });
  $("dtab-menu").addEventListener("click", function () { showFamTab("menu"); });
  $("fam-order-btn").addEventListener("click", openOrderSheet);

  // 本周菜单 = 妈妈做什么：默认今天，可以点别的日子；晚饭一起吃全显示，早饭只显示自己的（别人的折起来）
  function renderFamilyToday() {
    if (!ui.famDay || cookDays().indexOf(ui.famDay) === -1) ui.famDay = cookBaseIso();
    var id = ui.famDay, di = dayInfo(id);
    dayStrip($("fam-day-strip"), id, function (x) { ui.famDay = x; renderFamilyToday(); }, cookDays());
    var box = $("fam-today-menu"); box.innerHTML = "";
    var card = el("div", "tonight-card", '<div class="plan-meal">' + esc(di.md + " " + di.weekday + (di.rel ? "（" + di.rel + "）" : "")) + " · 晚饭 · " + totalPeople(id) + " 个人吃" + (guestCount(id) ? "（含客人 " + guestCount(id) + " 位）" : "") + "</div>");
    var dn = dinner(id);
    if (!dn.length) card.appendChild(el("div", null, '<div style="font-size:17px;color:#8a7967">妈妈还没定这天的晚饭。</div>'));
    dn.forEach(function (name) {
      var w = wishOf(name);
      var row = el("div", "dish-row", dishMedia(name) + '<div class="dish-info"><div class="dish-name">' + esc(name) + newTag(name) + '</div><div class="dish-from">' + (w ? esc(pname(w.person)) + "想吃的" : "妈妈定的") + "</div></div>");
      dishClickRow(row, name); card.appendChild(row);
    });
    if (!isHome(id, ui.me)) card.appendChild(el("div", "plan-serves", "你这天不在家吃。"));
    var bfs = bfList(id).filter(function (it) { return it.kind !== "skip"; });
    var mine = bfs.filter(function (it) { return it.person === ui.me; });
    var others = bfs.filter(function (it) { return it.person !== ui.me; });
    var head = el("div", "plan-meal"); head.style.marginTop = "16px"; head.textContent = "我的早饭";
    card.appendChild(head);
    function bfRow(it) {
      var name = it.kind === "any" ? "随便" : it.name;
      var row = el("div", "dish-row", (it.kind === "any" ? '<div class="dish-tile" aria-hidden="true">随</div>' : dishMedia(it.name)) +
        '<div class="dish-info"><div class="dish-name">' + esc(name) + newTag(name) + '</div><div class="dish-from">' + esc(pname(it.person)) + "的" + (it.kind === "fallback" ? " · 没点，默认" : "") + "</div></div>");
      if (it.kind !== "any") dishClickRow(row, it.name);
      return row;
    }
    if (!mine.length) card.appendChild(el("div", null, '<div style="font-size:17px;color:#8a7967">这天不吃早饭。</div>'));
    mine.forEach(function (it) { card.appendChild(bfRow(it)); });
    if (others.length) {
      card.appendChild(foldBtn(ui.othersBfOpen, "其他人的早饭（" + others.length + " 份）", "收起其他人的早饭", function () { ui.othersBfOpen = !ui.othersBfOpen; renderFamilyToday(); }));
      if (ui.othersBfOpen) others.forEach(function (it) { card.appendChild(bfRow(it)); });
    }
    box.appendChild(card);
  }

  // ---------- 客人（家里人加，平时折叠；妈妈屏有才显示） ----------
  function firstSaturday() { var ds = days(); for (var i = 0; i < ds.length; i++) if (fromIso(ds[i]).getDay() === 6) return ds[i]; return ds[1]; }
  function setGuestOpen(open) {
    ui.guestOpen = !!open;
    if (open && (!ui.guestDay || days().indexOf(ui.guestDay) === -1)) ui.guestDay = firstSaturday();
    $("guest-body").hidden = !open;
    var b = $("guest-fold-btn");
    setFold(b, open, "＋ 有客人来，点这里（平时不用管）", "收起");
    renderGuests();
  }
  function renderGuests() {
    var list = allGuests();
    var total = list.reduce(function (s, g) { return s + (g.count || 1); }, 0);
    var sum = $("guest-summary"); sum.hidden = !total; sum.textContent = total ? "🎉 这周客人 " + total + " 位" : "";
    var note = $("guest-collapsed-note");
    note.hidden = ui.guestOpen || !list.length;
    note.innerHTML = list.length ? "🎉 <b>已加：</b>" + list.map(function (g) { return esc(dayInfo(g.date).short + " " + g.label + " " + g.count + " 位"); }).join("；") : "";
    if (!ui.guestOpen) return;
    var dr = $("guest-day-row"); dr.innerHTML = "";
    days().forEach(function (id) {
      var d = dayInfo(id), gc = guestCount(id);
      var b = el("button", "g-day-btn" + (ui.guestDay === id ? " on" : ""), '<span class="t-top">' + d.short + '</span><span class="t-sub">' + (gc ? "已有 " + gc + " 位" : (d.rel || d.num + "日")) + "</span>");
      b.type = "button"; b.setAttribute("aria-label", "客人" + d.md + "来");
      b.addEventListener("click", function () { ui.guestDay = id; renderGuests(); });
      dr.appendChild(b);
    });
    var cr = $("guest-count-row"); cr.innerHTML = "";
    [1, 2, 3, 4, 5, 6].forEach(function (n) {
      cr.appendChild(btn("g-count-btn" + (ui.guestCount === n ? " on" : ""), n + " 位", function () { ui.guestCount = n; renderGuests(); }, n + "位客人"));
    });
    var lb = $("guest-list"); lb.innerHTML = "";
    if (!list.length) { lb.appendChild(el("div", "guest-none", "最近没有客人。")); return; }
    list.forEach(function (g) {
      var d = dayInfo(g.date);
      var row = el("div", "guest-item-row", '<span aria-hidden="true" style="font-size:24px">🎉</span><span class="gi-main">' + esc(g.label) + " · " + g.count + " 位<small>" + d.short + " " + d.md + (g.by ? " · " + esc(pname(g.by)) + "加的" : "") + "</small></span>");
      row.appendChild(btn("custom-del", "取消", function () {
        S.del(g.id); log("取消了" + dayName(g.date) + "的客人：" + g.label);
        toast("取消了：" + g.label);
      }, "取消客人" + g.label));
      lb.appendChild(row);
    });
  }
  $("guest-fold-btn").addEventListener("click", function () { setGuestOpen(!ui.guestOpen); });
  $("guest-add-btn").addEventListener("click", function () {
    var inp = $("guest-name"), label = trim(inp.value);
    if (!label) { toast("先写客人是谁"); inp.focus(); return; }
    var id = ui.guestDay || firstSaturday();
    S.put("guest:" + Date.now() + "-" + rnd(), { date: id, label: label, count: ui.guestCount, by: ui.me });
    log("加了客人：" + dayName(id) + " " + label + " " + ui.guestCount + "位");
    inp.value = "";
    toast("加上了！" + dayName(id) + "：" + label + " " + ui.guestCount + " 位");
  });

  // =====================================================================
  //  菜谱
  // =====================================================================
  function newDish(name, meal, cat, ings, steps, silent) {
    S.putMany([
      { id: "dish:" + name, data: { name: name, meal: meal, cat: cat, ings: ings || [], steps: steps || [], order: newOrder() } }
    ]);
    if (!silent) log("菜谱里加了新菜：" + name);
  }
  // 选菜用的单子：上面一排分类，下面按「有人想吃 > 最近常做 > 其他」排，新加的菜标「新」
  function cookCount(name) {
    var since = iso(addDays(new Date(), -60)), n = 0;
    S.list("dinner:").forEach(function (x) { var d = x.id.slice(7); if (d >= since && d <= todayIso() && x.data && (x.data.dishes || []).indexOf(name) !== -1) n++; });
    return n;
  }
  // 「新菜」：家里后来加的菜，一直标「新」，直到真吃过（妈妈点了「做好了」，或者定在某天、那天已经过去）
  var eatenMemo = { t: 0, set: null };
  function eatenSet() {
    if (eatenMemo.set && Date.now() - eatenMemo.t < 800) return eatenMemo.set;
    var out = {}, today = todayIso();
    S.list("dinner:").forEach(function (x) { if (x.id.slice(7) < today && x.data) (x.data.dishes || []).forEach(function (n) { out[n] = 1; }); });
    S.list("bf:").forEach(function (x) { var m = x.id.match(/^bf:(\d{4}-\d{2}-\d{2}):/); if (m && m[1] < today && x.data) (x.data.dishes || (x.data.dish ? [x.data.dish] : [])).forEach(function (n) { out[n] = 1; }); });
    S.list("done:").forEach(function (x) { var m = x.id.match(/^done:[^:]+:(?:dn|bf):(.+)$/); if (m) out[m[1]] = 1; });
    eatenMemo = { t: Date.now(), set: out };
    return out;
  }
  function isNewDish(d) { if (d && typeof d === "string") d = dish(d); return !!(d && d.order < 0 && !eatenSet()[d.name]); }
  function newTag(name) { return isNewDish(name) ? '<span class="new-tag">新</span>' : ""; }
  function dishGrid(opts) {
    var wrap = el("div", "dish-grid-wrap"), cat = "all";
    var list = menuFor(opts.meal).filter(function (d) { return !opts.skip || !opts.skip(d.name); });
    var cnt = {}; list.forEach(function (d) { cnt[d.name] = cookCount(d.name); });
    list.sort(function (a, b) { return wantLevel(b.name) - wantLevel(a.name) || cnt[b.name] - cnt[a.name] || (a.order || 0) - (b.order || 0); });
    var has = {}; list.forEach(function (d) { dishTags(d).forEach(function (t) { has[t] = (has[t] || 0) + 1; }); });
    var chips = el("div", "filter-row");
    var grid = el("div", "pick-grid");
    function draw() {
      chips.innerHTML = ""; grid.innerHTML = "";
      D.CATS.forEach(function (f) {
        if (f.id !== "all" && !has[f.id]) return;
        chips.appendChild(btn("filter-chip" + (cat === f.id ? " on" : ""), f.label, function () { cat = f.id; draw(); }));
      });
      list.forEach(function (d) {
        if (cat !== "all" && dishTags(d).indexOf(cat) === -1) return;
        var sub = (opts.sub && opts.sub(d)) || (wantLevel(d.name) ? "有人想吃" : cnt[d.name] ? "最近做过 " + cnt[d.name] + " 次" : isNewDish(d) ? "🆕 新菜，还没吃过" : d.prep || null);
        grid.appendChild(pickCard(d.name, sub, function () { opts.onPick(d.name); }));
      });
      if (!grid.children.length) grid.appendChild(el("p", "sheet-sub", "这一类还没有菜。"));
    }
    draw();
    wrap.appendChild(chips); wrap.appendChild(grid);
    return wrap;
  }
  // 按菜名找菜谱里的菜：一样 > 包含 > 字差不多（「红烧」找到红烧带鱼，「带鱼」也找得到）
  function findDishes(q, meal) {
    q = trim(q); if (!q) return [];
    var out = [];
    menuFor(meal).forEach(function (d) {
      var n = d.name, sc = 0;
      if (n === q) sc = 100;
      else if (n.indexOf(q) !== -1) sc = 60 + q.length;
      else if (q.indexOf(n) !== -1) sc = 50 + n.length;
      else if (q.length >= 2) {
        var c = 0; for (var i = 0; i < q.length; i++) if (n.indexOf(q.charAt(i)) !== -1) c++;
        if (c >= 2 && c >= Math.ceil(q.length * 0.6)) sc = c;
      }
      if (sc) out.push({ n: n, sc: sc });
    });
    return out.sort(function (a, b) { return b.sc - a.sc; }).map(function (x) { return x.n; });
  }
  // 新加的菜先定上，配料和做法让 AI 在后台补上
  function fillRecipeLater(name, meal) {
    ai("recipe", { name: name, meal: meal }).then(function (r) {
      var d = dish(name);
      if (!d || (d.ings && d.ings.length)) return;
      S.put("dish:" + name, Object.assign({}, d, { cat: r.cat || d.cat, ings: r.ings || [], steps: r.steps || [], prep: r.prep || "" }));
    }).catch(function () {});
  }
  function renderMenu() {
    var tabs = $("menu-tabs"); tabs.innerHTML = "";
    [["breakfast", "🌅 早饭菜谱"], ["dinner", "🍲 晚饭菜谱"]].forEach(function (m) {
      var n = allDishes().filter(function (d) { return d.meal === m[0] || d.meal === "both"; }).length;
      var b = el("button", ui.menuTab === m[0] ? "on" : "", esc(m[1]) + "<small>" + n + " 道</small>"); b.type = "button"; b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(ui.menuTab === m[0]));
      b.addEventListener("click", function () { ui.menuTab = m[0]; renderMenu(); });
      tabs.appendChild(b);
    });
    var meal = ui.menuTab;
    var fbox = $("menu-filter"); fbox.innerHTML = "";
    // 只显示这一页有菜的分类
    var mealDishes = menuFor(meal), has = {};
    mealDishes.forEach(function (d) { dishTags(d).forEach(function (t) { has[t] = (has[t] || 0) + 1; }); });
    if (ui.filter !== "all" && !has[ui.filter]) ui.filter = "all";
    D.CATS.forEach(function (f) {
      if (f.id !== "all" && !has[f.id]) return;
      fbox.appendChild(btn("filter-chip" + (ui.filter === f.id ? " on" : ""), f.label, function () { ui.filter = f.id; renderMenu(); }));
    });
    var box = $("menu-list"); box.innerHTML = "";
    var list = mealDishes.filter(function (d) { return ui.filter === "all" || dishTags(d).indexOf(ui.filter) !== -1; });
    if (ui.filter === "fish" && meal === "dinner") { var h = el("h2", "sec-title"); h.style.marginTop = "6px"; h.textContent = "鱼的做法都在这"; box.appendChild(h); }
    if (!list.length) box.appendChild(el("div", "wish-none", "这一类还没有菜"));
    list.forEach(function (d, idx) {
      var ws = wishes().filter(function (w) { return w.dish === d.name; });
      var who = ws.map(function (w) { return pname(w.person) + craveOf(w.level).emoji; }).join(" ");
      var row = el("div", "menu-row" + (ws.length ? " wanted" : ""), dishMedia(d.name) + '<div class="mn-name">' + esc(d.name) + newTag(d.name) +
        (who ? '<span class="want-tag">想吃：' + esc(who) + "</span>" : "") +
        "<small>" + esc(ingsFor(d.name).slice(0, 3).map(function (x) { return x.split(/\s+/)[0]; }).join("、")) + "</small></div>");
      dishClickRow(row, d.name);
      var acts = el("div", "row-acts");
      if (isMom()) {
        if (meal === "dinner") acts.appendChild(btn("mini-btn want-btn", "定哪天", function () { openDinnerDays(d.name); }, "把" + d.name + "定进哪几天的晚饭"));
      } else {
        if (meal === "dinner") acts.appendChild(btn("mini-btn want-btn", "我想吃", function () { openCravePicker(d.name); }, "我想吃" + d.name));
        else if (d.stock !== "out") acts.appendChild(btn("mini-btn want-btn", "当早饭", function () { openBfDayChoice(d.name); }, "选哪天早饭吃" + d.name));
      }
      if (meal === "breakfast" && d.stock === "out") { row.classList.add("out"); row.querySelector(".mn-name").appendChild(el("span", "out-tag", "吃完了，等再买")); }
      if (meal === "breakfast" && isMom()) acts.appendChild(d.stock === "out"
        ? btn("mini-btn stock-btn back", "又有了", function () { setStock(d.name, false); }, d.name + "又有了")
        : btn("mini-btn stock-btn", "吃完了", function () { setStock(d.name, true); }, d.name + "吃完了"));
      acts.appendChild(btn("mini-btn", "看做法", function () { openRecipe(d.name); }));
      acts.appendChild(btn("ord-btn", "↑", function () { moveDish(list, idx, -1); }, "上移" + d.name));
      acts.appendChild(btn("ord-btn", "↓", function () { moveDish(list, idx, 1); }, "下移" + d.name));
      acts.appendChild(btn("mini-btn danger", "删掉", function () {
        var m = S.get("meta:seeded");
        var ops = [{ id: "dish:" + d.name, deleted: true }];
        if (m) ops.push({ id: "meta:seeded", data: Object.assign({}, m, { deleted: (m.deleted || []).concat([d.name]) }) });
        S.putMany(ops); log("菜谱里删掉了：" + d.name); toast("删掉了：" + d.name);
      }, "删掉" + d.name));
      row.appendChild(acts);
      box.appendChild(row);
    });
  }
  // 一道菜定进好几天的晚饭：点一天定上，再点一下拿掉
  function dinnerDaysRow(name, onChange) {
    var g = el("div", "g-day-row");
    days().forEach(function (id) {
      var d = dayInfo(id), on = dinner(id).indexOf(name) !== -1;
      var b = el("button", "g-day-btn" + (on ? " on" : ""), '<span class="t-top">' + (d.rel || d.short) + '</span><span class="t-sub">' + (on ? "✓ 定上了" : d.num + "日 · " + (dinner(id).length ? dinner(id).length + " 道" : "还没定")) + "</span>");
      b.type = "button"; b.setAttribute("aria-pressed", String(on));
      b.setAttribute("aria-label", d.md + (on ? "已定" + name + "，点一下拿掉" : "点一下把" + name + "定进这天晚饭"));
      b.addEventListener("click", function () {
        var cur = dinner(id).slice(), i = cur.indexOf(name);
        if (i === -1) { cur.push(name); log("定了" + dayName(id) + "晚饭：" + name); toast(dayName(id) + "晚饭定了：" + name); }
        else { cur.splice(i, 1); log("拿掉了" + dayName(id) + "晚饭：" + name); toast("拿掉了：" + dayName(id) + " " + name); }
        setDinner(id, cur);
        setTimeout(onChange, 30);
      });
      g.appendChild(b);
    });
    return g;
  }
  function openDinnerDays(name, title) {
    sheet.innerHTML = "<h3>" + esc(title || "「" + name + "」定进哪几天？") + '</h3><p class="sheet-sub">点一天就定上，可以点好几天；再点一下拿掉。</p>';
    sheet.appendChild(dinnerDaysRow(name, function () { openDinnerDays(name, title); }));
    sheet.appendChild(btn("sheet-cta", "好了", closeSheet));
    openSheet();
  }
  function moveDish(list, idx, dir) {
    var j = idx + dir; if (j < 0 || j >= list.length) return;
    var arr = list.slice(); var t = arr[idx]; arr[idx] = arr[j]; arr[j] = t;
    // 只把这一段重新编号：保留它们原来占的 order 值，按新顺序分给它们
    var orders = list.map(function (d) { return d.order || 0; }).sort(function (a, b) { return a - b; });
    for (var k = 1; k < orders.length; k++) if (orders[k] <= orders[k - 1]) orders[k] = orders[k - 1] + 0.001;
    S.putMany(arr.map(function (d, k) { return { id: "dish:" + d.name, data: Object.assign({}, d, { order: orders[k] }) }; }));
  }
  function openBfDayChoice(name) {
    sheet.innerHTML = "<h3>哪天早饭吃「" + esc(name) + "」？</h3>" + '<p class="sheet-sub">点一天就定。</p>';
    var g = el("div", "g-day-row");
    days().forEach(function (id) {
      var d = dayInfo(id), home = isHome(id, ui.me);
      var b = el("button", "g-day-btn", '<span class="t-top">' + d.short + '</span><span class="t-sub">' + (home ? (bfPick(id, ui.me) || "还没点") : "不在家") + "</span>");
      b.type = "button"; b.disabled = !home;
      b.addEventListener("click", function () { addBreakfast(id, name); });
      g.appendChild(b);
    });
    sheet.appendChild(g);
    sheet.appendChild(closeBtn("返回"));
    openSheet();
  }
  function openRecipe(name) {
    var d = dish(name);
    sheet.innerHTML = '<div class="ing-head">' + dishMedia(name) + '<div><div class="ih-name">' + esc(name) + "</div>" +
      (dishTags(d).length ? '<div style="font-size:15px;color:#5d4f3f">' + esc(dishTags(d).map(catLabel).join(" · ")) + "</div>" : "") + "</div></div>";
    var ul = el("ul", "ing-list");
    ingsFor(name).forEach(function (x) { ul.appendChild(el("li", null, esc(x))); });
    sheet.appendChild(ul);
    sheet.appendChild(el("h4", null, "怎么做"));
    var ol = el("ol"); ol.style.cssText = "margin:0;padding-left:22px;font-size:17px;line-height:1.75;color:#2b2118";
    stepsFor(name).forEach(function (s) { ol.appendChild(el("li", null, esc(s))); });
    sheet.appendChild(ol);
    if (d && d.prep) { var p = el("p", null, "⏰ 提醒：" + esc(d.prep)); p.style.cssText = "font-size:16px;color:#8a5a00;font-weight:700;margin:12px 0 0"; sheet.appendChild(p); }
    if (isMom()) {
      if (isDinnerDish(name)) {
        sheet.appendChild(el("h4", null, "定进哪几天的晚饭（可以点好几天）"));
        var keep = sheet.scrollTop;
        sheet.appendChild(dinnerDaysRow(name, function () { openRecipe(name); }));
      }
    } else {
      if (isDinnerDish(name)) sheet.appendChild(btn("sheet-cta", "🍽 我想吃这道", function () { openCravePicker(name); }));
      else if (!stockOf(name)) sheet.appendChild(btn("sheet-cta", "当早饭（选哪天）", function () { openBfDayChoice(name); }));
      else sheet.appendChild(el("div", "assist-hint", stockOf(name) === "out" ? "吃完了，等妈妈再买。" : "家里还没有，妈妈准备好了会通知想吃的人。"));
    }
    var row2 = el("div", "rec-acts rec-grid");
    row2.appendChild(btn("mini-btn", "✏️ 改配料做法", function () { openDishEditor(name); }));
    // 做法太简单：请 AI 重新写一份详细的
    row2.appendChild(btn("mini-btn", "✨ 做法写详细点", function (e) {
      var b = e && e.currentTarget; if (b) { b.disabled = true; b.textContent = "✨ 正在写…"; }
      var cur = dish(name) || { name: name, meal: "dinner" };
      ai("recipe", { name: name, meal: cur.meal === "breakfast" ? "breakfast" : "dinner", ings: cur.ings || [], steps: cur.steps || [] }).then(function (r) {
        if (!r.steps || !r.steps.length) throw new Error("empty");
        S.put("dish:" + name, Object.assign({}, cur, { ings: r.ings && r.ings.length ? r.ings : cur.ings, steps: r.steps, prep: r.prep || cur.prep || "" }));
        log("「" + name + "」的做法写详细了");
        toast("写好了：" + name);
        if (sheetIsOpen()) openRecipe(name);
      }).catch(function (err) {
        if (b) { b.disabled = false; b.textContent = "✨ 做法写详细点"; }
        toast(err && err.code === "no_key" ? "AI 还没开通" : "AI 现在连不上，等一下再试");
      });
    }));
    row2.appendChild(btn("mini-btn", "📷 换照片", function () { pickPhoto({ kind: "dish", id: name }); }));
    var ph = S.get("photo:" + name);
    if (ph && ph.src && ph.ai) row2.appendChild(btn("mini-btn", "🎨 换一张 AI 图", function () {
      S.del("photo:" + name); photoQueue.unshift(name); setTimeout(nextAiPhoto, 300); toast("在画新的，过一会儿就换上"); closeSheet();
    }));
    else if (ph && ph.src) row2.appendChild(btn("mini-btn", "用回默认图", function () { S.del("photo:" + name); openRecipe(name); }));
    sheet.appendChild(row2);
    sheet.appendChild(closeBtn("知道了，返回"));
    openSheet();
  }
  // AI 写配料和做法：填进两个输入框（没有 AI 时，推荐池里有的就用推荐池的）
  function aiFill(name, meal, ings, steps, button) {
    name = trim(name);
    if (!name) { toast("先写菜名"); return; }
    var old = button.textContent; button.disabled = true; button.textContent = "✨ 正在写…";
    function fill(r) {
      ings.value = (r.ings || []).join("\n"); steps.value = (r.steps || []).join("\n");
      button.disabled = false; button.textContent = old;
      toast("写好了，看看对不对，可以改");
    }
    ai("recipe", { name: name, meal: meal, ings: splitLines(ings.value), steps: String(steps.value).split(/\n+/).map(trim).filter(Boolean) }).then(fill).catch(function (e) {
      var rec = D.RECOMMENDS.filter(function (r) { return r.name === name; })[0];
      if (rec) { fill(rec); return; }
      button.disabled = false; button.textContent = old;
      toast(e && e.code === "no_key" ? "AI 还没开通，先自己写，或者空着也行" : "AI 现在连不上，先自己写，或者空着也行");
    });
  }
  function splitLines(s) { return String(s || "").split(/[\n、，,；;]+/).map(trim).filter(Boolean); }
  function openDishEditor(name) {
    var d = dish(name) || { name: name, meal: "dinner", cat: guessCat(name) };
    sheet.innerHTML = "<h3>改「" + esc(name) + "」</h3>" + '<p class="sheet-sub">一行一样。</p>';
    sheet.appendChild(el("label", "f", "配料和份量"));
    var ings = el("textarea", "add-input"); ings.value = (d.ings || []).join("\n"); ings.setAttribute("aria-label", "配料");
    sheet.appendChild(ings);
    sheet.appendChild(el("label", "f", "怎么做"));
    var steps = el("textarea", "add-input"); steps.value = (d.steps || []).join("\n"); steps.setAttribute("aria-label", "做法");
    sheet.appendChild(steps);
    var aiB = btn("ai-btn", "✨ 让 AI 重新写配料和做法", function () { aiFill(name, d.meal === "breakfast" ? "breakfast" : "dinner", ings, steps, aiB); });
    sheet.appendChild(aiB);
    sheet.appendChild(el("label", "f", "提前备（可以不写）"));
    var prep = el("input", "add-input"); prep.type = "text"; prep.value = d.prep || ""; prep.placeholder = "比如：鱼当天买新鲜的"; prep.setAttribute("aria-label", "提前备");
    sheet.appendChild(prep);
    sheet.appendChild(btn("sheet-cta", "存好", function () {
      var nd = Object.assign({}, d, { ings: splitLines(ings.value), steps: String(steps.value).split(/\n+/).map(trim).filter(Boolean), prep: trim(prep.value) });
      if (!nd.prep) delete nd.prep;
      S.put("dish:" + name, nd);
      toast("存好了：" + name);
      openRecipe(name);
    }));
    sheet.appendChild(btn("sheet-close", "不改了，返回", function () { openRecipe(name); }));
    openSheet();
  }
  $("menu-add-btn").addEventListener("click", function () { openAddDish(); });
  function openAddDish(prefill) {
    var st = prefill || { name: "", meal: "dinner", cat: null, ings: "", steps: "" };
    sheet.innerHTML = "<h3>加一道新菜</h3>" + '<p class="sheet-sub">打字或说话，确认了才进菜谱。</p>';
    var row = el("div", "name-row");
    var input = el("input", "add-input"); input.type = "text"; input.placeholder = "菜名，比如：冬瓜排骨汤"; input.value = st.name; input.setAttribute("aria-label", "新菜的名字");
    row.appendChild(input); row.appendChild(voiceButton(input, "说话说菜名"));
    sheet.appendChild(row);
    var tg = el("div", "meal-toggle");
    [["breakfast", "早饭"], ["dinner", "晚饭"]].forEach(function (m) {
      var b = btn(st.meal === m[0] ? "on" : "", m[1], function () { st.meal = m[0]; tg.querySelectorAll("button").forEach(function (x) { x.className = ""; }); b.className = "on"; });
      tg.appendChild(b);
    });
    sheet.appendChild(tg);
    sheet.appendChild(el("label", "f", "配料（一行一样，可以让 AI 写）"));
    var ings = el("textarea", "add-input"); ings.value = st.ings; ings.placeholder = "排骨 500克\n冬瓜 1 块\n姜"; ings.setAttribute("aria-label", "配料");
    sheet.appendChild(ings);
    sheet.appendChild(el("label", "f", "怎么做（可以不写）"));
    var steps = el("textarea", "add-input"); steps.value = st.steps; steps.setAttribute("aria-label", "做法");
    sheet.appendChild(steps);
    var aiB = btn("ai-btn", "✨ 让 AI 写配料和做法", function () { aiFill(input.value, st.meal, ings, steps, aiB); });
    sheet.insertBefore(aiB, sheet.querySelectorAll("label.f")[0]);
    sheet.appendChild(btn("sheet-cta", "下一步：确认", function () {
      var name = trim(input.value);
      if (!name) { toast("先写菜名"); input.focus(); return; }
      if (routeIfSentence(name)) return;
      if (dish(name)) { toast("菜谱里已经有「" + name + "」了"); return; }
      st.name = name; st.ings = ings.value; st.steps = steps.value;
      confirmPanel("对吗？", "加进" + (st.meal === "breakfast" ? "早饭" : "晚饭") + "菜谱：", name, "对，就这样", function () {
        newDish(name, st.meal, guessCat(name), splitLines(st.ings), String(st.steps).split(/\n+/).map(trim).filter(Boolean));
        ui.menuTab = st.meal === "breakfast" ? "breakfast" : "dinner";
        if (st.meal === "breakfast") { closeSheet(); toast("加好了：" + name + "，在早饭菜谱最上面"); }
        else if (isMom()) openDinnerDays(name, "「" + name + "」加好了，要定进哪天吗？");
        else openCravePicker(name, true);
      }, function () { openAddDish(st); });
    }));
    sheet.appendChild(closeBtn("不加了"));
    openSheet();
    setTimeout(function () { if (!st.name) input.focus(); }, 80);
  }
  // 帮我想新菜：先选口味（川菜、粤菜…），AI 一次想 4 道菜谱里没有的；AI 不通就用自带的推荐
  var REC_STYLES = ["随便", "家常菜", "川菜", "粤菜", "湘菜", "东北菜", "江浙菜", "清淡", "汤", "早饭"];
  var rec = { style: "随便", list: [], seen: {}, loading: false, ctx: {}, ticket: 0 };
  $("menu-rec-btn").addEventListener("click", function () { openRecommend({}); });
  function openRecommend(ctx) {
    rec.ctx = ctx || {};
    if (rec.ctx.meal && rec.style === "早饭") rec.style = "随便";
    rec.list = [];
    renderRecommend(); openSheet();
    fetchRec();
  }
  function recMeal() { return rec.style === "早饭" ? "breakfast" : "dinner"; }
  function fetchRec() {
    var t = ++rec.ticket, meal = recMeal();
    rec.loading = true; renderRecommend();
    var avoid = allDishes().map(function (d) { return d.name; }).concat(Object.keys(rec.seen));
    ai("suggest", { meal: meal, style: rec.style === "随便" || rec.style === "早饭" ? "" : rec.style, avoid: avoid.slice(-150) }).then(function (r) {
      var ds = (r.dishes || []).filter(function (x) { return x && x.name && !dish(x.name) && !rec.seen[x.name]; });
      if (!ds.length) throw new Error("empty");
      return ds;
    }).catch(function () {
      return D.RECOMMENDS.filter(function (r) { return !dish(r.name) && !rec.seen[r.name] && (meal === "breakfast" ? r.meal === "breakfast" : r.meal !== "breakfast"); }).slice(0, 4);
    }).then(function (ds) {
      if (t !== rec.ticket) return;
      ds.forEach(function (x) { x.meal = meal; rec.seen[x.name] = true; });
      rec.list = ds; rec.loading = false;
      if (sheetIsOpen() && sheet.querySelector(".rec-styles")) renderRecommend();
    });
  }
  function addRec(r) {
    if (dish(r.name)) return;
    S.put("dish:" + r.name, { name: r.name, meal: r.meal, cat: r.cat, ings: r.ings || [], steps: r.steps || [], prep: r.prep || "", order: newOrder() });
    log("菜谱里加了新菜：" + r.name);
    toast("加好了：" + r.name);
  }
  function pickRec(r) {
    if (rec.ctx.onPick) { rec.ctx.onPick(r); return; }
    addRec(r);
    rec.list = rec.list.filter(function (x) { return x !== r; });
    renderRecommend();
  }
  function renderRecommend() {
    sheet.innerHTML = "<h3>✨ 帮我想新菜</h3>" + '<p class="sheet-sub">想吃哪一类？点一下，换一批就再想 4 道。</p>';
    var row = el("div", "rec-styles");
    REC_STYLES.forEach(function (st) {
      if (st === "早饭" && rec.ctx.meal) return;
      row.appendChild(btn("style-chip" + (rec.style === st ? " on" : ""), st, function () { if (rec.style === st && !rec.loading) return; rec.style = st; fetchRec(); }));
    });
    sheet.appendChild(row);
    if (rec.loading) sheet.appendChild(el("div", "read-panel rec-loading", "✨ 正在想" + (rec.style === "随便" ? "" : rec.style) + "…"));
    else if (!rec.list.length) {
      sheet.appendChild(el("div", "read-panel", "这一类暂时想不出新的了，换一类试试。"));
    } else rec.list.forEach(function (r) {
      var card = el("div", "rec-card", '<div class="rec-head">' + dishMedia(r.name) + '<div class="rec-name">' + esc(r.name) + "<small>" + (r.meal === "breakfast" ? "早饭" : "晚饭") + "</small></div></div>" +
        '<div class="rec-blurb">' + esc(r.blurb || "") + '</div><div class="rec-ings">配料：' + esc((r.ings || []).join("、")) + "</div>");
      var acts = el("div", "rec-acts");
      acts.appendChild(btn("want-btn", rec.ctx.pickText || "要这道", function () { pickRec(r); }, "把" + r.name + "加进菜谱"));
      acts.appendChild(btn("mini-btn", "看做法", function () { renderRecDetail(r); }));
      acts.appendChild(btn("mini-btn", "不要", function () { rec.list = rec.list.filter(function (x) { return x !== r; }); renderRecommend(); }));
      card.appendChild(acts);
      sheet.appendChild(card);
    });
    if (!rec.loading) sheet.appendChild(btn("sheet-cta", "🔄 换一批", function () { fetchRec(); sheet.scrollTop = 0; }));
    sheet.appendChild(rec.ctx.back ? btn("sheet-close", "← 返回", rec.ctx.back) : closeBtn("返回"));
  }
  function renderRecDetail(r) {
    sheet.innerHTML = '<div class="ing-head">' + dishMedia(r.name) + '<div><div class="ih-name">' + esc(r.name) + '</div><div style="font-size:15px;color:#5d4f3f">' + esc(r.blurb || "") + "</div></div></div>";
    var ul = el("ul", "ing-list"); (r.ings || []).forEach(function (x) { ul.appendChild(el("li", null, esc(x))); }); sheet.appendChild(ul);
    sheet.appendChild(el("h4", null, "怎么做"));
    var ol = el("ol"); ol.style.cssText = "margin:0;padding-left:22px;font-size:17px;line-height:1.75;color:#2b2118";
    (r.steps || []).forEach(function (s) { ol.appendChild(el("li", null, esc(s))); }); sheet.appendChild(ol);
    sheet.appendChild(btn("sheet-cta", rec.ctx.pickText || "要这道，加进菜谱", function () { pickRec(r); }));
    sheet.appendChild(btn("sheet-close", "← 返回接着看", renderRecommend));
    sheet.scrollTop = 0;
  }

  // =====================================================================
  //  买菜
  // =====================================================================
  // 调料：家里一般都有，排在最后，默认不算「要买」
  var PANTRY = /^(盐|生抽|老抽|香醋|陈醋|白醋|醋|白糖|细砂糖|糖|冰糖|淀粉|玉米淀粉|红薯淀粉|食用油|花生油|猪油|油|香油|料酒|蚝油|郫县豆瓣酱|豆瓣酱|甜面酱|黄豆酱|豆豉|腐乳汁|老干妈.*|花椒|花椒粒|花椒粉|蒸鱼豉油|番茄酱|沙拉酱|果酱|芝麻|白芝麻|熟白芝麻|干辣椒|沙姜|八角|桂皮|香叶|草果|五香粉|孜然粒|孜然粉|白胡椒粉|胡椒粉|黑胡椒碎|黑胡椒粉|鸡精|味精)$/;
  // 水、冰块这些不用买，干脆不进清单
  var NOT_BUY = /^(清水|热水|冷水|开水|温水|凉水|水|冰块|冰水|水淀粉)$/;
  function splitIng(s) { var m = String(s).match(/^(\S+)\s+(.+)$/); return m ? { name: m[1], qty: m[2] } : { name: String(s), qty: "" }; }
  function collectBuy() {
    var order = [], map = {};
    function add(ing, src, date) {
      var x = splitIng(ing);
      if (NOT_BUY.test(x.name)) return;
      if (!map[x.name]) { map[x.name] = { name: x.name, qtys: [], srcs: [], first: date }; order.push(x.name); }
      var m = map[x.name];
      if (x.qty) m.qtys.push(x.qty);
      if (m.srcs.indexOf(src) === -1) m.srcs.push(src);
    }
    var ds = days();
    ds.forEach(function (id, i) {
      var dn = dayName(id);
      var seen = {};
      bfList(id).forEach(function (it) {
        if (it.kind === "skip" || it.kind === "any") return;
        if (it.kind === "fallback" && i > 1) return; // 默认的鸡蛋三明治只算今明两天
        if (seen[it.name]) return; seen[it.name] = true;
        ingsFor(it.name).forEach(function (ing) { add(ing, dn + "早饭·" + it.name, id); });
      });
      dinner(id).forEach(function (name) { ingsFor(name).forEach(function (ing) { add(ing, dn + "晚饭·" + name, id); }); });
    });
    return order.map(function (n) {
      var m = map[n];
      var uniq = m.qtys.filter(function (q, i) { return m.qtys.indexOf(q) === i; });
      var qty = uniq.length ? uniq.join(" + ") : "";
      if (m.srcs.length > 1) qty = (qty ? qty + " " : "") + "（用 " + m.srcs.length + " 次）";
      return { name: n, qty: qty || "适量", srcs: m.srcs, pantry: PANTRY.test(n) };
    }).sort(function (a, b) { return (a.pantry ? 1 : 0) - (b.pantry ? 1 : 0); });
  }
  function recentMark(key) {
    var b = S.get(key);
    if (!b || !b.date) return false;
    return fromIso(b.date) >= addDays(new Date(), -6);
  }
  function boughtRecently(name) { return recentMark("bought:" + name); }
  // 「不用买」：家里还有，这一周不用买（一周后自动失效）
  function noNeed(name) { return recentMark("noneed:" + name); }
  function weeeLink(name) {
    return '<a class="weee-link" href="https://www.sayweee.com/zh/search?keyword=' + encodeURIComponent(name) + '" target="_blank" rel="noopener" aria-label="去 Weee 买' + esc(name) + '"><span class="weee-ico" aria-hidden="true">🛒</span>去 Weee 买<span class="weee-go" aria-hidden="true">›</span></a>';
  }
  function buyRow(name, qty, src, bought, onToggle, extra, skipped) {
    var row = el("div", "buy-row" + (bought ? " bought" : "") + (skipped ? " skipped" : ""),
      '<span class="b-info"><span class="b-name">' + esc(name) + ' <span class="b-qty">' + esc(qty) + "</span></span>" +
      '<span class="b-src">' + esc(src) + "</span>" + weeeLink(name) + "</span>" +
      '<span class="b-side"><span class="b-state">' + (skipped ? "不用买" : bought ? "✓ 买好了" : "还没买") + "</span></span>");
    row.setAttribute("role", "button"); row.tabIndex = 0;
    row.setAttribute("aria-label", name + (bought ? "，已买，点一下改回还没买" : "，还没买，点一下标成买好了"));
    function go(e) { if (e.target.closest && (e.target.closest("a") || e.target.closest("button"))) return; onToggle(); }
    row.addEventListener("click", go);
    row.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(e); } });
    if (extra) row.querySelector(".b-side").appendChild(extra);
    return row;
  }
  function customItems() { return S.list("custom:").map(function (x) { return Object.assign({ id: x.id }, x.data); }).sort(function (a, b) { return (a.t || 0) - (b.t || 0); }); }
  function staples() { var s = S.get("staples"); return (s && s.list) || (seeded() ? [] : ["牛奶", "面包", "鸡蛋"]); }
  function addCustom(name, qty) {
    name = trim(name);
    if (!name) { toast("先写要买什么"); return false; }
    if (customItems().some(function (it) { return it.name === name && !it.bought; })) { toast("「" + name + "」已经在清单里了"); return false; }
    S.put("custom:" + Date.now() + "-" + rnd(), { name: name, qty: trim(qty) || "1 份", bought: false, by: ui.me, t: Date.now() });
    log("买菜清单加了：" + name);
    toast("加好了：" + name);
    return true;
  }
  function unboughtCount() {
    return collectBuy().filter(function (it) { return !it.pantry && !boughtRecently(it.name) && !noNeed(it.name); }).length +
      customItems().filter(function (it) { return !it.bought; }).length;
  }
  function renderBuy() {
    var items = collectBuy(), custom = customItems();
    var planned = days().filter(function (id) { return dinner(id).length; }).length;
    var left = unboughtCount();
    $("buy-sum").innerHTML = "这一周晚饭定了 <b>" + planned + " 天</b>，还有 <b>" + left + " 样</b>没买。";
    var badge = $("buy-badge"); badge.hidden = left === 0; badge.textContent = left;
    // 自己加的
    var sbox = $("staple-row"); sbox.innerHTML = "";
    var st = staples();
    if (!st.length) sbox.appendChild(el("span", "wish-none", "常买是空的。"));
    st.forEach(function (s) {
      var chip = el("span", "staple-chip");
      var lab = el("span", null, "＋ " + esc(s)); lab.setAttribute("role", "button"); lab.tabIndex = 0;
      lab.addEventListener("click", function () { addCustom(s, ""); });
      chip.appendChild(lab);
      chip.appendChild(btn("sx", "×", function (e) { e.stopPropagation(); S.put("staples", { list: staples().filter(function (o) { return o !== s; }) }); toast("常买里拿掉了：" + s); }, "把" + s + "从常买里拿掉"));
      sbox.appendChild(chip);
    });
    var cl = $("custom-list"); cl.innerHTML = "";
    custom.forEach(function (it) {
      var del = btn("custom-del", "删掉", function (e) { e.stopPropagation(); S.del(it.id); toast("删掉了：" + it.name); }, "删掉" + it.name);
      cl.appendChild(buyRow(it.name, it.qty, "自己加的" + (it.by ? " · " + pname(it.by) : ""), it.bought, function () {
        S.put(it.id, Object.assign({}, it, { id: undefined, bought: !it.bought }));
      }, del));
    });
    // 做菜要买的
    var box = $("buy-list"); box.innerHTML = "";
    var need = items.filter(function (it) { return !it.pantry && !noNeed(it.name); });
    var togB = $("buy-toggle");
    setFold(togB, ui.buyOpen, items.length ? "一共 " + items.length + " 样，还有 " + need.filter(function (it) { return !boughtRecently(it.name); }).length + " 样没买" : "还没定菜", "收起");
    box.hidden = !ui.buyOpen;
    if (!items.length) box.appendChild(el("div", "wish-none", "还没定菜，定了就会出现在这里。"));
    // 顺序：要买的 → 调料 → 不用买的
    var order = items.filter(function (it) { return !it.pantry && !noNeed(it.name); })
      .concat(items.filter(function (it) { return it.pantry && !noNeed(it.name); }))
      .concat(items.filter(function (it) { return noNeed(it.name); }));
    var head = null;
    order.forEach(function (it) {
      var skipped = noNeed(it.name);
      var h = skipped ? "不用买的（点「要买」改回来）：" : it.pantry ? "调料（家里有就点「不用买」）：" : null;
      if (h && h !== head) { head = h; box.appendChild(el("div", "day-note", h)).style.margin = "14px 0 8px"; }
      var b = boughtRecently(it.name);
      var skipBtn = btn("nn-btn" + (skipped ? " on" : ""), skipped ? "要买" : "不用买", function (e) {
        e.stopPropagation();
        if (skipped) { S.del("noneed:" + it.name); toast("「" + it.name + "」又要买了"); }
        else { S.put("noneed:" + it.name, { date: todayIso() }); toast("「" + it.name + "」不用买"); }
      }, (skipped ? "要买" : "不用买") + it.name);
      var row = buyRow(it.name, it.qty, "用在：" + it.srcs.join("、"), b && !skipped, function () {
        if (skipped) return;
        if (b) S.del("bought:" + it.name); else S.put("bought:" + it.name, { date: todayIso() });
      }, skipBtn, skipped);
      if (it.pantry) row.classList.add("pantry");
      box.appendChild(row);
    });
    // 这一周每天
    var wk = $("week-list"); wk.innerHTML = "";
    days().forEach(function (id) {
      var d = dayInfo(id);
      var bf = bfList(id).filter(function (it) { return it.kind !== "skip"; }).map(function (it) { return it.name; });
      bf = bf.filter(function (n, i) { return bf.indexOf(n) === i; });
      var dn = dinner(id);
      var link = function (n) { return n === D.BF_ANY ? "随便" : '<span class="dish-link-txt" data-dish="' + esc(n) + '">' + esc(n) + "</span>" + newTag(n); };
      wk.appendChild(el("div", "week-row",
        "<b>" + d.short + " " + d.num + "日</b>" + (d.rel ? "（" + d.rel + "）" : "") + " · " + totalPeople(id) + " 人<br>" +
        '<span class="w-meal">早饭：' + (bf.length ? bf.map(link).join("、") : "不用做") + "</span><br>" +
        (dn.length ? '<span class="w-meal">晚饭：' + dn.map(link).join("、") + "</span>" : '<span class="w-none">晚饭还没定</span>') +
        (guestCount(id) ? '<br><span class="w-meal">🎉 客人：' + esc(guestText(id)) + "</span>" : "")));
    });
  }
  $("week-list").addEventListener("click", function (e) { var t = e.target; if (t && t.classList && t.classList.contains("dish-link-txt")) openRecipe(t.getAttribute("data-dish")); });
  $("buy-toggle").addEventListener("click", function () { ui.buyOpen = !ui.buyOpen; renderBuy(); });
  $("custom-toggle").addEventListener("click", function () {
    ui.customOpen = !ui.customOpen;
    $("custom-body").hidden = !ui.customOpen;
    setFold($("custom-toggle"), ui.customOpen, "＋ 自己加东西", "收起");
  });
  setFold($("custom-toggle"), false, "＋ 自己加东西", "收起");
  $("custom-voice").innerHTML = MIC_SVG;
  $("custom-voice").addEventListener("click", function () { startVoice($("custom-name"), function () { if (routeIfSentence($("custom-name").value)) $("custom-name").value = ""; }); });
  $("custom-add-btn").addEventListener("click", function () {
    var n = $("custom-name"), q = $("custom-qty");
    if (routeIfSentence(n.value)) { n.value = ""; return; }
    if (addCustom(n.value, q.value)) { n.value = ""; q.value = ""; } else n.focus();
  });
  $("staple-add-btn").addEventListener("click", function () {
    var inp = $("staple-input"), name = trim(inp.value);
    if (!name) { toast("先写要加进常买的东西"); inp.focus(); return; }
    var st = staples(); if (st.indexOf(name) !== -1) { toast("已经在常买里了"); return; }
    S.put("staples", { list: st.concat([name]) }); inp.value = ""; toast("加进常买了：" + name);
  });

  // =====================================================================
  //  我的 + 反馈
  // =====================================================================
  function renderProfile() {
    var p = person(ui.me); if (!p) return;
    var card = $("profile-card"); card.innerHTML = "";
    var src = avatarSrc(p.id);
    card.appendChild(el("div", "profile-head", (src ? '<img class="big-avatar" src="' + esc(src) + '" alt="' + esc(p.name) + '的头像">' : '<div class="big-avatar ' + p.cls + '">' + esc(p.initial) + "</div>") +
      '<div class="profile-name">' + esc(p.name) + "<small>" + esc(p.sub) + "</small></div>"));
    card.appendChild(btn("sheet-cta", "📷 换头像", function () { pickPhoto({ kind: "avatar", id: p.id }); }));
    if (src) card.appendChild(btn("sheet-close", "用回默认头像", function () { S.del("avatar:" + p.id); toast("换回默认头像了"); }));
    var myW = wishes().filter(function (w) { return w.person === p.id; });
    var bfDone = bfDays().filter(function (id) { return isHome(id, p.id) && bfPick(id, p.id); });
    $("profile-stats").innerHTML =
      '<div class="log-item">最近想吃：' + (myW.length ? esc(myW.map(function (w) { return w.dish; }).join("、")) : "还没点") + "</div>" +
      '<div class="log-item">早饭定了：' + (bfDone.length ? bfDone.map(function (id) { var d = dayInfo(id); return (d.rel || d.short) + " " + esc(bfPick(id, p.id)); }).join("、") : "还没定") + "</div>" +
      '<div class="log-item">明天在家吃饭：' + (isHome(tomorrowIso(), p.id) ? "在家" : "不在家") + "</div>" +
      "";
    var who = $("profile-who"); who.innerHTML = "";
    D.PEOPLE.forEach(function (x) {
      var b = el("button", "me-btn" + (ui.me === x.id ? " on" : ""), avatarHTML(x) + '<span class="me-name">' + esc(x.name) + "<small>" + esc(x.sub) + "</small></span>");
      b.type = "button"; b.setAttribute("aria-label", "这部手机是" + x.name + "的");
      b.addEventListener("click", function () {
        if (x.id === ui.me) return;
        sheet.innerHTML = "<h3>这部手机换成" + esc(x.name) + "的？</h3>" + '<p class="sheet-sub">换了以后，打开就是' + esc(x.name) + "的那屏。</p>";
        sheet.appendChild(btn("sheet-cta", "对，换成" + x.name, function () { closeSheet(); setMe(x.id); toast("好了，这部手机是" + x.name + "的"); }));
        sheet.appendChild(closeBtn("不换"));
        openSheet();
      });
      who.appendChild(b);
    });
    renderShare();
    renderCredits();
    var st = S.status();
    $("app-foot").innerHTML = (st === "ok" ? "✓ 全家同步中" : st === "local" ? "只存在这部手机" : st === "badkey" ? "链接不对，同步不上" : "正在同步…") +
      (S.pendingCount() ? " · 还有 " + S.pendingCount() + " 条没传上去" : "");
  }
  function renderCredits() {
    var box = $("credits-sec"); if (!box) return;
    var P = window.MP_PHOTOS || {};
    var names = Object.keys(P);
    if (!names.length) { box.innerHTML = ""; return; }
    box.innerHTML = '<details class="credits"><summary>图片来源（' + names.length + ' 张）</summary>' +
      '<div class="credits-list">' + names.map(function (n) {
        var c = P[n];
        return '<div class="credit"><b>' + esc(n) + '</b>：' + esc(c.author || "佚名") + ' · <a href="' + esc(c.page) + '" target="_blank" rel="noopener">维基共享资源</a> · ' +
          (c.licenseUrl ? '<a href="' + esc(c.licenseUrl) + '" target="_blank" rel="noopener">' + esc(c.license) + "</a>" : esc(c.license)) + (c.modified ? "（已裁剪）" : "") + "</div>";
      }).join("") + "</div></details>";
  }
  function linkFor(pid) {
    var u = new URL(location.href);
    u.search = ""; u.hash = "";
    u.searchParams.set("h", S.household()); u.searchParams.set("me", pid);
    return u.toString();
  }
  function renderShare() {
    var box = $("share-sec"); box.innerHTML = "";
    if (!S.household()) return;
    box.appendChild(el("h2", "sec-title", "发给家里人 <span class=\"hint\">每人一个链接</span>"));
    box.appendChild(el("div", "day-note", "用 iPhone 的 Safari 打开链接 → 点「分享」→「添加到主屏幕」。")).style.marginBottom = "10px";
    D.PEOPLE.forEach(function (p) {
      var link = linkFor(p.id);
      var row = el("div", "share-row", avatarHTML(p) + '<span class="sr-name">' + esc(p.name) + "的链接</span>");
      row.appendChild(btn("mini-btn", navigator.share ? "发给" + p.name : "复制", function () {
        if (navigator.share) { navigator.share({ title: "爱心厨房", text: p.name + "，用这个打开我们家的爱心厨房：", url: link }).catch(function () {}); return; }
        copyText(link).then(function () { toast("复制好了，发给" + p.name); }, function () { window.prompt("复制这个链接", link); });
      }));
      box.appendChild(row);
    });
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return Promise.reject();
  }
  // 反馈：「我的」页底部和每屏最底部都有，同一份列表
  function buildFeedbackSlots() {
    document.querySelectorAll("[data-fb-slot]").forEach(function (slot) {
      slot.innerHTML = '<h2 class="sec-title">说说想法 <span class="hint">说话或打字</span></h2>';
      var box = el("div", "fb-box");
      var row = el("div", "name-row");
      var input = el("input", "add-input"); input.type = "text"; input.placeholder = "想说什么"; input.setAttribute("aria-label", "反馈内容");
      row.appendChild(input); row.appendChild(voiceButton(input, "说话输入反馈", true));
      box.appendChild(row);
      box.appendChild(btn("sheet-cta", "提交反馈", function () {
        var t = trim(input.value);
        if (!t) { toast("先说一句或写一句"); input.focus(); return; }
        // 直接送到后台，不进同步库，家里人看不到
        S.call("mp_feedback_add", { who: ui.me, msg: t }).then(function () {
          input.value = ""; toast("收到了，谢谢！");
        }, function () { toast("没送出去，等一下再试"); });
      }));
      box.appendChild(el("div", "assist-hint", "写的话家里人看不到，直接送到后台。"));
      slot.appendChild(box);
    });
  }
  function renderFeedback() {}

  // =====================================================================
  //  妈妈的悬浮话筒：说一句 → 确认页 → 才排进这一周
  // =====================================================================
  var voiceItems = null;
  function dayWords() {
    var out = [];
    days14().forEach(function (id, i) {
      var d = dayInfo(id), w = WD[d.date.getDay()];
      var base = ["周" + w, "星期" + w, "礼拜" + w];
      if (w === "日") base.push("周天", "星期天", "礼拜天");
      // 「周四」不带前缀：指最近的那个（7 天以内）；「这周四」「下周四」「下下周四」按周一开始的礼拜算
      var words = i < 7 ? base.slice() : [];
      var pre = d.wk === 0 ? ["这", "这个", "本"] : d.wk === 1 ? ["下", "下个", "下一个"] : d.wk === 2 ? ["下下", "下下个"] : [];
      pre.forEach(function (p) { base.forEach(function (b) { words.push(p + b); }); });
      if (d.rel) words.push(d.rel);
      if (d.rel === "今天") words.push("今晚");
      if (d.rel === "明天") words.push("明晚");
      out.push({ words: words, id: id });
    });
    return out;
  }
  function vpResolve(raw) {
    var names = menuFor("dinner").map(function (d) { return d.name; }), best = null;
    names.forEach(function (n) { if (raw.indexOf(n) !== -1 && (!best || n.length > best.length)) best = n; });
    if (!best) names.forEach(function (n) { if (n.indexOf(raw) !== -1 && raw.length >= 2 && (!best || n.length < best.length)) best = n; });
    if (best) return { status: "ok", name: best };
    // 推荐菜池里有的：带上配料和做法一起加进菜谱
    for (var r = 0; r < D.RECOMMENDS.length; r++) {
      var rn = D.RECOMMENDS[r].name;
      if (raw.indexOf(rn) !== -1 || (raw.length >= 2 && rn.indexOf(raw) !== -1)) return { status: "new", name: rn };
    }
    if (raw.indexOf("鱼") !== -1) {
      var fish = allDishes().filter(function (d) { return d.cat === "fish" && d.meal !== "breakfast"; }).map(function (d) { return d.name; });
      if (fish.length) return { status: "choose", candidates: fish, why: "「鱼」有好几种做法，挑一种" };
    }
    var kws = ["鸡腿", "鸡翅", "鸡", "排骨", "豆腐", "虾", "蛋", "牛", "肉", "汤", "面"];
    for (var i = 0; i < kws.length; i++) {
      if (raw.indexOf(kws[i]) !== -1) {
        var k = kws[i], c = names.filter(function (n) { return n.indexOf(k) !== -1 || (k.length > 1 && n.indexOf(k.charAt(0)) !== -1); });
        if (c.length) return { status: "choose", candidates: c.slice(0, 6), why: "菜谱里这几道最接近，挑一道；都不对就按原话排" };
      }
    }
    return { status: "new", name: raw };
  }
  // 句子里提到的日子：长的先认（「下周四」不会再被当成「周四」）
  function dayMarks(text) {
    var marks = [];
    dayWords().forEach(function (dw) {
      dw.words.forEach(function (w) {
        var from = 0, idx;
        while ((idx = text.indexOf(w, from)) !== -1) { marks.push({ idx: idx, len: w.length, id: dw.id }); from = idx + w.length; }
      });
    });
    marks.sort(function (a, b) { return a.idx - b.idx || b.len - a.len; });
    var clean = [];
    marks.forEach(function (m) {
      var last = clean[clean.length - 1];
      if (last && m.idx < last.idx + last.len) return;
      // 「周四」前面紧挨着「下」「这」「本」「个」：是带前缀的说法里的一部分，不单独算
      if (/[下这本个]/.test(text.charAt(m.idx - 1)) && /^(周|星期|礼拜)/.test(text.substr(m.idx, 2))) return;
      clean.push(m);
    });
    return clean;
  }
  function vpParse(text) {
    var clean = dayMarks(text);
    var items = [];
    clean.forEach(function (m, i) {
      var end = i + 1 < clean.length ? clean[i + 1].idx : text.length;
      var seg = text.slice(m.idx + m.len, end)
        .replace(/^[：:，,、。\s]+/, "")
        .replace(/^(还是|那就|还要|还有|还|再|然后|另外|就)+/, "")
        .replace(/(晚饭|晚上|安排|我们|我想|想|吃|做|来个|来一个|弄个)/g, "")
        .replace(/^(的|个|一个|一道)/, "")
        .replace(/[：:，,、。．.！!\s和跟还有]+$/, "");
      seg = trim(seg);
      if (!seg) return;
      // 一天说了好几道：「周二做鱼和青菜汤」
      seg.split(/[和跟、，,]|还有|还要/).map(function (x) { return trim(x).replace(/^(再|就)/, ""); }).filter(Boolean).forEach(function (part) {
        var r = vpResolve(part);
        items.push({ dayId: m.id, raw: part, name: r.name || null, status: r.status, candidates: r.candidates || null, why: r.why || "" });
      });
    });
    return items;
  }
  // ---------- AI（Qwen Token Plan，经 Supabase 边缘函数 mp-ai） ----------
  function ai(task, payload) {
    if (!S.household() || !window.fetch) return Promise.reject(new Error("local"));
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 60000);
    return fetch(CFG.supabaseUrl + "/functions/v1/mp-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: CFG.supabaseKey },
      body: JSON.stringify(Object.assign({ h: S.household(), task: task }, payload)),
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      clearTimeout(timer);
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ("HTTP " + r.status)); e.code = j.error; throw e; }
        return j;
      });
    }, function (e) { clearTimeout(timer); throw e; });
  }

  // ---------- 语音助手：说一句话 → 听懂要办的事 → 确认 → 办 ----------
  // 是不是一句话（而不是一个菜名）：带哪天、带「吃 / 做 / 想 / 买 / 还是」这类字，或者是「菜谱里有的菜 + 别的字」
  var FILLER = /^[还是就那要想吃做来个弄的吧啊呀了也再我们给一道份点晚上饭早今明后天餐，,。 ]*$/;
  function knownDishIn(text) {
    var best = null;
    allDishes().forEach(function (d) { if (d.name.length >= 2 && text.indexOf(d.name) !== -1 && (!best || d.name.length > best.length)) best = d.name; });
    return best;
  }
  function isSentence(text) {
    text = trim(text); if (!text || dish(text)) return false;
    if (dayWords().some(function (x) { return x.words.some(function (w) { return text.indexOf(w) !== -1; }); })) return true;
    if (/周末|这周|这几天|每天|早上|晚上|中午|早饭|晚饭|早餐|晚餐/.test(text)) return true;
    if (/想吃|要吃|我想|我要|不在家|不回|回家吃|在家吃|还是|帮我|给我|要买|去买|不吃|安排|定一下|[，,。！？!?]/.test(text)) return true;
    if (/^(吃|做|买|来个|来一个|弄个|就吃|就做)/.test(text)) return true;
    var k = knownDishIn(text);
    if (k && k !== text && FILLER.test(text.replace(k, ""))) return true;
    return false;
  }
  // 是一句话就交给语音助手（听懂 → 给人看一眼 → 才办），返回 true；只是个菜名就返回 false，照原来的走
  function routeIfSentence(text) {
    text = trim(text);
    if (!isSentence(text)) return false;
    openSheet();
    runAssistant(text);
    return true;
  }
  // 把听到的菜名对上菜谱：「还是牛排骨」→「牛排骨」；对不上才当新菜
  function normalizeDish(raw) {
    raw = trim(raw); if (!raw || dish(raw)) return raw;
    var c = trim(raw.replace(/^(那就|还是|就|还|再|也|要|想|我们|我|今天|明天|后天|今晚|明晚|晚上|早上|晚饭|早饭)+/, "").replace(/^(吃|做|来个|来一个|来点|弄个)+/, "").replace(/(吧|啊|呀|哦|了|啦|呢)+$/, ""));
    if (c && dish(c)) return c;
    var k = knownDishIn(raw);
    if (k && FILLER.test(raw.replace(k, ""))) return k;
    return c || raw;
  }
  function matchDish(raw, meal) {
    raw = trim(raw); if (!raw) return raw;
    var list = menuFor(meal).map(function (d) { return d.name; }), best = null;
    list.forEach(function (n) { if (raw.indexOf(n) !== -1 && (!best || n.length > best.length)) best = n; });
    if (!best && raw.length >= 2) list.forEach(function (n) { if (n.indexOf(raw) !== -1 && (!best || n.length < best.length)) best = n; });
    return best || raw;
  }
  function cleanDish(x) {
    return trim(String(x || "").replace(/^(我|也|还|再|就|要|想|都|是)+/, "").replace(/^(吃|做|来个|来一个|来点|弄个|买)+/, "").replace(/(吧|啊|呀|哦|了|啦|呢)+$/, ""));
  }
  // 没有 AI 时：本地规则听懂常见说法
  function localIntent(text) {
    var out = [], dw = dayWords();
    String(text).split(/[，,。；;！!？?\n]+|然后|另外/).map(trim).filter(Boolean).forEach(function (seg) {
      var ds = [];
      dayMarks(seg).forEach(function (m) { if (ds.indexOf(m.id) === -1) ds.push(m.id); });
      if (/周末/.test(seg)) days().forEach(function (id) { var g = fromIso(id).getDay(); if ((g === 0 || g === 6) && ds.indexOf(id) === -1) ds.push(id); });
      if (/这几天|这周|这一周|每天/.test(seg) && !ds.length) ds = days().slice();
      var when = ds.length ? ds : [tomorrowIso()];
      if (/不在家|不回来|不回家|在外面吃|外面吃|出去吃/.test(seg)) { when.forEach(function (id) { out.push({ type: "home", date: id, on: false }); }); return; }
      if (/不吃早饭|不吃早餐/.test(seg)) {
        if (ds.length) ds.forEach(function (id) { out.push({ type: "breakfast", date: id, dish: D.BF_SKIP }); });
        else out.push({ type: "bf_switch", on: false });
        return;
      }
      if (/要吃早饭|吃早饭了|开始吃早饭/.test(seg) && !ds.length) { out.push({ type: "bf_switch", on: true }); return; }
      if (/早饭|早餐/.test(seg)) {
        var bd = cleanDish(seg.replace(/.*?(早饭|早餐)/, ""));
        if (bd) when.forEach(function (id) { out.push({ type: "breakfast", date: id, dish: matchDish(bd, "breakfast") }); });
        return;
      }
      var buy = seg.match(/(?:要买|去买|买)(.+)/);
      if (buy) { buy[1].split(/[和跟、]|还有/).map(cleanDish).filter(Boolean).forEach(function (n) { out.push({ type: "buy", dish: n, qty: "" }); }); return; }
      if (/在家|回家吃|回来吃/.test(seg)) { when.forEach(function (id) { out.push({ type: "home", date: id, on: true }); }); return; }
      if (isMom() && ds.length) {
        vpParse(seg).forEach(function (it) { out.push({ type: "dinner", date: it.dayId, dish: it.name || it.raw }); });
        return;
      }
      // 妈妈没说哪天、但说了菜谱里有的菜（「还是吃牛排骨」）：定进正在排的那天
      if (isMom() && !/想吃|馋/.test(seg)) {
        var kd = knownDishIn(seg);
        if (kd && isDinnerDish(kd)) { out.push({ type: "dinner", date: days().indexOf(ui.planDay) !== -1 ? ui.planDay : tomorrowIso(), dish: kd }); return; }
      }
      var lv = /超想|特别想|太想|馋死/.test(seg) ? 3 : /很想|好想/.test(seg) ? 2 : 2;
      var wd = cleanDish(seg.replace(/.*?(想吃|要吃|馋|想要|做个|做)/, "").replace(/(超|很|好|特别|太)$/, ""));
      if (wd && /想吃|要吃|馋|想要|做/.test(seg)) wd.split(/[和跟、]|还有/).map(cleanDish).filter(Boolean).forEach(function (n) { out.push({ type: "wish", dish: matchDish(n, "dinner"), level: lv }); });
    });
    return out;
  }
  function normAction(a) {
    if (!a || !a.type) return null;
    var needDate = { home: 1, dinner: 1, breakfast: 1 };
    if (needDate[a.type] && days14().indexOf(a.date) === -1) return null;
    var dish = trim(a.dish || "");
    if ((a.type === "wish" || a.type === "dinner" || a.type === "breakfast") && dish !== D.BF_SKIP && dish !== D.BF_ANY) dish = normalizeDish(dish);
    if ((a.type === "wish" || a.type === "dinner" || a.type === "breakfast" || a.type === "buy") && !dish) return null;
    if (a.type === "dinner" && !isMom()) return { type: "wish", dish: dish, level: 2 };
    return { type: a.type, date: a.date || "", dish: dish, on: a.on !== false, level: a.level || 2, qty: trim(a.qty || "") };
  }
  function actionText(a) {
    switch (a.type) {
      case "home": return "🏠 " + dayName(a.date) + (a.on ? "在家吃饭" : "不在家吃饭");
      case "wish": return craveOf(a.level).emoji + " 想吃「" + a.dish + "」";
      case "dinner": return "🍲 " + dayName(a.date) + "晚饭做「" + a.dish + "」";
      case "breakfast": return "🌅 " + dayName(a.date) + "早饭" + (a.dish === D.BF_SKIP ? "不吃" : "吃「" + a.dish + "」");
      case "buy": return "🛒 买菜清单加「" + a.dish + "」" + (a.qty ? " " + a.qty : "");
      case "bf_switch": return a.on ? "🌅 以后要吃早饭" : "🌅 以后不吃早饭";
    }
    return "";
  }
  var ASSIST_EX = {
    mom: ["周二做红烧肉，周三做鱼", "明天晚饭做番茄炒蛋和青菜汤", "要买牛奶和鸡蛋"],
    family: ["我明天不在家吃饭", "我超想吃小酥肉", "周三早饭吃馄饨", "这周末不在家"]
  };
  function openAssistant(prefill, note) {
    sheet.innerHTML = "<h3>🎤 语音助手</h3>" + '<p class="sheet-sub">说一句话，我帮你办。先给你看一眼，对了才算。' + (note ? " " + esc(note) : "") + "</p>";
    var input = el("textarea", "add-input assist-input"); input.rows = 2; input.value = prefill || "";
    input.placeholder = "比如：" + ASSIST_EX[isMom() ? "mom" : "family"][0];
    input.setAttribute("aria-label", "说话或打字");
    var mic = el("button", "vp-mic", MIC_SVG + "<span>点这里，说话</span>"); mic.type = "button";
    mic.addEventListener("click", function () { startVoice(input, function () { go(); }); });
    sheet.appendChild(mic);
    sheet.appendChild(input);
    sheet.appendChild(el("div", "assist-hint", canRecord() ? "点「说话」，说完再点一下下面的红条。" : "说话没反应？点上面的输入框，再点键盘上的 🎤 说就行。"));
    var ex = el("div", "thanks-row");
    ASSIST_EX[isMom() ? "mom" : "family"].forEach(function (t) { ex.appendChild(btn("thanks-chip", t, function () { input.value = t; })); });
    sheet.appendChild(el("h4", null, "可以这样说："));
    sheet.appendChild(ex);
    function go() {
      var text = trim(input.value);
      if (!text) { toast("先说一句，或者打字"); input.focus(); return; }
      runAssistant(text);
    }
    sheet.appendChild(btn("sheet-cta", "好了，帮我办", go));
    sheet.appendChild(closeBtn("不用了"));
    openSheet();
  }
  function runAssistant(text) {
    sheet.innerHTML = "<h3>🎤 正在听懂…</h3>" + '<p class="sheet-sub">「' + esc(text) + "」</p>";
    var done = false;
    function show(list, reply) { if (done) return; done = true; showAssistActions(list, reply, text); }
    ai("intent", {
      text: text,
      me: pname(ui.me) + (isMom() ? "（妈妈，做饭的人）" : ""),
      days: days14().map(function (id) { var d = dayInfo(id); return id + " " + (d.rel ? d.rel + " " : "") + (d.wk === 0 ? "这周" : d.wk === 1 ? "下周" : "下下周") + d.short.slice(1) + "（" + d.weekday + "）"; }),
      breakfast: menuFor("breakfast").map(function (d) { return d.name; }),
      dinner: menuFor("dinner").map(function (d) { return d.name; })
    }).then(function (r) {
      var list = (r.actions || []).map(normAction).filter(Boolean);
      if (!list.length) list = localIntent(text).map(normAction).filter(Boolean);
      show(list, r.reply || "");
    }).catch(function () { show(localIntent(text).map(normAction).filter(Boolean), ""); });
  }
  function showAssistActions(list, reply, text) {
    sheet.innerHTML = "<h3>" + (list.length ? "听懂的是这样，对吗？" : "没听懂，再说一次吧") + "</h3>" +
      '<p class="sheet-sub">「' + esc(text) + "」" + (reply ? "<br>" + esc(reply) : "") + "</p>";
    list.forEach(function (a, i) {
      var isDish = (a.type === "dinner" || a.type === "wish" || a.type === "breakfast") && a.dish !== D.BF_SKIP && a.dish !== D.BF_ANY;
      var known = isDish && dish(a.dish) && !stockOf(a.dish);
      var card = el("div", "vp-item", (isDish ? '<div class="vp-media">' + (known ? dishMedia(a.dish) : '<div class="dish-tile" aria-hidden="true">新</div>') + "</div>" : "") +
        '<div class="vp-dish" style="font-size:21px">' + esc(actionText(a)) +
        (isDish ? '<span class="vp-badge' + (known ? " ok" : "") + '">' + (known ? "菜谱里有的" : a.type === "breakfast" ? "家里还没有，会告诉妈妈" : "新菜，会加进菜谱") + "</span>" : "") + "</div>");
      var acts = el("div", "vp-acts");
      acts.appendChild(btn("mini-btn danger", "这条不要", function () { list.splice(i, 1); showAssistActions(list, reply, text); }));
      card.appendChild(acts);
      sheet.appendChild(card);
    });
    if (list.length) {
      var yes = btn("sheet-cta", "✓ 对，就这样", function () { applyActions(list); });
      yes.style.background = "#2e7d5b";
      sheet.appendChild(yes);
    }
    sheet.appendChild(btn("sheet-close", "不对，我重新说", function () { openAssistant(text); }));
    sheet.appendChild(closeBtn("先不办了"));
    sheet.scrollTop = 0;
  }
  function applyActions(list) {
    undoStart();
    var ops = [], dinners = {}, done = [], bfWishLater = [];
    list.forEach(function (a) {
      if (a.type === "home") { ops.push({ id: "home:" + a.date + ":" + ui.me, data: { v: a.on } }); log(dayName(a.date) + (a.on ? "在家吃饭" : "不在家吃饭")); }
      else if (a.type === "bf_switch") { ops.push({ id: "bfoff:" + ui.me, data: { v: !a.on } }); log(a.on ? "要吃早饭了" : "不吃早饭了"); }
      else if (a.type === "breakfast") {
        if (a.dish !== D.BF_SKIP && a.dish !== D.BF_ANY && (!dish(a.dish) || stockOf(a.dish))) { bfWishLater.push(a.dish); return; }
        var bl = (a.dish === D.BF_SKIP || a.dish === D.BF_ANY) ? [] : bfPicks(a.date, ui.me).filter(function (n) { return n !== D.BF_SKIP && n !== D.BF_ANY; });
        if (bl.indexOf(a.dish) === -1) bl.push(a.dish);
        ops.push({ id: "bf:" + a.date + ":" + ui.me, data: { dish: bl[0], dishes: bl } }); log("定了" + dayName(a.date) + "早饭：" + bl.join("、"));
      } else if (a.type === "dinner") {
        if (!dish(a.dish)) {
          var rec = D.RECOMMENDS.filter(function (r) { return r.name === a.dish; })[0];
          ops.push({ id: "dish:" + a.dish, data: rec ? { name: rec.name, meal: "dinner", cat: rec.cat, ings: rec.ings, steps: rec.steps, prep: rec.prep, order: newOrder() } : { name: a.dish, meal: "dinner", cat: guessCat(a.dish), ings: [], steps: [], order: newOrder() } });
        }
        if (!dinners[a.date]) dinners[a.date] = dinner(a.date).slice();
        if (dinners[a.date].indexOf(a.dish) === -1) dinners[a.date].push(a.dish);
        log("说话定了" + dayName(a.date) + "晚饭：" + a.dish);
      }
      done.push(actionText(a));
    });
    Object.keys(dinners).forEach(function (id) { ops.push({ id: "dinner:" + id, data: { dishes: dinners[id] } }); });
    if (ops.length) S.putMany(ops);
    list.forEach(function (a) {
      if (a.type === "wish") { if (!dish(a.dish)) newDish(a.dish, "dinner", guessCat(a.dish), [], [], true); addWish(a.dish, a.level, THANKS[0]); }
      if (a.type === "buy") addCustom(a.dish, a.qty);
    });
    bfWishLater.forEach(function (n) {
      if (stockOf(n) === "out") toast(n + "吃完了，先选别的"); else addBfWish(n);
    });
    closeSheet();
    undoOffer("办好了！" + done.join("；"));
  }
  $("voice-fab").addEventListener("click", function () { openAssistant(); });

  // =====================================================================
  //  导航 / 谁的手机 / 同步状态
  // =====================================================================
  var VIEWS = ["today", "family", "menu", "buy", "profile"];
  function showView(v) {
    if (v === "today" && !isMom()) v = "family";
    if (v === "family" && isMom()) v = "today";
    ui.view = v;
    VIEWS.forEach(function (k) { $("view-" + k).hidden = k !== v; });
    $("nav-today").classList.toggle("on", v === "today" || v === "family");
    $("nav-menu").classList.toggle("on", v === "menu");
    $("nav-buy").classList.toggle("on", v === "buy");
    $("nav-profile").classList.toggle("on", v === "profile");
    closeSheet();
    var sc = $("view-" + v).querySelector(".screen-scroll"); if (sc) sc.scrollTop = 0;
  }
  $("nav-today").addEventListener("click", function () { showView("today"); });
  $("nav-menu").addEventListener("click", function () { showView("menu"); });
  $("nav-buy").addEventListener("click", function () { showView("buy"); });
  $("nav-profile").addEventListener("click", function () { showView("profile"); });

  function keepUrl() {
    // 网址里留着家庭密钥和「是谁」，这样「添加到主屏幕」以后图标打开也是对的
    var h = S.household(); if (!h) return;
    var u = new URL(location.href);
    u.searchParams.set("h", h);
    if (ui.me) u.searchParams.set("me", ui.me);
    try { history.replaceState(null, "", u.pathname + "?" + u.searchParams.toString()); } catch (e) {}
  }
  // =====================================================================
  //  通知（Web Push）：妈妈——有人点菜、改在不在家、定早饭；家里人——妈妈定了晚饭、晚上提醒点早饭
  //  iPhone 要先「加到主屏幕」，从主屏幕打开，才能打开通知
  // =====================================================================
  var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isStandalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  var notify = { state: "checking", sub: null };
  function pushSupported() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
  function notifyFn(task, payload) {
    if (!S.household()) return Promise.reject(new Error("local"));
    return fetch(CFG.supabaseUrl + "/functions/v1/mp-notify", {
      method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.supabaseKey },
      body: JSON.stringify(Object.assign({ h: S.household(), task: task }, payload || {}))
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); });
  }
  function swReg() {
    if (!swReg.p) swReg.p = navigator.serviceWorker.register("sw.js").then(function () { return navigator.serviceWorker.ready; });
    return swReg.p;
  }
  function b64urlToBytes(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
    var raw = atob(s), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  // 现在是什么情况：unsupported / need-home（iPhone 还没加到主屏幕）/ denied / on / off
  function checkNotify() {
    if (!pushSupported()) { notify.state = isIOS && !isStandalone ? "need-home" : "unsupported"; renderNotify(); return Promise.resolve(); }
    if (Notification.permission === "denied") { notify.state = "denied"; renderNotify(); return Promise.resolve(); }
    return swReg().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      notify.sub = sub;
      notify.state = sub && Notification.permission === "granted" ? "on" : "off";
      // 已经打开的：每次打开 App 再报一次（换了人、地址变了都能对上）
      if (notify.state === "on" && ui.me) S.call("mp_push_sub", { who: ui.me, sub: sub.toJSON(), enable: true }).catch(function () {});
      renderNotify();
    }).catch(function () { notify.state = "unsupported"; renderNotify(); });
  }
  function enableNotify() {
    if (notify.state === "need-home") { showHomeScreenHelp(); return; }
    if (!pushSupported()) { toast("这部手机打不开通知"); return; }
    // iPhone 要求：点了按钮马上问，中间不能先做别的
    var perm = Notification.requestPermission();
    Promise.resolve(perm).then(function (p) {
      if (p !== "granted") { notify.state = p === "denied" ? "denied" : "off"; renderNotify(); throw new Error("no-permission"); }
      return Promise.all([swReg(), notifyFn("key")]);
    }).then(function (r) {
      var reg = r[0], key = r[1].key;
      return reg.pushManager.getSubscription().then(function (old) {
        return old || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(key) });
      });
    }).then(function (sub) {
      notify.sub = sub;
      return S.call("mp_push_sub", { who: ui.me, sub: sub.toJSON(), enable: true });
    }).then(function () {
      notify.state = "on"; renderNotify();
      toast("通知打开了！马上发一条试试");
      notifyFn("test", { who: ui.me }).catch(function () {});
    }).catch(function (e) {
      if (e && e.message === "no-permission") { toast(notify.state === "denied" ? "通知被关掉了，要到手机「设置」里打开" : "没打开通知"); return; }
      toast("通知没打开成功，等一下再试");
    });
  }
  function disableNotify() {
    var sub = notify.sub;
    if (!sub) { notify.state = "off"; renderNotify(); return; }
    S.call("mp_push_sub", { who: ui.me, sub: sub.toJSON(), enable: false }).catch(function () {});
    sub.unsubscribe().catch(function () {}).then(function () { notify.sub = null; notify.state = "off"; renderNotify(); toast("通知关掉了"); });
  }
  function showHomeScreenHelp() {
    sheet.innerHTML = "<h3>先把 App 加到主屏幕</h3>" + '<p class="sheet-sub">iPhone 要从主屏幕打开，才能收通知。</p>' +
      '<div class="read-panel" style="font-size:18px;line-height:1.8">① 用 Safari 打开这个 App<br>② 点下面中间的「分享」按钮（方块带向上箭头）<br>③ 往下找「添加到主屏幕」，点「添加」<br>④ 回到主屏幕，点「爱心厨房」打开<br>⑤ 到「我的」→「打开通知」</div>';
    sheet.appendChild(closeBtn("知道了"));
    openSheet();
  }
  function notifyWhat() {
    return isMom() ? "家里人点了想吃的、改了在不在家、定了早饭，马上告诉你" : "妈妈定了晚饭马上告诉你；晚上 9 点半提醒你点明天早饭";
  }
  function renderNotify() {
    var box = $("notify-sec");
    if (box && ui.me) {
      box.innerHTML = '<h2 class="sec-title"><span class="sec-ic" aria-hidden="true">🔔</span>通知</h2>';
      var st = notify.state;
      box.appendChild(el("div", "assist-hint", esc(notifyWhat()) + "。"));
      if (st === "on") {
        box.appendChild(el("div", "home-sum", "🔔 通知已经打开了 ✓"));
        box.appendChild(btn("sheet-close", "发一条试试", function () { notifyFn("test", { who: ui.me }).then(function (r) { toast(r.sent ? "发了，看看手机上面" : "没发出去，关掉再打开一次"); }, function () { toast("没发出去，等一下再试"); }); }));
        box.appendChild(btn("sheet-close", "关掉通知", disableNotify));
      } else if (st === "need-home") {
        box.appendChild(btn("sheet-cta", "🔔 怎么打开通知", showHomeScreenHelp));
      } else if (st === "denied") {
        box.appendChild(el("div", "home-sum away", "通知被关掉了。到手机「设置」→「通知」→「爱心厨房」里打开。"));
      } else if (st === "unsupported") {
        box.appendChild(el("div", "home-sum away", "这部手机或浏览器收不了通知。"));
      } else if (st === "off") {
        box.appendChild(btn("sheet-cta", "🔔 打开通知", enableNotify));
      }
    }
    // 首页上面的提示条：还没打开、也没点过「以后再说」才显示
    var hide = LS.get("mp:notifyHide", 0);
    document.querySelectorAll(".notify-banner").forEach(function (b) {
      var show = ui.me && (notify.state === "off" || notify.state === "need-home") && !(hide && Date.now() - hide < 7 * 86400000);
      b.hidden = !show;
      if (!show) { b.innerHTML = ""; return; }
      b.innerHTML = '<div class="nb-txt"><b>🔔 打开通知</b><span>' + esc(notifyWhat()) + "</span></div>";
      var row = el("div", "nb-acts");
      row.appendChild(btn("nb-yes", notify.state === "need-home" ? "怎么打开" : "打开", enableNotify));
      row.appendChild(btn("nb-no", "以后再说", function () { LS.set("mp:notifyHide", Date.now()); renderNotify(); }));
      b.appendChild(row);
    });
  }

  function setMe(pid) {
    ui.me = pid; LS.set("mp:me", pid);
    S.setWho(pid);
    keepUrl();
    $("welcome").hidden = true;
    $("voice-fab").hidden = false;
    showView("today");
    renderAll();
    checkNotify();
  }
  function showWelcome() {
    var g = $("welcome-grid"); g.innerHTML = "";
    D.PEOPLE.forEach(function (p) {
      var b = el("button", "me-btn", avatarHTML(p) + '<span class="me-name">' + esc(p.name) + "<small>" + esc(p.sub) + "</small></span>");
      b.type = "button"; b.setAttribute("aria-label", "我是" + p.name);
      b.addEventListener("click", function () { setMe(p.id); });
      g.appendChild(b);
    });
    $("welcome").hidden = false;
  }
  function renderSyncBar(st) {
    var bar = $("sync-bar");
    var msg = st === "local" ? "还没连上全家同步：请用家里人发的链接打开。现在改的只存在这部手机。"
      : st === "badkey" ? "这个链接同步不上，请找 Vicky 要新链接。"
      : st === "offline" ? "没连上网，改的先存在手机里，有网会自动同步。" : "";
    bar.hidden = !msg; bar.textContent = msg;
    bar.classList.toggle("bad", st === "badkey");
    if (ui.view === "profile") renderProfile();
  }

  // ---------- 全部重画 ----------
  var renderQueued = false;
  function renderAll() {
    renderQueued = false;
    if (!ui.me) return;
    if (isMom()) { renderMomPlan(); renderCook(); }
    else renderFamily();
    renderMenu(); renderBuy(); renderHistory(); renderFeedback(); renderProfile();
  }
  function queueRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(renderAll); }

  // 第一次连上、库里还是空的：放进起步菜谱（只放一次）。
  function maybeSeed() {
    if (S.household() && S.status() !== "ok") return;
    var meta = S.get("meta:seeded");
    if (meta) {
      // 起步菜谱后来又加了菜（比如旧版里妈妈加的）：只补库里没有的，删过的也不再补回来
      if ((meta.v || 1) >= (D.SEED_VERSION || 1)) return;
      var have = {}; allDishes().forEach(function (d) { have[d.name] = true; });
      var gone = meta.deleted || [];
      var add = D.SEED_DISHES.filter(function (d) { return !have[d.name] && gone.indexOf(d.name) === -1; })
        .map(function (d, i) { return { id: "dish:" + d.name, data: Object.assign({ order: 1000 + i }, d) }; });
      add.push({ id: "meta:seeded", data: Object.assign({}, meta, { v: D.SEED_VERSION }) });
      S.putMany(add);
      return;
    }
    var ops = D.SEED_DISHES.map(function (d, i) { return { id: "dish:" + d.name, data: Object.assign({ order: i }, d) }; });
    ops.push({ id: "staples", data: { list: ["牛奶", "面包", "鸡蛋"] } });
    ops.push({ id: "meta:seeded", data: { v: D.SEED_VERSION || 1, t: Date.now() } });
    S.putMany(ops);
  }

  // ---------- 启动 ----------
  function boot() {
    var q = new URLSearchParams(location.search);
    var h = q.get("h");
    if (h && /^[0-9a-zA-Z_-]{24,}$/.test(h)) LS.set("mp:h", h); else h = LS.get("mp:h", null);
    var me = q.get("me");
    if (me && person(me)) LS.set("mp:me", me); else me = LS.get("mp:me", null);
    if (!person(me)) me = null;
    ui.me = me;

    buildFeedbackSlots();
    setGuestOpen(false);
    showMode(ui.mode === "cook" ? "cook" : "plan");
    S.onChange(queueRender);
    S.onStatus(function (st) { renderSyncBar(st); if (st === "ok") maybeSeed(); });
    var ready = S.init({ household: h, who: me || "" });
    keepUrl();
    if (!me) showWelcome();
    else { $("voice-fab").hidden = false; showView("today"); renderAll(); }
    ready.then(function () { maybeSeed(); if (S.status() === "ok" && isMom()) pruneLogs(); queueRender(); setTimeout(queueAiPhotos, 3000); });
    S.onChange(function () { setTimeout(queueAiPhotos, 2000); });
    loadWeather();
    if (me) checkNotify();
    // 到了晚上 7 点，「照着做」「本周菜单」从明天开始
    // 过了中午 12 点，家里人的「我的早饭」从明天开始
    var lastBase = cookBaseIso(), lastBf = bfDays()[0];
    setInterval(function () {
      var b = cookBaseIso(), f = bfDays()[0];
      if (b !== lastBase) { lastBase = b; ui.cookDay = b; ui.famDay = b; ui.planDay = b; queueRender(); }
      if (f !== lastBf) { lastBf = f; queueRender(); }
    }, 60000);
    // 手机放下再拿起来：隔了夜、或者离开超过 1 小时，选的日子回到默认（7 点前今天，7 点后明天）
    // 不然晚上看的「明天」第二天早上还停着，会被当成今天（以前这里还会跳到新的明天，更容易看错）
    var lastDay = todayIso(), hiddenAt = 0;
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      weatherTries = 0; loadWeather();
      if (todayIso() !== lastDay || (hiddenAt && Date.now() - hiddenAt > 3600000)) {
        lastDay = todayIso();
        var b = cookBaseIso(); ui.planDay = b; ui.cookDay = b; ui.famDay = b;
        queueRender();
      }
    });
  }
  boot();
})();
