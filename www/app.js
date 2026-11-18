(function () {
"use strict";
var TP = window.TL_PROGRAMS;
var Cap = window.Capacitor, isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
var P = (Cap && Cap.Plugins) || {};
var APP_VERSION = "1.4.0";

// ================= Dates =================
var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function pad(n) { return (n < 10 ? "0" : "") + n; }
function ds(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function pd(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
function addDays(s, n) { var d = pd(s); d.setDate(d.getDate() + n); return ds(d); }
function todayS() { return ds(new Date()); }
function weekStart(s) { var d = pd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ds(d); }
function fmtLong(s) { var d = pd(s); return DOW[d.getDay()] + ", " + MON[d.getMonth()].slice(0, 3) + " " + d.getDate(); }
function fmtShort(s) { var d = pd(s); return MON[d.getMonth()].slice(0, 3) + " " + d.getDate(); }
function short(s) { var d = pd(s); return (d.getMonth() + 1) + "/" + d.getDate(); }
function daysBetween(a, b) { return Math.round((pd(b) - pd(a)) / 864e5); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

// ================= State =================
var KEY = "tl_state_v1", FILE = "training-log.json";
var S = null; // persisted state
var compiled = {}; // programId -> parsed
var ui = { tab: "log", cur: todayS(), calMonth: todayS().slice(0, 7), progEx: "bench-press", reportRange: "30" };

function defaultState() {
  var st = {
    version: 1,
    programs: {},
    activeProgramId: "level-1",
    programHistory: [{ programId: "level-1", from: "2026-11-16" }],
    days: {},
    exNames: {},
    settings: { name: "Rob Webster", restOn: true, restSec: 90, restPowerSec: 150, remindOn: false, remindTime: "05:00", remindDays: [1, 2, 3, 4, 5, 6], bodyGoal: null, age: null, sex: "M", heightIn: 75, weightLb: 275 }
  };
  TP.BUILTIN.forEach(function (p) { st.programs[p.id] = clone(p); });
  // Rob's first session (Mon Nov 16, 2026), carried over from the web tracker
  function S_(w, r) { return { w: w == null ? "" : String(w), r: String(r), d: true }; }
  var chin = []; for (var i = 0; i < 25; i++) chin.push(S_("", 1));
  st.days["2026-11-16"] = {
    date: "2026-11-16", programId: "level-1", workout: "1", liftDone: true, absDone: true, cardioMin: 30, cardioType: "Stationary bike", bodyWeight: null,
    notes: "First session. Chin-ups: 25 singles, very hard; form questionable on some reps. Abs: 50 sit-ups (target 125) - stomach burning.",
    ex: {
      "bench-press": [S_(185, 8), S_(185, 8), S_(185, 5)],
      "incline-press": [S_(135, 8), S_(155, 5), S_(155, 5)],
      "pullovers": [S_(40, 8), S_(50, 8), S_(50, 8)],
      "chin-ups": chin,
      "bent-over-rows": [S_(60, 8), S_(60, 8), S_(60, 8)],
      "deadlifts": [S_(135, 10), S_(135, 10), S_(185, 6)],
      "crunches": [S_("", 25), S_("", 25), { w: "", r: "", d: false }, { w: "", r: "", d: false }, { w: "", r: "", d: false }]
    }
  };
  return st;
}

function compileAll() {
  compiled = {};
  Object.keys(S.programs).forEach(function (id) {
    var p = S.programs[id], c = TP.parseProgram(p.text, { defaultSets: p.defaultSets });
    compiled[id] = c;
    Object.keys(c.workouts).forEach(function (k) { c.workouts[k].groups.forEach(function (g) { g.ex.forEach(function (e) { S.exNames[e.id] = e.n; }); }); });
  });
}
function exInfo(id) {
  for (var pid in compiled) { var c = compiled[pid]; for (var k in c.workouts) { var gs = c.workouts[k].groups; for (var i = 0; i < gs.length; i++) for (var j = 0; j < gs[i].ex.length; j++) if (gs[i].ex[j].id === id) return gs[i].ex[j]; } }
  return { id: id, n: S.exNames[id] || id, reps: [8, 8, 8] };
}
function programOnDate(date) {
  var h = S.programHistory.filter(function (x) { return x.from <= date && S.programs[x.programId]; }).sort(function (a, b) { return a.from < b.from ? -1 : 1; });
  var id = h.length ? h[h.length - 1].programId : S.activeProgramId;
  if (!S.programs[id]) id = S.activeProgramId;
  return id;
}
function scheduledWorkout(date) { var pid = programOnDate(date); return S.programs[pid].schedule[pd(date).getDay()] || "rest"; }
function blank(date) { var pid = programOnDate(date); return { date: date, programId: pid, workout: S.programs[pid].schedule[pd(date).getDay()] || "rest", liftDone: false, absDone: false, cardioMin: 0, cardioType: "Stationary bike", bodyWeight: null, notes: "", ex: {} }; }
function get(date) { return S.days[date] || null; }
function ensure(date) { if (!S.days[date]) S.days[date] = blank(date); return S.days[date]; }
function dayProg(d) { return compiled[S.programs[d.programId] ? d.programId : S.activeProgramId]; }
function dayWorkout(d) { var c = dayProg(d); return c.workouts[d.workout] || null; }
function isRestDay(date) { var d = get(date); if (d) return d.workout === "rest"; return scheduledWorkout(date) === "rest"; }
function startDate() { var f = S.programHistory.map(function (x) { return x.from; }).concat(Object.keys(S.days).filter(function (k) { var d = S.days[k]; return d.liftDone || d.absDone || Object.keys(d.ex || {}).length; })).sort(); return f[0] || todayS(); }
function tracked(date) { return date >= startDate(); }
function score(d) { if (!d) return 0; return (d.liftDone ? 1 : 0) + ((+d.cardioMin || 0) > 0 ? 1 : 0) + (d.absDone ? 1 : 0); }

// ================= Persistence =================
var saveT = null;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(function () {
    var json = JSON.stringify(S);
    try { localStorage.setItem(KEY, json); } catch (e) { }
    if (isNative && P.Filesystem) P.Filesystem.writeFile({ path: FILE, data: json, directory: "DATA", encoding: "utf8" }).catch(function () { });
  }, 350);
  updateHeader();
}
function load() {
  var raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { }
  if (raw) return Promise.resolve(raw);
  if (isNative && P.Filesystem) return P.Filesystem.readFile({ path: FILE, directory: "DATA", encoding: "utf8" }).then(function (r) { return r.data; }).catch(function () { return null; });
  return Promise.resolve(null);
}
function migrate(st) {
  var d = defaultState();
  st.settings = Object.assign(d.settings, st.settings || {});
  st.programs = st.programs || {};
  TP.BUILTIN.forEach(function (p) { if (!st.programs[p.id]) st.programs[p.id] = clone(p); });
  st.programHistory = st.programHistory || d.programHistory;
  st.days = st.days || {}; st.exNames = st.exNames || {};
  if (!st.programs[st.activeProgramId]) st.activeProgramId = "level-1";
  return st;
}

// ================= Helpers =================
var view = document.getElementById("view");
function toast(msg) { var t = document.getElementById("toast"); t.textContent = msg; t.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(function () { t.style.opacity = 0; }, 2200); }
function haptic() { try { if (P.Haptics) P.Haptics.impact({ style: "LIGHT" }); } catch (e) { } }
function streak() {
  var n = 0, s = todayS(), first = true, guard = 0;
  while (guard++ < 1500) {
    var d = get(s);
    if (isRestDay(s) && !(d && d.liftDone)) { s = addDays(s, -1); first = false; continue; }
    if (d && d.liftDone) n++;
    else if (!first) break;
    first = false; s = addDays(s, -1);
    if (s < startDate()) break;
  }
  return n;
}
function updateHeader() {
  var t = todayS(), ws = weekStart(t), done = 0, sched = 0, cmin = 0, total = 0;
  for (var i = 0; i < 7; i++) { var x = addDays(ws, i), d = get(x); if (!isRestDay(x) && tracked(x)) sched++; if (d) { if (d.liftDone) done++; cmin += (+d.cardioMin || 0); } }
  Object.keys(S.days).forEach(function (k) { if (S.days[k].liftDone) total++; });
  document.getElementById("sStreak").textContent = streak();
  document.getElementById("sWeek").textContent = done + "/" + sched;
  document.getElementById("sCardio").textContent = cmin;
  document.getElementById("sTotal").textContent = total;
  document.getElementById("progName").textContent = S.programs[S.activeProgramId].name;
}
function lastFor(exId, before) {
  var keys = Object.keys(S.days).filter(function (k) { return k < before; }).sort().reverse();
  for (var i = 0; i < keys.length; i++) { var s = (S.days[keys[i]].ex || {})[exId]; if (s && s.some(function (x) { return x.d; })) return { date: keys[i], sets: s }; }
  return null;
}
function topWeight(sets) { var m = 0; sets.forEach(function (s) { if (s.d && +s.w > m) m = +s.w; }); return m; }
function e1rm(w, r) { w = +w; r = +r; if (!w || !r) return 0; return r === 1 ? w : Math.round(w * (1 + r / 30)); }
function isLower(name) { return /squat|deadlift|lunge|leg|calf|good morning|hip|glute/i.test(name); }
function exDone(e, sets) {
  if (!sets) return false;
  if (e.total) return sets.reduce(function (a, x) { return a + (x.d ? (+x.r || 0) : 0); }, 0) >= e.total;
  return sets.length > 0 && sets.every(function (x) { return x.d; });
}
// Suggest next weights from the last session
function suggest(e, last) {
  if (!last || e.bw) return null;
  var done = last.sets.filter(function (s) { return s.d && +s.w; });
  if (!done.length) return null;
  var inc = isLower(e.n) ? 10 : 5;
  var same = e.reps.every(function (r) { return r === e.reps[0]; });
  var w = [], hitAll = true;
  e.reps.forEach(function (tr, i) {
    var s = last.sets[i];
    var hit = s && s.d && (+s.r || 0) >= tr;
    if (!hit) hitAll = false;
    w.push(s && +s.w ? +s.w : (done[done.length - 1] ? +done[done.length - 1].w : ""));
  });
  var text;
  if (same) {
    if (hitAll) { w = w.map(function (x) { return x ? x + inc : x; }); text = "All reps hit last time → go up to " + w[0] + " lb"; }
    else text = "Stay at " + w.filter(Boolean).join("/") + " lb until every set hits " + e.reps[0];
  } else {
    w = w.map(function (x, i) { var s = last.sets[i]; return x && s && s.d && (+s.r || 0) >= e.reps[i] ? x + inc : x; });
    text = "Suggested: " + w.map(function (x, i) { return (x || "?") + "×" + e.reps[i]; }).join(", ");
  }
  return { w: w, text: text };
}

// ================= Render =================
var pendingRender = false;
function render() {
  var a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && view.contains(a)) { pendingRender = true; return; }
  pendingRender = false;
  updateHeader();
  ({ log: renderLog, cal: renderCal, prog: renderProg, programs: renderPrograms, more: renderMore })[ui.tab]();
}
document.addEventListener("focusout", function () { setTimeout(function () { if (pendingRender) render(); }, 0); });

var CARDIO_TYPES = ["Stationary bike", "Walk", "Treadmill", "Elliptical", "Rower", "Stair climber", "Hockey", "Golf", "Other"];

function renderLog() {
  var cur = ui.cur, d = get(cur) || blank(cur), t = todayS(), c = dayProg(d), pname = S.programs[d.programId] ? S.programs[d.programId].name : "";
  var h = '<div class="datebar"><button class="iconbtn" data-act="prev">‹</button><div class="d"><b>' + fmtLong(cur) + '</b><span class="mute small">' + (cur === t ? "Today" : '<a href="#" data-act="today" style="color:var(--blue)">Back to today</a>') + '</span></div><button class="iconbtn" data-act="next">›</button></div>';
  h += '<div class="chips" style="margin-bottom:12px">';
  c.order.concat(["rest"]).forEach(function (w) { h += '<button class="chip' + (d.workout === w ? " on" : "") + '" data-act="wk" data-w="' + esc(w) + '">' + (w === "rest" ? "Rest" : (/^\d+$/.test(w) ? "Workout #" + esc(w) : esc(w))) + '</button>'; });
  h += '</div>';
  var cm = +d.cardioMin || 0;
  h += '<div class="habits">' +
    '<button class="habit' + (d.liftDone ? " done" : "") + '" data-act="lift"><div class="ic">🏋️</div><div class="t">Lift</div><div class="s">' + (d.liftDone ? "Done" : "Tap when done") + '</div></button>' +
    '<div class="habit' + (cm > 0 ? " done" : "") + '"><div class="ic">🚴</div><div class="t">Cardio</div><div class="s">' + (cm > 0 ? cm + " min" : "Not yet") + '</div></div>' +
    '<button class="habit' + (d.absDone ? " done" : "") + '" data-act="abs"><div class="ic">🔥</div><div class="t">Abs</div><div class="s">' + (d.absDone ? "Done" : "Every day") + '</div></button></div>';
  h += '<div class="card"><div class="row between"><b>Cardio</b><span class="mute small">minutes</span></div><div class="row" style="margin-top:10px;gap:8px">' +
    '<div class="numrow"><button class="pm" data-act="cm" data-v="-5">−5</button><input class="field" type="number" inputmode="numeric" id="cardioMin" value="' + (cm || "") + '" placeholder="0"><button class="pm" data-act="cm" data-v="5">+5</button></div>' +
    '<select class="field" id="cardioType" style="flex:1;min-width:0">' + CARDIO_TYPES.map(function (x) { return '<option' + (x === d.cardioType ? " selected" : "") + '>' + x + '</option>'; }).join("") + '</select></div></div>';
  h += calCard(d);
  h += healthCard(d);
  var W = dayWorkout(d);
  if (d.workout === "rest") {
    h += '<div class="card restcard"><div class="big">😴</div><b>Rest day</b><div class="mute small">' + esc(W && W.focus ? W.focus : "Recover. Walk if you feel like it.") + '</div></div>';
    if (W) W.groups.forEach(function (g) { h += exerciseGroup(d, g); });
  } else if (W) {
    h += '<div class="mute small" style="margin:4px 2px 0">' + esc(pname) + ' · ' + esc(W.focus) + '</div>';
    W.groups.forEach(function (g) { h += exerciseGroup(d, g); });
  } else {
    h += '<div class="card mute">This workout isn\'t in the program anymore.</div>';
  }
  h += '<h2>Body weight & notes</h2><div class="card"><div class="row" style="gap:10px;margin-bottom:10px"><span class="lbl" style="width:96px">Body wt (lb)</span><input class="field" type="number" inputmode="decimal" id="bodyWeight" value="' + (d.bodyWeight || "") + '" placeholder="optional" style="flex:1"></div><textarea class="field" id="notes" placeholder="How did it feel? PRs, aches, energy…">' + esc(d.notes) + '</textarea></div>';
  view.innerHTML = h;
  if (healthOn()) { var dd = cur; syncHealth(dd).then(function (ch) { if (ch && ui.tab === "log" && ui.cur === dd) render(); }); }
}
function setsFor(d, e) { return (d.ex && d.ex[e.id]) || e.reps.map(function () { return { w: "", r: "", d: false }; }); }
function exerciseGroup(d, g) {
  var h = '<h2>' + esc(g.g) + '</h2>';
  g.ex.forEach(function (e) {
    var sets = setsFor(d, e), last = lastFor(e.id, d.date), sug = suggest(e, last), all = exDone(e, d.ex && d.ex[e.id]);
    h += '<div class="card ex' + (all ? " complete" : "") + '"><h3>' + esc(e.n) + '</h3>';
    var tgt = e.total ? ("Goal: " + e.total + " total reps") : (e.reps.length + " sets × " + (e.reps.every(function (r) { return r === e.reps[0]; }) ? e.reps[0] : e.reps.join(", ")) + " reps");
    h += '<div class="mute small">' + tgt + '</div>';
    if (e.note) h += '<div class="note">' + esc(e.note) + '</div>';
    if (last) {
      var ls = last.sets.filter(function (s) { return s.d; });
      if (e.total) h += '<div class="last">Last (' + fmtShort(last.date) + '): ' + ls.reduce(function (a, s) { return a + (+s.r || 0); }, 0) + ' total reps · best set ' + Math.max.apply(null, ls.map(function (s) { return +s.r || 0; })) + '</div>';
      else h += '<div class="last">Last (' + fmtShort(last.date) + '): ' + ls.map(function (s) { return (e.bw ? "" : (s.w || "–") + "×") + (s.r || "–"); }).join(" · ") + '</div>';
    }
    if (sug && !all) h += '<div class="hint">' + esc(sug.text) + '</div>';
    var xc = exCalories(d, e); if (xc) h += '<div class="hrline" style="color:var(--warn)">🔥 ~' + xc.kcal + ' kcal' + (xc.how === "hr" ? " (from heart rate)" : " (estimate)") + '</div>';
    var xh = d.liftHr && d.liftHr.ex && d.liftHr.ex[e.id];
    if (xh) h += '<div class="hrline">❤️ avg <b>' + xh.avg + '</b> · peak <b>' + xh.max + '</b> bpm · ' + xh.mins + ' min' + (xh.sets && xh.sets.some(Boolean) ? '<br><span class="mute">Set peaks: ' + xh.sets.map(function (v, i) { return v ? (i + 1) + ") " + v : null; }).filter(Boolean).join(" · ") + '</span>' : '') + '</div>';
    else if (healthOn() && d.date === todayS() && sets.some(function (x) { return x.d && x.t; })) h += '<div class="hrline mute">❤️ Heart rate shows here once your watch syncs (tap Sync).</div>';
    if (e.total) { var tt = sets.reduce(function (a, s) { return a + (s.d ? (+s.r || 0) : 0); }, 0); h += '<div class="row between small" style="margin-top:6px"><span class="mute">Total so far</span><b>' + tt + ' / ' + e.total + '</b></div><div class="progressbar"><i style="width:' + Math.min(100, tt / e.total * 100) + '%"></i></div>'; }
    h += '<div class="sets">';
    if (!e.bw) h += '<div class="set"><span></span><span class="lbl" style="text-align:center">lb</span><span></span><span class="lbl" style="text-align:center">reps</span><span></span></div>';
    sets.forEach(function (s, i) {
      var tr = e.reps[i] || e.reps[e.reps.length - 1] || "";
      var ph = sug && sug.w[i] ? sug.w[i] : (last && last.sets[i] && last.sets[i].w ? last.sets[i].w : "lb");
      h += '<div class="set' + (e.bw ? " bw" : "") + '"><button class="n setn" data-act="setmenu" data-ex="' + e.id + '" data-i="' + i + '">' + (i + 1) + '</button>';
      if (!e.bw) h += '<input type="number" inputmode="decimal" data-ex="' + e.id + '" data-i="' + i + '" data-f="w" value="' + esc(s.w) + '" placeholder="' + esc(ph) + '"><span class="x">×</span>';
      h += '<input type="number" inputmode="numeric" data-ex="' + e.id + '" data-i="' + i + '" data-f="r" value="' + esc(s.r) + '" placeholder="' + (tr || "max") + '">';
      h += '<button class="chk' + (s.d ? " on" : "") + '" data-act="set" data-ex="' + e.id + '" data-i="' + i + '">✓</button></div>';
    });
    h += '</div><div class="setbtns"><button class="addset" data-act="addset" data-ex="' + e.id + '">+ Add set</button>' + (sets.length > 1 ? '<button class="addset" data-act="rmset" data-ex="' + e.id + '">− Remove set</button>' : '') + '</div><div class="small mute" style="margin-top:4px">Tip: tap a set number to remove that set.</div></div>';
  });
  return h;
}
function setMenu(exId, i) {
  var d = ensure(ui.cur), e = findInDay(d, exId), st = getSets(d, e)[i] || {};
  var info = st.d ? (e.bw ? (st.r || "-") + " reps" : (st.w || "-") + " lb × " + (st.r || "-")) + ", ticked" : (st.w || st.r ? "partly filled in" : "empty");
  openSheet('<h3>' + esc(e.n) + ' · set ' + (i + 1) + '</h3><div class="small mute" style="margin-bottom:14px">This set is ' + esc(info) + '.</div><button class="btn bad full" data-act="setdel" data-ex="' + e.id + '" data-i="' + i + '">Remove set ' + (i + 1) + '</button><button class="btn sec full" style="margin-top:8px" data-act="sclose">Cancel</button>');
}
function getSets(d, e) { d.ex = d.ex || {}; if (!d.ex[e.id]) d.ex[e.id] = setsFor(d, e).map(clone); return d.ex[e.id]; }
function findInDay(d, id) { var W = dayWorkout(d); if (W) for (var i = 0; i < W.groups.length; i++) for (var j = 0; j < W.groups[i].ex.length; j++) if (W.groups[i].ex[j].id === id) return W.groups[i].ex[j]; return exInfo(id); }
function autoHabits(d) {
  var W = dayWorkout(d); if (!W) return;
  var liftAll = true, absAll = true, hasLift = false, hasAbs = false;
  W.groups.forEach(function (g) { g.ex.forEach(function (e) { var ok = exDone(e, (d.ex || {})[e.id]); if (g.abs) { hasAbs = true; if (!ok) absAll = false; } else { hasLift = true; if (!ok) liftAll = false; } }); });
  if (hasLift && liftAll && d.workout !== "rest") d.liftDone = true;
  if (hasAbs && absAll) d.absDone = true;
}

// ================= Calendar =================
function renderCal() {
  var p = ui.calMonth.split("-"), y = +p[0], m = +p[1] - 1, first = new Date(y, m, 1), nd = new Date(y, m + 1, 0).getDate(), t = todayS();
  var h = '<div class="datebar"><button class="iconbtn" data-act="calnav" data-v="-1">‹</button><div class="d"><b>' + MON[m] + ' ' + y + '</b><span class="mute small">Success calendar</span></div><button class="iconbtn" data-act="calnav" data-v="1">›</button></div>';
  h += '<div class="card"><div class="cal">';
  ["M", "T", "W", "T", "F", "S", "S"].forEach(function (x) { h += '<div class="hd">' + x + '</div>'; });
  var lead = (first.getDay() + 6) % 7; for (var i = 0; i < lead; i++) h += '<div class="cell empty"></div>';
  var sched = 0, done = 0, cmin = 0, perfect = 0;
  for (var dn = 1; dn <= nd; dn++) {
    var s = y + "-" + pad(m + 1) + "-" + pad(dn), d = get(s), sc = score(d), rest = isRestDay(s);
    var cls = "cell" + (s === t ? " today" : "");
    if (sc > 0) cls += " s" + sc; else if (rest) cls += " rest"; else if (s < t && tracked(s)) cls += " miss";
    if (!rest && s <= t && tracked(s)) sched++;
    if (d) { if (d.liftDone) done++; cmin += (+d.cardioMin || 0); if (sc === 3) perfect++; }
    var w = d ? d.workout : scheduledWorkout(s);
    h += '<button class="' + cls + '" data-act="calday" data-d="' + s + '"><span style="text-align:left">' + dn + '</span>';
    h += '<span class="dots"><i class="' + (d && d.liftDone ? "on" : "") + '"></i><i class="' + (d && +d.cardioMin > 0 ? "on" : "") + '"></i><i class="' + (d && d.absDone ? "on" : "") + '"></i></span>';
    h += '<span class="w">' + (w === "rest" ? "R" : (/^\d+$/.test(w) ? "#" + w : esc(String(w).slice(0, 3)))) + '</span></button>';
  }
  h += '</div><div class="legend"><span><i style="background:var(--acc)"></i>All 3</span><span><i style="background:#24814b"></i>2 of 3</span><span><i style="background:#1e3d2b"></i>1 of 3</span><span><i style="background:#3a2224"></i>Missed</span><span><i style="background:#1a1f23;border:1px solid var(--line)"></i>Rest</span></div>';
  h += '<div class="mute small" style="margin-top:6px">Dots = Lift · Cardio · Abs. Tap a day to open it.</div></div>';
  var rate = sched ? Math.round(done / sched * 100) : 0;
  h += '<div class="grid2"><div class="kv"><b>' + done + '/' + sched + '</b><span>Workouts done so far</span></div><div class="kv"><b>' + rate + '%</b><span>Success rate</span></div><div class="kv"><b>' + cmin + '</b><span>Cardio minutes</span></div><div class="kv"><b>' + perfect + '</b><span>Perfect days (all 3)</span></div></div>';
  view.innerHTML = h;
}

// ================= Progress =================
function lineChart(pts, color, goal) {
  if (!pts.length) return '<div class="mute small" style="padding:20px 0;text-align:center">No data yet. Log a few sessions.</div>';
  var W = 340, H = 170, L = 34, R = 10, T = 12, B = 26;
  var ys = pts.map(function (p) { return p.y; }); if (goal) ys.push(goal);
  var mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys);
  if (mn === mx) { mn = mn * 0.9; mx = mx * 1.1 || 1; } var pp = (mx - mn) * 0.1; mn -= pp; mx += pp;
  function X(i) { return pts.length === 1 ? (L + (W - L - R) / 2) : L + i * (W - L - R) / (pts.length - 1); }
  function Y(v) { return T + (H - T - B) * (1 - (v - mn) / (mx - mn)); }
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block">';
  for (var g = 0; g < 4; g++) { var v = mn + (mx - mn) * g / 3, yy = Y(v); s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#2c343a"/><text x="' + (L - 4) + '" y="' + (yy + 3) + '" text-anchor="end">' + Math.round(v) + '</text>'; }
  if (goal) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(goal) + '" y2="' + Y(goal) + '" stroke="#f5b84b" stroke-dasharray="4 4"/><text x="' + (W - R) + '" y="' + (Y(goal) - 4) + '" text-anchor="end" style="fill:#f5b84b">goal ' + goal + '</text>';
  s += '<path d="' + pts.map(function (p, i) { return (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(p.y).toFixed(1); }).join("") + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round"/>';
  pts.forEach(function (p, i) { s += '<circle cx="' + X(i) + '" cy="' + Y(p.y) + '" r="3.5" fill="' + color + '"/>'; });
  var step = Math.max(1, Math.ceil(pts.length / 5));
  pts.forEach(function (p, i) { if (i % step === 0 || i === pts.length - 1) s += '<text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + p.x + '</text>'; });
  return s + '</svg>';
}
function barChart(pts, color) {
  var W = 340, H = 160, L = 30, R = 6, T = 12, B = 26, mx = Math.max.apply(null, pts.map(function (p) { return p.y; }).concat([30])), bw = (W - L - R) / pts.length;
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block">';
  [0, 0.5, 1].forEach(function (f) { var yy = T + (H - T - B) * (1 - f); s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#2c343a"/><text x="' + (L - 4) + '" y="' + (yy + 3) + '" text-anchor="end">' + Math.round(mx * f) + '</text>'; });
  pts.forEach(function (p, i) { var h = (H - T - B) * p.y / mx, x = L + i * bw + bw * 0.18; s += '<rect x="' + x + '" y="' + (H - B - h) + '" width="' + (bw * 0.64) + '" height="' + h + '" rx="3" fill="' + color + '"/>'; if (p.y) s += '<text x="' + (x + bw * 0.32) + '" y="' + (H - B - h - 3) + '" text-anchor="middle" style="fill:#eef2f4">' + p.y + '</text>'; s += '<text x="' + (x + bw * 0.32) + '" y="' + (H - 8) + '" text-anchor="middle">' + p.x + '</text>'; });
  return s + '</svg>';
}
function loggedExercises() {
  var seen = {}; Object.keys(S.days).forEach(function (k) { Object.keys(S.days[k].ex || {}).forEach(function (id) { var e = exInfo(id); if (!e.bw && topWeight(S.days[k].ex[id])) seen[id] = e.n; }); });
  return seen;
}
function prList() {
  var best = {};
  Object.keys(S.days).forEach(function (k) {
    var ex = S.days[k].ex || {};
    Object.keys(ex).forEach(function (id) {
      ex[id].forEach(function (s) { if (!s.d || !+s.w) return; var v = e1rm(s.w, s.r); if (!best[id] || v > best[id].e) best[id] = { e: v, w: +s.w, r: +s.r, date: k }; });
    });
  });
  return best;
}
function renderProg() {
  var keys = Object.keys(S.days).sort(), seen = loggedExercises(), ids = Object.keys(seen);
  if (ids.length && ids.indexOf(ui.progEx) < 0) ui.progEx = ids[0];
  var h = '<h2>Lifts</h2><div class="card">';
  if (!ids.length) h += '<div class="mute">Log a weighted set to see progress here.</div>';
  else {
    h += '<select class="field" id="progEx">' + ids.map(function (id) { return '<option value="' + id + '"' + (id === ui.progEx ? " selected" : "") + '>' + esc(seen[id]) + '</option>'; }).join("") + '</select>';
    var pts = [], rows = [];
    keys.forEach(function (k) { var s = (S.days[k].ex || {})[ui.progEx]; if (!s) return; var tw = topWeight(s); if (!tw) return; var vol = s.reduce(function (a, x) { return a + (x.d ? (+x.w || 0) * (+x.r || 0) : 0); }, 0); pts.push({ x: short(k), y: tw }); rows.push({ k: k, s: s, vol: vol }); });
    var chg = pts.length > 1 ? pts[pts.length - 1].y - pts[0].y : null;
    h += '<div class="row between small" style="margin:12px 0 4px"><span class="mute">Top set weight (lb)</span>' + (chg !== null ? '<b style="color:var(--acc)">' + (chg >= 0 ? "+" : "") + chg + ' lb since start</b>' : '') + '</div>';
    h += lineChart(pts.slice(-20), "#3ddc84");
    if (rows.length) { h += '<table style="margin-top:10px"><tr><th>Date</th><th>Sets</th><th>Volume</th></tr>'; rows.slice(-8).reverse().forEach(function (r) { h += '<tr><td>' + short(r.k) + '</td><td>' + r.s.filter(function (x) { return x.d; }).map(function (x) { return x.w + "×" + x.r; }).join(", ") + '</td><td>' + r.vol.toLocaleString() + '</td></tr>'; }); h += '</table><div class="mute small" style="margin-top:6px">Volume = weight × reps, added up over the sets.</div>'; }
  }
  h += '</div>';
  var prs = prList(), pids = Object.keys(prs).filter(function (id) { return !exInfo(id).bw; });
  if (pids.length) {
    h += '<h2>Personal records</h2><div class="card"><table><tr><th>Lift</th><th>Best set</th><th>Est. 1-rep max</th></tr>';
    pids.sort(function (a, b) { return prs[b].e - prs[a].e; }).forEach(function (id) { var p = prs[id]; h += '<tr><td>' + esc(exInfo(id).n) + '</td><td>' + p.w + '×' + p.r + ' <span class="mute small">' + short(p.date) + '</span></td><td>' + p.e + '</td></tr>'; });
    h += '</table></div>';
  }
  var t = todayS(), wk = weekStart(t), bars = [];
  for (var i = 7; i >= 0; i--) { var ws = addDays(wk, -7 * i), sum = 0; for (var j = 0; j < 7; j++) { var d = get(addDays(ws, j)); if (d) sum += (+d.cardioMin || 0); } bars.push({ x: short(ws), y: sum }); }
  h += '<h2>Cardio minutes per week</h2><div class="card">' + barChart(bars, "#5fb3f0") + '</div>';
  var cb = []; for (var ci = 13; ci >= 0; ci--) { var ck = addDays(t, -ci), cc = dayCalories(get(ck)); cb.push({ x: short(ck).split("/")[1], y: cc ? (cc.workout || 0) : 0 }); }
  if (cb.some(function (p) { return p.y; })) h += '<h2>Workout calories, last 14 days</h2><div class="card">' + barChart(cb, "#f5b84b") + '<div class="mute small" style="margin-top:6px">Estimated lifting + cardio calories each day.</div></div>';
  var hk = keys.filter(function (k) { return S.days[k].health; });
  if (hk.length) {
    var rh = hk.filter(function (k) { return S.days[k].health.restingHr; }).map(function (k) { return { x: short(k), y: S.days[k].health.restingHr }; });
    if (rh.length) h += '<h2>Resting heart rate</h2><div class="card">' + lineChart(rh.slice(-30), "#e5675b") + '<div class="mute small" style="margin-top:6px">Trending down over the weeks = your heart is getting fitter.</div></div>';
    var stp = [], slp = [];
    for (var di = 13; di >= 0; di--) { var dk = addDays(t, -di), dh = get(dk) && get(dk).health; stp.push({ x: short(dk), y: dh && dh.steps ? dh.steps : 0 }); slp.push({ x: short(dk), y: dh && dh.sleep ? Math.round(dh.sleep.min / 6) / 10 : 0 }); }
    if (stp.some(function (p) { return p.y; })) h += '<h2>Steps, last 14 days</h2><div class="card">' + barChart(stp.map(function (p) { return { x: p.x.split("/")[1], y: p.y }; }), "#3ddc84") + '</div>';
    if (slp.some(function (p) { return p.y; })) h += '<h2>Sleep hours, last 14 days</h2><div class="card">' + lineChart(slp.filter(function (p) { return p.y; }), "#a78bfa") + '</div>';
  }
  var bwp = keys.filter(function (k) { return S.days[k].bodyWeight; }).map(function (k) { return { x: short(k), y: +S.days[k].bodyWeight }; });
  h += '<h2>Body weight</h2><div class="card">' + lineChart(bwp.slice(-30), "#f5b84b", S.settings.bodyGoal ? +S.settings.bodyGoal : null) + '</div>';
  view.innerHTML = h;
}

// ================= Programs =================
function schedSummary(p) { return [1, 2, 3, 4, 5, 6, 0].map(function (i) { var w = p.schedule[i] || "rest"; return DOW[i] + " " + (w === "rest" ? "Rest" : (/^\d+$/.test(w) ? "#" + w : w)); }).join(" · "); }
function renderPrograms() {
  var a = S.programs[S.activeProgramId], ac = compiled[a.id], h = '';
  var started = S.programHistory.filter(function (x) { return x.programId === a.id; }).map(function (x) { return x.from; }).sort().pop();
  h += '<h2>Current program</h2><div class="card"><div class="row between"><b style="font-size:17px">' + esc(a.name) + '</b><span class="tag">ACTIVE</span></div>';
  h += '<div class="mute small" style="margin-top:4px">' + esc(a.source || "") + (started ? ' · since ' + fmtShort(started) + ', ' + pd(started).getFullYear() : '') + '</div>';
  if (a.notes) h += '<div class="small" style="margin-top:8px">' + esc(a.notes) + '</div>';
  h += '<div class="small mute" style="margin-top:8px">' + esc(schedSummary(a)) + '</div>';
  ac.order.forEach(function (k) { var w = ac.workouts[k], n = 0; w.groups.forEach(function (g) { n += g.ex.length; }); h += '<div class="small" style="margin-top:6px"><b>' + (/^\d+$/.test(k) ? "Workout #" + esc(k) : esc(k)) + '</b> · ' + esc(w.focus) + ' <span class="mute">(' + n + ' exercises)</span></div>'; });
  h += '<div class="row" style="margin-top:12px;gap:8px"><button class="btn sec sm" data-act="pedit" data-id="' + a.id + '">Edit program & schedule</button></div></div>';
  h += '<h2>Program library</h2><div class="card">';
  Object.keys(S.programs).forEach(function (id) {
    var p = S.programs[id];
    h += '<div class="listrow"><div style="min-width:0"><b>' + esc(p.name) + '</b>' + (id === S.activeProgramId ? ' <span class="tag">ACTIVE</span>' : '') + '<div class="mute small">' + esc(p.source || "") + '</div></div><div class="row" style="gap:6px;flex-shrink:0">';
    if (id !== S.activeProgramId && !p.template) h += '<button class="btn sm" data-act="puse" data-id="' + id + '">Use</button>';
    h += '<button class="btn sec sm" data-act="' + (p.template ? "pdup" : "pedit") + '" data-id="' + id + '">' + (p.template ? "Use as start" : "Edit") + '</button></div></div>';
  });
  h += '<button class="btn full" style="margin-top:12px" data-act="pnew">+ New program</button>';
  h += '<div class="mute small" style="margin-top:10px">Starting the next phase of the book? Tap <b>+ New program</b>, type it in (or send Claude a photo of the page and paste in what it gives you), then tap <b>Use</b>. Your history and personal records carry over by exercise name.</div></div>';
  h += '<h2>Program history</h2><div class="card">' + S.programHistory.slice().sort(function (x, y) { return x.from < y.from ? 1 : -1; }).map(function (x) { return '<div class="listrow"><span>' + esc(S.programs[x.programId] ? S.programs[x.programId].name : "(deleted program)") + '</span><span class="mute small">from ' + fmtShort(x.from) + ', ' + pd(x.from).getFullYear() + '</span></div>'; }).join("") + '</div>';
  view.innerHTML = h;
}
function openSheet(html) { document.getElementById("sheetIn").innerHTML = html; document.getElementById("sheet").classList.remove("hidden"); document.getElementById("sheetIn").scrollTop = 0; }
function closeSheet() { document.getElementById("sheet").classList.add("hidden"); document.getElementById("sheetIn").innerHTML = ""; }
document.getElementById("sheet").addEventListener("click", function (e) { if (e.target.id === "sheet") closeSheet(); });

var editing = null;
function openEditor(id, asNew) {
  var src = S.programs[id];
  editing = asNew ? { id: TP.slug(src.name) + "-" + Date.now().toString(36), isNew: true, p: Object.assign(clone(src), { name: src.template ? "My new program" : src.name + " (copy)", builtin: false, template: false, source: src.template ? "" : src.source }) } : { id: id, isNew: false, p: clone(src) };
  var p = editing.p;
  var h = '<div class="row between"><h3>' + (editing.isNew ? "New program" : "Edit program") + '</h3><button class="btn sec sm" data-act="sclose">Cancel</button></div>';
  h += '<div class="lbl">Name</div><input class="field" id="pName" value="' + esc(p.name) + '" style="margin:4px 0 10px">';
  h += '<div class="lbl">Source / notes</div><input class="field" id="pSource" value="' + esc(p.source || "") + '" placeholder="e.g. Book: Level II" style="margin:4px 0 6px"><textarea class="field" id="pNotes" placeholder="Program notes" style="min-height:50px;margin-bottom:10px">' + esc(p.notes || "") + '</textarea>';
  h += '<div class="lbl" style="margin-bottom:6px">Weekly schedule</div><div class="schedgrid" id="pSched"></div>';
  h += '<div class="row" style="margin:10px 0"><span class="lbl" style="flex:1">Default when no reps listed</span><input class="field" id="pDef" value="' + esc(p.defaultSets || "3x8") + '" style="width:90px;text-align:center"></div>';
  h += '<div class="lbl" style="margin:8px 0 4px">Workouts</div>';
  h += '<details class="small mute" style="margin-bottom:6px"><summary>How to write it</summary><div style="margin-top:6px;line-height:1.6"><code>== 1: Chest · Back</code> starts workout "1"<br><code># Chest</code> starts a group. Add <code>(abs)</code> to count toward the Abs habit.<br><code>Bench Press | 3x8</code><br><code>Deadlifts | 10,6,4 | Reps to failure</code><br><code>Chin-Ups | 50 total | bw</code><br><code>Crunches | 5x25 | bw</code> (bw = no weight box)<br><code>== rest: Rest day</code> is optional and sets what shows on rest days.</div></details>';
  h += '<textarea class="field code" id="pText" spellcheck="false" autocapitalize="off" autocomplete="off">' + esc(p.text) + '</textarea>';
  h += '<div id="pCheck" class="small" style="margin:8px 0"></div>';
  h += '<button class="btn full" data-act="psave">Save program</button>';
  if (!editing.isNew && id === "level-1") h += '<button class="btn sec full" style="margin-top:8px" data-act="preset">Reset to the book version</button>';
  if (!editing.isNew && !src.builtin && id !== S.activeProgramId) h += '<button class="btn bad full" style="margin-top:8px" data-act="pdel">Delete program</button>';
  openSheet(h);
  refreshEditor();
}
function refreshEditor() {
  if (!editing) return;
  var text = document.getElementById("pText").value, c = TP.parseProgram(text, { defaultSets: document.getElementById("pDef").value });
  var keys = c.order.concat(["rest"]), sch = editing.p.schedule, box = document.getElementById("pSched"), h = "";
  [1, 2, 3, 4, 5, 6, 0].forEach(function (i) {
    var cur = sch[i] || "rest"; if (keys.indexOf(cur) < 0) cur = "rest";
    h += '<span class="small"><b>' + DOW[i] + '</b></span><select class="field" data-sched="' + i + '">' + keys.map(function (k) { return '<option value="' + esc(k) + '"' + (k === cur ? " selected" : "") + '>' + (k === "rest" ? "Rest" : (/^\d+$/.test(k) ? "Workout #" + esc(k) : esc(k))) + (c.workouts[k] && c.workouts[k].focus ? " · " + esc(c.workouts[k].focus) : "") + '</option>'; }).join("") + '</select>';
  });
  box.innerHTML = h;
  var n = 0; c.order.forEach(function (k) { c.workouts[k].groups.forEach(function (g) { n += g.ex.length; }); });
  document.getElementById("pCheck").innerHTML = c.errors.length ? '<div class="err">' + esc(c.errors.join("\n")) + '</div>' : '<span style="color:var(--acc)">✓ ' + c.order.length + ' workouts, ' + n + ' exercises</span>';
}
function confirmSheet(title, body, okLabel, onOk, danger) {
  openSheet('<h3>' + esc(title) + '</h3><div class="small" style="margin-bottom:14px">' + body + '</div><div class="row" style="gap:8px"><button class="btn sec" style="flex:1" data-act="sclose">Cancel</button><button class="btn' + (danger ? " bad" : "") + '" style="flex:1" data-act="sok">' + esc(okLabel) + '</button></div>');
  confirmSheet.ok = onOk;
}
function useProgram(id) {
  var p = S.programs[id], t = todayS();
  openSheet('<h3>Start ' + esc(p.name) + '?</h3><div class="small mute" style="margin-bottom:10px">Your logged sessions, calendar and records stay. Days from the start date on follow the new program.</div><div class="lbl">Start date</div><input type="date" class="field" id="useFrom" value="' + t + '" style="margin:4px 0 14px"><div class="row" style="gap:8px"><button class="btn sec" style="flex:1" data-act="sclose">Cancel</button><button class="btn" style="flex:1" data-act="useok" data-id="' + id + '">Start program</button></div>');
}

// ================= More / settings / report =================
function renderMore() {
  var st = S.settings, h = '';
  var ro = repOpts(), rr = repRange(ro);
  h += '<h2>PDF report</h2><div class="card"><div class="small mute" style="margin-bottom:10px">Pick the dates, workouts, exercises and sections you want. The PDF saves to your phone\'s <b>Downloads/TrainingLog</b> folder and you can open or send it straight away.</div>';
  h += '<div class="small" style="margin-bottom:10px">Last used: <b>' + esc(ro.title || "Training Report") + '</b> · ' + fmtShort(rr[0]) + ' → ' + fmtShort(rr[1]) + '</div>';
  h += '<button class="btn full" data-act="openreport">Build a PDF report</button></div>';

  h += '<h2>Rest timer</h2><div class="card"><label class="sw"><span>Start a rest timer when I tick a set</span><input type="checkbox" id="restOn"' + (st.restOn ? " checked" : "") + '></label>';
  h += '<div class="row between" style="padding:6px 0"><span class="small">Normal sets (seconds)</span><input class="field" type="number" id="restSec" value="' + st.restSec + '" style="width:90px;text-align:center"></div>';
  h += '<div class="row between" style="padding:6px 0"><span class="small">Power / to-failure sets (seconds)</span><input class="field" type="number" id="restPowerSec" value="' + st.restPowerSec + '" style="width:90px;text-align:center"></div></div>';

  h += '<h2>Gym reminders</h2><div class="card"><label class="sw"><span>Remind me on workout days</span><input type="checkbox" id="remindOn"' + (st.remindOn ? " checked" : "") + '></label>';
  h += '<div class="row between" style="padding:6px 0"><span class="small">Time</span><input class="field" type="time" id="remindTime" value="' + st.remindTime + '" style="width:130px"></div><div class="daypick" style="margin-top:6px">';
  [0, 1, 2, 3, 4, 5, 6].forEach(function (i) { h += '<button data-act="rday" data-v="' + i + '" class="' + (st.remindDays.indexOf(i) >= 0 ? "on" : "") + '">' + DOW[i].slice(0, 2) + '</button>'; });
  h += '</div>' + (isNative ? "" : '<div class="small mute" style="margin-top:8px">Reminders work in the installed Android app.</div>') + '</div>';

  h += '<h2>Samsung Health</h2><div class="card">';
  if (!isNative || !H) h += '<div class="small mute">Works in the installed Android app. It reads heart rate, sleep, steps, blood oxygen, weight and workouts from Samsung Health through Health Connect.</div>';
  else if (!st.healthOn) h += '<div class="small" style="line-height:1.6;margin-bottom:10px">Pull in your heart rate, resting HR, HRV, blood oxygen, sleep, steps, calories, weight and the workouts your watch records.<br><br><b>First, in Samsung Health:</b> ⋮ → Settings → <b>Health Connect</b>, and allow Samsung Health to share your data.</div><button class="btn full" data-act="hconnect">Connect Samsung Health</button>';
  else h += '<div class="row between"><span>✅ Connected</span><span class="small mute">' + ((st.healthGranted || []).length) + ' data types allowed</span></div><div class="small mute" style="margin:6px 0 10px">Each day syncs when you open it. Cardio and body weight fill in automatically if you haven\'t entered them.</div><div class="row wrap" style="gap:8px"><button class="btn sec sm" data-act="hback">Re-sync last 30 days</button><button class="btn sec sm" data-act="hperm">Permissions</button><button class="btn sec sm" data-act="hoff">Disconnect</button></div>';
  h += '</div>';

  h += '<h2>Profile</h2><div class="card"><div class="row between" style="padding:4px 0"><span class="small">Name on reports</span><input class="field" id="pfName" value="' + esc(st.name || "") + '" style="width:60%"></div><div class="row between" style="padding:4px 0"><span class="small">Age</span><input class="field" type="number" id="pfAge" value="' + (st.age || "") + '" placeholder="needed for calories" style="width:170px;text-align:center"></div><div class="row between" style="padding:4px 0"><span class="small">Sex</span><select class="field" id="pfSex" style="width:170px"><option value="M"' + (st.sex !== "F" ? " selected" : "") + '>Male</option><option value="F"' + (st.sex === "F" ? " selected" : "") + '>Female</option></select></div><div class="row between" style="padding:4px 0"><span class="small">Height (inches)</span><input class="field" type="number" id="pfHeight" value="' + (st.heightIn || "") + '" style="width:170px;text-align:center"></div><div class="row between" style="padding:4px 0"><span class="small">Starting weight (lb)</span><input class="field" type="number" id="pfWeight" value="' + (st.weightLb || "") + '" style="width:170px;text-align:center"></div><div class="row between" style="padding:4px 0"><span class="small">Body weight goal (lb)</span><input class="field" type="number" id="bodyGoal" value="' + (st.bodyGoal || "") + '" placeholder="optional" style="width:110px;text-align:center"></div></div>';

  h += '<h2>Backup</h2><div class="card"><div class="small mute" style="margin-bottom:10px">Your data lives on this phone. Export a backup now and then (to Google Drive or email) so a lost phone doesn\'t mean a lost log.</div><div class="row" style="gap:8px"><button class="btn sec" style="flex:1" data-act="export">Export backup</button><button class="btn sec" style="flex:1" data-act="import">Import backup</button></div><input type="file" id="importFile" accept="application/json,.json" class="hidden"></div>';
  h += '<div class="mute small" style="text-align:center;margin-top:16px">Training Log v' + APP_VERSION + '</div>';
  view.innerHTML = h;
}

function scheduleReminders() {
  if (!isNative || !P.LocalNotifications) return Promise.resolve();
  var LN = P.LocalNotifications, ids = [101, 102, 103, 104, 105, 106, 107];
  return LN.cancel({ notifications: ids.map(function (id) { return { id: id }; }) }).catch(function () { }).then(function () {
    if (!S.settings.remindOn) return;
    var tm = S.settings.remindTime.split(":"), prog = S.programs[S.activeProgramId], c = compiled[prog.id];
    var list = S.settings.remindDays.map(function (dow) {
      var w = prog.schedule[dow] || "rest", W = c.workouts[w];
      var body = w === "rest" ? "Rest day. Get your abs and a walk in." : ((/^\d+$/.test(w) ? "Workout #" + w : w) + (W && W.focus ? ": " + W.focus : "") + ". Keep the streak alive.");
      return { id: 101 + dow, title: "Gym time 💪", body: body, schedule: { on: { weekday: dow + 1, hour: +tm[0], minute: +tm[1] }, allowWhileIdle: true } };
    });
    return LN.schedule({ notifications: list });
  }).catch(function (e) { toast("Couldn't set reminders: " + (e && e.message || e)); });
}
function ensureNotifPerm() {
  if (!isNative || !P.LocalNotifications) return Promise.resolve(true);
  return P.LocalNotifications.checkPermissions().then(function (p) { if (p.display === "granted") return true; return P.LocalNotifications.requestPermissions().then(function (r) { return r.display === "granted"; }); }).catch(function () { return false; });
}

// ---------- files ----------
function shareFile(name, b64OrText, mime, isText) {
  if (isNative && P.Filesystem && P.Share) {
    var opts = { path: name, data: b64OrText, directory: "CACHE" }; if (isText) opts.encoding = "utf8";
    return P.Filesystem.writeFile(opts).then(function (r) {
      var saved = Object.assign({}, opts, { path: "TrainingLog/" + name, directory: "DOCUMENTS", recursive: true });
      P.Filesystem.writeFile(saved).then(function () { toast("Saved to Documents/TrainingLog"); }).catch(function () { });
      return P.Share.share({ title: name, files: [r.uri], dialogTitle: "Save or send " + name });
    }).catch(function (e) { if (!/cancel/i.test(String(e && e.message))) toast("Couldn't share: " + (e && e.message || e)); });
  }
  var blob = isText ? new Blob([b64OrText], { type: mime }) : new Blob([Uint8Array.from(atob(b64OrText), function (c) { return c.charCodeAt(0); })], { type: mime });
  var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  return Promise.resolve();
}

// ================= PDF report =================
var REPORT_SECTIONS = [
  ["summary", "Summary tiles", "Workouts done, success rate, streak, cardio, body weight"],
  ["calendar", "Success calendar", "Colour-coded days for the range"],
  ["lifts", "Lift progress table", "First vs last top set, change, best set, volume"],
  ["charts", "Lift progress charts", "A small chart of top weight for each lift"],
  ["prs", "Personal records", "Best set and estimated 1-rep max per lift"],
  ["cardio", "Cardio", "Minutes by type"],
  ["calories", "Calories burned", "Workout and whole-day estimates"],
  ["bodyweight", "Body weight", "Start, latest and a trend chart"],
  ["health", "Samsung Health stats", "Heart rate, steps, sleep, blood oxygen, watch workouts"],
  ["log", "Session-by-session log", "Every set of every day"],
  ["hr", "Heart rate & calories per exercise", "Shown in the session log"],
  ["notes", "Your notes", "Shown in the session log"]
];
var REPORT_PRESETS = {
  full: { label: "Full report", on: ["summary", "calendar", "lifts", "charts", "prs", "cardio", "calories", "bodyweight", "health", "log", "hr", "notes"] },
  summary: { label: "1-page summary", on: ["summary", "calendar", "lifts", "cardio", "bodyweight"] },
  lifts: { label: "Lifts only", on: ["lifts", "charts", "prs", "log", "hr"] },
  health: { label: "Health & cardio", on: ["summary", "cardio", "calories", "bodyweight", "health"] }
};
var RANGES = [["7", "Last 7 days"], ["30", "Last 30 days"], ["thisweek", "This week"], ["month", "This month"], ["lastmonth", "Last month"], ["90", "Last 90 days"], ["all", "All time"], ["custom", "Custom dates"]];

function repOpts() {
  var r = S.settings.report;
  if (!r) {
    r = S.settings.report = { range: "30", from: addDays(todayS(), -29), to: todayS(), title: "Training Report", preset: "full", sections: {}, exExclude: [], wkExclude: [], cardioExclude: [] };
    REPORT_PRESETS.full.on.forEach(function (k) { r.sections[k] = true; });
  }
  return r;
}
function repRange(r) {
  var t = todayS(), keys = Object.keys(S.days).sort(), d = pd(t);
  switch (r.range) {
    case "7": return [addDays(t, -6), t];
    case "30": return [addDays(t, -29), t];
    case "90": return [addDays(t, -89), t];
    case "thisweek": return [weekStart(t), t];
    case "month": return [t.slice(0, 8) + "01", t];
    case "lastmonth": var a = new Date(d.getFullYear(), d.getMonth() - 1, 1), b = new Date(d.getFullYear(), d.getMonth(), 0); return [ds(a), ds(b)];
    case "all": return [startDate() < (keys[0] || t) ? startDate() : (keys[0] || t), t];
  }
  var f = r.from || addDays(t, -29), to = r.to || t;
  return f <= to ? [f, to] : [to, f];
}
function datesIn(from, to) { var out = []; for (var s = from; s <= to; s = addDays(s, 1)) out.push(s); return out; }
function dayWk(s) { var d = get(s); return d ? d.workout : scheduledWorkout(s); }
function wkLabel(w) { return w === "rest" ? "Rest days" : (/^\d+$/.test(w) ? "Workout #" + w : w); }
// what exists in a range, for the filter lists
function rangeInventory(from, to, r) {
  var wks = {}, exs = {}, cts = {};
  datesIn(from, to).forEach(function (s) {
    var d = get(s), w = dayWk(s);
    if (d && (score(d) || Object.keys(d.ex || {}).length)) wks[w] = (wks[w] || 0) + 1;
    if (!d) return;
    if (r && r.wkExclude.indexOf(w) >= 0) return;
    Object.keys(d.ex || {}).forEach(function (id) { if (d.ex[id].some(function (x) { return x.d; })) exs[id] = (exs[id] || 0) + 1; });
    if (+d.cardioMin > 0) cts[d.cardioType] = (cts[d.cardioType] || 0) + 1;
  });
  return { wks: wks, exs: exs, cts: cts };
}

function openReportBuilder() { renderReportSheet(); document.getElementById("sheet").classList.remove("hidden"); document.getElementById("sheetIn").scrollTop = 0; }
function renderReportSheet() {
  var r = repOpts(), rg = repRange(r), inv = rangeInventory(rg[0], rg[1], r), box = document.getElementById("sheetIn"), keep = box.scrollTop;
  var h = '<div class="row between"><h3>PDF report</h3><button class="btn sec sm" data-act="sclose">Close</button></div>';
  h += '<div class="lbl" style="margin:6px 0">Start from</div><div class="chips">';
  Object.keys(REPORT_PRESETS).forEach(function (k) { h += '<button class="chip' + (r.preset === k ? " on" : "") + '" data-act="rpreset" data-v="' + k + '">' + REPORT_PRESETS[k].label + '</button>'; });
  h += '</div>';
  h += '<div class="lbl" style="margin:14px 0 6px">Date range</div><div class="chips">';
  RANGES.forEach(function (x) { h += '<button class="chip' + (r.range === x[0] ? " on" : "") + '" data-act="rrange2" data-v="' + x[0] + '">' + x[1] + '</button>'; });
  h += '</div>';
  if (r.range === "custom") h += '<div class="grid2" style="margin-top:8px"><div><div class="lbl">From</div><input type="date" class="field" id="rpFrom" value="' + rg[0] + '"></div><div><div class="lbl">To</div><input type="date" class="field" id="rpTo" value="' + rg[1] + '"></div></div>';
  h += '<div class="small mute" style="margin-top:6px">' + fmtLong(rg[0]) + ', ' + pd(rg[0]).getFullYear() + ' → ' + fmtLong(rg[1]) + ', ' + pd(rg[1]).getFullYear() + ' (' + (daysBetween(rg[0], rg[1]) + 1) + ' days)</div>';

  h += '<div class="lbl" style="margin:14px 0 6px">Title</div><input class="field" id="rpTitle" value="' + esc(r.title || "Training Report") + '">';

  h += '<div class="lbl" style="margin:14px 0 2px">What to include</div>';
  REPORT_SECTIONS.forEach(function (sx) { h += '<label class="sw"><span><span class="small"><b>' + sx[1] + '</b></span><br><span class="small mute">' + sx[2] + '</span></span><input type="checkbox" data-rsec="' + sx[0] + '"' + (r.sections[sx[0]] ? " checked" : "") + '></label>'; });

  var wk = Object.keys(inv.wks).sort();
  if (wk.length) {
    h += '<div class="lbl" style="margin:14px 0 6px">Workouts</div><div class="chips">';
    wk.forEach(function (w) { h += '<button class="chip' + (r.wkExclude.indexOf(w) < 0 ? " on" : "") + '" data-act="rwk" data-v="' + esc(w) + '">' + esc(wkLabel(w)) + ' <span class="mute">· ' + inv.wks[w] + (inv.wks[w] === 1 ? " day" : " days") + '</span></button>'; });
    h += '</div>';
  }
  var exIds = Object.keys(inv.exs).sort(function (a, b) { return exInfo(a).n < exInfo(b).n ? -1 : 1; });
  h += '<div class="row between" style="margin:14px 0 4px"><span class="lbl">Exercises</span><span class="row" style="gap:6px"><button class="btn sec sm" data-act="rexall">All</button><button class="btn sec sm" data-act="rexnone">None</button></span></div>';
  if (!exIds.length) h += '<div class="small mute">No exercises logged in this range.</div>';
  exIds.forEach(function (id) { h += '<label class="sw"><span class="small">' + esc(exInfo(id).n) + ' <span class="mute">· ' + inv.exs[id] + (inv.exs[id] === 1 ? " session" : " sessions") + '</span></span><input type="checkbox" data-rex="' + id + '"' + (r.exExclude.indexOf(id) < 0 ? " checked" : "") + '></label>'; });
  var ct = Object.keys(inv.cts).sort();
  if (ct.length) {
    h += '<div class="lbl" style="margin:14px 0 6px">Cardio types</div><div class="chips">';
    ct.forEach(function (c) { h += '<button class="chip' + (r.cardioExclude.indexOf(c) < 0 ? " on" : "") + '" data-act="rct" data-v="' + esc(c) + '">' + esc(c) + '</button>'; });
    h += '</div>';
  }
  var nEx = exIds.filter(function (id) { return r.exExclude.indexOf(id) < 0; }).length, nSec = REPORT_SECTIONS.filter(function (sx) { return r.sections[sx[0]]; }).length;
  h += '<div class="card" style="margin:16px 0 10px;background:var(--card2)"><div class="small">' + nSec + ' sections · ' + nEx + ' of ' + exIds.length + ' exercises' + (r.wkExclude.length ? ' · some workouts hidden' : '') + '</div></div>';
  h += '<button class="btn full" data-act="rmake" ' + (nSec ? "" : "disabled") + '>Create PDF & save to Downloads</button>';
  box.innerHTML = h; box.scrollTop = keep;
}
function reportSheetAct(act, b) {
  var r = repOpts(), v = b.getAttribute("data-v");
  if (act === "rpreset") { r.preset = v; r.sections = {}; REPORT_PRESETS[v].on.forEach(function (k) { r.sections[k] = true; }); if (v === "summary" && (r.range === "all" || r.range === "90")) r.range = "30"; }
  else if (act === "rrange2") { r.range = v; if (v === "custom") { var rg = repRange({ range: "30" }); r.from = r.from || rg[0]; r.to = r.to || rg[1]; } }
  else if (act === "rwk") { var i = r.wkExclude.indexOf(v); if (i >= 0) r.wkExclude.splice(i, 1); else r.wkExclude.push(v); }
  else if (act === "rct") { var j = r.cardioExclude.indexOf(v); if (j >= 0) r.cardioExclude.splice(j, 1); else r.cardioExclude.push(v); }
  else if (act === "rexall") r.exExclude = [];
  else if (act === "rexnone") { var rg2 = repRange(r); r.exExclude = Object.keys(rangeInventory(rg2[0], rg2[1], r).exs); }
  else if (act === "rmake") return makeReport2(b);
  save(); renderReportSheet();
}
document.getElementById("sheetIn").addEventListener("change", function (ev) {
  var t = ev.target, r = S && S.settings.report; if (!r) return;
  if (t.hasAttribute("data-rsec")) { r.sections[t.getAttribute("data-rsec")] = t.checked; r.preset = ""; save(); renderReportSheet(); }
  else if (t.hasAttribute("data-rex")) { var id = t.getAttribute("data-rex"), i = r.exExclude.indexOf(id); if (t.checked && i >= 0) r.exExclude.splice(i, 1); if (!t.checked && i < 0) r.exExclude.push(id); save(); renderReportSheet(); }
  else if (t.id === "rpFrom") { r.from = t.value; save(); renderReportSheet(); }
  else if (t.id === "rpTo") { r.to = t.value; save(); renderReportSheet(); }
});
document.getElementById("sheetIn").addEventListener("input", function (ev) { var r = S && S.settings.report; if (r && ev.target.id === "rpTitle") { r.title = ev.target.value; save(); } });

function makeReport2(btn) {
  var r = repOpts(), rg = repRange(r);
  btn.disabled = true; btn.textContent = "Building report…";
  setTimeout(function () {
    var doc, name;
    try {
      doc = buildReport({ from: rg[0], to: rg[1], title: r.title || "Training Report", sec: r.sections, exExclude: r.exExclude, wkExclude: r.wkExclude, cardioExclude: r.cardioExclude });
      name = (r.title || "Training Report").replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-") + "_" + rg[0] + "_to_" + rg[1] + ".pdf";
    } catch (e) { btn.disabled = false; btn.textContent = "Create PDF & save to Downloads"; toast("Report failed: " + e.message); console.error(e); return; }
    var b64 = doc.output("datauristring").split(",")[1], pages = doc.getNumberOfPages();
    savePdf(name, b64).then(function (res) { showSaved(name, b64, res, pages); }).catch(function (e) {
      showSaved(name, b64, null, pages, e && e.message);
    });
  }, 30);
}
// Save to the phone's Downloads/TrainingLog folder (native) or download (browser)
function savePdf(name, b64) {
  if (isNative && P.SaveFile) return P.SaveFile.saveToDownloads({ filename: name, data: b64, mimeType: "application/pdf" });
  if (isNative) return Promise.reject(new Error("Saving isn't available on this phone"));
  var blob = new Blob([Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); })], { type: "application/pdf" });
  var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  return Promise.resolve({ path: "your Downloads folder", uri: null, browser: true });
}
var lastPdf = null;
function showSaved(name, b64, res, pages, err) {
  lastPdf = { name: name, b64: b64, uri: res && res.uri };
  var h = '<h3>' + (res ? "✅ Report saved" : "Report ready") + '</h3>';
  h += '<div class="small" style="margin-bottom:6px"><b>' + esc(name) + '</b> · ' + pages + (pages === 1 ? " page" : " pages") + '</div>';
  if (res) h += '<div class="small mute" style="margin-bottom:14px">Saved to <b>' + esc(res.path) + '</b>. You\'ll also find it in the <b>My Files</b> app under Downloads.</div>';
  else h += '<div class="small err" style="margin-bottom:14px">Couldn\'t save to Downloads' + (err ? " (" + esc(err) + ")" : "") + '. Use Share to save it to Drive, email it, or save it to your files.</div>';
  if (res && res.uri) h += '<button class="btn full" data-act="ropen">Open PDF</button>';
  h += '<button class="btn ' + (res && res.uri ? "sec " : "") + 'full" style="margin-top:8px" data-act="rshare">Share / email / save to Drive</button>';
  h += '<button class="btn sec full" style="margin-top:8px" data-act="rback">Back to report options</button>';
  openSheet(h);
}
function sharePdf() {
  if (!lastPdf) return;
  if (isNative && P.Filesystem && P.Share) return P.Filesystem.writeFile({ path: lastPdf.name, data: lastPdf.b64, directory: "CACHE" }).then(function (w) { return P.Share.share({ title: lastPdf.name, files: [w.uri], dialogTitle: "Send " + lastPdf.name }); }).catch(function (e) { if (!/cancel/i.test(String(e && e.message))) toast("Couldn't share: " + (e && e.message || e)); });
  savePdf(lastPdf.name, lastPdf.b64);
}

function pdfText(s) { return String(s == null ? "" : s).replace(/[✓✔]/g, "Y").replace(/→/g, "->").replace(/[−–]/g, "-").replace(/[^\x00-\xFF—·×…’‘“”•]/g, ""); }

function buildReport(o) {
  if (typeof o === "string") o = { from: arguments[0], to: arguments[1], sec: null }; // old signature (tests)
  var sec = o.sec || {}; if (!o.sec) REPORT_PRESETS.full.on.forEach(function (k) { sec[k] = true; });
  var exX = o.exExclude || [], wkX = o.wkExclude || [], ctX = o.cardioExclude || [];
  function exOk(id) { return exX.indexOf(id) < 0; }
  function ctOk(c) { return ctX.indexOf(c) < 0; }
  var from = o.from, to = o.to;
  var jsPDF = window.jspdf.jsPDF, doc = new jsPDF({ unit: "pt", format: "letter" });
  var PW = 612, M = 40, y = 0, CW = PW - 2 * M;
  var G = [61, 220, 132], DK = [20, 30, 26], MU = [110, 120, 128], LN = [220, 225, 228];
  function fill(c) { doc.setFillColor(c[0], c[1], c[2]); }
  function col(c) { doc.setTextColor(c[0], c[1], c[2]); }
  function font(sz, st) { doc.setFont("helvetica", st || "normal"); doc.setFontSize(sz); }
  function need(h) { if (y + h > 752) { doc.addPage(); y = 50; } }
  function heading(t) { need(70); y += 14; font(13, "bold"); col(DK); doc.text(pdfText(t), M, y); y += 6; doc.setDrawColor(G[0], G[1], G[2]); doc.setLineWidth(1.5); doc.line(M, y, M + 40, y); y += 14; }
  function para(t, sz, c) { font(sz || 10, "normal"); col(c || DK); doc.splitTextToSize(pdfText(t), CW).forEach(function (l) { need(14); doc.text(l, M, y); y += 13; }); }
  function table(cols, rows, widths) {
    var x0 = M, rh = 16;
    function head() { need(rh + 4); font(8.5, "bold"); col(MU); var x = x0; cols.forEach(function (c, i) { doc.text(pdfText(c).toUpperCase(), x + 2, y); x += widths[i]; }); y += 5; doc.setDrawColor(LN[0], LN[1], LN[2]); doc.setLineWidth(0.6); doc.line(M, y, M + CW, y); y += 11; }
    head();
    rows.forEach(function (r) {
      font(9.5, "normal"); col(DK);
      var lines = r.map(function (c, i) { return doc.splitTextToSize(pdfText(c), widths[i] - 6); }), n = Math.max.apply(null, lines.map(function (l) { return l.length; })), h = n * 12 + 4;
      if (y + h > 752) { doc.addPage(); y = 50; head(); font(9.5, "normal"); col(DK); }
      var x = x0; lines.forEach(function (l, i) { doc.text(l, x + 2, y); x += widths[i]; }); y += h - 4; doc.setDrawColor(238, 240, 242); doc.line(M, y - 6, M + CW, y - 6); y += 6;
    });
    y += 4;
  }
  function miniChart(x, yy, w, h, title, pts, color, unit) {
    fill([248, 250, 249]); doc.roundedRect(x, yy, w, h, 5, 5, "F");
    font(9, "bold"); col(DK); doc.text(pdfText(title), x + 8, yy + 14);
    var ch = pts.length > 1 ? (pts[pts.length - 1].y - pts[0].y) : 0;
    font(8.5, "bold"); doc.setTextColor(20, 120, 70); doc.text(pdfText((ch > 0 ? "+" : "") + ch + " " + unit), x + w - 8, yy + 14, { align: "right" });
    var px = x + 30, py = yy + 24, pw = w - 40, ph = h - 44, ys = pts.map(function (p) { return p.y; }), mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys);
    if (mn === mx) { mn -= 5; mx += 5; }
    font(7); col(MU); doc.text(String(mx), px - 4, py + 4, { align: "right" }); doc.text(String(mn), px - 4, py + ph, { align: "right" });
    doc.setDrawColor(LN[0], LN[1], LN[2]); doc.setLineWidth(0.4); doc.line(px, py, px + pw, py); doc.line(px, py + ph, px + pw, py + ph);
    var X = function (i) { return pts.length === 1 ? px + pw / 2 : px + pw * i / (pts.length - 1); }, Y = function (v) { return py + ph * (1 - (v - mn) / (mx - mn)); };
    doc.setDrawColor(color[0], color[1], color[2]); doc.setLineWidth(1.6);
    for (var i = 1; i < pts.length; i++) doc.line(X(i - 1), Y(pts[i - 1].y), X(i), Y(pts[i].y));
    fill(color); pts.forEach(function (p, i) { doc.circle(X(i), Y(p.y), 1.8, "F"); });
    font(7); col(MU); doc.text(pdfText(pts[0].x), px, yy + h - 7); if (pts.length > 1) doc.text(pdfText(pts[pts.length - 1].x), px + pw, yy + h - 7, { align: "right" });
  }

  // which days are in the report
  var all = datesIn(from, to), t = todayS();
  var dates = all.filter(function (s) { return wkX.indexOf(dayWk(s)) < 0; });
  var sched = 0, done = 0, cardio = 0, cardioN = 0, perfect = 0, absN = 0, types = {}, bws = [];
  dates.forEach(function (s) {
    var d = get(s), rest = isRestDay(s);
    if (!rest && s <= t && tracked(s)) sched++;
    if (d) {
      if (d.liftDone) done++;
      if (+d.cardioMin > 0 && ctOk(d.cardioType)) { cardio += +d.cardioMin; cardioN++; types[d.cardioType] = (types[d.cardioType] || 0) + (+d.cardioMin); }
      if (score(d) === 3) perfect++; if (d.absDone) absN++;
      var bw = d.bodyWeight || (d.health && d.health.weightLb); if (bw) bws.push({ d: s, w: +bw });
    }
  });
  var progs = {}; dates.forEach(function (s) { var d = get(s); progs[d ? d.programId : programOnDate(s)] = 1; });
  var progNames = Object.keys(progs).filter(function (id) { return S.programs[id]; }).map(function (id) { return S.programs[id].name; }).join(", ");
  var exIds = {}; dates.forEach(function (s) { var d = get(s); if (d) Object.keys(d.ex || {}).forEach(function (id) { if (exOk(id) && d.ex[id].some(function (x) { return x.d; })) exIds[id] = 1; }); });
  var exList = Object.keys(exIds).sort(function (a, b) { return exInfo(a).n < exInfo(b).n ? -1 : 1; });
  function sessOf(id) { return dates.filter(function (s) { var d = get(s); return d && d.ex && d.ex[id] && d.ex[id].some(function (x) { return x.d; }); }); }

  // header band
  fill([15, 18, 20]); doc.rect(0, 0, PW, 96, "F");
  fill(G); doc.rect(0, 96, PW, 4, "F");
  font(22, "bold"); doc.setTextColor(255, 255, 255); doc.text(pdfText(o.title || "Training Report"), M, 40);
  font(11, "normal"); doc.setTextColor(190, 200, 205);
  doc.text(pdfText((S.settings.name ? S.settings.name + "  ·  " : "") + fmtLong(from) + ", " + pd(from).getFullYear() + "  to  " + fmtLong(to) + ", " + pd(to).getFullYear()), M, 60);
  doc.text(pdfText("Program: " + (progNames || "-")), M, 75);
  var filt = []; if (wkX.length) filt.push("workouts: " + Object.keys(dates.reduce(function (a, s) { a[wkLabel(dayWk(s))] = 1; return a; }, {})).join(", "));
  if (exX.length) filt.push(exList.length + " selected exercises"); if (ctX.length) filt.push("some cardio types hidden");
  if (filt.length) { font(9); doc.text(pdfText("Filtered - " + filt.join("; ")), M, 89); }
  font(9, "normal"); doc.setTextColor(190, 200, 205); doc.text(pdfText("Generated " + fmtShort(t) + ", " + pd(t).getFullYear()), PW - M, 40, { align: "right" });
  y = 124;

  if (sec.summary) {
    var rate = sched ? Math.round(done / sched * 100) : 0;
    var bwTxt = bws.length > 1 ? ((bws[bws.length - 1].w - bws[0].w > 0 ? "+" : "") + (bws[bws.length - 1].w - bws[0].w).toFixed(1) + " lb") : (bws.length ? bws[0].w + " lb" : "-");
    var tiles = [[done + " / " + sched, "Workouts done"], [rate + "%", "Success rate"], [String(streak()), "Current streak"], [String(cardio), "Cardio minutes"], [String(perfect), "Perfect days (all 3)"], [bwTxt, bws.length > 1 ? "Body weight change" : "Body weight"]];
    var tw = (CW - 2 * 10) / 3, th = 54;
    tiles.forEach(function (tl, i) {
      var x = M + (i % 3) * (tw + 10), yy = y + Math.floor(i / 3) * (th + 10);
      fill([244, 247, 245]); doc.roundedRect(x, yy, tw, th, 6, 6, "F");
      font(18, "bold"); col([20, 120, 70]); doc.text(pdfText(tl[0]), x + 12, yy + 26);
      font(9, "normal"); col(MU); doc.text(pdfText(tl[1]), x + 12, yy + 42);
    });
    y += 2 * th + 10 + 16;
  }

  if (sec.calendar) {
    heading("Success calendar");
    var start = weekStart(from), cell = 22, gap = 4, gx = M + 46;
    font(8, "bold"); col(MU); ["M", "T", "W", "T", "F", "S", "S"].forEach(function (l, i) { doc.text(l, gx + i * (cell + gap) + cell / 2, y, { align: "center" }); });
    y += 8;
    for (var w = start; w <= to; w = addDays(w, 7)) {
      need(cell + gap);
      font(8, "normal"); col(MU); doc.text(pdfText(fmtShort(w)), M, y + 14);
      for (var i = 0; i < 7; i++) {
        var dd = addDays(w, i), x = gx + i * (cell + gap);
        if (dd < from || dd > to) continue;
        var d = get(dd), sc = score(d), rest = isRestDay(dd);
        var c = sc === 3 ? G : sc === 2 ? [46, 150, 92] : sc === 1 ? [170, 220, 190] : rest ? [236, 238, 240] : (dd < t && tracked(dd)) ? [245, 196, 190] : [248, 249, 250];
        fill(c); doc.roundedRect(x, y, cell, cell, 3, 3, "F");
        font(7.5, "bold"); doc.setTextColor(sc >= 2 ? 255 : 60, sc >= 2 ? 255 : 70, sc >= 2 ? 255 : 76); doc.text(String(pd(dd).getDate()), x + cell / 2, y + 14, { align: "center" });
      }
      y += cell + gap;
    }
    y += 4; font(8, "normal"); col(MU);
    var lx = M; [[G, "All 3 habits"], [[46, 150, 92], "2 of 3"], [[170, 220, 190], "1 of 3"], [[245, 196, 190], "Missed"], [[236, 238, 240], "Rest"]].forEach(function (l) { fill(l[0]); doc.rect(lx, y - 7, 9, 9, "F"); doc.text(l[1], lx + 13, y); lx += 22 + doc.getTextWidth(l[1]) + 10; });
    y += 14;
    font(9, "normal"); col(DK); doc.text(pdfText("Habits hit: Lift " + done + "  ·  Cardio " + cardioN + "  ·  Abs " + absN + " days"), M, y); y += 8;
  }

  var weighted = exList.filter(function (id) { var e = exInfo(id); return !e.bw && sessOf(id).some(function (s) { return topWeight(get(s).ex[id]); }); });
  var bodyw = exList.filter(function (id) { return weighted.indexOf(id) < 0; });
  if (sec.lifts) {
    heading("Lift progress");
    var liftRows = weighted.map(function (id) {
      var e = exInfo(id), sess = sessOf(id), tws = sess.map(function (s) { return topWeight(get(s).ex[id]); }).filter(Boolean), best = 0, bestS = "";
      sess.forEach(function (s) { get(s).ex[id].forEach(function (x) { var v = e1rm(x.w, x.r); if (x.d && v > best) { best = v; bestS = x.w + "×" + x.r; } }); });
      var vol = sess.reduce(function (a, s) { return a + get(s).ex[id].reduce(function (b, x) { return b + (x.d ? (+x.w || 0) * (+x.r || 0) : 0); }, 0); }, 0), ch = tws[tws.length - 1] - tws[0];
      return [e.n, String(sess.length), tws[0] + " lb", tws[tws.length - 1] + " lb", (ch > 0 ? "+" : "") + ch + " lb", bestS + " (~" + best + ")", vol.toLocaleString()];
    });
    if (liftRows.length) table(["Exercise", "Sessions", "First top set", "Last top set", "Change", "Best set (est. 1RM)", "Volume lb"], liftRows, [128, 48, 66, 66, 52, 110, 62]);
    else para("No weighted lifts in this selection.", 10, MU);
    if (bodyw.length) {
      y += 4;
      table(["Bodyweight exercise", "Sessions", "First", "Last", "Best day"], bodyw.map(function (id) { var sess = sessOf(id), tot = sess.map(function (s) { return get(s).ex[id].reduce(function (a, x) { return a + (x.d ? (+x.r || 0) : 0); }, 0); }); return [exInfo(id).n, String(sess.length), tot[0] + " reps", tot[tot.length - 1] + " reps", Math.max.apply(null, tot) + " reps"]; }), [168, 70, 80, 80, 134]);
    }
  }

  if (sec.charts && weighted.length) {
    heading("Lift progress charts");
    var cw2 = (CW - 12) / 2, chH = 120, n = 0;
    weighted.forEach(function (id) {
      var pts = sessOf(id).map(function (s) { return { x: fmtShort(s), y: topWeight(get(s).ex[id]) }; }).filter(function (p) { return p.y; });
      if (!pts.length) return;
      if (n % 2 === 0) need(chH + 10);
      miniChart(M + (n % 2) * (cw2 + 12), y, cw2, chH, exInfo(id).n + " - top set", pts, [61, 180, 110], "lb");
      n++; if (n % 2 === 0) y += chH + 10;
    });
    if (n % 2 === 1) y += chH + 10;
    font(8); col(MU); doc.text("One point per session. A single session shows as one dot.", M, y); y += 8;
  }

  if (sec.prs && weighted.length) {
    heading("Personal records (in this range)");
    var prRows = weighted.map(function (id) {
      var best = null; sessOf(id).forEach(function (s) { get(s).ex[id].forEach(function (x) { var v = e1rm(x.w, x.r); if (x.d && v && (!best || v > best.v)) best = { v: v, w: x.w, r: x.r, s: s }; }); });
      var heavy = null; sessOf(id).forEach(function (s) { get(s).ex[id].forEach(function (x) { if (x.d && +x.w && (!heavy || +x.w > +heavy.w)) heavy = { w: x.w, r: x.r, s: s }; }); });
      return best ? [exInfo(id).n, best.w + " × " + best.r, fmtShort(best.s), "~" + best.v + " lb", heavy.w + " lb (" + fmtShort(heavy.s) + ")"] : null;
    }).filter(Boolean).sort(function (a, b) { return parseInt(b[3].slice(1)) - parseInt(a[3].slice(1)); });
    table(["Lift", "Best set", "Date", "Est. 1-rep max", "Heaviest weight"], prRows, [150, 80, 70, 100, 132]);
  }

  if (sec.cardio) {
    heading("Cardio");
    para(cardio + " minutes over " + cardioN + " sessions" + (cardioN ? " (avg " + Math.round(cardio / cardioN) + " min)" : ""));
    var tk = Object.keys(types); if (tk.length) table(["Type", "Sessions", "Minutes"], tk.sort(function (a, b) { return types[b] - types[a]; }).map(function (k) { return [k, String(dates.filter(function (s) { var d = get(s); return d && d.cardioType === k && +d.cardioMin > 0; }).length), String(types[k])]; }), [200, 100, 100]);
  }

  if (sec.calories) {
    var calDays = dates.map(function (x) { return { s: x, c: dayCalories(get(x)) }; }).filter(function (z) { return z.c; });
    heading("Calories burned (estimates)");
    if (!calDays.length) para("No calorie data in this range. Add age and height under More > Profile.", 10, MU);
    else {
      var wkCal = calDays.reduce(function (a, z) { return a + (z.c.workout || 0); }, 0), totD = calDays.filter(function (z) { return z.c.total; });
      para("Workouts ~" + wkCal.toLocaleString() + " kcal in total" + (totD.length ? "; whole-day average ~" + Math.round(totD.reduce(function (a, z) { return a + z.c.total; }, 0) / totD.length).toLocaleString() + " kcal/day" : "") + ".");
      table(["Date", "Lifting", "Cardio", "Workout", "Whole day"], calDays.filter(function (z) { return z.c.workout || z.c.total; }).map(function (z) { return [fmtShort(z.s), z.c.lift ? "~" + z.c.lift : "-", z.c.cardio ? "~" + z.c.cardio : "-", z.c.workout ? "~" + z.c.workout : "-", z.c.total ? z.c.total.toLocaleString() : "-"]; }), [110, 100, 100, 100, 122]);
    }
  }

  if (sec.bodyweight && bws.length) {
    heading("Body weight");
    para("Start " + bws[0].w + " lb (" + fmtShort(bws[0].d) + ")  ->  latest " + bws[bws.length - 1].w + " lb (" + fmtShort(bws[bws.length - 1].d) + ")" + (S.settings.bodyGoal ? "   ·   goal " + S.settings.bodyGoal + " lb" : ""));
    if (bws.length > 1) { need(130); miniChart(M, y, CW, 120, "Body weight (lb)", bws.map(function (b) { return { x: fmtShort(b.d), y: b.w }; }), [230, 150, 40], "lb"); y += 130; }
  }

  if (sec.health) {
    var hds = dates.filter(function (x) { var d = get(x); return d && d.health; }).map(function (x) { return get(x); });
    if (hds.length) {
      heading("Health (from Samsung Health)");
      var stat = function (fn, unit, dec) { var v = hds.map(fn).filter(function (x) { return x != null && isFinite(x) && x > 0; }); if (!v.length) return null; var f = function (n) { return dec ? n.toFixed(dec) : Math.round(n).toLocaleString(); }; return [f(v.reduce(function (a, c) { return a + c; }, 0) / v.length) + unit, f(Math.min.apply(null, v)) + unit, f(Math.max.apply(null, v)) + unit, String(v.length)]; };
      var rowsH = [["Resting heart rate", function (d) { return d.health.restingHr; }, " bpm"], ["Average heart rate", function (d) { return d.health.hr && d.health.hr.avg; }, " bpm"], ["Max heart rate", function (d) { return d.health.hr && d.health.hr.max; }, " bpm"], ["Steps per day", function (d) { return d.health.steps; }, ""], ["Active calories", function (d) { return d.health.activeCal; }, " kcal"], ["Sleep per night", function (d) { return d.health.sleep && d.health.sleep.min / 60; }, " h", 1], ["Blood oxygen", function (d) { return d.health.spo2; }, "%", 1], ["HRV", function (d) { return d.health.hrv; }, " ms"]].map(function (r) { var st = stat(r[1], r[2], r[3]); return st ? [r[0]].concat(st) : null; }).filter(Boolean);
      if (rowsH.length) table(["Measure", "Average", "Lowest", "Highest", "Days"], rowsH, [170, 92, 92, 92, 86]);
      var rhp = dates.filter(function (x) { var d = get(x); return d && d.health && d.health.restingHr; }).map(function (x) { return { x: fmtShort(x), y: get(x).health.restingHr }; });
      if (rhp.length > 1) { need(130); miniChart(M, y, CW, 120, "Resting heart rate (bpm)", rhp, [229, 103, 91], "bpm"); y += 130; }
      var hw = []; dates.forEach(function (x) { var d = get(x); if (d && d.health && d.health.workouts) d.health.workouts.forEach(function (w) { hw.push([fmtShort(x), w.name, w.min + " min", w.avgHr ? w.avgHr + " / " + w.maxHr + " bpm" : "-", w.kcal ? w.kcal + " kcal" : "-"]); }); });
      if (hw.length) { y += 4; table(["Date", "Recorded workout", "Time", "Avg / max HR", "Calories"], hw, [70, 170, 70, 120, 102]); }
    }
  }

  if (sec.log) {
    need(190); heading("Session log");
    var any = false;
    dates.slice().reverse().forEach(function (s) {
      var d = get(s); if (!d) return;
      var W = dayWorkout(d), lines = [];
      if (+d.cardioMin > 0 && ctOk(d.cardioType)) lines.push("Cardio: " + d.cardioMin + " min " + String(d.cardioType).toLowerCase());
      var order = []; if (W) W.groups.forEach(function (g) { g.ex.forEach(function (e) { order.push(e.id); }); });
      Object.keys(d.ex || {}).forEach(function (id) { if (order.indexOf(id) < 0) order.push(id); });
      var exLines = 0;
      order.forEach(function (id) {
        if (!exOk(id)) return;
        var sets = (d.ex || {})[id]; if (!sets) return; var dn = sets.filter(function (x) { return x.d; }); if (!dn.length) return;
        var e = exInfo(id), txt;
        if (e.bw || !dn.some(function (x) { return +x.w; })) { var tot = dn.reduce(function (a, x) { return a + (+x.r || 0); }, 0); txt = dn.length > 6 ? (tot + " reps in " + dn.length + " sets") : (dn.map(function (x) { return x.r; }).join(", ") + " reps (" + tot + " total)"); }
        else txt = dn.map(function (x) { return x.w + "×" + x.r; }).join(", ");
        if (sec.hr) { var xh2 = d.liftHr && d.liftHr.ex && d.liftHr.ex[id]; if (xh2) txt += "   (HR avg " + xh2.avg + ", peak " + xh2.max + ")"; var xc2 = exCalories(d, e); if (xc2) txt += "   ~" + xc2.kcal + " kcal"; }
        lines.push(e.n + ": " + txt); exLines++;
      });
      if (exX.length && !exLines && !(+d.cardioMin > 0)) return; // nothing selected happened this day
      if (sec.calories) { var dc2 = dayCalories(d); if (dc2) lines.push("Calories: " + (dc2.total ? dc2.total.toLocaleString() + " total for the day, " : "") + "workout ~" + dc2.workout); }
      if (sec.bodyweight && d.bodyWeight) lines.push("Body weight: " + d.bodyWeight + " lb");
      if (sec.health && d.health) { var hh = d.health, hp = []; if (hh.restingHr) hp.push("resting HR " + hh.restingHr); if (hh.hr) hp.push("HR avg " + hh.hr.avg + " / max " + hh.hr.max); if (hh.steps) hp.push(hh.steps.toLocaleString() + " steps"); if (hh.sleep) hp.push("sleep " + fmtMin(hh.sleep.min)); if (hh.spo2) hp.push("SpO2 " + hh.spo2 + "%"); if (hp.length) lines.push("Health: " + hp.join(", ")); if (sec.hr && d.liftHr && d.liftHr.avg) lines.push("Lifting session: " + Math.round((d.liftHr.end - d.liftHr.start) / 60000) + " min, HR avg " + d.liftHr.avg + " / max " + d.liftHr.max); }
      var notes = sec.notes && d.notes ? doc.splitTextToSize(pdfText("Notes: " + d.notes), CW - 14) : [];
      if (!lines.length && !notes.length && !score(d)) return;
      any = true;
      font(9.5, "normal"); var wrapped = []; lines.forEach(function (l) { wrapped = wrapped.concat(doc.splitTextToSize(pdfText(l), CW - 14)); });
      need(22 + wrapped.length * 12 + notes.length * 12);
      fill([244, 247, 245]); doc.rect(M, y - 11, CW, 17, "F");
      font(10.5, "bold"); col(DK); doc.text(pdfText(fmtLong(s) + "  ·  " + (d.workout === "rest" ? "Rest day" : (/^\d+$/.test(d.workout) ? "Workout #" + d.workout : d.workout)) + (W && W.focus && d.workout !== "rest" ? " (" + W.focus + ")" : "")), M + 6, y + 1);
      font(9, "bold"); doc.setTextColor(20, 120, 70); doc.text(pdfText("Lift " + (d.liftDone ? "Y" : "-") + "   Cardio " + (+d.cardioMin > 0 ? "Y" : "-") + "   Abs " + (d.absDone ? "Y" : "-")), PW - M - 6, y + 1, { align: "right" });
      y += 18; font(9.5, "normal"); col(DK);
      wrapped.forEach(function (l) { doc.text(l, M + 8, y); y += 12; });
      if (notes.length) { font(9, "italic"); col(MU); notes.forEach(function (l) { doc.text(l, M + 8, y); y += 12; }); }
      y += 8;
    });
    if (!any) para("Nothing logged for this selection.", 10, MU);
  }

  var n2 = doc.getNumberOfPages();
  for (var pg = 1; pg <= n2; pg++) { doc.setPage(pg); font(8); col(MU); doc.text(pdfText((o.title || "Training Report") + "  ·  page " + pg + " of " + n2), PW / 2, 776, { align: "center" }); }
  return doc;
}

// ================= Health (Samsung Health -> Health Connect) =================
var H = P.Health;
var HEALTH_READ = ["heartRate", "restingHeartRate", "heartRateVariability", "oxygenSaturation", "respiratoryRate", "steps", "distance", "calories", "totalCalories", "sleep", "weight", "bodyFat", "vo2Max", "bloodPressure", "workouts"];
var WK_NAMES = { bikingStationary: "Stationary bike", cycling: "Cycling", walking: "Walk", running: "Run", runningTreadmill: "Treadmill", elliptical: "Elliptical", rowingMachine: "Rower", rowing: "Rowing", stairClimbingMachine: "Stair climber", stairClimbing: "Stairs", weightlifting: "Weight training", strengthTraining: "Strength training", traditionalStrengthTraining: "Strength training", functionalStrengthTraining: "Strength training", hockey: "Hockey", iceHockey: "Hockey", golf: "Golf", hiking: "Hike", swimming: "Swim", swimmingPool: "Swim", highIntensityIntervalTraining: "HIIT", stretching: "Stretching", yoga: "Yoga", other: "Workout" };
var WK_CARDIO = { bikingStationary: "Stationary bike", cycling: "Other", walking: "Walk", running: "Other", runningTreadmill: "Treadmill", elliptical: "Elliptical", rowingMachine: "Rower", stairClimbingMachine: "Stair climber", stairClimbing: "Stair climber", hockey: "Hockey", iceHockey: "Hockey", golf: "Golf", hiking: "Walk", swimming: "Other", swimmingPool: "Other", highIntensityIntervalTraining: "Other" };
function wkName(t) { return WK_NAMES[t] || String(t || "Workout").replace(/([A-Z])/g, " $1").replace(/^./, function (c) { return c.toUpperCase(); }); }
function healthOn() { return isNative && !!H && !!S.settings.healthOn; }
function fmtTime(iso) { var d = new Date(iso), h = d.getHours(), m = d.getMinutes(); return ((h + 11) % 12 + 1) + ":" + pad(m) + (h < 12 ? " AM" : " PM"); }
function fmtMin(m) { m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + "h " + pad(m % 60) + "m" : m + " min"; }
var hBusy = {};
function syncHealth(date, force) {
  if (!healthOn()) return Promise.resolve(false);
  var d0 = get(date), h0 = d0 && d0.health, t = todayS();
  if (date > t) return Promise.resolve(false);
  if (!force && h0 && h0.syncedAt && (h0.final || Date.now() - h0.syncedAt < 10 * 60e3)) return Promise.resolve(false);
  if (hBusy[date]) return hBusy[date];
  var s0 = pd(date), s1 = pd(addDays(date, 1)), b = [s0.toISOString(), s1.toISOString()];
  var sleepB = [new Date(s0.getTime() - 12 * 3600e3).toISOString(), new Date(s0.getTime() + 18 * 3600e3).toISOString()];
  function q(fn) { try { return fn().catch(function () { return null; }); } catch (e) { return Promise.resolve(null); } }
  function agg(type) { return q(function () { return H.queryAggregated({ dataType: type, startDate: b[0], endDate: b[1], bucket: "day", aggregation: "sum" }); }); }
  function rs(type, s, e, lim) { return q(function () { return H.readSamples({ dataType: type, startDate: s || b[0], endDate: e || b[1], limit: lim || 200, ascending: true }); }); }
  function list(r) { return (r && r.samples) || []; }
  function sum(r) { var a = list(r); return a.length ? a.reduce(function (x, y) { return x + (+y.value || 0); }, 0) : null; }
  function mean(r) { var v = list(r).map(function (x) { return +x.value; }).filter(isFinite); return v.length ? v.reduce(function (x, y) { return x + y; }, 0) / v.length : null; }
  function last(r) { var a = list(r); return a.length ? a[a.length - 1] : null; }
  hBusy[date] = Promise.all([
    agg("steps"), agg("calories"), agg("totalCalories"), agg("distance"),
    rs("heartRate", null, null, 2000), rs("restingHeartRate"), rs("heartRateVariability"), rs("oxygenSaturation"), rs("respiratoryRate"),
    rs("weight"), rs("bodyFat"), rs("vo2Max"), rs("bloodPressure"), rs("sleep", sleepB[0], sleepB[1], 20),
    q(function () { return H.queryWorkouts({ startDate: b[0], endDate: b[1], limit: 50, ascending: true }); }),
    (function () { var tk = setTicks(get(date)); if (!tk.length) return Promise.resolve(null); return rs("heartRate", new Date(tk[0].t - 10 * 60e3).toISOString(), new Date(tk[tk.length - 1].t + 5 * 60e3).toISOString(), 5000); })()
  ]).then(function (r) {
    var o = { syncedAt: Date.now(), final: date < addDays(t, -1) }, v, x;
    if ((v = sum(r[0])) != null && v > 0) o.steps = Math.round(v);
    if ((v = sum(r[1])) != null && v > 0) o.activeCal = Math.round(v);
    if ((v = sum(r[2])) != null && v > 0) o.totalCal = Math.round(v);
    if ((v = sum(r[3])) != null && v > 0) o.distanceKm = Math.round(v / 100) / 10;
    var hr = list(r[4]).map(function (s) { return { t: new Date(s.startDate).getTime(), v: +s.value }; }).filter(function (s) { return s.v > 0; });
    if (hr.length) { var hv = hr.map(function (s) { return s.v; }); o.hr = { min: Math.min.apply(null, hv), max: Math.max.apply(null, hv), avg: Math.round(hv.reduce(function (a, c) { return a + c; }, 0) / hv.length), n: hv.length }; }
    if ((x = last(r[5]))) o.restingHr = Math.round(+x.value);
    if ((v = mean(r[6])) != null) o.hrv = Math.round(v);
    if ((v = mean(r[7])) != null) o.spo2 = Math.round(v * 10) / 10;
    if ((v = mean(r[8])) != null) o.respRate = Math.round(v * 10) / 10;
    if ((x = last(r[9]))) o.weightLb = Math.round(+x.value * 2.20462 * 10) / 10;
    if ((x = last(r[10]))) o.bodyFat = Math.round(+x.value * 10) / 10;
    if ((x = last(r[11]))) o.vo2max = Math.round(+x.value * 10) / 10;
    if ((x = last(r[12])) && x.systolic) o.bp = Math.round(x.systolic) + "/" + Math.round(x.diastolic);
    var sl = list(r[13]).filter(function (s) { var e = new Date(s.endDate); return e >= s0 && e < new Date(s0.getTime() + 18 * 3600e3); });
    if (sl.length) {
      var asleep = 0, deep = 0, rem = 0;
      sl.forEach(function (s) { if (s.stages && s.stages.length) s.stages.forEach(function (st) { if (st.stage !== "awake" && st.stage !== "inBed") asleep += st.durationMinutes; if (st.stage === "deep") deep += st.durationMinutes; if (st.stage === "rem") rem += st.durationMinutes; }); else asleep += +s.value || 0; });
      o.sleep = { min: Math.round(asleep), deep: Math.round(deep), rem: Math.round(rem), start: sl[0].startDate, end: sl[sl.length - 1].endDate };
    }
    var wk = ((r[14] && r[14].workouts) || []).map(function (w) {
      var st = new Date(w.startDate).getTime(), en = new Date(w.endDate).getTime(), ws = hr.filter(function (s) { return s.t >= st && s.t <= en; }).map(function (s) { return s.v; });
      return { type: w.workoutType, name: wkName(w.workoutType), start: w.startDate, end: w.endDate, min: Math.round((en - st) / 60000), kcal: w.totalEnergyBurned ? Math.round(w.totalEnergyBurned) : null, avgHr: ws.length ? Math.round(ws.reduce(function (a, c) { return a + c; }, 0) / ws.length) : null, maxHr: ws.length ? Math.max.apply(null, ws) : null };
    }).filter(function (w) { return w.min > 0; });
    if (wk.length) o.workouts = wk;
    var d = ensure(date); d.health = o;
    var lhr = list(r[15]).map(function (s) { return { t: new Date(s.startDate).getTime(), v: +s.value }; }).filter(function (s) { return s.v > 0; });
    if (!lhr.length) lhr = hr;
    var lh = liftHr(d, lhr); if (lh) d.liftHr = lh;
    // fill in what the day is missing
    if (o.weightLb && !d.bodyWeight) { d.bodyWeight = o.weightLb; d.bodyWeightSrc = "Samsung Health"; }
    var cw = wk.filter(function (w) { return WK_CARDIO[w.type]; });
    if (cw.length && !(+d.cardioMin) && !d.cardioManual) {
      d.cardioMin = cw.reduce(function (a, w) { return a + w.min; }, 0); d.cardioType = WK_CARDIO[cw[0].type]; d.cardioSrc = "Samsung Health";
    }
    delete hBusy[date]; save(); return true;
  }).catch(function (e) { delete hBusy[date]; return false; });
  return hBusy[date];
}

// ---- heart rate per exercise, from the times sets were ticked ----
function setTicks(d) {
  var tk = []; if (!d) return tk;
  Object.keys(d.ex || {}).forEach(function (id) { d.ex[id].forEach(function (st, i) { if (st.d && st.t) tk.push({ id: id, i: i, t: st.t }); }); });
  return tk.sort(function (a, b) { return a.t - b.t; });
}
function hrStats(arr) { if (!arr.length) return null; var v = arr.map(function (x) { return x.v; }); return { avg: Math.round(v.reduce(function (a, c) { return a + c; }, 0) / v.length), max: Math.max.apply(null, v), min: Math.min.apply(null, v), n: v.length }; }
function liftHr(d, hr) {
  var tk = setTicks(d); if (!tk.length || !hr.length) return null;
  var lead = 4 * 60e3, tail = 30e3, ex = {};
  tk.forEach(function (k, j) {
    var from = j ? tk[j - 1].t : k.t - lead, win = hr.filter(function (h) { return h.t > from && h.t <= k.t + tail; });
    var e = ex[k.id] || (ex[k.id] = { from: from, to: k.t + tail, sets: [] });
    e.to = k.t + tail; e.sets[k.i] = win.length ? Math.max.apply(null, win.map(function (h) { return h.v; })) : null;
  });
  var out = { start: tk[0].t - lead, end: tk[tk.length - 1].t + 60e3, ex: {} };
  Object.keys(ex).forEach(function (id) {
    var e = ex[id], st = hrStats(hr.filter(function (h) { return h.t > e.from && h.t <= e.to; }));
    if (st) out.ex[id] = { avg: st.avg, max: st.max, min: st.min, mins: Math.max(1, Math.round((e.to - e.from) / 60000)), sets: e.sets };
  });
  var all = hrStats(hr.filter(function (h) { return h.t >= out.start && h.t <= out.end; }));
  if (all) { out.avg = all.avg; out.max = all.max; out.min = all.min; }
  return Object.keys(out.ex).length ? out : null;
}
function connectHealth() {
  if (!isNative || !H) { toast("Samsung Health works in the installed Android app"); return; }
  H.isAvailable().then(function (a) {
    if (!a.available) {
      openSheet('<h3>Health Connect is needed</h3><div class="small" style="line-height:1.6;margin-bottom:14px">Samsung Health shares its data with other apps through <b>Health Connect</b>. ' + esc(a.reason || "") + '<br><br>On Android 14 or newer it\'s built in (Settings → Security and privacy → Privacy → Health Connect). On older phones, install <b>Health Connect by Android</b> from the Play Store, then come back and tap Connect again.</div><button class="btn full" data-act="sclose">OK</button>');
      return;
    }
    return H.requestAuthorization({ read: HEALTH_READ, write: [], requestHistoryAccess: true }).then(function (st) {
      var ok = (st && st.readAuthorized) || [];
      if (!ok.length) { toast("No health permissions were allowed"); return; }
      S.settings.healthOn = true; S.settings.healthGranted = ok; save();
      toast("Connected: " + ok.length + " data types");
      var days = []; for (var i = 0; i < 14; i++) days.push(addDays(todayS(), -i));
      days.reduce(function (p, d) { return p.then(function () { return syncHealth(d, true); }); }, Promise.resolve()).then(render);
      render();
    });
  }).catch(function (e) { toast("Couldn't connect: " + (e && e.message || e)); });
}
function healthCard(d) {
  if (!isNative || !H) return "";
  if (!S.settings.healthOn) return ui.cur === todayS() && S.settings.healthPrompt !== false ? '<div class="card"><div class="row between"><div><b>❤️ Connect Samsung Health</b><div class="small mute">Heart rate, sleep, steps and workouts on each day</div></div><button class="btn sm" data-act="hconnect">Connect</button></div></div>' : "";
  var h = d.health, out = '<div class="card"><div class="row between"><b>❤️ Samsung Health</b><button class="btn sec sm" data-act="hsync">Sync</button></div>';
  if (!h || (!h.hr && !h.steps && !h.sleep && !h.restingHr && !h.workouts)) return out + '<div class="small mute" style="margin-top:8px">' + (h ? "No Samsung Health data for this day yet." : "Syncing…") + '</div></div>';
  var tiles = [];
  if (h.restingHr) tiles.push([h.restingHr + " bpm", "Resting HR"]);
  if (h.hr) tiles.push([h.hr.avg + " bpm", "Avg HR"], [h.hr.max + " bpm", "Max HR"]);
  if (h.steps) tiles.push([h.steps.toLocaleString(), "Steps"]);
  if (h.activeCal) tiles.push([h.activeCal.toLocaleString(), "Active kcal"]);
  if (h.sleep) tiles.push([fmtMin(h.sleep.min), "Sleep"]);
  if (h.spo2) tiles.push([h.spo2 + "%", "Blood oxygen"]);
  if (h.hrv) tiles.push([h.hrv + " ms", "HRV"]);
  if (h.respRate) tiles.push([h.respRate, "Breaths/min"]);
  if (h.bp) tiles.push([h.bp, "Blood pressure"]);
  if (h.weightLb) tiles.push([h.weightLb + " lb", "Weight"]);
  if (h.bodyFat) tiles.push([h.bodyFat + "%", "Body fat"]);
  if (h.vo2max) tiles.push([h.vo2max, "VO2 max"]);
  out += '<div class="htiles">' + tiles.map(function (t) { return '<div class="kv"><b>' + esc(t[0]) + '</b><span>' + esc(t[1]) + '</span></div>'; }).join("") + '</div>';
  if (d.liftHr && d.liftHr.avg) out += '<div class="lbl" style="margin:10px 0 4px">Lifting session</div><div class="small">' + fmtTime(new Date(d.liftHr.start).toISOString()) + '–' + fmtTime(new Date(d.liftHr.end).toISOString()) + ' · ' + Math.round((d.liftHr.end - d.liftHr.start) / 60000) + ' min · avg ' + d.liftHr.avg + ' / max ' + d.liftHr.max + ' bpm</div>';
  if (h.workouts) out += '<div class="lbl" style="margin:10px 0 4px">Workouts recorded</div>' + h.workouts.map(function (w) { return '<div class="small" style="padding:4px 0;border-bottom:1px solid var(--line)"><b>' + esc(w.name) + '</b> · ' + fmtTime(w.start) + ' · ' + w.min + ' min' + (w.avgHr ? ' · avg ' + w.avgHr + ' / max ' + w.maxHr + ' bpm' : '') + (w.kcal ? ' · ' + w.kcal + ' kcal' : '') + '</div>'; }).join("");
  if (d.cardioSrc && +d.cardioMin) out += '<div class="small" style="color:var(--acc);margin-top:6px">Cardio filled in from Samsung Health. Edit it above if it\'s wrong.</div>';
  return out + '<div class="small mute" style="margin-top:6px">Updated ' + fmtTime(new Date(h.syncedAt).toISOString()) + '</div></div>';
}


// ================= Calories =================
var CARDIO_MET = { "Stationary bike": 5.5, "Walk": 3.5, "Treadmill": 7, "Elliptical": 5, "Rower": 7, "Stair climber": 9, "Hockey": 8, "Golf": 4.8, "Other": 6 };
function weightLbOn(date) {
  var keys = Object.keys(S.days).filter(function (k) { return k <= date; }).sort().reverse();
  for (var i = 0; i < keys.length; i++) { var d = S.days[keys[i]]; if (d.bodyWeight) return +d.bodyWeight; if (d.health && d.health.weightLb) return d.health.weightLb; }
  return S.settings.weightLb ? +S.settings.weightLb : null;
}
function bmr(date) {
  var st = S.settings, lb = weightLbOn(date), age = +st.age, inch = +st.heightIn;
  if (!lb || !age || !inch) return null;
  return Math.round(10 * lb / 2.20462 + 6.25 * inch * 2.54 - 5 * age + (st.sex === "F" ? -161 : 5));
}
// kcal for one exercise on a day: heart-rate based when we have HR + age, else a MET estimate from time or sets
function exCalories(d, e) {
  var sets = ((d.ex || {})[e.id] || []).filter(function (x) { return x.d; }); if (!sets.length) return null;
  var lb = weightLbOn(d.date); if (!lb) return null;
  var kg = lb / 2.20462, age = +S.settings.age, xh = d.liftHr && d.liftHr.ex && d.liftHr.ex[e.id];
  if (xh && xh.avg && age) {
    var perMin = S.settings.sex === "F" ? (-20.4022 + 0.4472 * xh.avg - 0.1263 * kg + 0.074 * age) / 4.184 : (-55.0969 + 0.6309 * xh.avg + 0.1988 * kg + 0.2017 * age) / 4.184;
    if (perMin > 0) return { kcal: Math.round(Math.min(perMin, 12) * xh.mins), how: "hr" };
  }
  var met = e.bw ? (/chin|pull-?up/i.test(e.n) ? 6 : 3.8) : (e.failure ? 6 : 5);
  var mins = xh ? xh.mins : (e.total ? Math.min(12, sets.length * 0.6) : e.bw ? sets.length * 1.2 : sets.length * (e.failure ? 3 : 2.5));
  mins = Math.min(mins, 20);
  return { kcal: Math.round(met * 3.5 * kg / 200 * mins), how: "est" };
}
function dayCalories(d) {
  if (!d) return null;
  var out = { lift: 0, cardio: 0, liftHow: "est", cardioHow: "est" }, W = dayWorkout(d), any = false;
  if (W) W.groups.forEach(function (g) { g.ex.forEach(function (e) { var c = exCalories(d, e); if (c) { out.lift += c.kcal; any = true; if (c.how === "hr") out.liftHow = "hr"; } }); });
  var cm = +d.cardioMin || 0;
  if (cm) {
    var hw = d.health && d.health.workouts ? d.health.workouts.filter(function (w) { return WK_CARDIO[w.type] && w.kcal; }) : [];
    if (hw.length) { out.cardio = hw.reduce(function (a, w) { return a + w.kcal; }, 0); out.cardioHow = "watch"; }
    else { var lb = weightLbOn(d.date); if (lb) out.cardio = Math.round((CARDIO_MET[d.cardioType] || 6) * 3.5 * (lb / 2.20462) / 200 * cm); }
    if (out.cardio) any = true;
  }
  out.workout = out.lift + out.cardio;
  var h = d.health || {}, b = bmr(d.date);
  if (h.totalCal) { out.total = h.totalCal; out.totalHow = "watch"; }
  else if (b && h.activeCal) { out.total = b + h.activeCal; out.totalHow = "bmr+active"; }
  else if (b) { out.total = Math.round(b * 1.2) + out.workout; out.totalHow = "est"; }
  if (h.activeCal) out.active = h.activeCal;
  out.bmr = b;
  return any || out.total ? out : null;
}
function calCard(d) {
  var c = dayCalories(d);
  if (!c) return (!S.settings.age || !S.settings.heightIn) && ui.cur === todayS() ? '<div class="card small mute">🔥 Add your age and height under More → Profile to see calories burned.</div>' : "";
  var h = '<div class="card"><div class="row between"><b>🔥 Calories burned</b>' + (c.total ? '<b style="font-size:20px;color:var(--warn)">' + c.total.toLocaleString() + '</b>' : '') + '</div>';
  h += '<div class="htiles">';
  if (c.workout) h += '<div class="kv"><b>' + c.workout.toLocaleString() + '</b><span>Workout</span></div>';
  if (c.lift) h += '<div class="kv"><b>' + c.lift.toLocaleString() + '</b><span>Lifting' + (c.liftHow === "hr" ? " (HR)" : " (est.)") + '</span></div>';
  if (c.cardio) h += '<div class="kv"><b>' + c.cardio + '</b><span>Cardio' + (c.cardioHow === "watch" ? " (watch)" : " (est.)") + '</span></div>';
  if (c.active) h += '<div class="kv"><b>' + c.active.toLocaleString() + '</b><span>Active (watch)</span></div>';
  if (c.bmr) h += '<div class="kv"><b>' + c.bmr.toLocaleString() + '</b><span>Resting (BMR)</span></div>';
  h += '</div><div class="small mute" style="margin-top:6px">' + (c.totalHow === "watch" ? "Day total from Samsung Health." : c.totalHow === "bmr+active" ? "Day total = resting burn + watch active calories." : c.total ? "Day total estimated from your profile + today's workout." : "") + ' Exercise numbers are estimates' + (c.liftHow === "hr" ? ", based on your heart rate." : ". Tick sets live with your watch on for heart-rate-based numbers.") + '</div></div>';
  return h;
}

// ================= Rest timer =================
var T = { end: 0, total: 0, iv: null, bg: false };
function startTimer(sec) {
  if (!S.settings.restOn || !sec) return;
  T.total = sec; T.end = Date.now() + sec * 1000;
  var el = document.getElementById("timer"); el.classList.remove("hidden", "done");
  clearInterval(T.iv); T.iv = setInterval(tick, 250); tick();
}
function stopTimer() { clearInterval(T.iv); T.iv = null; T.end = 0; document.getElementById("timer").classList.add("hidden"); cancelTimerNotif(); }
function tick() {
  var left = Math.max(0, Math.round((T.end - Date.now()) / 1000));
  document.getElementById("tTime").textContent = Math.floor(left / 60) + ":" + pad(left % 60);
  document.getElementById("tFill").style.width = (T.total ? left / T.total * 100 : 0) + "%";
  if (left <= 0 && T.iv) {
    clearInterval(T.iv); T.iv = null;
    var el = document.getElementById("timer"); el.classList.add("done"); document.getElementById("tTime").textContent = "Go!";
    try { if (P.Haptics) P.Haptics.vibrate({ duration: 600 }); else if (navigator.vibrate) navigator.vibrate(600); } catch (e) { }
    beep();
    setTimeout(function () { if (!T.iv) document.getElementById("timer").classList.add("hidden"); }, 4000);
  }
}
var actx = null;
function beep() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); [0, 0.25].forEach(function (o) { var os = actx.createOscillator(), g = actx.createGain(); os.frequency.value = 880; os.connect(g); g.connect(actx.destination); g.gain.setValueAtTime(0.25, actx.currentTime + o); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + o + 0.2); os.start(actx.currentTime + o); os.stop(actx.currentTime + o + 0.22); }); } catch (e) { } }
function scheduleTimerNotif() { if (!isNative || !P.LocalNotifications || !T.iv) return; var at = new Date(T.end); if (at - Date.now() < 2000) return; P.LocalNotifications.schedule({ notifications: [{ id: 9001, title: "Rest's over", body: "Time for your next set 💪", schedule: { at: at, allowWhileIdle: true } }] }).catch(function () { }); }
function cancelTimerNotif() { if (isNative && P.LocalNotifications) P.LocalNotifications.cancel({ notifications: [{ id: 9001 }] }).catch(function () { }); }
document.getElementById("timer").addEventListener("click", function (e) {
  var b = e.target.closest("[data-act]"); if (!b) return;
  if (b.getAttribute("data-act") === "t15") { T.end += 15000; T.total += 15; if (!T.iv) { document.getElementById("timer").classList.remove("done"); T.iv = setInterval(tick, 250); } tick(); }
  else stopTimer();
});

// ================= Events =================
function setTab(t) {
  ui.tab = t; document.querySelectorAll("#tabs button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === t); });
  if (t === "cal") ui.calMonth = ui.cur.slice(0, 7);
  window.scrollTo(0, 0); render();
}
document.getElementById("tabs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { haptic(); setTab(b.getAttribute("data-tab")); } });

function onAct(b, ev) {
  var act = b.getAttribute("data-act"), id = b.getAttribute("data-id");
  switch (act) {
    case "prev": ui.cur = addDays(ui.cur, -1); return render();
    case "next": ui.cur = addDays(ui.cur, 1); return render();
    case "today": ev.preventDefault(); ui.cur = todayS(); return render();
    case "calday": ui.cur = b.getAttribute("data-d"); return setTab("log");
    case "calnav": var p = ui.calMonth.split("-"), dd = new Date(+p[0], +p[1] - 1 + (+b.getAttribute("data-v")), 1); ui.calMonth = dd.getFullYear() + "-" + pad(dd.getMonth() + 1); return render();
    case "sclose": editing = null; return closeSheet();
    case "sok": var fn = confirmSheet.ok; closeSheet(); if (fn) fn(); return;
    case "pedit": return openEditor(id, false);
    case "pdup": return openEditor(id, true);
    case "pnew": return openEditor("blank", true);
    case "puse": return useProgram(id);
    case "useok":
      var from = document.getElementById("useFrom").value || todayS();
      S.programHistory = S.programHistory.filter(function (x) { return x.from < from; }); S.programHistory.push({ programId: id, from: from }); S.activeProgramId = id;
      Object.keys(S.days).forEach(function (k) { var d = S.days[k]; if (k >= from && !Object.keys(d.ex || {}).length) { d.programId = id; d.workout = S.programs[id].schedule[pd(k).getDay()] || "rest"; } });
      closeSheet(); save(); scheduleReminders(); toast(S.programs[id].name + " is now active"); return render();
    case "psave": return saveEditor();
    case "preset": confirmSheet("Reset Level I?", "This puts the exercises and schedule back to the book version. Your logged sessions aren't touched.", "Reset", function () { var b0 = clone(TP.BUILTIN[0]); S.programs["level-1"] = b0; compileAll(); save(); scheduleReminders(); render(); toast("Reset to the book version"); }); return;
    case "pdel": var did = editing.id; confirmSheet("Delete " + S.programs[did].name + "?", "Logged sessions stay in your history.", "Delete", function () { delete S.programs[did]; S.programHistory = S.programHistory.filter(function (x) { return x.programId !== did; }); editing = null; compileAll(); save(); render(); }, true); return;
    case "openreport": return openReportBuilder();
    case "rpreset": case "rrange2": case "rwk": case "rct": case "rexall": case "rexnone": case "rmake": return reportSheetAct(act, b);
    case "ropen": if (lastPdf && lastPdf.uri && P.SaveFile) P.SaveFile.open({ uri: lastPdf.uri, mimeType: "application/pdf" }).catch(function (e) { toast((e && e.message) || "Couldn't open the PDF"); }); return;
    case "rshare": return sharePdf();
    case "rback": return openReportBuilder();
    case "setmenu": return setMenu(b.getAttribute("data-ex"), +b.getAttribute("data-i"));
    case "setdel": var dd2 = ensure(ui.cur), e3 = findInDay(dd2, b.getAttribute("data-ex")), ss = getSets(dd2, e3), ix2 = +b.getAttribute("data-i"); if (ss.length > 1) ss.splice(ix2, 1); else ss[0] = { w: "", r: "", d: false }; closeSheet(); save(); toast("Set removed"); return render();
    case "rday": var v = +b.getAttribute("data-v"), arr = S.settings.remindDays, ix = arr.indexOf(v); if (ix >= 0) arr.splice(ix, 1); else arr.push(v); save(); scheduleReminders(); return render();
    case "export": var name = "training-log-backup-" + todayS() + ".json"; return shareFile(name, JSON.stringify(S, null, 1), "application/json", true);
    case "import": return document.getElementById("importFile").click();
    case "hconnect": return connectHealth();
    case "hsync": toast("Syncing Samsung Health…"); return syncHealth(ui.cur, true).then(function (ch) { render(); toast(ch ? "Synced" : "Nothing new"); });
    case "hperm": if (H) H.openHealthConnectSettings().catch(function () { toast("Couldn't open Health Connect"); }); return;
    case "hback": toast("Syncing the last 30 days…"); var dl = []; for (var q = 0; q < 30; q++) dl.push(addDays(todayS(), -q)); dl.reduce(function (p, x) { return p.then(function () { return syncHealth(x, true); }); }, Promise.resolve()).then(function () { render(); toast("Synced 30 days"); }); return;
    case "hoff": S.settings.healthOn = false; save(); toast("Samsung Health disconnected"); return render();
    case "hdismiss": S.settings.healthPrompt = false; save(); return render();
  }
  // day edits
  var d = ensure(ui.cur);
  if (act === "wk") d.workout = b.getAttribute("data-w");
  else if (act === "lift") d.liftDone = !d.liftDone;
  else if (act === "abs") d.absDone = !d.absDone;
  else if (act === "cm") { d.cardioMin = Math.max(0, (+d.cardioMin || 0) + (+b.getAttribute("data-v"))); d.cardioManual = true; delete d.cardioSrc; }
  else if (act === "set") {
    var e = findInDay(d, b.getAttribute("data-ex")), i = +b.getAttribute("data-i"), sets = getSets(d, e), s = sets[i];
    var row = b.parentNode; row.querySelectorAll("input").forEach(function (inp) { s[inp.getAttribute("data-f")] = inp.value; });
    if (!s.d) {
      if (!e.bw && !s.w) { var ph = row.querySelector('input[data-f="w"]'); if (ph && ph.placeholder && !isNaN(+ph.placeholder)) s.w = ph.placeholder; }
      if (!s.r) { var tr = e.reps[i] || e.reps[e.reps.length - 1]; if (tr) s.r = String(tr); }
      if (!s.r) { toast("Enter how many reps you did"); return; }
      s.d = true; if (ui.cur === todayS()) s.t = Date.now(); autoHabits(d); haptic();
      var rest = e.failure ? S.settings.restPowerSec : S.settings.restSec;
      if (exDone(e, sets)) rest = Math.max(rest, S.settings.restSec);
      startTimer(+rest);
    } else s.d = false;
  }
  else if (act === "rmset") {
    var e4 = findInDay(d, b.getAttribute("data-ex")), s4 = getSets(d, e4), last = s4[s4.length - 1];
    if (s4.length <= 1) return;
    if (last.d || last.w || last.r) return setMenu(e4.id, s4.length - 1);
    s4.pop(); toast("Set removed");
  }
  else if (act === "addset") { var e2 = findInDay(d, b.getAttribute("data-ex")); getSets(d, e2).push({ w: "", r: "", d: false }); }
  else return;
  save(); render();
}
function clickHandler(ev) { var b = ev.target.closest("[data-act]"); if (b) onAct(b, ev); }
view.addEventListener("click", clickHandler);
document.getElementById("sheetIn").addEventListener("click", clickHandler);

view.addEventListener("input", function (ev) {
  var t = ev.target;
  if (t.matches("input[data-ex]")) { var d = ensure(ui.cur), e = findInDay(d, t.getAttribute("data-ex")); getSets(d, e)[+t.getAttribute("data-i")][t.getAttribute("data-f")] = t.value; save(); return; }
  if (t.id === "cardioMin") { var dc = ensure(ui.cur); dc.cardioMin = Math.max(0, +t.value || 0); dc.cardioManual = true; delete dc.cardioSrc; save(); return; }
  if (t.id === "bodyWeight") { ensure(ui.cur).bodyWeight = t.value ? +t.value : null; save(); return; }
  if (t.id === "notes") { ensure(ui.cur).notes = t.value; save(); return; }
  if (t.id === "pfName") { S.settings.name = t.value; save(); return; }
  if (t.id === "bodyGoal") { S.settings.bodyGoal = t.value ? +t.value : null; save(); return; }
  if (t.id === "pfAge") { S.settings.age = t.value ? +t.value : null; save(); return; }
  if (t.id === "pfHeight") { S.settings.heightIn = t.value ? +t.value : null; save(); return; }
  if (t.id === "pfWeight") { S.settings.weightLb = t.value ? +t.value : null; save(); return; }
  if (t.id === "restSec" || t.id === "restPowerSec") { S.settings[t.id] = Math.max(0, +t.value || 0); save(); return; }
});
view.addEventListener("change", function (ev) {
  var t = ev.target;
  if (t.id === "cardioType") { ensure(ui.cur).cardioType = t.value; save(); }
  if (t.id === "cardioMin") setTimeout(render, 0);
  if (t.id === "progEx") { ui.progEx = t.value; t.blur(); render(); }
  if (t.id === "restOn") { S.settings.restOn = t.checked; save(); }
  if (t.id === "pfSex") { S.settings.sex = t.value; save(); }
  if (t.id === "remindOn") { var on = t.checked; (on ? ensureNotifPerm() : Promise.resolve(true)).then(function (ok) { if (on && !ok) { toast("Notifications are blocked. Allow them in Android settings."); t.checked = false; return; } S.settings.remindOn = on; save(); scheduleReminders(); if (on) toast("Reminders on at " + S.settings.remindTime); }); }
  if (t.id === "remindTime") { S.settings.remindTime = t.value || "05:00"; save(); scheduleReminders(); }
  if (t.id === "rFrom") ui.rFrom = t.value;
  if (t.id === "rTo") ui.rTo = t.value;
  if (t.id === "rLog") ui.rLog = t.checked;
  if (t.id === "importFile" && t.files && t.files[0]) {
    var f = t.files[0], rd = new FileReader();
    rd.onload = function () {
      try {
        var st = JSON.parse(rd.result); if (!st || !st.days || !st.programs) throw new Error("not a Training Log backup");
        var n = Object.keys(st.days).length;
        confirmSheet("Replace your log?", "This backup has " + n + " logged days. It will replace everything on this phone.", "Replace", function () { S = migrate(st); compileAll(); save(); scheduleReminders(); render(); toast("Backup restored"); }, true);
      } catch (e) { toast("Couldn't read that file: " + e.message); }
    };
    rd.readAsText(f); t.value = "";
  }
});
var edT = null;
document.getElementById("sheetIn").addEventListener("input", function (ev) {
  if (!editing) return;
  if (ev.target.id === "pText" || ev.target.id === "pDef") { clearTimeout(edT); edT = setTimeout(refreshEditor, 400); }
});
document.getElementById("sheetIn").addEventListener("change", function (ev) {
  if (editing && ev.target.hasAttribute("data-sched")) editing.p.schedule[+ev.target.getAttribute("data-sched")] = ev.target.value;
});
function saveEditor() {
  var p = editing.p;
  p.name = document.getElementById("pName").value.trim() || "Untitled program";
  p.source = document.getElementById("pSource").value.trim();
  p.notes = document.getElementById("pNotes").value.trim();
  p.defaultSets = document.getElementById("pDef").value.trim() || "3x8";
  p.text = document.getElementById("pText").value;
  document.querySelectorAll("#pSched select").forEach(function (sel) { p.schedule[+sel.getAttribute("data-sched")] = sel.value; });
  var c = TP.parseProgram(p.text, { defaultSets: p.defaultSets });
  if (c.errors.length) { refreshEditor(); toast("Fix the highlighted problem first"); return; }
  p.id = editing.id; S.programs[editing.id] = p;
  var wasNew = editing.isNew, nid = editing.id; editing = null;
  compileAll(); save(); closeSheet(); scheduleReminders(); render();
  if (wasNew) confirmSheet("Program saved", "Start using <b>" + esc(p.name) + "</b> now?", "Use it", function () { useProgram(nid); });
  else toast("Program saved");
}

// Android back button + app lifecycle
if (isNative && P.App) {
  P.App.addListener("backButton", function () {
    if (!document.getElementById("sheet").classList.contains("hidden")) { editing = null; closeSheet(); return; }
    if (ui.tab !== "log") { setTab("log"); return; }
    if (ui.cur !== todayS()) { ui.cur = todayS(); render(); return; }
    P.App.exitApp();
  });
  P.App.addListener("appStateChange", function (s) {
    if (!s.isActive) scheduleTimerNotif();
    else { cancelTimerNotif(); checkDay(); updateHeader(); render(); if (healthOn()) syncHealth(ui.cur).then(function (ch) { if (ch) render(); }); }
  });
}

// ================= Day rollover =================
// The app reads the phone's own date, time and time zone. If it's left open past midnight, move to the new day.
var lastToday = todayS();
function checkDay() {
  var t = todayS(); if (t === lastToday) return;
  if (ui.cur === lastToday) ui.cur = t;
  lastToday = t; if (S) { render(); if (healthOn()) syncHealth(addDays(t, -1), true).then(function () { return syncHealth(t); }).then(function (ch) { if (ch) render(); }); }
}
setInterval(checkDay, 60000);
document.addEventListener("visibilitychange", function () { if (!document.hidden) checkDay(); });

// ================= Boot =================
load().then(function (raw) {
  var st = null; try { st = raw ? JSON.parse(raw) : null; } catch (e) { }
  S = migrate(st || defaultState());
  compileAll(); save(); render();
  if (S.settings.remindOn) scheduleReminders();
  if (healthOn()) syncHealth(addDays(todayS(), -1)).then(function () { return syncHealth(todayS()); }).then(function (ch) { if (ch) render(); });
}).catch(function (e) { view.innerHTML = '<div class="card err">Failed to start: ' + esc(e && e.message) + '</div>'; });

window.TL_DEBUG = { get S() { return S; }, buildReport: buildReport };
})();
