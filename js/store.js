// 同步存储：每条数据一个 id（比如 "bf:2026-11-17:vicky"），后写的覆盖先写的。
// 先写本地（马上看到），再推到 Supabase；每隔几秒、切回 App 时拉别人改的。
// 没有家庭密钥时是「本机模式」：只存在这部手机里，不同步。
(function () {
  var cfg = window.MP_CONFIG || {};
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };

  var household = null;
  var who = "";
  var items = {};     // id -> { data, deleted, at, by }
  var pending = [];   // [{ id, data, deleted, by, seq }]
  var since = null;   // 服务器时间，上次拉到哪
  var seq = 0;
  var listeners = [];
  var status = "local"; // local | syncing | ok | offline | badkey
  var statusListeners = [];
  var timer = null;
  var busy = false;
  var again = false;

  function cacheKey() { return "mp:cache:" + (household || "local"); }
  function pendKey() { return "mp:pending:" + (household || "local"); }
  function save() {
    LS.set(cacheKey(), { items: items, since: since });
    LS.set(pendKey(), pending);
  }
  function emit(ids) { listeners.forEach(function (cb) { try { cb(ids); } catch (e) { console.error(e); } }); }
  function setStatus(s) {
    if (s === status) return;
    status = s;
    statusListeners.forEach(function (cb) { try { cb(s); } catch (e) { console.error(e); } });
  }

  function rpc(name, body) {
    return fetch(cfg.supabaseUrl + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.supabaseKey },
      body: JSON.stringify(body),
      cache: "no-store"
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) { var err = new Error((j && j.message) || ("HTTP " + r.status)); err.status = r.status; err.body = j; throw err; }
        return j;
      });
    });
  }

  function pendingIds() { var m = {}; pending.forEach(function (p) { m[p.id] = true; }); return m; }

  function pushPending() {
    if (!pending.length) return Promise.resolve();
    var batch = pending.slice(0, 200);
    var maxSeq = batch[batch.length - 1].seq;
    return rpc("mp_push", { h: household, items: batch.map(function (p) { return { id: p.id, data: p.data, deleted: p.deleted, by: p.by }; }) })
      .then(function () {
        pending = pending.filter(function (p) { return p.seq > maxSeq; });
        save();
        if (pending.length) return pushPending();
      });
  }

  function pull() {
    // 往回多拉 15 秒，防止两部手机同时写时漏掉
    var s = since ? new Date(new Date(since).getTime() - 15000).toISOString() : null;
    return rpc("mp_pull", { h: household, since: s }).then(function (res) {
      var mine = pendingIds();
      var changed = [];
      (res.items || []).forEach(function (it) {
        if (mine[it.id]) return; // 本地还没推上去的，以本地为准
        var cur = items[it.id];
        if (cur && cur.at && it.at && cur.at === it.at && cur.deleted === it.deleted) return;
        if (it.deleted) { if (cur && !cur.deleted) changed.push(it.id); items[it.id] = { deleted: true, at: it.at, by: it.by }; }
        else { items[it.id] = { data: it.data, deleted: false, at: it.at, by: it.by }; changed.push(it.id); }
      });
      // 删掉很久以前的「已删除」标记，省空间
      if (!since) Object.keys(items).forEach(function (k) { if (items[k].deleted && !mine[k]) delete items[k]; });
      since = res.now;
      save();
      if (changed.length) emit(changed);
    });
  }

  function sync() {
    if (!household) return Promise.resolve();
    if (busy) { again = true; return Promise.resolve(); }
    busy = true;
    if (status !== "ok") setStatus("syncing");
    return pushPending().then(pull).then(function () {
      setStatus("ok");
    }).catch(function (e) {
      if (e && e.body && /unknown household/.test(e.body.message || "")) setStatus("badkey");
      else setStatus("offline");
    }).then(function () {
      busy = false;
      if (again) { again = false; return sync(); }
    });
  }

  function schedule() {
    clearInterval(timer);
    if (!household) return;
    timer = setInterval(function () { if (!document.hidden) sync(); }, cfg.pollMs || 8000);
  }

  var api = {
    init: function (opts) {
      household = opts.household || null;
      who = opts.who || "";
      var c = LS.get(cacheKey(), null);
      items = (c && c.items) || {};
      since = (c && c.since) || null;
      pending = LS.get(pendKey(), []) || [];
      seq = pending.reduce(function (m, p) { return Math.max(m, p.seq || 0); }, 0);
      setStatus(household ? (navigator.onLine === false ? "offline" : "syncing") : "local");
      if (household) {
        document.addEventListener("visibilitychange", function () { if (!document.hidden) sync(); });
        window.addEventListener("focus", function () { sync(); });
        window.addEventListener("online", function () { sync(); });
        window.addEventListener("pageshow", function () { sync(); });
        schedule();
      }
      return household ? sync() : Promise.resolve();
    },
    setWho: function (w) { who = w || ""; },
    household: function () { return household; },
    hasData: function () { return Object.keys(items).length > 0; },
    get: function (id) { var it = items[id]; return it && !it.deleted ? it.data : undefined; },
    meta: function (id) { var it = items[id]; return it && !it.deleted ? { at: it.at, by: it.by } : null; },
    list: function (prefix) {
      var out = [];
      Object.keys(items).forEach(function (k) {
        var it = items[k];
        if (!it.deleted && k.indexOf(prefix) === 0) out.push({ id: k, data: it.data, at: it.at, by: it.by });
      });
      return out;
    },
    put: function (id, data) { api.putMany([{ id: id, data: data }]); },
    del: function (id) { api.putMany([{ id: id, deleted: true }]); },
    // 一次写好几条（一起推上去）
    putMany: function (list) {
      var now = new Date().toISOString();
      var ids = [];
      list.forEach(function (x) {
        var del = !!x.deleted;
        items[x.id] = del ? { deleted: true, at: now, by: who } : { data: x.data, deleted: false, at: now, by: who };
        if (household) {
          pending = pending.filter(function (p) { return p.id !== x.id; });
          pending.push({ id: x.id, data: del ? {} : x.data, deleted: del, by: who, seq: ++seq });
        }
        ids.push(x.id);
      });
      save();
      emit(ids);
      if (household) setTimeout(sync, 50);
    },
    onChange: function (cb) { listeners.push(cb); },
    onStatus: function (cb) { statusListeners.push(cb); cb(status); },
    status: function () { return status; },
    pendingCount: function () { return pending.length; },
    syncNow: sync
  };
  window.MPStore = api;
})();
