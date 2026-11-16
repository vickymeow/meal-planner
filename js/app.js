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
      rel: diff === 0 ? "今天" : diff === 1 ? "明天" : diff === 2 ? "后天" : ""
    };
  }
  function days() { var out = [], t = new Date(); for (var i = 0; i < 7; i++) out.push(iso(addDays(t, i))); return out; }
  function eveLabel(id) { var d = dayInfo(id); return d.rel === "今天" ? "今晚" : d.rel === "明天" ? "明晚" : d.rel === "后天" ? "后天晚上" : d.short + "晚上"; }
  function dayName(id) { var d = dayInfo(id); return d.rel || d.short; }

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
    planDay: tomorrowIso(),
    famTab: "order",
    filter: "all",
    guestOpen: false,
    guestDay: null,
    guestCount: 2,
    customOpen: false
  };
  function isMom() { return ui.me === "mom"; }

  // ---------- 数据读取 ----------
  function seeded() { return !!S.get("meta:seeded"); }
  function allDishes() {
    var list = seeded() ? S.list("dish:").map(function (x) { return x.data; })
      : D.SEED_DISHES.map(function (d, i) { return Object.assign({ order: i }, d); });
    return list.filter(function (d) { return d && d.name; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function menuFor(meal) { return allDishes().filter(function (d) { return d.meal === meal || d.meal === "both"; }); }
  function dish(name) { var all = allDishes(); for (var i = 0; i < all.length; i++) if (all[i].name === name) return all[i]; return null; }
  function isDinnerDish(name) { var d = dish(name); return !d || d.meal !== "breakfast"; }
  function ingsFor(name) { var d = dish(name); return d && d.ings && d.ings.length ? d.ings : [name, "葱", "姜", "蒜"]; }
  function stepsFor(name) {
    var d = dish(name); if (d && d.steps && d.steps.length) return d.steps;
    return ["配料洗净切好，按家里人数准备。", "热锅下油，先炒主料，再放配菜和调味。", "尝一下咸淡，合适就出锅。"];
  }
  function guessCat(name) {
    if (/鱼/.test(name)) return "fish";
    if (/鸡|鸭|肉|排骨|牛|羊|虾|翅/.test(name)) return "meat";
    if (/蛋/.test(name)) return "egg";
    if (/豆腐/.test(name)) return "tofu";
    if (/面|饭|粥|饼|包|饺|馄饨|吐司|油条/.test(name)) return "staple";
    return "veg";
  }

  function isHome(date, pid) { var h = S.get("home:" + date + ":" + pid); return !(h && h.v === false); }
  function homePeople(date) { return D.PEOPLE.filter(function (p) { return isHome(date, p.id); }); }
  function guests(date) { return S.list("guest:").map(function (x) { return Object.assign({ id: x.id }, x.data); }).filter(function (g) { return g.date === date; }); }
  function allGuests() { var ds = days(); return S.list("guest:").map(function (x) { return Object.assign({ id: x.id }, x.data); }).filter(function (g) { return ds.indexOf(g.date) !== -1; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }); }
  function guestCount(date) { return guests(date).reduce(function (s, g) { return s + (g.count || 1); }, 0); }
  function guestText(date) { return guests(date).map(function (g) { return g.label + " " + g.count + "位"; }).join("、"); }
  function totalPeople(date) { return homePeople(date).length + guestCount(date); }
  function bfPick(date, pid) { var b = S.get("bf:" + date + ":" + pid); return b && b.dish; }
  // 某天的早饭：在家的人每人一份。没点的默认做鸡蛋三明治。
  function bfList(date) {
    return homePeople(date).map(function (p) {
      var pick = bfPick(date, p.id);
      if (!pick) return { person: p.id, name: D.BF_FALLBACK, kind: "fallback" };
      if (pick === D.BF_SKIP) return { person: p.id, name: pick, kind: "skip" };
      if (pick === D.BF_ANY) return { person: p.id, name: pick, kind: "any" };
      return { person: p.id, name: pick, kind: "pick" };
    });
  }
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
  function log(text, who) {
    var t = Date.now();
    S.put("log:" + t + "-" + rnd(), { t: t, who: who === undefined ? ui.me : who, text: text });
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
  function renderHistory() {
    var logs = S.list("log:").map(function (x) { return x.data; }).sort(function (a, b) { return (b.t || 0) - (a.t || 0); }).slice(0, 20);
    document.querySelectorAll(".history-box").forEach(function (box) {
      if (!logs.length) { box.innerHTML = '<div class="act-item"><span class="act-main">还没有动态。谁点了菜、定了饭，这里马上能看到。</span></div>'; return; }
      box.innerHTML = logs.map(function (l, i) {
        var p = person(l.who);
        var dot = p ? '<span class="act-dot act-' + p.id + '" aria-hidden="true">' + esc(p.initial) + "</span>" : '<span class="act-dot act-home" aria-hidden="true">🏠</span>';
        return '<div class="act-item">' + dot + '<span class="act-main">' + (p ? "<b>" + esc(p.name) + "</b>" : "") + esc(l.text) +
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

  // ---------- 照片 ----------
  var failedImg = {};
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function autoPhoto(name) {
    var prompt = name + "，中式家常菜，Chinese home cooking dish, appetizing food photo, served in a bowl or plate, top-down, warm natural light, no text";
    return "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?width=640&height=480&nologo=true&seed=" + hash(name);
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
    var d = dish(name), e = d && D.CAT_EMOJI[d.cat];
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
  function startVoice(input) {
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
      };
      rec.onerror = function () { toast("没听清，点键盘上的话筒也能说"); input.focus(); };
      rec.start();
    } catch (e) { toast("点输入框，再点键盘上的话筒说话"); input.focus(); }
  }
  function voiceButton(input, label) {
    var b = el("button", "voice-btn", MIC_SVG); b.type = "button";
    b.setAttribute("aria-label", label || "说话输入");
    b.addEventListener("click", function () { startVoice(input); });
    return b;
  }

  // ---------- 弹层 ----------
  var sheetWrap = $("sheet-wrap"), sheet = $("sheet");
  function sheetIsOpen() { return sheetWrap.classList.contains("open"); }
  function openSheet() { sheetWrap.classList.add("open"); sheet.scrollTop = 0; }
  function closeSheet() { sheetWrap.classList.remove("open"); sheet.innerHTML = ""; }
  sheetWrap.addEventListener("click", function (e) { if (e.target === sheetWrap) closeSheet(); });
  function closeBtn(text) { return btn("sheet-close", text || "回去", closeSheet); }
  function pickCard(name, sub, onPick) {
    var b = el("button", "pick-card", dishMedia(name) + '<span class="pk-name">' + esc(name) + (sub ? '<span class="pk-from">' + esc(sub) + "</span>" : "") + "</span>");
    b.type = "button"; b.addEventListener("click", onPick);
    return b;
  }
  function confirmPanel(title, sub, big, yesText, onYes, onNo) {
    sheet.innerHTML = "<h3>" + esc(title) + '</h3><p class="sheet-sub">' + esc(sub) + "</p>" +
      '<div class="read-panel" style="font-size:24px;font-weight:800;text-align:center">' + esc(big) + "</div>";
    sheet.appendChild(btn("sheet-cta", yesText, onYes));
    sheet.appendChild(btn("sheet-close", "不对，回去改", onNo));
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
  function loadWeather() {
    var c = CFG.weather || {};
    if (c.latitude == null || c.longitude == null) return;
    var w = LS.get("mp:weather", null);
    if (w && w.day === todayIso()) return;
    fetch("https://api.open-meteo.com/v1/forecast?latitude=" + c.latitude + "&longitude=" + c.longitude +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=8")
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.daily) { LS.set("mp:weather", { day: todayIso(), daily: j.daily }); renderAll(); } })
      .catch(function () {});
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
  function renderDayStrip() {
    var ds = days();
    if (ds.indexOf(ui.planDay) === -1) ui.planDay = ds[1];
    var box = $("day-strip"); box.innerHTML = "";
    ds.forEach(function (id) {
      var d = dayInfo(id), decided = dinner(id).length > 0;
      var b = el("button", "day-chip" + (ui.planDay === id ? " on" : ""),
        '<span class="dc-top">' + d.short + "</span>" +
        '<span class="dc-date">' + (d.rel ? d.rel + " · " : "") + d.num + "日</span>" +
        '<span class="dc-st' + (decided ? " ok" : "") + '">' + (decided ? "晚饭已定 ✓" : "晚饭未定") + "</span>");
      b.type = "button"; b.setAttribute("role", "tab");
      b.setAttribute("aria-label", d.md + d.weekday + (decided ? "，晚饭已定" : "，晚饭未定"));
      b.addEventListener("click", function () { ui.planDay = id; renderMomPlan(); });
      box.appendChild(b);
    });
    var cur = dayInfo(ui.planDay);
    $("plan-date").textContent = cur.md + " " + cur.weekday + (cur.rel ? "（" + cur.rel + "）" : "");
    $("plan-meta").innerHTML = dayMetaHTML(ui.planDay);
    $("dinner-hint").textContent = "定" + dayName(ui.planDay) + "的";
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
    var chip = el("span", "chip", esc(w.dish) + craveTag(w.level));
    dishClick(chip, w.dish);
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
    D.PEOPLE.forEach(function (p) {
      var mine = all.filter(function (w) { return w.person === p.id; });
      if (p.id === "mom" && !mine.length) return;
      var g = el("div", "wish-group", '<div class="wish-who">' + esc(p.name) + " <span>想吃妈妈做的</span></div>");
      if (!mine.length) g.appendChild(el("div", "wish-none", "最近还没点"));
      else { var chips = el("div", "chips"); mine.forEach(function (w) { chips.appendChild(wishChip(w, true)); }); g.appendChild(chips); }
      box.appendChild(g);
    });
  }
  function renderMomBreakfast() {
    var box = $("breakfast"); box.innerHTML = "";
    var card = el("div", "bf-card", '<div class="plan-meal">早饭 · 加热就行</div>');
    var list = bfList(ui.planDay);
    if (!list.length) card.appendChild(el("div", "bf-from", "这天没人在家吃早饭"));
    list.forEach(function (it) {
      if (it.kind === "skip") { card.appendChild(el("div", "bf-note", esc(pname(it.person)) + "这天不吃早饭")); return; }
      var name = it.kind === "any" ? "随便" : it.name;
      var row = el("div", "bf-row",
        (it.kind === "any" ? '<div class="dish-tile" aria-hidden="true">随</div>' : dishMedia(it.name)) +
        '<div class="dish-info"><div class="bf-name">' + esc(name) + (it.kind === "fallback" ? '<span class="fallback-tag">没点，默认</span>' : "") + "</div>" +
        '<div class="bf-from">' + esc(pname(it.person)) + (it.kind === "any" ? " · 妈妈看着做" : "的") + "</div></div>" +
        '<span class="heat-tag">加热就行</span>');
      if (it.kind !== "any") dishClickRow(row, it.name);
      // 妈妈只能改她自己的那份早饭；别人的只看
      if (it.person === ui.me) row.appendChild(btn("mini-btn", "换", function () { openBreakfast(ui.planDay); }, "换我自己的早饭"));
      card.appendChild(row);
    });
    var mine = bfList(ui.planDay).filter(function (it) { return it.person === ui.me && it.kind === "skip"; })[0];
    if (mine) card.appendChild(btn("mini-btn", "我这天想吃早饭了", function () { openBreakfast(ui.planDay); }));
    box.appendChild(card);
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
          '<div class="dish-info"><div class="dish-name">' + esc(name) + "</div>" +
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
    var ws = wishes().filter(function (w) { return have.indexOf(w.dish) === -1; });
    if (ws.length) {
      sheet.appendChild(el("h4", null, "从「最近想吃」里挑"));
      var g1 = el("div", "pick-grid");
      ws.forEach(function (w) { var c = craveOf(w.level); g1.appendChild(pickCard(w.dish, pname(w.person) + "想吃 · " + c.emoji + " " + c.label, function () { choose(w.dish); })); });
      sheet.appendChild(g1);
    }
    sheet.appendChild(el("h4", null, "从菜谱里挑"));
    var g2 = el("div", "pick-grid");
    menuFor("dinner").forEach(function (dd) {
      if (have.indexOf(dd.name) !== -1) return;
      g2.appendChild(pickCard(dd.name, dd.prep || null, function () { choose(dd.name); }));
    });
    sheet.appendChild(g2);
    sheet.appendChild(closeBtn("先不定，回去"));
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
    var id = todayIso(), d = dayInfo(id);
    $("cook-date").textContent = d.md + " " + d.weekday;
    $("cook-meta").innerHTML = dayMetaHTML(id);
    var box = $("morning"); box.innerHTML = "";
    var bfCard = el("div", "m-card", '<div class="plan-meal">早饭 · 热一下就行</div>');
    var bfs = bfList(id).filter(function (it) { return it.kind !== "skip"; });
    if (!bfs.length) bfCard.appendChild(el("div", "m-empty", "今天不用做早饭。"));
    bfs.forEach(function (it) {
      var key = "bf:" + it.person, done = !!S.get("done:" + id + ":" + key);
      var name = it.kind === "any" ? "随便" : it.name;
      var wrap = el("div", "m-dish" + (done ? " done" : ""),
        (it.kind === "any" ? '<div class="dish-tile hero" aria-hidden="true">随</div>' : dishMedia(it.name, "hero")) +
        '<div class="m-name">' + esc(name) + "</div>" +
        '<div class="m-serves">' + esc(pname(it.person)) + "的" + (it.kind === "fallback" ? " · 没点，默认做这个" : it.kind === "any" ? " · 妈妈看着做" : "") + "</div>");
      if (it.kind !== "any") dishClickRow(wrap, it.name);
      wrap.appendChild(btn("done-btn", done ? "✓ 热好了" : "热好了", function () { if (!done) finishDish(id, key, it.name); }));
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
    $("today-line").innerHTML = "今天在家：" + esc(homePeople(id).map(function (p) { return p.name; }).join("、") || "没人") +
      (away.length ? "<br>" + esc(away.join("、")) + "不在家" : "") +
      (guestCount(id) ? "<br>🎉 有客人：" + esc(guestText(id)) : "");
  }
  function todayScript() {
    var id = todayIso();
    var bf = bfList(id).filter(function (it) { return it.kind !== "skip"; }).map(function (it) { return pname(it.person) + "吃" + it.name; }).join("，");
    var dn = dinner(id);
    return "今天在家吃饭的有" + homePeople(id).map(function (p) { return p.name; }).join("、") + "，一共 " + totalPeople(id) + " 个人" +
      (guestCount(id) ? "，其中客人 " + guestCount(id) + " 位" : "") + "。\n早饭，加热就行：" + (bf || "不用做") + "。\n晚饭：" + (dn.length ? dn.join("、") : "还没定") + "。";
  }
  var reading = false;
  $("read-btn").addEventListener("click", function () {
    var b = $("read-btn"), panel = $("read-panel");
    if (reading) { try { speechSynthesis.cancel(); } catch (e) {} reading = false; b.textContent = "🔊 再读一遍"; return; }
    panel.hidden = false; panel.textContent = todayScript();
    if (!window.speechSynthesis) return;
    try {
      var u = new SpeechSynthesisUtterance(todayScript());
      u.lang = "zh-CN"; u.rate = 0.9;
      u.onend = function () { reading = false; b.textContent = "🔊 再读一遍"; };
      reading = true; b.textContent = "⏹ 停，别读了";
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { b.textContent = "🔊 再读一遍"; }
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
  $("tab-cook").addEventListener("click", function () { showMode("cook"); });

  function renderMomPlan() { renderDayStrip(); renderPeople(); renderWishes(); renderMomBreakfast(); renderMomDinner(); }

  // =====================================================================
  //  家里人屏（Vicky / 小陈 / 爸爸）
  // =====================================================================
  function renderFamily() {
    if (isMom()) return;
    var me = ui.me, t = dayInfo(todayIso());
    $("fam-when").textContent = pname(me) + "的这屏";
    $("fam-date").textContent = "今天 " + t.md + " " + t.weekday;
    // 1 · 早饭：逐天点
    var bf = $("fam-breakfast"); bf.innerHTML = "";
    days().forEach(function (id) {
      var d = dayInfo(id), home = isHome(id, me), pick = bfPick(id, me);
      var label = !home ? '<span class="s-dish away">这天不在家</span>'
        : pick ? '<span class="s-dish">' + esc(pick) + "</span>" : '<span class="s-dish none">还没点</span>';
      var row = el("div", "d-row", '<span class="s-day">' + d.short + "<small>" + (d.rel ? d.rel + " · " : "") + d.num + "日</small></span>" + label);
      if (home && pick && pick !== D.BF_ANY && pick !== D.BF_SKIP) dishClick(row.querySelector(".s-dish"), pick);
      if (home) row.appendChild(btn("mini-btn", pick ? "换一道" : "选早饭", function () { openBreakfast(id); }, "点" + d.short + "的早饭"));
      bf.appendChild(row);
    });
    // 2 · 想吃
    var wbox = $("fam-wishes"); wbox.innerHTML = "";
    var mine = wishes().filter(function (w) { return w.person === me; });
    var g = el("div", "wish-group", '<div class="wish-who">' + esc(pname(me)) + " <span>想吃妈妈做的</span></div>");
    if (!mine.length) g.appendChild(el("div", "wish-none", "还没点，点上面大按钮挑一道。"));
    else { var chips = el("div", "chips"); mine.forEach(function (w) { chips.appendChild(wishChip(w, true)); }); g.appendChild(chips); }
    wbox.appendChild(g);
    // 3 · 今晚 + 在家
    var box = $("fam-tonight"); box.innerHTML = "";
    var card = el("div", "tonight-card", '<div class="plan-meal">今晚妈妈做</div>');
    var tonight = dinner(todayIso());
    if (!tonight.length) card.appendChild(el("div", null, '<div style="font-size:18px;color:#8a7967">妈妈还没定今晚的。</div>'));
    tonight.forEach(function (name) {
      var row = el("div", "dish-row", dishMedia(name) + '<div class="dish-info"><div class="dish-name">' + esc(name) + "</div></div>");
      dishClickRow(row, name); card.appendChild(row);
    });
    var tm = tomorrowIso(), on = isHome(tm, me);
    var homeRow = el("div", null, '<div style="flex:1;font-size:18px;font-weight:800">我明天在家吃饭吗？</div>');
    homeRow.style.cssText = "display:flex;align-items:center;gap:12px;margin-top:12px;background:#fff;border-radius:14px;padding:10px 12px";
    homeRow.appendChild(btn("home-btn " + (on ? "on" : "off"), on ? "在家 ✓" : "不在家", function () { toggleHome(tm); },
      "明天" + (on ? "在家，点一下改成不在家" : "不在家，点一下改成在家")));
    card.appendChild(homeRow);
    var other = el("div", "home-days");
    days().forEach(function (id) {
      if (id === tm) return;
      var h = isHome(id, me), d = dayInfo(id);
      var b = el("button", "home-day" + (h ? "" : " off"), "<b>" + (d.rel || d.short) + "</b><span>" + (h ? "在家" : "不在家") + "</span>");
      b.type = "button"; b.setAttribute("aria-label", d.md + (h ? "在家，点一下改成不在家" : "不在家，点一下改成在家"));
      b.addEventListener("click", function () { toggleHome(id); });
      other.appendChild(b);
    });
    card.appendChild(other);
    box.appendChild(card);
    renderGuests();
    renderFamilyToday();
  }
  function toggleHome(id) {
    var now = !isHome(id, ui.me);
    S.put("home:" + id + ":" + ui.me, { v: now });
    log((now ? dayName(id) + "在家吃饭" : dayName(id) + "不在家吃饭"));
    toast(now ? "好了，妈妈知道你" + dayName(id) + "在家" : "好了，妈妈知道你" + dayName(id) + "不在家");
  }
  function setBreakfast(id, name) {
    S.put("bf:" + id + ":" + ui.me, { dish: name });
    log("定了" + dayName(id) + "早饭：" + name);
    closeSheet();
    toast(dayName(id) + "早饭：" + name);
  }
  function openBreakfast(id) {
    var d = dayInfo(id), cur = bfPick(id, ui.me);
    sheet.innerHTML = "<h3>" + d.short + "（" + d.md + "）早饭吃什么？</h3>" + '<p class="sheet-sub">只定这一天。</p>';
    var g = el("div", "pick-grid");
    menuFor("breakfast").forEach(function (dd) {
      g.appendChild(pickCard(dd.name, cur === dd.name ? "现在选的就是这个" : null, function () { setBreakfast(id, dd.name); }));
    });
    sheet.appendChild(g);
    var sp = el("div", "bf-special");
    [D.BF_ANY, D.BF_SKIP].forEach(function (n) {
      var b = btn(cur === n ? "on" : "", n === D.BF_ANY ? "🤲 随便" : "🙅 今天不吃", function () { setBreakfast(id, n); });
      sp.appendChild(b);
    });
    sheet.appendChild(sp);
    sheet.appendChild(el("h4", null, "上面没有？写下来"));
    var row = el("div", "name-row");
    var input = el("input", "add-input"); input.type = "text"; input.placeholder = "比如：三明治"; input.setAttribute("aria-label", "早饭名字");
    row.appendChild(input); row.appendChild(voiceButton(input, "说话说早饭名字"));
    sheet.appendChild(row);
    sheet.appendChild(btn("sheet-cta", "下一步：确认", function () {
      var name = trim(input.value);
      if (!name) { toast("先写早饭名字"); input.focus(); return; }
      confirmPanel("对吗？", d.short + "早饭就吃这个：", name, "对，就这样", function () {
        if (!dish(name)) S.put("dish:" + name, { name: name, meal: "breakfast", cat: guessCat(name), ings: [], steps: [], order: Date.now() / 1000 });
        setBreakfast(id, name);
      }, function () { openBreakfast(id); });
    }));
    sheet.appendChild(closeBtn("先不定，回去"));
    openSheet();
  }
  function addWish(name, level) {
    var dup = wishes().some(function (w) { return w.person === ui.me && w.dish === name; });
    if (dup) { toast("「" + name + "」你已经点过了"); return; }
    S.put("wish:" + Date.now() + "-" + rnd(), { person: ui.me, dish: name, level: level, t: Date.now() });
    var c = craveOf(level);
    log("点了想吃：" + name + " · " + c.label);
    toast("点好了！" + c.emoji + "「" + name + "」，妈妈能看到");
  }
  function openCravePicker(name) {
    if (wishes().some(function (w) { return w.person === ui.me && w.dish === name; })) { toast("「" + name + "」你已经点过了"); closeSheet(); return; }
    sheet.innerHTML = "<h3>有多想吃「" + esc(name) + "」？</h3>" + '<p class="sheet-sub">点一下就行。</p>';
    D.CRAVES.forEach(function (c) {
      var b = el("button", "crave-btn lv" + c.level, '<span class="cb-emoji" aria-hidden="true">' + c.emoji + '</span><span class="cb-txt">' + c.label + "<small>" + c.desc + "</small></span>");
      b.type = "button"; b.setAttribute("aria-label", "想吃程度：" + c.label);
      b.addEventListener("click", function () { closeSheet(); addWish(name, c.level); });
      sheet.appendChild(b);
    });
    sheet.appendChild(btn("sheet-close", "← 回去再挑", openOrderSheet));
    sheet.appendChild(closeBtn("不点了"));
    openSheet();
  }
  function openOrderSheet() {
    sheet.innerHTML = "<h3>" + esc(pname(ui.me)) + "，想吃什么？</h3>" + '<p class="sheet-sub">挑一道，再选有多想吃。</p>';
    var g = el("div", "pick-grid");
    var mine = wishes().filter(function (w) { return w.person === ui.me; }).map(function (w) { return w.dish; });
    menuFor("dinner").forEach(function (dd) {
      var already = mine.indexOf(dd.name) !== -1;
      g.appendChild(pickCard(dd.name, already ? "已经点过了" : null, function () { if (already) { toast("已经点过了"); return; } openCravePicker(dd.name); }));
    });
    sheet.appendChild(g);
    sheet.appendChild(el("h4", null, "菜谱里没有？写下来"));
    var row = el("div", "name-row");
    var input = el("input", "add-input"); input.type = "text"; input.placeholder = "比如：冬瓜排骨汤"; input.setAttribute("aria-label", "想吃的菜名");
    row.appendChild(input); row.appendChild(voiceButton(input, "说话说菜名"));
    sheet.appendChild(row);
    sheet.appendChild(btn("sheet-cta", "下一步：确认", function () {
      var name = trim(input.value);
      if (!name) { toast("先写菜名"); input.focus(); return; }
      confirmPanel("对吗？", "想吃这道：", name, "对，下一步选有多想吃", function () {
        if (!dish(name)) newDish(name, "dinner", guessCat(name), [], [], true);
        openCravePicker(name);
      }, openOrderSheet);
    }));
    sheet.appendChild(closeBtn("不点了，回去"));
    openSheet();
  }
  function showFamTab(which) {
    ui.famTab = which;
    $("family-main").hidden = which !== "order";
    $("family-today").hidden = which === "order";
    $("dtab-order").classList.toggle("on", which === "order");
    $("dtab-menu").classList.toggle("on", which !== "order");
  }
  $("dtab-order").addEventListener("click", function () { showFamTab("order"); });
  $("dtab-menu").addEventListener("click", function () { showFamTab("menu"); });
  $("fam-order-btn").addEventListener("click", openOrderSheet);

  function renderFamilyToday() {
    var id = todayIso(), box = $("fam-today-menu"); box.innerHTML = "";
    var card = el("div", "tonight-card", '<div class="plan-meal">早饭 · 热一下就行</div>');
    var bfs = bfList(id).filter(function (it) { return it.kind !== "skip"; });
    if (!bfs.length) card.appendChild(el("div", null, '<div style="font-size:17px;color:#8a7967">今天不用做早饭。</div>'));
    bfs.forEach(function (it) {
      var name = it.kind === "any" ? "随便" : it.name;
      var row = el("div", "dish-row", (it.kind === "any" ? '<div class="dish-tile" aria-hidden="true">随</div>' : dishMedia(it.name)) +
        '<div class="dish-info"><div class="dish-name">' + esc(name) + '</div><div class="dish-from">' + esc(pname(it.person)) + "的" + (it.kind === "fallback" ? " · 没点，默认" : "") + "</div></div>");
      if (it.kind !== "any") dishClickRow(row, it.name);
      card.appendChild(row);
    });
    var head = el("div", "plan-meal"); head.style.marginTop = "14px";
    head.textContent = "晚饭 · " + totalPeople(id) + " 个人吃" + (guestCount(id) ? "（含客人 " + guestCount(id) + " 位）" : "");
    card.appendChild(head);
    var dn = dinner(id);
    if (!dn.length) card.appendChild(el("div", null, '<div style="font-size:17px;color:#8a7967">妈妈还没定今晚的。</div>'));
    dn.forEach(function (name) {
      var w = wishOf(name);
      var row = el("div", "dish-row", dishMedia(name) + '<div class="dish-info"><div class="dish-name">' + esc(name) + '</div><div class="dish-from">' + (w ? esc(pname(w.person)) + "想吃的" : "妈妈定的") + "</div></div>");
      dishClickRow(row, name); card.appendChild(row);
    });
    box.appendChild(card);
  }

  // ---------- 客人（家里人加，平时折叠；妈妈屏有才显示） ----------
  function firstSaturday() { var ds = days(); for (var i = 0; i < ds.length; i++) if (fromIso(ds[i]).getDay() === 6) return ds[i]; return ds[1]; }
  function setGuestOpen(open) {
    ui.guestOpen = !!open;
    if (open && (!ui.guestDay || days().indexOf(ui.guestDay) === -1)) ui.guestDay = firstSaturday();
    $("guest-body").hidden = !open;
    var b = $("guest-fold-btn");
    b.setAttribute("aria-expanded", String(open));
    b.innerHTML = open ? "收起 ▲" : "＋ 有客人来，点这里<small>平时不用管</small>";
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
      { id: "dish:" + name, data: { name: name, meal: meal, cat: cat, ings: ings || [], steps: steps || [], order: Math.round(Date.now() / 1000) } }
    ]);
    if (!silent) log("菜谱里加了新菜：" + name);
  }
  function renderMenu() {
    var fbox = $("menu-filter"); fbox.innerHTML = "";
    D.CATS.forEach(function (f) {
      fbox.appendChild(btn("filter-chip" + (ui.filter === f.id ? " on" : ""), f.label, function () { ui.filter = f.id; renderMenu(); }));
    });
    var box = $("menu-list"); box.innerHTML = "";
    var all = allDishes();
    [["breakfast", "早饭菜谱"], ["dinner", "晚饭菜谱"]].forEach(function (m) {
      var meal = m[0];
      var list = all.filter(function (d) { return (d.meal === meal || d.meal === "both") && (ui.filter === "all" || d.cat === ui.filter); });
      if (ui.filter !== "all" && !list.length) return;
      var h = el("h2", "sec-title"); h.style.marginTop = "6px"; h.textContent = m[1] + (ui.filter === "fish" && meal === "dinner" ? " · 鱼的做法都在这" : "");
      box.appendChild(h);
      if (!list.length) box.appendChild(el("div", "wish-none", "还没有菜"));
      list.forEach(function (d, idx) {
        var row = el("div", "menu-row", dishMedia(d.name) + '<div class="mn-name">' + esc(d.name) + "<small>" + esc(ingsFor(d.name).slice(0, 3).map(function (x) { return x.split(/\s+/)[0]; }).join("、")) + "</small></div>");
        dishClickRow(row, d.name);
        var acts = el("div", "row-acts");
        if (!isMom()) {
          if (meal === "dinner") acts.appendChild(btn("mini-btn want-btn", "我想吃", function () { openCravePicker(d.name); }, "我想吃" + d.name));
          else acts.appendChild(btn("mini-btn want-btn", "当早饭", function () { openBfDayChoice(d.name); }, "选哪天早饭吃" + d.name));
        }
        acts.appendChild(btn("mini-btn", "看做法", function () { openRecipe(d.name); }));
        acts.appendChild(btn("ord-btn", "↑", function () { moveDish(list, idx, -1); }, "上移" + d.name));
        acts.appendChild(btn("ord-btn", "↓", function () { moveDish(list, idx, 1); }, "下移" + d.name));
        acts.appendChild(btn("mini-btn danger", "删掉", function () {
          S.del("dish:" + d.name); log("菜谱里删掉了：" + d.name); toast("删掉了：" + d.name);
        }, "删掉" + d.name));
        row.appendChild(acts);
        box.appendChild(row);
      });
    });
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
      b.addEventListener("click", function () { setBreakfast(id, name); });
      g.appendChild(b);
    });
    sheet.appendChild(g);
    sheet.appendChild(closeBtn("回去"));
    openSheet();
  }
  function openRecipe(name) {
    var d = dish(name);
    sheet.innerHTML = '<div class="ing-head">' + dishMedia(name) + '<div><div class="ih-name">' + esc(name) + "</div>" +
      (d && d.cat ? '<div style="font-size:15px;color:#5d4f3f">' + esc((D.CATS.filter(function (c) { return c.id === d.cat; })[0] || {}).label || "") + "</div>" : "") + "</div></div>";
    var ul = el("ul", "ing-list");
    ingsFor(name).forEach(function (x) { ul.appendChild(el("li", null, esc(x))); });
    sheet.appendChild(ul);
    sheet.appendChild(el("h4", null, "怎么做"));
    var ol = el("ol"); ol.style.cssText = "margin:0;padding-left:22px;font-size:17px;line-height:1.75;color:#2b2118";
    stepsFor(name).forEach(function (s) { ol.appendChild(el("li", null, esc(s))); });
    sheet.appendChild(ol);
    if (d && d.prep) { var p = el("p", null, "⏰ 提醒：" + esc(d.prep)); p.style.cssText = "font-size:16px;color:#8a5a00;font-weight:700;margin:12px 0 0"; sheet.appendChild(p); }
    if (isMom()) {
      if (isDinnerDish(name)) sheet.appendChild(btn("sheet-cta", "定进" + dayName(ui.planDay) + "晚饭", function () {
        if (addDinner(ui.planDay, name)) { closeSheet(); showView("today"); showMode("plan"); toast(dayName(ui.planDay) + "晚饭定了：" + name); }
      }));
    } else {
      if (isDinnerDish(name)) sheet.appendChild(btn("sheet-cta", "🍽 我想吃这道", function () { openCravePicker(name); }));
      else sheet.appendChild(btn("sheet-cta", "当早饭（选哪天）", function () { openBfDayChoice(name); }));
    }
    var row2 = el("div", "rec-acts");
    row2.appendChild(btn("mini-btn", "📷 换照片", function () { pickPhoto({ kind: "dish", id: name }); }));
    if (S.get("photo:" + name)) row2.appendChild(btn("mini-btn", "用回自动配图", function () { S.del("photo:" + name); openRecipe(name); }));
    row2.appendChild(btn("mini-btn", "✏️ 改配料做法", function () { openDishEditor(name); }));
    sheet.appendChild(row2);
    sheet.appendChild(closeBtn("知道了，回去"));
    openSheet();
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
    sheet.appendChild(btn("sheet-close", "不改了，回去", function () { openRecipe(name); }));
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
    sheet.appendChild(el("label", "f", "配料（可以不写，一行一样）"));
    var ings = el("textarea", "add-input"); ings.value = st.ings; ings.placeholder = "排骨 500克\n冬瓜 1 块\n姜"; ings.setAttribute("aria-label", "配料");
    sheet.appendChild(ings);
    sheet.appendChild(el("label", "f", "怎么做（可以不写）"));
    var steps = el("textarea", "add-input"); steps.value = st.steps; steps.setAttribute("aria-label", "做法");
    sheet.appendChild(steps);
    sheet.appendChild(btn("sheet-cta", "下一步：确认", function () {
      var name = trim(input.value);
      if (!name) { toast("先写菜名"); input.focus(); return; }
      if (dish(name)) { toast("菜谱里已经有「" + name + "」了"); return; }
      st.name = name; st.ings = ings.value; st.steps = steps.value;
      confirmPanel("对吗？", "加进" + (st.meal === "breakfast" ? "早饭" : "晚饭") + "菜谱：", name, "对，就这样", function () {
        newDish(name, st.meal, guessCat(name), splitLines(st.ings), String(st.steps).split(/\n+/).map(trim).filter(Boolean));
        closeSheet(); toast("加好了：" + name);
      }, function () { openAddDish(st); });
    }));
    sheet.appendChild(closeBtn("不加了"));
    openSheet();
    setTimeout(function () { if (!st.name) input.focus(); }, 80);
  }
  // 帮我想新菜：一次 4 道
  var recOffset = 0, recSkip = {};
  function recPool() { return D.RECOMMENDS.filter(function (r) { return !dish(r.name) && !recSkip[r.name]; }); }
  $("menu-rec-btn").addEventListener("click", function () { recOffset = 0; renderRecommend(); openSheet(); });
  function addRec(r) {
    S.put("dish:" + r.name, { name: r.name, meal: r.meal, cat: r.cat, ings: r.ings, steps: r.steps, prep: r.prep, order: Math.round(Date.now() / 1000) });
    log("菜谱里加了新菜：" + r.name);
    toast("加好了：" + r.name);
  }
  function renderRecommend() {
    var pool = recPool();
    sheet.innerHTML = "<h3>✨ 想了几道新菜</h3>" + '<p class="sheet-sub">喜欢就点「要这道」。</p>';
    if (!pool.length) {
      sheet.appendChild(el("div", "read-panel", "推荐的都看过了。"));
      sheet.appendChild(btn("sheet-cta", "重新看一遍", function () { recSkip = {}; recOffset = 0; renderRecommend(); }));
      sheet.appendChild(closeBtn("回去"));
      return;
    }
    if (recOffset >= pool.length) recOffset = 0;
    var shown = pool.slice(recOffset, recOffset + 4);
    if (shown.length < 4) shown = shown.concat(pool.slice(0, Math.min(4, pool.length) - shown.length));
    shown.forEach(function (r) {
      var card = el("div", "rec-card", '<div class="rec-head">' + dishMedia(r.name) + '<div class="rec-name">' + esc(r.name) + "<small>" + (r.meal === "breakfast" ? "早饭" : "晚饭") + "</small></div></div>" +
        '<div class="rec-blurb">' + esc(r.blurb) + '</div><div class="rec-ings">配料：' + esc(r.ings.join("、")) + "</div>");
      var acts = el("div", "rec-acts");
      acts.appendChild(btn("want-btn", "要这道", function () { addRec(r); renderRecommend(); }, "把" + r.name + "加进菜谱"));
      acts.appendChild(btn("mini-btn", "看做法", function () { renderRecDetail(r); }));
      acts.appendChild(btn("mini-btn", "不要", function () { recSkip[r.name] = true; renderRecommend(); }));
      card.appendChild(acts);
      sheet.appendChild(card);
    });
    if (pool.length > 4) { var m = btn("sheet-cta", "🔄 换一批", function () { recOffset = (recOffset + 4) % pool.length; renderRecommend(); sheet.scrollTop = 0; }); m.style.background = "#2e7d5b"; sheet.appendChild(m); }
    sheet.appendChild(closeBtn("回去"));
    sheet.scrollTop = 0;
  }
  function renderRecDetail(r) {
    sheet.innerHTML = '<div class="ing-head">' + dishMedia(r.name) + '<div><div class="ih-name">' + esc(r.name) + '</div><div style="font-size:15px;color:#5d4f3f">' + esc(r.blurb) + "</div></div></div>";
    var ul = el("ul", "ing-list"); r.ings.forEach(function (x) { ul.appendChild(el("li", null, esc(x))); }); sheet.appendChild(ul);
    sheet.appendChild(el("h4", null, "怎么做"));
    var ol = el("ol"); ol.style.cssText = "margin:0;padding-left:22px;font-size:17px;line-height:1.75;color:#2b2118";
    r.steps.forEach(function (s) { ol.appendChild(el("li", null, esc(s))); }); sheet.appendChild(ol);
    sheet.appendChild(btn("sheet-cta", "要这道，加进菜谱", function () { addRec(r); renderRecommend(); }));
    sheet.appendChild(btn("sheet-close", "← 回去接着看", renderRecommend));
    sheet.scrollTop = 0;
  }

  // =====================================================================
  //  买菜
  // =====================================================================
  var PANTRY = /^(盐|生抽|老抽|香醋|醋|白糖|糖|冰糖|淀粉|食用油|油|香油|料酒|蚝油|豆瓣酱|花椒|蒸鱼豉油|番茄酱|沙拉酱|果酱|芝麻|温水|水|干辣椒|沙姜)$/;
  function splitIng(s) { var m = String(s).match(/^(\S+)\s+(.+)$/); return m ? { name: m[1], qty: m[2] } : { name: String(s), qty: "" }; }
  function collectBuy() {
    var order = [], map = {};
    function add(ing, src, date) {
      var x = splitIng(ing);
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
  function boughtRecently(name) {
    var b = S.get("bought:" + name);
    if (!b || !b.date) return false;
    return fromIso(b.date) >= addDays(new Date(), -6);
  }
  function weeeLink(name) {
    return '<a class="weee-link" href="https://www.sayweee.com/zh/search?keyword=' + encodeURIComponent(name) + '" target="_blank" rel="noopener" aria-label="去 Weee 买' + esc(name) + '"><span class="weee-ico" aria-hidden="true">🛒</span>去 Weee 买<span class="weee-go" aria-hidden="true">›</span></a>';
  }
  function buyRow(name, qty, src, bought, onToggle, extra) {
    var row = el("div", "buy-row" + (bought ? " bought" : ""),
      '<span class="b-info"><span class="b-name">' + esc(name) + ' <span class="b-qty">' + esc(qty) + "</span></span>" +
      '<span class="b-src">' + esc(src) + "</span>" + weeeLink(name) + "</span>" +
      '<span class="b-state">' + (bought ? "✓ 买好了" : "还没买") + "</span>");
    row.setAttribute("role", "button"); row.tabIndex = 0;
    row.setAttribute("aria-label", name + (bought ? "，已买，点一下改回还没买" : "，还没买，点一下标成买好了"));
    function go(e) { if (e.target.closest && (e.target.closest("a") || e.target.closest("button"))) return; onToggle(); }
    row.addEventListener("click", go);
    row.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(e); } });
    if (extra) row.appendChild(extra);
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
    return collectBuy().filter(function (it) { return !it.pantry && !boughtRecently(it.name); }).length +
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
    if (!items.length) box.appendChild(el("div", "wish-none", "还没定菜，定了就会出现在这里。"));
    var pantryHead = false;
    items.forEach(function (it) {
      if (it.pantry && !pantryHead) { pantryHead = true; box.appendChild(el("div", "day-note", "调料（家里有就不用买）：")).style.margin = "14px 0 8px"; }
      var b = boughtRecently(it.name);
      var row = buyRow(it.name, it.qty, "用在：" + it.srcs.join("、"), b, function () {
        if (b) S.del("bought:" + it.name); else S.put("bought:" + it.name, { date: todayIso() });
      });
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
      var link = function (n) { return n === D.BF_ANY ? "随便" : '<span class="dish-link-txt" data-dish="' + esc(n) + '">' + esc(n) + "</span>"; };
      wk.appendChild(el("div", "week-row",
        "<b>" + d.short + " " + d.num + "日</b>" + (d.rel ? "（" + d.rel + "）" : "") + " · " + totalPeople(id) + " 人<br>" +
        '<span class="w-meal">早饭：' + (bf.length ? bf.map(link).join("、") : "不用做") + "</span><br>" +
        (dn.length ? '<span class="w-meal">晚饭：' + dn.map(link).join("、") + "</span>" : '<span class="w-none">晚饭还没定</span>') +
        (guestCount(id) ? '<br><span class="w-meal">🎉 客人：' + esc(guestText(id)) + "</span>" : "")));
    });
  }
  $("week-list").addEventListener("click", function (e) { var t = e.target; if (t && t.classList && t.classList.contains("dish-link-txt")) openRecipe(t.getAttribute("data-dish")); });
  $("custom-toggle").addEventListener("click", function () {
    ui.customOpen = !ui.customOpen;
    $("custom-body").hidden = !ui.customOpen;
    $("custom-toggle").textContent = ui.customOpen ? "收起 ▲" : "展开 ▼";
    $("custom-toggle").setAttribute("aria-expanded", String(ui.customOpen));
  });
  $("custom-voice").innerHTML = MIC_SVG;
  $("custom-voice").addEventListener("click", function () { startVoice($("custom-name")); });
  $("custom-add-btn").addEventListener("click", function () {
    var n = $("custom-name"), q = $("custom-qty");
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
    var bfDays = days().filter(function (id) { return bfPick(id, p.id); });
    var fbN = S.list("fb:").filter(function (x) { return x.data.who === p.id; }).length;
    $("profile-stats").innerHTML =
      '<div class="log-item">最近想吃：' + (myW.length ? esc(myW.map(function (w) { return w.dish; }).join("、")) : "还没点") + "</div>" +
      '<div class="log-item">早饭定了：' + (bfDays.length ? bfDays.map(function (id) { return dayInfo(id).short; }).join("、") : "还没定") + "</div>" +
      '<div class="log-item">明天在家吃饭：' + (isHome(tomorrowIso(), p.id) ? "在家" : "不在家") + "</div>" +
      '<div class="log-item">留过反馈：' + fbN + " 条</div>";
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
        if (navigator.share) { navigator.share({ title: "早饭晚饭", text: p.name + "，用这个打开我们家的早饭晚饭：", url: link }).catch(function () {}); return; }
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
      row.appendChild(input); row.appendChild(voiceButton(input, "说话输入反馈"));
      box.appendChild(row);
      box.appendChild(btn("sheet-cta", "提交反馈", function () {
        var t = trim(input.value);
        if (!t) { toast("先说一句或写一句"); input.focus(); return; }
        S.put("fb:" + Date.now() + "-" + rnd(), { who: ui.me, text: t, t: Date.now() });
        input.value = ""; toast("收到了，谢谢！");
      }));
      var list = el("div", "fb-list"); list.style.marginTop = "8px";
      box.appendChild(list);
      slot.appendChild(box);
    });
  }
  function renderFeedback() {
    var fbs = S.list("fb:").map(function (x) { return x.data; }).sort(function (a, b) { return (b.t || 0) - (a.t || 0); }).slice(0, 30);
    document.querySelectorAll(".fb-list").forEach(function (box) {
      box.innerHTML = fbs.length ? fbs.map(function (f) { return '<div class="fb-item"><b>' + esc(pname(f.who)) + "：</b>" + esc(f.text) + "</div>"; }).join("")
        : '<div class="wish-none">还没有反馈。</div>';
    });
  }

  // =====================================================================
  //  妈妈的悬浮话筒：说一句 → 确认页 → 才排进这一周
  // =====================================================================
  var voiceItems = null;
  function dayWords() {
    var out = [];
    days().forEach(function (id) {
      var d = dayInfo(id), w = WD[d.date.getDay()];
      var words = ["周" + w, "星期" + w, "礼拜" + w];
      if (w === "日") words.push("周天", "星期天", "礼拜天");
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
  function vpParse(text) {
    var marks = [];
    dayWords().forEach(function (dw) {
      dw.words.forEach(function (w) {
        var from = 0, idx;
        while ((idx = text.indexOf(w, from)) !== -1) { marks.push({ idx: idx, len: w.length, id: dw.id }); from = idx + w.length; }
      });
    });
    marks.sort(function (a, b) { return a.idx - b.idx || b.len - a.len; });
    var clean = [];
    marks.forEach(function (m) { var last = clean[clean.length - 1]; if (!last || m.idx >= last.idx + last.len) clean.push(m); });
    var items = [];
    clean.forEach(function (m, i) {
      var end = i + 1 < clean.length ? clean[i + 1].idx : text.length;
      var seg = text.slice(m.idx + m.len, end)
        .replace(/^[：:，,、。\s]+/, "")
        .replace(/^(还要|还有|还|再|然后|另外|就)+/, "")
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
  function openVoicePlan(note) {
    sheet.innerHTML = "<h3>说一句，这周怎么安排</h3>" + '<p class="sheet-sub">比如「周二做鱼，周三做鸡腿」。说完先确认。' + (note ? " " + esc(note) : "") + "</p>";
    var input = el("input", "add-input"); input.type = "text"; input.placeholder = "或者打字：周二做鱼"; input.setAttribute("aria-label", "说话或打字输入这周的安排");
    var mic = el("button", "vp-mic", MIC_SVG + "<span>点这里，说话</span>"); mic.type = "button";
    mic.addEventListener("click", function () { startVoice(input); });
    sheet.appendChild(mic); sheet.appendChild(input);
    sheet.appendChild(btn("sheet-cta", "说完了 · 给我确认", function () {
      var text = trim(input.value);
      if (!text) { toast("先说话或打字"); input.focus(); return; }
      var items = vpParse(text);
      if (!items.length) { toast("没听出是哪天，再说一次，比如「周二做鱼」"); return; }
      voiceItems = items; renderVoiceConfirm();
    }));
    sheet.appendChild(closeBtn("不说了"));
    openSheet();
  }
  function renderVoiceConfirm() {
    sheet.innerHTML = "<h3>听懂的是这样，对吗？</h3>" + '<p class="sheet-sub">都对了，点下面大按钮。</p>';
    voiceItems.forEach(function (it, idx) {
      var d = dayInfo(it.dayId);
      var card = el("div", "vp-item" + (it.status === "choose" ? " need" : ""), '<div class="vp-day">' + d.short + " " + d.num + "日" + (d.rel ? "（" + d.rel + "）" : "") + " · 晚饭</div>");
      if (it.status === "choose") {
        card.appendChild(el("div", "vp-dish", esc(it.raw)));
        card.appendChild(el("div", "vp-note", esc(it.why)));
        var cands = el("div", "vp-cands");
        it.candidates.forEach(function (c) { cands.appendChild(btn("vp-cand", c, function () { it.name = c; it.status = "ok"; renderVoiceConfirm(); }, d.short + "晚饭就定" + c)); });
        var nb = btn("vp-cand", "就按「" + it.raw + "」排", function () { it.name = it.raw; it.status = "new"; renderVoiceConfirm(); });
        nb.style.cssText = "border-color:#d99a2b;background:#fdf1e3;color:#8a5a00";
        cands.appendChild(nb);
        card.appendChild(cands);
      } else {
        card.appendChild(el("div", "vp-dish", esc(it.name)));
        if (it.status === "new") card.appendChild(el("div", "vp-note", "菜谱里还没有，会自动加进去"));
      }
      var acts = el("div", "vp-acts");
      acts.appendChild(btn("mini-btn", "换一道", function () { renderVoicePick(idx); }));
      acts.appendChild(btn("mini-btn danger", "这条不要", function () {
        voiceItems.splice(idx, 1);
        if (!voiceItems.length) openVoicePlan("刚才的都不要了，再说一句。"); else renderVoiceConfirm();
      }));
      card.appendChild(acts);
      sheet.appendChild(card);
    });
    var pending = voiceItems.some(function (it) { return it.status === "choose"; });
    var yes = btn("sheet-cta", pending ? "先挑完上面黄框的" : "✓ 对，就这样", function () {
      if (pending) { toast("黄框的还没挑"); return; }
      applyVoice();
    });
    yes.style.background = "#2e7d5b";
    sheet.appendChild(yes);
    sheet.appendChild(btn("sheet-close", "不对，我重新说", function () { openVoicePlan(); }));
    sheet.appendChild(closeBtn("先不排了"));
    sheet.scrollTop = 0;
  }
  function renderVoicePick(idx) {
    var it = voiceItems[idx], d = dayInfo(it.dayId);
    sheet.innerHTML = "<h3>" + d.short + "晚饭换成哪道？</h3>";
    var g = el("div", "pick-grid");
    menuFor("dinner").forEach(function (dd) { g.appendChild(pickCard(dd.name, null, function () { it.name = dd.name; it.status = "ok"; renderVoiceConfirm(); })); });
    sheet.appendChild(g);
    sheet.appendChild(btn("sheet-close", "← 不换了", renderVoiceConfirm));
    sheet.scrollTop = 0;
  }
  function applyVoice() {
    var ops = [], parts = [], byDay = {};
    voiceItems.forEach(function (it) {
      if (!dish(it.name)) {
        var rec = D.RECOMMENDS.filter(function (r) { return r.name === it.name; })[0];
        ops.push({ id: "dish:" + it.name, data: rec
          ? { name: rec.name, meal: "dinner", cat: rec.cat, ings: rec.ings, steps: rec.steps, prep: rec.prep, order: Math.round(Date.now() / 1000) }
          : { name: it.name, meal: "dinner", cat: guessCat(it.name), ings: [], steps: [], order: Math.round(Date.now() / 1000) } });
      }
      if (!byDay[it.dayId]) byDay[it.dayId] = dinner(it.dayId).slice();
      if (byDay[it.dayId].indexOf(it.name) === -1) byDay[it.dayId].push(it.name);
      parts.push(dayName(it.dayId) + "：" + it.name);
    });
    Object.keys(byDay).forEach(function (id) { ops.push({ id: "dinner:" + id, data: { dishes: byDay[id] } }); });
    S.putMany(ops);
    voiceItems.forEach(function (it) { log("说话定了" + dayName(it.dayId) + "晚饭：" + it.name); });
    voiceItems = null;
    closeSheet();
    toast("排好了！" + parts.join("；"));
  }
  $("voice-fab").addEventListener("click", function () { openVoicePlan(); });

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
  function setMe(pid) {
    ui.me = pid; LS.set("mp:me", pid);
    S.setWho(pid);
    keepUrl();
    $("welcome").hidden = true;
    $("voice-fab").hidden = !isMom();
    showView("today");
    renderAll();
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
    if (seeded()) return;
    if (S.household() && S.status() !== "ok") return;
    var ops = D.SEED_DISHES.map(function (d, i) { return { id: "dish:" + d.name, data: Object.assign({ order: i }, d) }; });
    ops.push({ id: "staples", data: { list: ["牛奶", "面包", "鸡蛋"] } });
    ops.push({ id: "meta:seeded", data: { v: 1, t: Date.now() } });
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
    else { $("voice-fab").hidden = !isMom(); showView("today"); renderAll(); }
    ready.then(function () { maybeSeed(); if (S.status() === "ok" && isMom()) pruneLogs(); queueRender(); });
    loadWeather();
    // 过了半夜，日子要往后挪
    var lastDay = todayIso();
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) return;
      if (todayIso() !== lastDay) { lastDay = todayIso(); ui.planDay = tomorrowIso(); loadWeather(); queueRender(); }
    });
  }
  boot();
})();
