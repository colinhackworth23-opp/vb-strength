// VB Strength — app logic

const CURRENT_WEEK = 1;
const DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const TM = { squat:235, bench:170, dl:325, ohp:115 };

// ── Local cache — convenience layer, Google Sheets remains source of truth ──
const CACHE_KEY = 'vb-strength-cache-v4';
function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch(e) { return {}; }
}
function saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch(e) { /* quota exceeded or storage blocked — fail silently */ }
}
function saveInputToCache(key, value) {
  const cache = loadCache();
  if (!cache.inputs) cache.inputs = {};
  cache.inputs[key] = value;
  saveCache(cache);
}
function saveTMToCache() {
  const cache = loadCache();
  cache.tms = { ...TM };
  saveCache(cache);
}
function markWeekDone(weekN) {
  const cache = loadCache();
  if (!cache.doneWeeks) cache.doneWeeks = [];
  if (!cache.doneWeeks.includes(weekN)) cache.doneWeeks.push(weekN);
  saveCache(cache);
}
function isWeekDone(weekN) {
  const w = WEEKS[weekN - 1];
  if (w && w.done) return true; // hardcoded fallback
  const cache = loadCache();
  return cache.doneWeeks ? cache.doneWeeks.includes(weekN) : false;
}

// ── Set-check persistence ──
// Stored under cache.checks as a flat object keyed by `w{N}d{N}{exName}s{N}` → true
function checkKey(weekN, dayN, exName, setIdx) {
  return `w${weekN}d${dayN}${exName}s${setIdx}`;
}
function saveCheck(weekN, dayN, exName, setIdx, checked) {
  const cache = loadCache();
  if (!cache.checks) cache.checks = {};
  const k = checkKey(weekN, dayN, exName, setIdx);
  if (checked) cache.checks[k] = true;
  else delete cache.checks[k];
  saveCache(cache);
}
function isChecked(weekN, dayN, exName, setIdx) {
  const cache = loadCache();
  if (!cache.checks) return false;
  return !!cache.checks[checkKey(weekN, dayN, exName, setIdx)];
}
function clearChecksForWeek(weekN) {
  const cache = loadCache();
  if (!cache.checks) return;
  const prefix = `w${weekN}d`;
  Object.keys(cache.checks).forEach(k => {
    if (k.startsWith(prefix)) delete cache.checks[k];
  });
  saveCache(cache);
}
// ── Readiness check-in ──
// One tap at the top of each lift day: Rough night drops the day's primary
// loads ~7% (recovery-adjusted); Okay/Fresh run as planned. Local only.
function getReadiness(weekN, slot) {
  const c = loadCache();
  return (c.readiness && c.readiness[`w${weekN}d${slot}`]) || null;
}
function tapReadiness(btn, val) {
  const wrap = btn.closest('.ready-card');
  const weekN = parseInt(wrap.dataset.week, 10);
  const slot = parseInt(wrap.dataset.slot, 10);
  // Snapshot current primary weights so we can animate the change after re-render
  const before = {};
  document.querySelectorAll('.lift-input-weight').forEach(inp => {
    before[`${inp.dataset.ex}|${inp.dataset.s}`] = inp.value;
  });
  const c = loadCache();
  if (!c.readiness) c.readiness = {};
  c.readiness[`w${weekN}d${slot}`] = val;
  saveCache(c);
  haptic(10);
  renderContent(); // re-render so adjusted loads appear
  // Tick each changed number from old → new so the adjustment explains itself
  document.querySelectorAll('.lift-input-weight').forEach(inp => {
    const old = parseFloat(before[`${inp.dataset.ex}|${inp.dataset.s}`]);
    const now = parseFloat(inp.value);
    if (isNaN(old) || isNaN(now) || old === now) return;
    tickNumber(inp, old, now, 350);
  });
}
// Animate an input's value between two numbers with a brief highlight pulse
function tickNumber(inp, from, to, dur) {
  inp.classList.add('num-tick');
  const t0 = performance.now();
  function frame(now) {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    inp.value = Math.round(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(frame);
    else { inp.value = to; setTimeout(() => inp.classList.remove('num-tick'), 350); }
  }
  requestAnimationFrame(frame);
}

// ── Accessory auto-progression ──
// Each progressable exercise (has ex.inc) accumulates an offset in the cache.
// Tapping 'Clean' after the last set adds +inc to all future prescriptions;
// 'Hold' (or silence) keeps the current level. Verdicts are stored per
// week+exercise so re-tapping is idempotent.
function progKey(exName) { return exName.replace(/\s/g,'').toLowerCase(); }
function getProgOffset(exName) {
  const c = loadCache();
  return (c.prog && c.prog[progKey(exName)]) || 0;
}
function setVerdict(weekN, exName, verdict, inc) {
  const c = loadCache();
  if (!c.prog) c.prog = {};
  if (!c.verdicts) c.verdicts = {};
  const vk = `w${weekN}${progKey(exName)}`;
  const prev = c.verdicts[vk];
  if (prev === verdict) return; // no change
  const pk = progKey(exName);
  // Undo previous verdict's effect, apply new one
  if (prev === 'clean') c.prog[pk] = (c.prog[pk] || 0) - inc;
  if (verdict === 'clean') c.prog[pk] = (c.prog[pk] || 0) + inc;
  c.verdicts[vk] = verdict;
  saveCache(c);
}
function getVerdict(weekN, exName) {
  const c = loadCache();
  return (c.verdicts && c.verdicts[`w${weekN}${progKey(exName)}`]) || null;
}
// Apply an offset to a set value: '115'→'125', '+15'→'+20'; leave 'BW'/'grn'/'25s' alone
function bumpVal(v, offset) {
  if (!offset) return v;
  const m = /^(\+?)(\d+(?:\.\d+)?)$/.exec((v||'').toString().trim());
  if (!m) return v;
  return m[1] + (parseFloat(m[2]) + offset);
}

// Restore all checkmark visuals after a re-render
function restoreCheckmarks() {
  const checks = (loadCache().checks) || {};   // single parse for the whole pass
  document.querySelectorAll('.set-check').forEach(checkEl => {
    // Find associated input to read the week/day/ex/s identifiers
    const inputRow = checkEl.closest('.set-input-row');
    const liftRow = checkEl.closest('.lift-row');
    const inp = inputRow ? inputRow.querySelector('.set-input') : (liftRow ? liftRow.querySelector('.lift-input-weight') : null);
    if (!inp) return;
    const w = parseInt(inp.dataset.week, 10);
    const d = parseInt(inp.dataset.day, 10);
    const ex = inp.dataset.ex;
    const s = parseInt(inp.dataset.s, 10);
    if (checks[checkKey(w, d, ex, s)]) {
      checkEl.classList.add('checked');
      inp.classList.add('done');
    }
  });
}
function applyCachedTMs() {
  const cache = loadCache();
  if (cache.tms) {
    Object.keys(TM).forEach(k => {
      if (typeof cache.tms[k] === 'number' && cache.tms[k] > 0) TM[k] = cache.tms[k];
    });
  }
}
function buildCacheKey(inp) {
  const w = inp.getAttribute('data-week');
  const d = inp.getAttribute('data-day');
  const ex = inp.getAttribute('data-ex');
  const s = inp.getAttribute('data-s');
  const type = inp.getAttribute('data-type') || 'val';
  return `w${w}d${d}:${ex}:s${s}:${type}`;
}
function applyCachedInputs() {
  const cache = loadCache();
  if (!cache.inputs) return;
  document.querySelectorAll('.lift-input, .set-input').forEach(inp => {
    const key = buildCacheKey(inp);
    if (cache.inputs[key] !== undefined) inp.value = cache.inputs[key];
  });
}
// Wire up input change listeners — run after each render
function attachCacheListeners() {
  document.querySelectorAll('.lift-input, .set-input').forEach(inp => {
    if (inp.dataset.cacheWired) return;
    inp.dataset.cacheWired = '1';
    const key = buildCacheKey(inp);
    inp.addEventListener('change', () => saveInputToCache(key, inp.value));
  });
}

function r5(n) { return Math.round(n/5)*5; }

// ── Last-time lookup — populated from Google Sheets on app load ──
// Maps exercise name (lowercased, trimmed) → { date, displayDate, sets: [s1, s2, s3, ...] }
// Most recent occurrence wins, regardless of week/phase.
const LAST_TIME = {};
let LAST_TIME_LOADED = false;
// PR tracking — primary lifts only. Maps lift key → { e1rm: number, repMaxes: { 1: maxWeight, 3: maxWeight, ... } }
const PR_HISTORY = { squat: null, bench: null, dl: null, ohp: null };
const PR_LIFT_NAMES = { squat: 'Back Squat', bench: 'Incline Bench', dl: 'Hex Bar Deadlift', ohp: 'Overhead Press' };
function epleyE1RM(weight, reps) {
  if (!weight || !reps || reps < 1) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}
function matchPrimaryLiftKey(exNameRaw) {
  const name = (exNameRaw || '').toLowerCase();
  if (name.includes('__squat') || name.includes('back squat') || name.includes('safety bar')) return 'squat';
  if (name.includes('__bench') || name.includes('incline bench')) return 'bench';
  if (name.includes('__dl') || name.includes('hex bar deadlift') || name.includes('hex deadlift')) return 'dl';
  if (name.includes('__ohp') || name.includes('overhead press') || name.startsWith('ohp')) return 'ohp';
  return null;
}
function parseSetCell(val) {
  if (val === null || val === undefined || val === '' || val === '-') return null;
  const s = val.toString().trim();
  if (s === 'BW') return null;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)$/i);
  if (m) return { weight: parseFloat(m[1]), reps: parseInt(m[2], 10) };
  const numOnly = parseFloat(s);
  if (!isNaN(numOnly)) return { weight: numOnly, reps: 1 };
  return null;
}
// ── History — the Sets tab (one row per set), falling back to the old Log tab ──
// Entries: { date: Date, session, id, name, set, value }
function historyFromSets(rows) {
  const out = [];
  rows.forEach((r, i) => {
    const date = new Date(r[0]);
    if (!r[0] || isNaN(date.getTime()) || !r[4]) return;
    out.push({ date, order: i, week: r[1], day: r[2], session: String(r[3] || ''), id: String(r[4]), name: String(r[5] || r[4]), set: Number(r[6]) || 0, value: r[7] });
  });
  return out;
}
function historyFromLog(rows) {
  const out = [];
  rows.forEach((r, i) => {
    const date = new Date(r[0]);
    const exRaw = (r[3] || '').toString();
    if (!r[0] || isNaN(date.getTime()) || !exRaw) return;
    const session = `${r[0]}|${r[2]}`;
    r.slice(6, 11).forEach((v, s) => {
      if (v === '' || v === null || v === undefined || v === '-') return;
      out.push({ date, order: i, week: r[1], day: r[2], session, id: exId(exRaw), name: exRaw.split('__')[0].trim(), set: s + 1, value: v });
    });
  });
  return out;
}
let HISTORY_SOURCE = null; // 'Sets' once the new tab exists, else 'Log'
function currentHistory() {
  const sets = getCachedTab('Sets');
  let entries = [];
  if (sets && sets.rows && sets.rows.length > 1) { entries = historyFromSets(tabRows(sets)); HISTORY_SOURCE = 'Sets'; }
  else { entries = historyFromLog(tabRows(getCachedTab('Log'))); HISTORY_SOURCE = 'Log'; }
  // Saves still waiting in the outbox count too, so a session shows up the moment it's saved
  return entries.concat(historyFromSets(pendingRows('Sets')).map(e => ({ ...e, order: e.order + 1e6 })));
}
function applyHistory(entries) {
  Object.keys(LAST_TIME).forEach(k => delete LAST_TIME[k]);
  if (!entries.length) return;
  Object.keys(PR_HISTORY).forEach(k => PR_HISTORY[k] = { e1rm: 0, repMaxes: {} });
  // Group sets into one entry per exercise per session
  const groups = {};
  entries.forEach(e => {
    const key = e.session + '|' + e.id;
    const g = groups[key] || (groups[key] = { date: e.date, order: e.order, sets: [] });
    g.sets[e.set > 0 ? e.set - 1 : g.sets.length] = e.value;
    if (e.order > g.order) g.order = e.order;
    // PRs — primary lifts only
    if (PR_HISTORY[e.id]) {
      const sd = parseSetCell(e.value);
      if (sd && sd.weight && sd.reps) {
        const h = PR_HISTORY[e.id];
        const e1 = epleyE1RM(sd.weight, sd.reps);
        if (e1 > h.e1rm) h.e1rm = e1;
        if (!h.repMaxes[sd.reps] || sd.weight > h.repMaxes[sd.reps]) h.repMaxes[sd.reps] = sd.weight;
      }
    }
  });
  Object.entries(groups).forEach(([key, g]) => {
    const id = key.slice(key.lastIndexOf('|') + 1);
    const prev = LAST_TIME[id];
    if (prev && (prev.date > g.date || (+prev.date === +g.date && prev.order > g.order))) return;
    const sets = g.sets.filter(v => v !== undefined && v !== '');
    if (!sets.length) return;
    LAST_TIME[id] = { date: g.date, order: g.order, dateRaw: g.date.toISOString(), displayDate: `${g.date.getMonth()+1}/${g.date.getDate()}`, sets: sets.map(String) };
  });
  LAST_TIME_LOADED = true;
}
// "Last time" + PR data from the copy on the phone, before any network call
function applyLocalHistory() {
  try { applyHistory(currentHistory()); } catch(e) {}
}
// Refresh history from Google. Returns true when anything changed (caller re-renders only then).
async function loadLastTimeData(opts) {
  let changed = false;
  try {
    const sets = await fetchTab('Sets', opts);
    changed = sets.changed;
    if (!(sets.data.rows && sets.data.rows.length > 1)) {
      const log = await fetchTab('Log', opts); // older script, or Sets not created yet
      changed = changed || log.changed;
    }
  } catch(e) {
    return false; // offline — keep what's on the phone
  }
  if (changed) applyLocalHistory();
  return changed;
}
function getLastTime(exerciseNameOrId) {
  return LAST_TIME[exId(exerciseNameOrId)] || null;
}
function formatLastTime(exerciseName) {
  const data = getLastTime(exerciseName);
  if (!data) return '';
  const setsStr = data.sets.join(' / ');
  return `<div class="acc-last"><span>Last: ${setsStr}</span><span class="acc-last-date">${data.displayDate}</span></div>`;
}

// ── PR detection + celebration ──
// Build a snapshot of historical PRs BEFORE saving, then compare against this session's lifts.
function snapshotPRs() {
  const snap = {};
  Object.keys(PR_HISTORY).forEach(k => {
    if (!PR_HISTORY[k]) { snap[k] = { e1rm: 0, repMaxes: {} }; return; }
    snap[k] = { e1rm: PR_HISTORY[k].e1rm, repMaxes: { ...PR_HISTORY[k].repMaxes } };
  });
  return snap;
}
// Parse the just-saved session's primary lift data from DOM.
// Returns array of { liftKey, weight, reps } — best set per lift only (highest weight).
function getSessionLiftBests(weekN, dayN) {
  const liftRaw = {};
  document.querySelectorAll(`.lift-input[data-week="${weekN}"][data-day="${dayN}"]`).forEach(inp => {
    const exKey = inp.getAttribute('data-ex'); // "Back squat / safety bar__squat"
    const s = parseInt(inp.getAttribute('data-s'));
    const type = inp.getAttribute('data-type');
    if (!liftRaw[exKey]) liftRaw[exKey] = {};
    if (!liftRaw[exKey][s]) liftRaw[exKey][s] = {};
    liftRaw[exKey][s][type] = inp.value;
  });
  const sessionLifts = [];
  Object.entries(liftRaw).forEach(([exKey, sets]) => {
    const liftKey = matchPrimaryLiftKey(exKey);
    if (!liftKey) return;
    // Find the best e1rm-producing set across this session for this lift
    let best = null;
    Object.values(sets).forEach(set => {
      const w = parseFloat(set.weight);
      const r = parseInt(set.reps);
      if (isNaN(w) || isNaN(r) || w <= 0 || r <= 0) return;
      const e1rm = epleyE1RM(w, r);
      if (!best || e1rm > best.e1rm) best = { weight: w, reps: r, e1rm };
    });
    if (best) sessionLifts.push({ liftKey, ...best });
  });
  return sessionLifts;
}
// Compare session lifts against snapshot and return queue of PR events.
function detectPRs(snapshot, sessionLifts) {
  const prs = [];
  sessionLifts.forEach(lift => {
    const prev = snapshot[lift.liftKey] || { e1rm: 0, repMaxes: {} };
    // e1RM PR — only if there was a prior baseline (skip first-ever logged session for a lift)
    if (prev.e1rm > 0 && lift.e1rm > prev.e1rm) {
      prs.push({
        type: 'e1rm',
        liftKey: lift.liftKey,
        liftName: PR_LIFT_NAMES[lift.liftKey],
        value: lift.e1rm,
        prev: prev.e1rm,
        repsContext: `${lift.weight} × ${lift.reps}`,
      });
    }
    // Rep-max PR at this rep range
    const prevRM = prev.repMaxes[lift.reps] || 0;
    if (prevRM > 0 && lift.weight > prevRM) {
      prs.push({
        type: 'repmax',
        liftKey: lift.liftKey,
        liftName: PR_LIFT_NAMES[lift.liftKey],
        value: lift.weight,
        prev: prevRM,
        reps: lift.reps,
      });
    }
  });
  return prs;
}

// ── Confetti engine ──
let confettiAnimId = null;
function startConfetti() {
  const canvas = document.getElementById('prConfetti');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.scale(dpr, dpr);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const colors = ['#e8a33d', '#f5c870', '#fafaf7', '#bfb8a8', '#d97757', '#7a9b76'];
  const pieces = [];
  for (let i = 0; i < 140; i++) {
    pieces.push({
      x: Math.random() * W,
      y: -20 - Math.random() * H * 0.5,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 4,
      w: 6 + Math.random() * 8,
      h: 10 + Math.random() * 8,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.2,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: Math.random() < 0.5 ? 'rect' : 'circle',
    });
  }
  function frame() {
    ctx.clearRect(0, 0, W, H);
    pieces.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      p.vy += 0.05; // slight gravity acceleration
      if (p.y > H + 50) {
        p.y = -20;
        p.x = Math.random() * W;
        p.vy = 2 + Math.random() * 4;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
    confettiAnimId = requestAnimationFrame(frame);
  }
  frame();
}
function stopConfetti() {
  if (confettiAnimId) {
    cancelAnimationFrame(confettiAnimId);
    confettiAnimId = null;
  }
  const canvas = document.getElementById('prConfetti');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// ── PR queue + display ──
let PR_QUEUE = [];
let prAutoDismissTimer = null;
function celebratePRs(prs) {
  if (!prs || !prs.length) return;
  PR_QUEUE = prs.slice();
  showNextPR();
}
function showNextPR() {
  if (!PR_QUEUE.length) return;
  const pr = PR_QUEUE.shift();
  const overlay = document.getElementById('prOverlay');
  if (!overlay) return;
  const emojis = ['🎉', '💪', '🔥', '⚡', '🏆', '🚀'];
  document.getElementById('prEmoji').textContent = emojis[Math.floor(Math.random() * emojis.length)];
  document.getElementById('prKicker').textContent = pr.type === 'e1rm' ? 'NEW ESTIMATED 1RM' : `NEW ${pr.reps}-REP MAX`;
  document.getElementById('prHeadline').textContent = pr.liftName;
  document.getElementById('prWeight').textContent = pr.value + ' lbs';
  document.getElementById('prSubtype').textContent = pr.type === 'e1rm'
    ? `From ${pr.repsContext}`
    : `At ${pr.reps} reps`;
  document.getElementById('prPrev').innerHTML = pr.prev > 0
    ? `Previous best: <strong>${pr.prev} lbs</strong> &nbsp;·&nbsp; <strong>+${pr.value - pr.prev} lbs</strong>`
    : '';
  // Reset animations by removing & re-adding visible class
  overlay.classList.remove('visible');
  // Force reflow so animations restart on the next add
  void overlay.offsetWidth;
  overlay.classList.add('visible');
  haptic(40);
  setTimeout(() => haptic(60), 500);
  setTimeout(() => haptic(80), 1100);
  startConfetti();
  // Auto-dismiss after 10s so confetti doesn't run the battery down if the phone is set down
  if (prAutoDismissTimer) clearTimeout(prAutoDismissTimer);
  prAutoDismissTimer = setTimeout(dismissPR, 10000);
}
function dismissPR() {
  const overlay = document.getElementById('prOverlay');
  if (!overlay) return;
  if (prAutoDismissTimer) { clearTimeout(prAutoDismissTimer); prAutoDismissTimer = null; }
  overlay.classList.remove('visible');
  stopConfetti();
  // Brief delay before showing next so the transition feels distinct
  setTimeout(showNextPR, 400);
}

// ── Haptics ──
function haptic(ms) {
  if (navigator.vibrate) navigator.vibrate(ms || 10);
}

// ── Wake lock — keep screen on during workouts ──
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch(e) { /* fallback: browser doesn't support, ignore */ }
}
async function releaseWakeLock() {
  if (wakeLock) { try { await wakeLock.release(); } catch(e){} wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !wakeLock) requestWakeLock();
});

// ── Live TM adjustment ──
function updateTM(lift, value) {
  const n = parseInt(value);
  if (isNaN(n) || n < 50 || n > 800) return;
  TM[lift] = n;
  saveTMToCache();
  haptic(8);
  renderContent();
}

function renderMaxesInputs() {
  document.getElementById('tm-squat').value = TM.squat;
  document.getElementById('tm-bench').value = TM.bench;
  document.getElementById('tm-dl').value = TM.dl;
  document.getElementById('tm-ohp').value = TM.ohp;
}

// ── Plate calculator ──
let currentBar = 45;
function togglePlateCalc() {
  const m = document.getElementById('plateModal');
  m.classList.toggle('visible');
  if (m.classList.contains('visible')) {
    haptic(8);
    setTimeout(() => document.getElementById('plateInput').focus(), 50);
  }
}
function setBar(weight) {
  currentBar = weight;
  document.querySelectorAll('.bar-btn').forEach(b => b.classList.remove('bar-active'));
  document.getElementById('bar' + weight).classList.add('bar-active');
  calcPlates();
}
function calcPlates() {
  const target = parseFloat(document.getElementById('plateInput').value);
  const resultEl = document.getElementById('plateResult');
  if (!target || target < currentBar) {
    resultEl.innerHTML = target ? `<span style="color:var(--red)">Target must be at least ${currentBar} lbs (bar weight).</span>` : 'Enter a target weight above.';
    return;
  }
  const perSide = (target - currentBar) / 2;
  if (perSide < 0) { resultEl.innerHTML = '<span style="color:var(--red)">Target is less than bar weight.</span>'; return; }
  const plates = [45, 35, 25, 10, 5, 2.5];
  let remaining = perSide;
  const loaded = [];
  plates.forEach(p => {
    const count = Math.floor(remaining / p);
    if (count > 0) {
      loaded.push({ weight: p, count });
      remaining -= count * p;
    }
  });
  const leftover = remaining > 0.01 ? remaining : 0;
  let html = `<div style="font-size:13px;color:var(--text2);margin-bottom:8px">Per side (${perSide} lbs):</div>`;
  if (loaded.length === 0) {
    html += `<div style="color:var(--text2)">Just the bar.</div>`;
  } else {
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
    loaded.forEach(p => {
      html += `<div class="plate-chip">${p.count} × ${p.weight}</div>`;
    });
    html += '</div>';
  }
  if (leftover > 0) {
    html += `<div style="font-size:12px;color:var(--amber);margin-top:8px">Note: ${leftover.toFixed(1)} lbs short — can't be loaded with standard plates.</div>`;
  }
  resultEl.innerHTML = html;
}

// ── Today detection ──
function getTodayDayIdx() {
  const d = new Date().getDay(); // 0=Sun
  return [6,0,1,2,3,4,5][d]; // remap to Mon=0..Sun=6
}
function getTodayWeekIdx() {
  // Week 1 started Aug 3, 2026 (Monday). Parse as LOCAL time with Y,M,D args.
  const start = new Date(2026, 8, 28); // Monday Sep 28 2026 (month is 0-indexed)
  const today = new Date();
  // Normalize both to midnight local so DST and hour-of-day don't skew the math
  const startMid = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.floor((todayMid - startMid) / 86400000);
  const weekIdx = Math.max(0, Math.min(9, Math.floor(diffDays / 7)));
  return weekIdx;
}

// ── Timer ──
let timerInterval = null;
let timerTotal = 0;
let timerLeft = 0;
const circumference = 2 * Math.PI * 21;

// ── Audio beep for timer countdown ──
// iOS Safari (especially in standalone/PWA mode) has strict rules about Web Audio:
//   1. AudioContext must be created inside a user gesture handler
//   2. resume() returns a Promise and the context may linger in 'suspended' state
//   3. If the first gesture doesn't fully unlock it, subsequent scheduled sounds silently fail
// This implementation re-attempts unlock on every tap until the context is confirmed running.
let audioCtx = null;
let audioUnlocked = false;
function unlockAudio() {
  // Must run inside a real user-gesture handler (tap/click).
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      audioCtx = new Ctor();
    }
    // Always try to resume — even if previously "unlocked", iOS can re-suspend
    // the context when the PWA backgrounds and returns.
    if (audioCtx.state === 'suspended') {
      const p = audioCtx.resume();
      if (p && typeof p.then === 'function') {
        p.then(() => { audioUnlocked = (audioCtx.state === 'running'); }).catch(() => {});
      }
    } else if (audioCtx.state === 'running') {
      audioUnlocked = true;
    }
    // Play a silent priming tick inside the gesture — fully activates the audio graph on iOS.
    // We do this on every tap (it's cheap) so that if the first attempt failed, later taps recover.
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.01);
  } catch(e) { /* audio blocked — silently fail */ }
}
function beep(freq, durationMs) {
  try {
    if (!audioCtx) return;
    // Attempt to resume if the context has been suspended (e.g. by backgrounding).
    // This won't unlock a never-unlocked context, but it will wake a sleeping one.
    if (audioCtx.state === 'suspended') {
      const p = audioCtx.resume();
      if (p && typeof p.then === 'function') p.catch(() => {});
    }
    // If we can't produce sound, bail before creating nodes (prevents leaks).
    if (audioCtx.state !== 'running') return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durationMs / 1000);
    osc.start();
    osc.stop(audioCtx.currentTime + durationMs / 1000);
  } catch(e) { /* silently fail */ }
}

function startTimer(seconds, label) {
  stopTimer();
  timerTotal = seconds;
  timerLeft = seconds;
  document.getElementById('timerLabel').textContent = label;
  const overlay = document.getElementById('timerOverlay');
  overlay.classList.add('visible');
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timerLeft--;
    updateTimerDisplay();
    // Countdown beeps: short at 5,4,3,2; longer higher beep at 1/end
    if (timerLeft === 5 || timerLeft === 4 || timerLeft === 3 || timerLeft === 2) {
      beep(660, 100);
    } else if (timerLeft === 1) {
      beep(880, 200);
    }
    if (timerLeft <= 0) {
      beep(990, 350);
      stopTimer();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(timerLeft / 60);
  const s = timerLeft % 60;
  document.getElementById('timerCountdown').textContent = `${m}:${s.toString().padStart(2,'0')}`;
  const pct = timerLeft / timerTotal;
  const offset = circumference * (1 - pct);
  document.getElementById('timerArc').style.strokeDashoffset = offset;
  document.getElementById('timerArc').style.strokeDasharray = circumference;
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  document.getElementById('timerOverlay').classList.remove('visible');
}

// ── Progress tracking ──
function updateProgress() {
  const activeDay = document.querySelector('.day-screen.active');
  if (!activeDay) return;
  const checks = activeDay.querySelectorAll('.set-check');
  const done = activeDay.querySelectorAll('.set-check.checked');
  const total = checks.length;
  const completed = done.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const fillEl = document.getElementById('progressFill');
  fillEl.style.width = pct + '%';
  fillEl.classList.toggle('complete', pct === 100 && total > 0);
  document.getElementById('progressLabel').textContent = pct === 100 && total > 0 ? `Session complete — ${total} sets` : `${completed} of ${total} sets completed`;
}

// ── Set check handler ──
function handleSetCheck(checkEl, isWorkingSet, restOverride) {
  unlockAudio();
  checkEl.classList.toggle('checked');
  haptic(checkEl.classList.contains('checked') ? 12 : 6);
  const checked = checkEl.classList.contains('checked');
  // Find the input to mark "done" — accessories have .set-input inside .set-input-row, primary lifts have .lift-input-weight in the row
  const inputRow = checkEl.closest('.set-input-row');
  const liftRow = checkEl.closest('.lift-row');
  const inp = inputRow ? inputRow.querySelector('.set-input') : (liftRow ? liftRow.querySelector('.lift-input-weight') : null);
  if (checked) {
    if (inp) inp.classList.add('done');
    // rest:0 marks warm-up / cool-down / conditioning rows — no rest timer for those
    if (restOverride !== 0) {
      const restTime = restOverride || (isWorkingSet ? 180 : 90);
      const label = restOverride
        ? `Rest — ${Math.round(restOverride/60*10)/10} min, full recovery`
        : (isWorkingSet ? 'Rest — 3 min for primary lifts' : 'Rest — 90s for accessories');
      startTimer(restTime, label);
    }
    requestWakeLock();
  } else {
    if (inp) inp.classList.remove('done');
    stopTimer();
  }
  // Persist check state
  if (inp) {
    const w = parseInt(inp.dataset.week, 10);
    const d = parseInt(inp.dataset.day, 10);
    const ex = inp.dataset.ex;
    const s = parseInt(inp.dataset.s, 10);
    if (!isNaN(w) && !isNaN(d) && ex && !isNaN(s)) saveCheck(w, d, ex, s, checked);
  }
  // Reveal/hide progression verdict when an accessory's sets are all checked
  maybeRevealVerdict(checkEl);
  // Clear all active-row highlights
  document.querySelectorAll('.acc-row, .lift-row').forEach(r => r.classList.remove('active-row'));
  // Highlight current row only when unchecking (mid-exercise state)
  const row = checkEl.closest('.acc-row') || checkEl.closest('.lift-row');
  if (row && !checked) row.classList.add('active-row');
  updateProgress();
}

// ── Autofill ──
function autofill(btn) {
  const body = btn.closest('.acc-body');
  const inputs = body.querySelectorAll('.set-input');
  if (inputs.length < 2) return;
  const firstVal = inputs[0].value;
  if (!firstVal) return;
  inputs.forEach((inp, i) => { if (i > 0 && !inp.classList.contains('done')) inp.value = firstVal; });
}

// ── Auto-progression interactions ──
function allSetsChecked(weekN, dayN, exName, count) {
  const checks = (loadCache().checks) || {};
  for (let s = 0; s < count; s++) {
    if (!checks[checkKey(weekN, dayN, exName, s)]) return false;
  }
  return count > 0;
}
function tapVerdict(btn, verdict) {
  const wrap = btn.closest('.prog-verdict');
  const exName = wrap.dataset.ex;
  const inc = parseFloat(wrap.dataset.inc);
  const weekN = parseInt(wrap.dataset.week, 10);
  setVerdict(weekN, exName, verdict, inc);
  wrap.querySelectorAll('.prog-chip').forEach(c => c.classList.remove('selected'));
  btn.classList.add('selected');
  haptic(verdict === 'clean' ? 15 : 8);
}
function maybeRevealVerdict(checkEl) {
  const row = checkEl.closest('.acc-row');
  if (!row) return;
  const wrap = row.querySelector('.prog-verdict');
  if (!wrap) return;
  const total = row.querySelectorAll('.set-check').length;
  const done = row.querySelectorAll('.set-check.checked').length;
  if (done === total && total > 0) {
    if (!wrap.classList.contains('revealed')) { wrap.classList.add('revealed'); haptic(10); }
  } else {
    wrap.classList.remove('revealed');
  }
}

// ── Toggle cue ──
function toggleCue(header) {
  const row = header.closest('.acc-row');
  const cue = row.querySelector('.acc-cue');
  const last = row.querySelector('.acc-last');
  const chevron = row.querySelector('.acc-chevron');
  cue.classList.toggle('visible');
  if (last) last.classList.toggle('visible');
  chevron.classList.toggle('open');
}

let currentWeekIdx = getTodayWeekIdx();
let currentDayIdx = getTodayDayIdx();

// ── Builders ──
function calcLoads(weekN) {
  const w = WEEKS[weekN - 1];
  const out = {};
  ['squat','bench','dl'].forEach(lift => {
    const tm = TM[lift];
    const pcts = (w.pcts && w.pcts[lift]) || [];
    const wu1 = r5(tm * 0.60);
    const ws = pcts.map(p => r5(tm * p));
    const wu2 = (w.deload || !ws.length) ? null : r5((wu1 + ws[0]) / 2);
    out[lift] = { wu1, wu2, ws, pcts };
  });
  return out;
}

function liftRows(loads, key, name, w, dayN, locked) {
  const { wu1, wu2, ws, pcts } = loads[key];
  const isTest = w.testing;
  const rLabel = isTest ? 'Attempt' : 'Working set';
  const bClass = isTest ? 'badge-attempt' : 'badge-work';
  const rCount = isTest ? 1 : w.reps;
  const pLabels = isTest
    ? ['88% TM','93% TM','97% TM','100% TM']
    : pcts.map(p => `${Math.round(p*100)}% TM`);
  let h = `<div class="lift-row"><div class="lift-label">${name}<div class="lift-sub">Pattern activation ~60% TM</div></div><span class="badge badge-wu">${w.deload?'3':'5'} reps</span><div class="lift-target">${wu1} lbs</div></div>`;
  if (wu2) h += `<div class="lift-row"><div class="lift-label">Warm-up 2<div class="lift-sub">Bridge to working weight</div></div><span class="badge badge-wu">2 reps</span><div class="lift-target">${wu2} lbs</div></div>`;
  ws.forEach((wt, i) => {
    const disAttr = locked ? ' disabled' : '';
    const exKey = `${name}__${key}`;
    const checkHTML = locked ? '' : `<div class="set-check lift-check" onclick="handleSetCheck(this,true)"></div>`;
    h += `<div class="lift-row"><div class="lift-label">${rLabel} ${i+1}<div class="lift-sub">${pLabels[i]}</div></div>` +
      `<input class="lift-input lift-input-reps" data-week="${w.n}" data-day="${dayN}" data-ex="${exKey}" data-s="${i}" data-type="reps" type="text" inputmode="numeric" value="${rCount}"${disAttr}>` +
      `<span class="lift-unit">reps</span>` +
      `<input class="lift-input lift-input-weight" data-week="${w.n}" data-day="${dayN}" data-ex="${exKey}" data-s="${i}" data-type="weight" type="text" inputmode="numeric" value="${wt}"${disAttr}>` +
      `<span class="lift-unit">lbs</span>` +
      checkHTML +
      `</div>`;
  });
  return h;
}

function accRow(ex, weekN, dayN, isWorking, locked) {
  const idBase = `w${weekN}d${dayN}${ex.name.replace(/\s/g,'').substring(0,8)}`;
  const inputs = ex.sets.map((v, si) => {
    const id = `${idBase}s${si}`;
    const disAttr = locked ? ' disabled' : '';
    const restArg = (ex.rest !== undefined) ? `,${ex.rest}` : '';
    const checkFn = isWorking ? `handleSetCheck(this,true${restArg})` : `handleSetCheck(this,false${restArg})`;
    return `<div class="set-wrap">
      <span class="set-lbl">S${si+1}</span>
      <div class="set-input-row">
        <input id="${id}" class="set-input" data-week="${weekN}" data-day="${dayN}" data-ex="${ex.name}" data-exid="${ex.id || exId(ex.name)}" data-s="${si}" type="text" value="${v}" inputmode="text"${disAttr}>
        ${!locked ? `<div class="set-check" onclick="${checkFn}"></div>` : ''}
      </div>
    </div>`;
  }).join('');
  const autofillBtn = !locked && ex.sets.length > 1 ? `<button class="autofill-btn" onclick="autofill(this)">Copy to all</button>` : '';
  // Auto-progression verdict chips — hidden until the last set is checked
  let verdictHTML = '';
  let progLine = '';
  if (ex.inc && !locked) {
    const off = getProgOffset(ex.name);
    if (off) progLine = `<div class="acc-last visible" style="display:block">Progression earned: +${off}</div>`;
    const v = getVerdict(weekN, ex.name);
    const topSet = ex.sets[ex.sets.length - 1];
    const nextVal = bumpVal(topSet, ex.inc);
    verdictHTML = `<div class="prog-verdict${allSetsChecked(weekN, dayN, ex.name, ex.sets.length) ? ' revealed' : ''}" data-ex="${ex.name}" data-inc="${ex.inc}" data-week="${weekN}">
      <span class="prog-q">Next week?</span>
      <button class="prog-chip prog-clean${v==='clean'?' selected':''}" onclick="tapVerdict(this,'clean')">Clean → ${nextVal}</button>
      <button class="prog-chip prog-hold${v==='hold'?' selected':''}" onclick="tapVerdict(this,'hold')">Hold</button>
    </div>`;
  }
  return `<div class="acc-row">
    <div class="acc-header" onclick="toggleCue(this)">
      <div class="acc-header-left">
        <div class="acc-top">
          <span class="acc-name">${ex.name}</span>${ex.ss ? `<span class="ss-badge">SS ${ex.ss}</span>` : ''}
          <span class="acc-meta">${ex.meta||ex.vol}</span>
          <span class="acc-rec">rec: ${ex.rec}</span>
        </div>
      </div>
      <span class="acc-chevron">▾</span>
    </div>
    ${formatLastTime(ex.id || ex.name)}${typeof progLine !== 'undefined' ? progLine : ''}
    <div class="acc-cue">${ex.cue}</div>
    <div class="acc-body">
      <div class="set-inputs">${inputs}</div>
      ${autofillBtn}
      ${verdictHTML}
    </div>
  </div>`;
}

function accRows(arr, weekN, dayN, isWorking, locked) {
  return arr.map(ex => {
    let sets = Array.isArray(ex.sets) ? ex.sets : (ex.sets[weekN] || []);
    if (!sets.length) return ''; // exercise not programmed this week
    if (ex.inc) {
      const off = getProgOffset(ex.name);
      if (off) sets = sets.map(v => bumpVal(v, off));
    }
    return accRow({ ...ex, sets }, weekN, dayN, isWorking, locked);
  }).join('');
}

function getPB(weekN, dayN) {
  if (dayN === 0) return weekN <= 1 ? PB.monEarly : PB.monLate;
  if (dayN === 1) return weekN <= 1 ? PB.tueEarly : PB.tueLate;
  return PB.fri;
}

function getPBTitle(dayN) {
  if (dayN === 0) return 'Power block · vertical jump (15 min)';
  if (dayN === 1) return 'Power block · hitting power (15 min)';
  return 'Power block · explosiveness (15 min)';
}

function getGymCallout(weekN, slot) {
  const phase = weekN <= 2 ? 'Foundation — sets of 10, technique before load. Film your front squat rack position this week.'
    : weekN <= 5 ? 'Build — sets of 8. The Clean chip is the ONLY thing that raises weight now; baselines stay flat.'
    : weekN <= 9 ? 'Peak volume — sets of 6, heaviest working sets of the block.'
    : 'Deload — light loads, same movements. Flush fatigue before Block 2.';
  if (slot === 'lower') return `Block 1 Week ${weekN}. ${phase} Spanish squat holds go FIRST today, before you touch a bar — they quiet the knee down before squats.`;
  if (slot === 'pushPull') return `Push + pull. Clean and jerk first while you are fresh, then pull-ups before any rowing. Pull-up protocol: ${weekN <= 2 ? 'bodyweight sets, 1 rep shy of failure.' : weekN <= 4 ? 'bodyweight sets plus banded negatives, 4s down.' : weekN <= 6 ? '+10 lbs, sets of 5.' : weekN <= 8 ? '+20 lbs, sets of 5.' : 'test your new ceiling.'} Bench and row are a superset — alternate them.`;
  return `Power day. Hang cleans FIRST, 2.5 min rest, speed decides the load. Front squat right after while the rack position is grooved, then the hex bar. Hip thrusts replace Good Mornings this block — three spine-loaded lifts is already enough for one day.`;
}
function getHomeCallout(slot) {
  if (slot === 'homeUpper') return 'Home upper — the session that builds the chest, arms and forearms you asked for. Pull-up practice first: sets at about half your max, never to failure. Overhead triceps extensions are new and they are the biggest gap your old program had.';
  return 'Home lower + core, placed on Tuesday so Friday power day gets fresh legs. Rear foot LOW on Bulgarians — about 12 inches, not the couch. Everything here is joint insurance plus your third calf dose of the week.';
}

function buildGymDay(weekN, slot, w, loads, calDay) {
  const locked = isWeekDone(weekN);
  const dayLabel = DAY_NAMES[calDay];
  const titles = { lower:'Lower body + hinge', pushPull:'Push + pull', power:'Power + posterior chain' };
  const primaryMap = { lower:'squat', pushPull:'bench', power:'dl' };
  const liftNames = { squat:'Back squat / safety bar', bench:'Incline bench', dl:'Hex bar deadlift' };
  const slot_title = titles[slot] || slot;
  const primaryKey = primaryMap[slot];
  let h = `<div style="padding:12px 16px 0"><span class="day-tag tag-lift">${slot_title}</span></div>`;
  if (locked) h += `<div class="locked-banner"><span>✓ Week ${weekN} completed — view only</span></div>`;
  // Check-in prompt for weeks 3, 5, 8
  if (w.checkin && !locked && slot === 'lower') h += buildCheckinPrompt(weekN);
  if (w.thanksgiving && !locked && slot === 'lower') h += `<div class="callout c-amber">Thanksgiving is Thursday this week and it lands in your heaviest week. If you are travelling, tell Claude and this becomes the deload week instead — do not try to force a peak week around a holiday.</div>`;
  // Readiness check-in
  const readiness = getReadiness(weekN, slot === 'lower' ? 0 : slot === 'pushPull' ? 1 : 2);
  const slotIdx = slot === 'lower' ? 0 : slot === 'pushPull' ? 1 : 2;
  if (!locked) {
    const opts = [['rough','😴','Rough night'],['okay','😐','Okay'],['fresh','💪','Fresh']];
    h += `<div class="ready-card" data-week="${weekN}" data-slot="${slotIdx}">
      <span class="ready-q">How'd you sleep?</span>
      <div class="ready-chips">${opts.map(([v,e,l]) =>
        `<button class="ready-chip${readiness===v?' selected':''}" onclick="tapReadiness(this,'${v}')">${e} ${l}</button>`).join('')}
      </div></div>`;
  }
  if (readiness === 'rough' && !locked) {
    loads = JSON.parse(JSON.stringify(loads));
    ['squat','bench','dl'].forEach(k => { loads[k].ws = loads[k].ws.map(x => r5(x * 0.93)); });
    h += `<div class="callout c-amber">Loads adjusted −7% for recovery. Accessories stay as listed.</div>`;
  }
  h += `<div class="callout c-blue">${getGymCallout(weekN, slot)}</div>`;
  // Warm-up — identical general block every day, then a primer specific to today
  const primers = { lower: ACC.primerLower, pushPull: ACC.primerPushPull, power: ACC.primerPower };
  h += `<div class="section"><div class="section-header">Warm-up · same every day</div>${accRows(ACC.warmupGeneral, weekN, slotIdx, false, locked)}</div>`;
  if (primers[slot]) {
    h += `<div class="section"><div class="section-header">Primer · today only</div>${accRows(primers[slot], weekN, slotIdx, false, locked)}</div>`;
  }
  // Primary lift (power day: speed work comes before the heavy hex bar pull)
  if (slot === 'power') {
    // Speed work first: hang clean + front squat come BEFORE the heavy hex bar pull
    h += `<div class="section"><div class="section-header">Speed work · before the heavy pull</div>${accRows(ACC.powerPre, weekN, slotIdx, false, locked)}</div>`;
    h += `<div class="section"><div class="section-header">Hex bar deadlift · primary lift</div>${liftRows(loads, 'dl', 'Hex bar deadlift', w, slotIdx, locked)}</div>`;
  } else if (loads[primaryKey] && loads[primaryKey].ws.length) {
    const pairNote = slot === 'pushPull' ? ' · SS A with chest-supported row' : '';
    h += `<div class="section"><div class="section-header">${liftNames[primaryKey]} · primary lift${pairNote}</div>${liftRows(loads, primaryKey, liftNames[primaryKey], w, slotIdx, locked)}</div>`;
  }
  h += `<div class="section"><div class="section-header">Accessories · tap for cues + last time</div>${accRows(ACC[slot], weekN, slotIdx, false, locked)}</div>`;
  // Conditioning finisher — Friday only, from Week 3, always last training item
  if (slot === 'power' && (ACC.conditioning[0].sets[weekN] || []).length) {
    h += `<div class="section"><div class="section-header">Conditioning · after the lifting</div>${accRows(ACC.conditioning, weekN, slotIdx, false, locked)}</div>`;
  }
  const cooldowns = { lower: ACC.cooldownLower, pushPull: ACC.cooldownPushPull, power: ACC.cooldownPower };
  if (cooldowns[slot]) {
    h += `<div class="section"><div class="section-header">Cool-down · optional</div>${accRows(cooldowns[slot], weekN, slotIdx, false, locked)}</div>`;
  }
  if (!locked) {
    h += `<div id="status-${weekN}-${slotIdx}"></div>`;
    h += `<button class="save-btn" onclick="saveSession(${weekN},${slotIdx},'${dayLabel}',this)">Save session to Google Sheets</button>`;
    h += `<button class="share-btn" onclick="shareDay(${weekN-1},${calDay},'Block 1 · Week ${weekN} · ${dayLabel} — ${slot_title}')">Share this workout</button>`;
  }
  if (w.deload && slot === 'power') h += buildEndReport();
  return h + `<div class="spacer"></div>`;
}

function buildEndReport() {
  const estStartTM = { squat: 230, bench: 170, dl: 315, ohp: 115 };
  const gains = {};
  ['squat','bench','dl','ohp'].forEach(k => { gains[k] = TM[k] - estStartTM[k]; });
  return `
  <div class="section" style="margin-top:20px">
    <div class="section-header">Program complete · end-of-program report</div>
    <div class="report-hero">
      <div class="report-title">🏐 Block 1 — Hypertrophy complete</div>
      <div class="report-body">You finished. Now let's build the next block from your actual data.</div>
    </div>
    <div style="padding:4px 0">
      <div class="report-stat"><span class="report-stat-label">Back Squat TM</span><span><span class="report-stat-val">${TM.squat} lbs</span>${gains.squat !== 0 ? `<span class="report-delta" style="color:${gains.squat > 0 ? 'var(--green)' : 'var(--red)'}">${gains.squat > 0 ? '+' : ''}${gains.squat}</span>` : ''}</span></div>
      <div class="report-stat"><span class="report-stat-label">Incline Bench TM</span><span><span class="report-stat-val">${TM.bench} lbs</span>${gains.bench !== 0 ? `<span class="report-delta" style="color:${gains.bench > 0 ? 'var(--green)' : 'var(--red)'}">${gains.bench > 0 ? '+' : ''}${gains.bench}</span>` : ''}</span></div>
      <div class="report-stat"><span class="report-stat-label">Hex Bar Deadlift TM</span><span><span class="report-stat-val">${TM.dl} lbs</span>${gains.dl !== 0 ? `<span class="report-delta" style="color:${gains.dl > 0 ? 'var(--green)' : 'var(--red)'}">${gains.dl > 0 ? '+' : ''}${gains.dl}</span>` : ''}</span></div>
      <div class="report-stat"><span class="report-stat-label">OHP TM</span><span><span class="report-stat-val">${TM.ohp} lbs</span>${gains.ohp !== 0 ? `<span class="report-delta" style="color:${gains.ohp > 0 ? 'var(--green)' : 'var(--red)'}">${gains.ohp > 0 ? '+' : ''}${gains.ohp}</span>` : ''}</span></div>
    </div>
  </div>
  <div class="callout c-blue" style="margin-top:12px">Block 1 — Hypertrophy complete. Share your Google Sheet and we'll build the off-season program from your actual data.</div>`;
}

function buildWed(weekN, locked) {
  const w = WEEKS[weekN - 1];
  let h = `<div style="padding:12px 16px 0"><span class="day-tag tag-vb">VB practice tonight</span></div>`;
  if (locked) h += `<div class="locked-banner"><span>✓ Week ${weekN} completed — view only</span></div>`;
  if (w && w.tournament) {
    h += `<div class="callout c-amber" style="margin-top:12px">🏐 Tournament this Saturday: ${w.tournament}. Keep everything easy this week — you're tapering.</div>`;
  }
  h += `<div class="callout c-green" style="margin-top:12px">Practice 8–10:30pm. No lifting today. Do this pre-practice prep 30–45 min before you play.</div>`;
  h += `<div class="section"><div class="section-header">Pre-practice activation · 20–25 min</div>`;
  [['Assault bike easy','Low intensity — raise core temp without spiking HR','5 min'],
   ['Hip 90/90 switches','Full ROM both sides — hip capsule prep for lateral movement','2 × 8 each'],
   ['Ankle CARs + heel raise','Dorsiflexion — directly limits jump landing depth if stiff','2 × 10 each'],
   ['Adductor rock-back','Groin prep — lateral VB movement protection','2 × 8 each'],
   ['Band pull-apart','Rear cuff activation — mandatory before spiking and blocking','3 × 15'],
   ['Prone Y-T-W','Lower trap + scapular control — overhead hitting mechanics','2 × 8 each'],
   ['Ankle pogo (small, fast)','Achilles stiffness — biggest factor in reactive jump height','2 × 20'],
   ['Approach jumps at 70%','Pattern warm-up — don\'t go max effort before practice','3–4 reps'],
  ].forEach(([n,d,v]) => {
    h += `<div class="mob-row"><div class="mob-check" onclick="this.classList.toggle('checked')"></div><div class="mob-info"><div class="mob-name">${n}</div><div class="mob-detail">${d}</div><div class="mob-vol">${v}</div></div></div>`;
  });
  h += `</div><div class="callout c-green">VB practice is your energy systems work tonight. Don't add any gym sessions after.</div><div class="spacer"></div>`;
  return h;
}

function buildThu(weekN, locked) {
  let h = `<div style="padding:12px 16px 0"><span class="day-tag tag-rest">Recovery day</span></div>`;
  if (locked) h += `<div class="locked-banner"><span>✓ Week ${weekN} completed — view only</span></div>`;
  h += `<div class="callout c-gray" style="margin-top:12px">Between VB practice last night and heavy hex bar tomorrow — protect Friday's session. Keep everything easy.</div>`;
  h += `<div class="section"><div class="section-header">Mobility flow · 20–30 min</div>`;
  [['Hip 90/90 + thoracic rotation','Hip capsule + t-spine — two biggest limiters at 6\'10"','3 × 8 each, slow'],
   ['Couch stretch','Hip flexor — critical for DL setup, gets compressed sitting','2 min each side'],
   ['Adductor side-lying stretch','Groin recovery from lateral VB movement last night','90s each side'],
   ['Ankle CARs (slow)','Full circles — Achilles + ankle joint recovery','2 × 10 each'],
   ['Dead bug (slow)','Anterior core — re-establish brace without loading the back','2 × 6 each side'],
   ['Cat-cow + child\'s pose','Lumbar decompression after VB lateral loading','2 min'],
  ].forEach(([n,d,v]) => {
    h += `<div class="mob-row"><div class="mob-check" onclick="this.classList.toggle('checked')"></div><div class="mob-info"><div class="mob-name">${n}</div><div class="mob-detail">${d}</div><div class="mob-vol">${v}</div></div></div>`;
  });
  h += `</div><div class="section"><div class="section-header">Optional light cardio</div>`;
  h += `<div class="mob-row"><div class="mob-check" onclick="this.classList.toggle('checked')"></div><div class="mob-info"><div class="mob-name">Easy walk or bike</div><div class="mob-detail">20–30 min conversational pace — blood flow without fatigue</div><div class="mob-vol">Zone 1 only</div></div></div></div>`;
  h += `<div class="callout c-gray">Goal: arrive at Friday's hex bar session completely fresh.</div><div class="spacer"></div>`;
  return h;
}

function buildSat(weekN, locked) {
  let h = `<div style="padding:12px 16px 0"><span class="day-tag tag-pump">Arm pump day</span></div>`;
  if (locked) h += `<div class="locked-banner"><span>✓ Week ${weekN} completed — view only</span></div>`;
  h += `<div class="callout c-amber" style="margin-top:12px">No heavy loading, no leg work. Fun and upper body blood flow only. Leave 2–3 reps in the tank.</div>`;
  h += `<div class="section"><div class="section-header">Arm pump · tap name for cues</div>${accRows(PUMP, weekN, 5, false, locked)}</div>`;
  h += `<div class="callout c-amber">Keep it fun. No PRs today — just a good pump and get out in 45 min.</div>`;
  if (!locked) {
    h += `<div id="status-${weekN}-5"></div><button class="save-btn" onclick="saveSession(${weekN},5,undefined,this)">Save session to Google Sheets</button>`;
  }
  return h + `<div class="spacer"></div>`;
}

function buildSun() {
  return `<div style="padding:12px 16px 0"><span class="day-tag tag-rest">Full rest</span></div>
  <div class="rest-hero">
    <div class="rest-title">Rest day</div>
    <div class="rest-body">Full recovery. No gym, no drills. Sleep, eat, hydrate.<br><br>At 6'10" and 240 lbs, your connective tissue needs this more than most. Adaptation happens during recovery — not the session.</div>
  </div>
  <div class="section" style="margin-top:12px">
    <div class="section-header">Optional — if you feel like moving</div>
    <div class="mob-row"><div class="mob-check" onclick="this.classList.toggle('checked')"></div><div class="mob-info"><div class="mob-name">Easy walk</div><div class="mob-detail">20–30 min conversational pace — blood flow only</div><div class="mob-vol">Zone 1</div></div></div>
    <div class="mob-row"><div class="mob-check" onclick="this.classList.toggle('checked')"></div><div class="mob-info"><div class="mob-name">Hip + ankle mobility</div><div class="mob-detail">90/90s, ankle CARs, couch stretch — 10–15 min total</div><div class="mob-vol">Optional</div></div></div>
  </div>
  <div class="callout c-gray" style="margin-top:12px">Monday is back squat day. Show up fresh.</div>
  <div class="spacer"></div>`;
}

const LIFT_DAY_MAP = [0, 1, null, null, 2, null, null]; // Mon=0, Tue=1, Fri=2

function buildTournamentFriday(weekN, w, locked) {
  let h = `<div style="padding:12px 16px 0"><span class="day-tag tag-vb">Pre-tournament</span></div>`;
  if (locked) h += `<div class="locked-banner"><span>✓ Week ${weekN} completed — view only</span></div>`;
  h += `<div class="callout c-amber" style="margin-top:12px">🏐 Tournament tomorrow: ${w.tournament}. NO lifting today — fresh legs win matches. Activation only, 15 minutes max.</div>`;
  h += `<div class="section"><div class="section-header">Optional activation · 15 min max</div>`;
  [['Band external rotations','Rotator cuff primed for tomorrow\'s swings','2 × 15 each'],
   ['Shoulder CARs','Full range, slow and controlled','2 × 5 each direction'],
   ['Light calf raises','Blood flow, not fatigue — cramp prevention','2 × 20'],
   ['Hip 90/90 switches','Hip mobility for low defensive positions','1 × 8 each side'],
   ['Easy walk','Keep blood moving, nothing more','10–15 min'],
  ].forEach(([n,d,v]) => {
    h += `<div class="mob-row"><div class="mob-check" onclick="this.classList.toggle('checked')"></div><div class="mob-info"><div class="mob-name">${n}</div><div class="mob-detail">${d}</div><div class="mob-vol">${v}</div></div></div>`;
  });
  h += `</div>`;
  h += `<div class="callout c-blue">Hydration and sodium start NOW, not tomorrow morning. Cramping prevention is a today problem.</div>`;
  if (w.n === 9) h += buildEndReport();
  return h + `<div class="spacer"></div>`;
}
function buildHomeDay(weekN, slot, w, calDay) {
  const locked = isWeekDone(weekN);
  const dayLabel = DAY_NAMES[calDay];
  const titles = { homeUpper:'Home — upper hypertrophy', homeLower:'Home — lower + core' };
  const slotIdx = slot === 'homeUpper' ? 3 : 4;
  let h = `<div style="padding:12px 16px 0"><span class="day-tag tag-lift">${titles[slot]}</span></div>`;
  if (locked) h += `<div class="locked-banner"><span>✓ Week ${weekN} completed — view only</span></div>`;
  h += `<div class="callout c-blue">${getHomeCallout(slot)}</div>`;
  h += `<div class="section"><div class="section-header">Exercises · tap for cues + last time</div>${accRows(ACC[slot], weekN, slotIdx, false, locked)}</div>`;
  const homeCool = slot === 'homeUpper' ? ACC.cooldownHomeUpper : ACC.cooldownHomeLower;
  h += `<div class="section"><div class="section-header">Cool-down · optional</div>${accRows(homeCool, weekN, slotIdx, false, locked)}</div>`;
  if (!locked) {
    h += `<div id="status-${weekN}-${slotIdx}"></div>`;
    h += `<button class="save-btn" onclick="saveSession(${weekN},${slotIdx},'${dayLabel}',this)">Save to Google Sheets</button>`;
    h += `<button class="share-btn" onclick="shareDay(${weekN-1},${calDay},'Block 1 · Week ${weekN} · ${dayLabel} — ${titles[slot]}')">Share this workout</button>`;
  }
  return h + `<div class="spacer"></div>`;
}
function buildPrehab(weekN, w) {
  const locked = isWeekDone(weekN);
  let h = `<div style="padding:12px 16px 0"><span class="day-tag tag-vb">Prehab · 15 min</span></div>`;
  if (locked) h += `<div class="locked-banner"><span>✓ Week ${weekN} completed — view only</span></div>`;
  h += `<div class="callout c-green">Saturday prehab — 15 minutes, no excuses. Two days before Monday's gym session. Shoulder and knee maintenance that compounds across the whole block.</div>`;
  h += `<div class="section"><div class="section-header">Prehab circuit · tap to check off</div>${accRows(ACC.prehab, weekN, 5, false, locked)}</div>`;
  h += `<div class="section"><div class="section-header">Zone 2 · the cramping lever</div>${accRows([{ rest:0, name:'Zone 2 aerobic', meta:'30-40 min', rec:'conversational pace', cue:'Brisk walk with the stroller, home stairs, or bike/stairmaster if you are at the gym. You must be able to hold a conversation — if you cannot, slow down. This is the piece that actually raises the ceiling you played under in the finals, and it only works if it is boring and consistent. Sunday counts as a second dose if life allows.', sets:['30-40 min'] }], weekN, 5, false, locked)}</div>`;
  return h + `<div class="spacer"></div>`;
}
function buildOffDay(weekN, w) {
  let h = `<div style="padding:12px 16px 0"><span class="day-tag tag-vb">Recovery day</span></div>`;
  h += `<div class="callout c-green" style="margin-top:12px">No barbell today. Ten minutes of shoulder care + optional zone-2 — this is where the cuff actually rebuilds and the anti-cramp engine gets built.</div>`;
  h += `<div class="section"><div class="section-header">Home cuff routine · ~10 min</div>`;
  [['Band external rotation','Slow, controlled, pain-free range only','2 × 15 each side'],
   ['Prone T raise','Face down, thumbs up, squeeze blades','2 × 10'],
   ['Serratus wall slide','Reach long at the top','2 × 10'],
   ['Sleeper stretch','Gentle — stretch, never pain','30s each side'],
  ].forEach(([n,d,v]) => {
    h += `<div class="mob-row"><div class="mob-check" onclick="this.classList.toggle('checked')"></div><div class="mob-info"><div class="mob-name">${n}</div><div class="mob-detail">${d}</div><div class="mob-vol">${v}</div></div></div>`;
  });
  h += `</div>`;
  h += `<div class="section"><div class="section-header">Zone-2 · optional but valuable</div>`;
  h += `<div class="mob-row"><div class="mob-check" onclick="this.classList.toggle('checked')"></div><div class="mob-info"><div class="mob-name">Brisk walk (stroller counts) or home stairs</div><div class="mob-detail">Conversational pace from your front door — aerobic base = later fatigue = less cramping. Rough night? Just the cuff work above is a successful day</div><div class="mob-vol">30–40 min</div></div></div>`;
  h += `</div>`;
  return h + `<div class="spacer"></div>`;
}
function buildActivationDay(weekN, w) {
  let h = `<div style="padding:12px 16px 0"><span class="day-tag tag-vb">Pre-tournament</span></div>`;
  h += `<div class="callout c-amber" style="margin-top:12px">🏐 ${w.tournament} is coming. NO lifting — fresh legs and a quiet shoulder win matches. Activation only, 15 minutes max.</div>`;
  [['Band external rotations','Wake the cuff, do not fatigue it','2 × 15 each'],
   ['Shoulder CARs','Full range, slow and controlled','2 × 5 each direction'],
   ['Light calf raises','Blood flow only — cramp prevention','2 × 20'],
   ['Hip 90/90 switches','Hip mobility for low defensive positions','1 × 8 each side'],
   ['Easy walk','Keep blood moving, nothing more','10–15 min'],
  ].forEach(([n,d,v]) => {
    h += `<div class="mob-row"><div class="mob-check" onclick="this.classList.toggle('checked')"></div><div class="mob-info"><div class="mob-name">${n}</div><div class="mob-detail">${d}</div><div class="mob-vol">${v}</div></div></div>`;
  });
  h += `<div class="callout c-blue">Hydration and sodium start today, not tournament morning.</div>`;
  return h + `<div class="spacer"></div>`;
}
function buildOlympianDay(weekN, w) {
  let h = `<div style="padding:12px 16px 0"><span class="day-tag tag-vb">Olympian session 🏐</span></div>`;
  h += `<div class="callout c-amber" style="margin-top:12px">Training with an Olympian today. No lifting — you tapered the shoulder all week for this.</div>`;
  h += `<div class="section"><div class="section-header">The game plan</div>`;
  [['Steal the invisible stuff','Footwork, positioning, vision, serve-receive habits — these transfer forever','all session'],
   ['Swing when drills demand it',"Don't audition your arm — an Olympian respects load management",'as needed'],
   ['If the shoulder barks','Shift to learning mode, not push-through mode','instantly'],
   ['Light cuff activation beforehand','Band ER 2 × 10 each, shoulder CARs','10 min prior'],
  ].forEach(([n,d,v]) => {
    h += `<div class="mob-row"><div class="mob-check" onclick="this.classList.toggle('checked')"></div><div class="mob-info"><div class="mob-name">${n}</div><div class="mob-detail">${d}</div><div class="mob-vol">${v}</div></div></div>`;
  });
  h += `</div><div class="callout c-blue">Log it with the 🏐 button afterward — including how the shoulder responded.</div>`;
  return h + `<div class="spacer"></div>`;
}
function buildTournamentSat(weekN, w) {
  let h = `<div style="padding:12px 16px 0"><span class="day-tag tag-vb">Tournament day</span></div>`;
  h += `<div class="callout c-amber" style="margin-top:12px">🏐 ${w.tournament} — Tournament day. No lifting. Go compete.</div>`;
  h += `<div class="section"><div class="section-header">Tournament checklist</div>`;
  [['Electrolytes + sodium every hour','Not just water — sodium is the cramp lever','all day'],
   ['Stay loose between matches','Shade + easy movement, don\'t go fully static','between matches'],
   ['Band work before match one','Light external rotations to wake the cuff up','2 × 10'],
   ['Log it afterward','🏐 button on the Activity tab','30 seconds'],
  ].forEach(([n,d,v]) => {
    h += `<div class="mob-row"><div class="mob-check" onclick="this.classList.toggle('checked')"></div><div class="mob-info"><div class="mob-name">${n}</div><div class="mob-detail">${d}</div><div class="mob-vol">${v}</div></div></div>`;
  });
  h += `</div>`;
  return h + `<div class="spacer"></div>`;
}

function buildWeekContent(weekIdx) {
  const w = WEEKS[weekIdx];
  const loads = calcLoads(w.n);
  let html = '';
  for (let d = 0; d < 7; d++) {
    const token = (w.days && w.days[d]) || 'off';
    let content;
    if (token === 'lower') content = buildGymDay(w.n, 'lower', w, loads, d);
    else if (token === 'push-pull') content = buildGymDay(w.n, 'pushPull', w, loads, d);
    else if (token === 'power') content = buildGymDay(w.n, 'power', w, loads, d);
    else if (token === 'home-upper') content = buildHomeDay(w.n, 'homeUpper', w, d);
    else if (token === 'home-lower') content = buildHomeDay(w.n, 'homeLower', w, d);
    else if (token === 'prehab') content = buildPrehab(w.n, w);
    else if (token === 'activation') content = buildActivationDay(w.n, w);
    else if (token === 'tournament') content = buildTournamentSat(w.n, w);
    else content = buildOffDay(w.n, w);
    const isActive = d === currentDayIdx;
    html += `<div class="day-screen${isActive?' active':''}" id="day-${weekIdx}-${d}">${content}</div>`;
  }
  return html;
}

// ── Render ──
function renderWeekStrip() {
  document.getElementById('weekStrip').innerHTML = WEEKS.map((w, i) => {
    const done = isWeekDone(w.n);
    const cls = done ? 'done' : (w.n === CURRENT_WEEK ? 'current' : 'upcoming');
    return `<button class="week-pill ${cls}${i===currentWeekIdx?' active':''}" onclick="switchWeek(${i})">W${w.n}<div class="wdot"></div></button>`;
  }).join('');
}

function renderWeekInfo() {
  const w = WEEKS[currentWeekIdx];
  const badge = isWeekDone(w.n) ? '<span class="done-badge">Completed</span>' : '';
  document.getElementById('weekInfo').innerHTML = `<span class="week-title">${w.phase}</span><span class="week-meta">${w.dates} &middot; ${w.intensity} &middot; ${w.volume}</span>${badge}`;
  const heroLbl = document.getElementById('heroWeekLabel');
  if (heroLbl) heroLbl.textContent = `Week ${w.n} of 10`;
}

function renderDayStrip() {
  const todayDayIdx = getTodayDayIdx();
  const todayWeekIdx = getTodayWeekIdx();
  const days = [
    {label:'Mon',cls:'lift-day'},{label:'Tue',cls:'lift-day'},{label:'Wed',cls:'vb-day'},
    {label:'Thu',cls:''},{label:'Fri',cls:'lift-day'},{label:'Sat',cls:'pump-day'},{label:'Sun',cls:''},
  ];
  document.getElementById('dayStrip').innerHTML = days.map((d, i) => {
    const isToday = i === todayDayIdx && currentWeekIdx === todayWeekIdx;
    const todayMarker = isToday ? '<div class="today-dot"></div>' : '';
    return `<button class="day-pill ${d.cls}${i===currentDayIdx?' active':''}${isToday?' today-pill':''}" onclick="switchDay(${i})">${d.label}<div class="ddot"></div>${todayMarker}</button>`;
  }).join('');
}

function renderContent() {
  document.getElementById('programContent').innerHTML = buildWeekContent(currentWeekIdx);
  applyCachedInputs();
  attachCacheListeners();
  restoreCheckmarks();
  setTimeout(updateProgress, 50);
}

function switchWeek(idx) {
  currentWeekIdx = idx;
  currentDayIdx = 0;
  stopTimer();
  renderWeekStrip();
  renderWeekInfo();
  renderDayStrip();
  renderContent();
}

function switchDay(idx) {
  const dir = idx > currentDayIdx ? 'slide-fwd' : 'slide-back';
  currentDayIdx = idx;
  document.querySelectorAll('.day-pill').forEach((p,i) => p.classList.toggle('active', i===idx));
  document.querySelectorAll('.day-screen').forEach((s,i) => {
    s.classList.remove('slide-fwd','slide-back');
    s.classList.toggle('active', i===idx);
    if (i === idx) s.classList.add(dir);
  });
  stopTimer();
  setTimeout(updateProgress, 50);
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  document.getElementById('mainHeader').style.display = name==='program' ? 'block' : 'none';
  document.getElementById('appBanner').style.display = name==='program' ? 'block' : 'none';
  ['program','warmup','activity','maxes'].forEach(n => {
    const icon = document.getElementById('ni-'+n);
    const lbl = document.getElementById('nl-'+n);
    if (icon) icon.className = 'nav-icon'+(n===name?' on':'');
    if (lbl) lbl.className = 'nav-lbl'+(n===name?' on':'');
  });
  // Show VB FAB only on activity screen
  const vbFab = document.getElementById('vbFabWrap');
  if (vbFab) vbFab.style.display = name==='activity' ? 'flex' : 'none';
  // Show LB plate calc FAB only on program screen
  const plateFab = document.getElementById('plateFab');
  if (plateFab) plateFab.style.display = name==='program' ? 'flex' : 'none';
  if (name==='activity') loadActivity();
  if (name==='maxes') { renderMaxesInputs(); applyTheme(getStoredTheme()); }
}

// ── Google Sheets ──
const INPUT_IDS = {}; // exercise name → id, filled from the inputs on screen
function getInputsForDay(weekN, dayN) {
  const data = {};
  // Accessories
  document.querySelectorAll(`.set-input[data-week="${weekN}"][data-day="${dayN}"]`).forEach(inp => {
    const ex = inp.getAttribute('data-ex');
    const s = parseInt(inp.getAttribute('data-s'));
    if (inp.dataset.exid) INPUT_IDS[ex] = inp.dataset.exid;
    if (!data[ex]) data[ex] = [];
    data[ex][s] = inp.value || '-';
  });
  // Primary lifts — combine reps × weight per set
  const liftData = {};
  document.querySelectorAll(`.lift-input[data-week="${weekN}"][data-day="${dayN}"]`).forEach(inp => {
    const ex = inp.getAttribute('data-ex');
    const s = parseInt(inp.getAttribute('data-s'));
    const type = inp.getAttribute('data-type');
    if (!liftData[ex]) liftData[ex] = {};
    if (!liftData[ex][s]) liftData[ex][s] = {};
    liftData[ex][s][type] = inp.value || '-';
  });
  Object.entries(liftData).forEach(([ex, sets]) => {
    data[ex] = Object.values(sets).map(s => `${s.weight || '-'}×${s.reps || '-'}`);
  });
  return data;
}

const _savingSessions = {};
const _lastSessionSave = {};
async function saveSession(weekN, dayN, dayLabelOverride, btnEl) {
  const lockKey = `${weekN}-${dayN}`;
  if (_savingSessions[lockKey]) return; // ignore repeat taps while a save is running
  _savingSessions[lockKey] = true;
  const statusEl = document.getElementById(`status-${weekN}-${dayN}`);
  const btn = btnEl || document.querySelector(`button[onclick="saveSession(${weekN},${dayN})"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  if (navigator.vibrate) { try { navigator.vibrate(15); } catch(e){} }
  // Snapshot PRs BEFORE saving so we can compare this session against history
  const prSnapshot = snapshotPRs();
  const sessionLifts = (dayN === 0 || dayN === 1 || dayN === 2) ? getSessionLiftBests(weekN, dayN) : [];
  const inputs = getInputsForDay(weekN, dayN);
  const date = new Date().toLocaleDateString('en-US');
  const dayLabel = dayLabelOverride || DAY_NAMES[dayN]; // fix: Friday no longer saved as 'Wednesday'
  try {
    const now = new Date();
    const session = localSessionId(now, dayLabel);
    const setRows = [];
    const legacy = [];
    Object.entries(inputs).forEach(([ex, sets]) => {
      legacy.push({ tab: 'Log', row: [date, `Week ${weekN}`, dayLabel, ex, sets.length, '', ...sets] });
      const id = (INPUT_IDS[ex]) || exId(ex);
      const name = ex.split('__')[0].trim();
      sets.forEach((v, i) => {
        if (v === undefined || v === null || v === '' || v === '-' || /^-×/.test(v)) return;
        const pv = parseSetValue(v);
        setRows.push([date, `Week ${weekN}`, dayLabel, session, id, name, i + 1, String(v), pv.weight, pv.reps, '']);
      });
    });
    // A second tap on an identical session within 2 minutes is ignored
    const sig = JSON.stringify(setRows.map(r => r.slice(4, 8)));
    const last = _lastSessionSave[lockKey];
    if (last && last.sig === sig && Date.now() - last.at < 120000) {
      if (statusEl) statusEl.innerHTML = `<div class="callout c-success sync-note" style="margin-top:8px">Already saved — no duplicate added.</div>`;
      if (btn) { btn.textContent = 'Saved ✓'; setTimeout(()=>{ btn.disabled=false; btn.textContent='Save session to Google Sheets'; }, 3000); }
      return;
    }
    const saveId = newSaveId();
    _lastSessionSave[lockKey] = { sig, at: Date.now() };
    queueSave({ id: saveId, tab: 'Sets', rows: setRows, legacy, label: `${dayLabel} session` });
    applyLocalHistory(); // "last time" includes this session straight away
    if (statusEl) statusEl.innerHTML = syncNoteHTML(saveId);
    if (btn) { btn.textContent = 'Saved ✓'; setTimeout(()=>{ btn.disabled=false; btn.textContent='Save session to Google Sheets'; }, 3000); }
    // Mark week as done after its last lifting day —
    // tournament weeks have no Friday session, so Tuesday (dayN 1) is their last lift day
    const wDef = WEEKS[weekN - 1];
    // lastLiftSlot is now a string ('power','pull',etc) or number for legacy weeks
    const lastSlotToken = wDef && wDef.lastLiftSlot;
    const slotTokenMap = {lower:0, 'push-pull':1, pushPull:1, power:2};
    const lastLiftDay = typeof lastSlotToken === 'string' ? (slotTokenMap[lastSlotToken] !== undefined ? slotTokenMap[lastSlotToken] : 2) : (lastSlotToken !== undefined ? lastSlotToken : 2);
    if (dayN === lastLiftDay) {
      markWeekDone(weekN);
      clearChecksForWeek(weekN);
      renderWeekStrip();
      setTimeout(renderContent, 1200); // apply locked state after the "Saved ✓" feedback registers
    }
    // Detect PRs against the pre-save snapshot
    const prs = detectPRs(prSnapshot, sessionLifts);
    if (prs.length) {
      // Slight delay so the "Saved ✓" feedback registers before the celebration
      setTimeout(() => celebratePRs(prs), 600);
    }
  } catch(e) {
    if (statusEl) statusEl.innerHTML = `<div class="callout c-error" style="margin-top:8px">Couldn't save — try again</div>`;
    if (btn) { btn.disabled=false; btn.textContent='Save session to Google Sheets'; }
  } finally {
    delete _savingSessions[lockKey];
  }
}

async function saveMaxes() {
  const btn = event.target;
  const statusEl = document.getElementById('maxes-status');
  btn.disabled=true; btn.textContent='Saving...';
  const row = [new Date().toLocaleDateString('en-US'), document.getElementById('tm-squat').value, document.getElementById('tm-bench').value, document.getElementById('tm-dl').value, document.getElementById('tm-ohp').value];
  try {
    const saveId = newSaveId();
    queueSave({ id: saveId, tab: 'Maxes', rows: [row], legacy: [{ tab: 'Maxes', row }], label: 'Maxes' });
    statusEl.innerHTML = syncNoteHTML(saveId);
    btn.textContent='Saved ✓';
    setTimeout(()=>{btn.disabled=false;btn.textContent='Save maxes to sheet';},3000);
  } catch(e) {
    statusEl.innerHTML='<div class="callout c-error" style="margin-top:8px">Save failed — check your connection</div>';
    btn.disabled=false; btn.textContent='Save maxes to sheet';
  }
}

// ── Share a day's workout ──
// Reads the rendered day screen so it exports what is actually on screen,
// including any weights Colin edited, then hands off to the iOS share sheet.
function buildShareText(screenEl, headerLine) {
  const lines = [headerLine, ''];
  let usedTM = false;
  let usedSS = false;
  screenEl.querySelectorAll('.section').forEach(sec => {
    const hdr = sec.querySelector('.section-header');
    const rawTitle = hdr ? hdr.textContent.trim() : '';
    // Keep the whole header when it names a superset partner; otherwise drop the UI hint after the ·
    const title = /SS [A-Z]/.test(rawTitle) ? rawTitle.replace(/SS ([A-Z])/, 'Superset $1') : rawTitle.split('·')[0].trim();
    const body = [];
    // Primary lift rows
    sec.querySelectorAll('.lift-row').forEach(row => {
      const lbl = row.querySelector('.lift-label');
      if (!lbl) return;
      const name = lbl.childNodes[0] ? lbl.childNodes[0].textContent.trim() : '';
      const subEl = lbl.querySelector('.lift-sub');
      const sub = subEl ? subEl.textContent.trim() : '';
      const pct = sub.match(/\d+%\s*TM/);          // share the percentage, not my weight
      const badge = row.querySelector('.badge');
      const target = row.querySelector('.lift-target');
      if (target) {                                  // warm-up rows
        const reps = badge ? badge.textContent.trim() : '';
        body.push(`  ${name} — ${reps}${pct ? ' @ ~'+pct[0] : (sub ? ' ('+sub+')' : '')}`);
        usedTM = true;
        return;
      }
      const reps = row.querySelector('.lift-input-reps');
      if (reps) {
        body.push(`  ${name} — ${reps.value} reps @ ${pct ? pct[0] : sub}`);
        usedTM = true;
      }
    });
    // Accessory rows
    sec.querySelectorAll('.acc-row').forEach(row => {
      const name = row.querySelector('.acc-name');
      const meta = row.querySelector('.acc-meta');
      const ss = row.querySelector('.ss-badge');
      const vals = [...row.querySelectorAll('.set-input')].map(i => i.value).filter(Boolean);
      if (!name) return;
      let line = `  ${name.textContent.trim()} — ${meta ? meta.textContent.trim() : ''}`;
      if (vals.length) line += `: ${vals.join(' / ')}`;
      if (ss) { line += `  [Superset ${ss.textContent.trim().replace(/^SS\s*/, '')}]`; usedSS = true; }
      body.push(line);
    });
    if (body.length) { lines.push(title.toUpperCase()); lines.push(...body); lines.push(''); }
  });
  if (usedSS) lines.push('Superset letters (A, B, C...) = do those two back to back, alternating, and rest only after the pair.');
  if (usedTM) lines.push('Main lifts are % of training max — use your own TM (roughly 90% of your 1RM).');
  lines.push('— sent from my training app');
  return lines.join('\n');
}
async function shareDay(weekIdx, dayIdx, headerLine) {
  const screenEl = document.getElementById(`day-${weekIdx}-${dayIdx}`);
  if (!screenEl) return;
  const text = buildShareText(screenEl, headerLine);
  haptic(10);
  try {
    if (navigator.share) { await navigator.share({ title: headerLine, text }); return; }
    await navigator.clipboard.writeText(text);
    flashShareMsg('Copied to clipboard');
  } catch(e) {
    if (e && e.name === 'AbortError') return; // user dismissed the share sheet
    try { await navigator.clipboard.writeText(text); flashShareMsg('Copied to clipboard'); }
    catch(_) { flashShareMsg('Could not share on this device'); }
  }
}
function flashShareMsg(msg) {
  let el = document.getElementById('shareToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'shareToast';
    el.className = 'share-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 1800);
}

// ── Check-in prompt ──
const CHECKIN_QUESTIONS = [
  { id:'home', q:'Home sessions happening?', opts:['Both days','One day','Struggling'] },
  { id:'knee', q:'Knee status vs last check?', opts:['Better','Same','Worse'] },
  { id:'shoulder', q:'Shoulder status?', opts:['Better','Same','Worse'] },
  { id:'progress', q:'Progressions on schedule?', opts:['Yes — chipping up','Most of them','Stalled on some'] },
  { id:'energy', q:'Energy in sessions?', opts:['Strong','Moderate','Dragging'] },
];
let checkinState = {};
function buildCheckinPrompt(weekN) {
  // Only show if not already submitted this week
  const c = loadCache();
  if (c.checkins && c.checkins[`w${weekN}`]) return `<div class="callout c-green" style="margin:12px 16px 0">✓ Week ${weekN} check-in logged — thanks.</div>`;
  return `<div class="checkin-card" id="checkinCard${weekN}">
    <div class="checkin-title">📋 Week ${weekN} Check-in</div>
    <div class="checkin-sub">Quick pulse — 30 seconds, then back to training</div>
    ${CHECKIN_QUESTIONS.map(q => `
      <div class="checkin-q">${q.q}</div>
      <div class="checkin-opts">${q.opts.map(o =>
        `<button class="checkin-opt" data-qid="${q.id}" data-val="${o}" onclick="tapCheckin(this)">${o}</button>`
      ).join('')}</div>
    `).join('')}
    <textarea class="vb-notes" id="checkinNotes${weekN}" placeholder="Anything else? (optional)" rows="2" style="margin-top:8px"></textarea>
    <button class="vb-save-btn" id="checkinSaveBtn${weekN}" onclick="submitCheckin(${weekN})" disabled>Submit check-in</button>
  </div>`;
}
function tapCheckin(btn) {
  const qid = btn.dataset.qid;
  const val = btn.dataset.val;
  checkinState[qid] = val;
  // Highlight selected in this question
  btn.closest('.checkin-opts').querySelectorAll('.checkin-opt').forEach(b => b.classList.toggle('selected', b === btn));
  haptic(6);
  // Enable submit when all questions answered
  const allCards = document.querySelectorAll('.checkin-card');
  allCards.forEach(card => {
    const btn2 = card.querySelector('[id^="checkinSaveBtn"]');
    if (btn2) btn2.disabled = CHECKIN_QUESTIONS.some(q => !checkinState[q.id]);
  });
}
async function submitCheckin(weekN) {
  const btn = document.getElementById(`checkinSaveBtn${weekN}`);
  if (btn) { btn.disabled = true; btn.textContent = 'Logging...'; }
  const notes = document.getElementById(`checkinNotes${weekN}`)?.value || '';
  const date = new Date().toLocaleDateString('en-US');
  const row = [date, `Week ${weekN}`,
    checkinState.home||'', checkinState.knee||'', checkinState.shoulder||'',
    checkinState.progress||'', checkinState.energy||'', notes];
  try {
    queueSave({ id: newSaveId(), tab: 'Check-ins', rows: [row], legacy: [{ tab: 'Check-ins', row }], label: `Week ${weekN} check-in` });
    const c = loadCache();
    if (!c.checkins) c.checkins = {};
    c.checkins[`w${weekN}`] = true;
    saveCache(c);
    checkinState = {};
    haptic(20);
    renderContent();
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  }
}

// ── VB Session logger ──
let vbState = { type: null, felt: null, pain: [], notes: '' };
function resetVBState() { vbState = { type: null, felt: null, pain: [], notes: '' }; }
function openVBLogger() {
  resetVBState();
  // Reset UI
  document.querySelectorAll('.vb-chip').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.vb-feel').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.vb-pain-chip').forEach(c => c.classList.remove('selected'));
  document.getElementById('vbNotes').value = '';
  // Date display
  const now = new Date();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  document.getElementById('vbModalDate').textContent = `Today — ${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
  document.getElementById('vbModal').classList.add('visible');
  haptic(8);
  updateVBSaveButton();
}
function closeVBLogger() {
  document.getElementById('vbModal').classList.remove('visible');
}
function setVBType(t) {
  vbState.type = t;
  document.querySelectorAll('.vb-chip').forEach(c => c.classList.toggle('selected', c.dataset.type === t));
  haptic(6);
  updateVBSaveButton();
}
function setVBFeel(f) {
  vbState.felt = f;
  document.querySelectorAll('.vb-feel').forEach(c => c.classList.toggle('selected', c.dataset.feel === f));
  haptic(6);
  updateVBSaveButton();
}
function toggleVBPain(p) {
  const idx = vbState.pain.indexOf(p);
  if (idx >= 0) vbState.pain.splice(idx, 1);
  else vbState.pain.push(p);
  document.querySelectorAll('.vb-pain-chip').forEach(c => c.classList.toggle('selected', vbState.pain.includes(c.dataset.pain)));
  haptic(6);
}
function updateVBSaveButton() {
  const btn = document.getElementById('vbSaveBtn');
  if (!btn) return;
  btn.disabled = !(vbState.type && vbState.felt);
}
async function saveVBSession() {
  if (!vbState.type || !vbState.felt) return;
  vbState.notes = document.getElementById('vbNotes').value.trim();
  const btn = document.getElementById('vbSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  const date = new Date().toLocaleDateString('en-US');
  const row = [date, vbState.type, vbState.felt, vbState.pain.join(', '), vbState.notes];
  try {
    queueSave({ id: newSaveId(), tab: 'VB Sessions', rows: [row], legacy: [{ tab: 'VB Sessions', row }], label: 'Volleyball session' });
    btn.textContent = 'Saved ✓';
    haptic(12);
    setTimeout(() => {
      closeVBLogger();
      btn.textContent = 'Save session';
      btn.disabled = false;
      loadActivity();
    }, 700);
  } catch(e) {
    btn.textContent = 'Save failed — retry';
    btn.disabled = false;
  }
}

// ── Activity feed — combines lifting (Log tab) and VB sessions (VB Sessions tab) ──
function parseSheetDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}
function formatActivityDate(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
}
function getWeekStart(d) {
  // Monday as week start
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0,0,0,0);
  return monday;
}
function weekGroupLabel(weekStart, now) {
  const today = getWeekStart(now);
  const diff = Math.round((today - weekStart) / (7 * 86400000));
  if (diff === 0) return 'This Week';
  if (diff === 1) return 'Last Week';
  return `${diff} weeks ago`;
}

// One row per exercise per session, in the shape paintActivity expects: [date, week, day, exercise]
function activityLiftRows() {
  const seen = {};
  const out = [];
  currentHistory().forEach(e => {
    const key = e.session + '|' + e.id;
    if (seen[key]) return;
    seen[key] = true;
    out.push([e.date.toISOString(), e.week, e.day, e.name, e.session]);
  });
  return out;
}
function activityVBRows() {
  return tabRows(getCachedTab('VB Sessions')).concat(pendingRows('VB Sessions'));
}
async function loadActivity(opts) {
  const el = document.getElementById('activity-content');
  const firstLoad = !el.dataset.loaded;
  // Show what's on the phone immediately
  const hasLocal = getCachedTab('Sets') || getCachedTab('Log') || getCachedTab('VB Sessions') || pendingCount();
  let painted = false;
  if (hasLocal) {
    try { paintActivity(el, activityLiftRows(), activityVBRows()); painted = true; } catch(e) {}
  }
  if (!painted && firstLoad) el.innerHTML =
    '<div class="skel-group"></div>' +
    Array.from({length: 4}, (_, i) => `<div class="skel-row" style="animation-delay:${i * 0.08}s"><div class="skel-icon"></div><div class="skel-lines"><div class="skel-line" style="width:${55 + (i%3)*12}%"></div><div class="skel-line thin" style="width:${30 + (i%2)*15}%"></div></div></div>`).join('');
  try {
    // Refresh in parallel (shares any read already in flight); tolerate VB Sessions tab not existing yet
    const [liftRes, vbRes] = await Promise.allSettled([loadLastTimeData(opts), fetchTab('VB Sessions', opts)]);
    const liftOk = liftRes.status === 'fulfilled', vbOk = vbRes.status === 'fulfilled';
    if (!vbOk && !(liftOk && liftRes.value) && !painted) throw new Error('offline');
    const changed = !painted || (liftOk && liftRes.value) || (vbOk && vbRes.value.changed);
    if (!changed) return;
    paintActivity(el, activityLiftRows(), activityVBRows());
  } catch(e) {
    // Only show an error when there's nothing on screen — a failed background
    // refresh keeps the saved feed visible
    if (!painted && firstLoad) el.innerHTML = '<div class="empty-state">Could not load activity.<br>Check your internet connection.</div>';
  }
}

function paintActivity(el, liftRows, vbRows) {
  {
    // Group lifting by date+day to collapse multiple exercises into one entry
    const liftSessions = {};
    liftRows.forEach(r => {
      const dateRaw = r[0];
      const week = r[1];
      const day = r[2];
      const ex = r[3];
      const d = parseSheetDate(dateRaw);
      if (!d || !day) return;
      const key = r[4] || `${dateRaw}|${day}`;
      if (!liftSessions[key]) liftSessions[key] = { date: d, dateRaw, week, day, exercises: [] };
      liftSessions[key].exercises.push((ex || '').toString().split('__')[0]);
    });
    const liftEntries = Object.values(liftSessions).map(s => ({
      kind: 'lift',
      date: s.date,
      week: s.week,
      day: s.day,
      exercises: s.exercises,
    }));

    // VB sessions: [Date, Type, Felt, Pain, Notes]
    const vbEntries = vbRows.map(r => {
      const d = parseSheetDate(r[0]);
      if (!d) return null;
      return {
        kind: 'vb',
        date: d,
        type: r[1] || '',
        felt: r[2] || '',
        pain: r[3] || '',
        notes: r[4] || '',
      };
    }).filter(Boolean);

    const all = [...liftEntries, ...vbEntries].sort((a, b) => b.date - a.date);
    if (!all.length) {
      el.innerHTML = '<div class="empty-state">No activity logged yet.<br>Save a lift or tap the volleyball to log a session.</div>';
      return;
    }

    // Group by week start (Monday)
    const now = new Date();
    const groups = {};
    all.forEach(entry => {
      const ws = getWeekStart(entry.date);
      const key = ws.toISOString();
      if (!groups[key]) groups[key] = { weekStart: ws, entries: [] };
      groups[key].entries.push(entry);
    });
    const sortedGroups = Object.values(groups).sort((a,b) => b.weekStart - a.weekStart);

    let html = '';
    sortedGroups.forEach(g => {
      html += `<div class="activity-group-label">${weekGroupLabel(g.weekStart, now)}</div>`;
      g.entries.forEach(entry => {
        if (entry.kind === 'lift') {
          const exPreview = entry.exercises.slice(0,3).join(', ');
          const more = entry.exercises.length > 3 ? ` +${entry.exercises.length - 3} more` : '';
          html += `<div class="activity-row activity-row-lift">
            <div class="activity-icon">🏋️</div>
            <div class="activity-body">
              <div class="activity-headline">${entry.day} — ${entry.week}</div>
              <div class="activity-sub">${formatActivityDate(entry.date)}</div>
              <div class="activity-detail">${exPreview}${more}</div>
            </div>
          </div>`;
        } else {
          const feltIcon = entry.felt === 'good' ? '👍' : (entry.felt === 'rough' ? '👎' : '');
          const painChips = entry.pain ? entry.pain.split(',').map(p => p.trim()).filter(Boolean).map(p => `<span class="activity-pain-chip">${p}</span>`).join('') : '';
          const notesLine = entry.notes ? `<div class="activity-notes">"${entry.notes}"</div>` : '';
          html += `<div class="activity-row activity-row-vb">
            <div class="activity-icon">🏐</div>
            <div class="activity-body">
              <div class="activity-headline">${entry.type} session ${feltIcon}</div>
              <div class="activity-sub">${formatActivityDate(entry.date)}</div>
              ${painChips ? `<div class="activity-pain-row">${painChips}</div>` : ''}
              ${notesLine}
            </div>
          </div>`;
        }
      });
    });
    el.innerHTML = html + '<div class="spacer"></div>';
    el.dataset.loaded = '1';
  }
}

// ── Theme management ──
// 'auto' follows system preference (no data-theme attribute set)
// 'light' / 'dark' override via data-theme on <html>
const THEME_KEY = 'vb-theme-v1';
function getStoredTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch(e) { return 'auto'; }
}
function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === 'auto') {
    html.removeAttribute('data-theme');
  } else {
    html.setAttribute('data-theme', theme);
  }
  // Update toggle UI if rendered
  document.querySelectorAll('.theme-opt').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-theme') === theme);
  });
}
function setTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch(e) {}
  applyTheme(theme);
  haptic(8);
}
// Apply stored theme as early as possible (before init render)
applyTheme(getStoredTheme());

// ── Sync status ──
// Under the save button: what happened to this save. Above the nav: anything still waiting.
function syncNoteHTML(saveId) {
  return `<div class="callout c-success sync-note" data-save-id="${saveId}" style="margin-top:8px">Saved on your phone · sending to Google Sheets…</div>`;
}
let _syncPillTimer = null;
function updateSyncPill(state, pending) {
  const pill = document.getElementById('syncPill');
  if (!pill) return;
  clearTimeout(_syncPillTimer);
  if (pending > 0) {
    pill.hidden = false;
    pill.classList.remove('ok');
    const n = pending === 1 ? '1 save' : `${pending} saves`;
    pill.textContent = state === 'sending' ? `Syncing ${n}…` : `${n} waiting for signal · tap to retry`;
  } else if (!pill.hidden) {
    pill.classList.add('ok');
    pill.textContent = 'All saved to Google Sheets ✓';
    _syncPillTimer = setTimeout(() => { pill.hidden = true; }, 2500);
  }
}
onSync(ev => {
  updateSyncPill(ev.type, ev.pending);
  if (ev.type === 'synced' && ev.job) {
    document.querySelectorAll(`.sync-note[data-save-id="${ev.job.id}"]`).forEach(el => { el.textContent = 'Saved to Google Sheets ✓'; });
    // Pull the synced rows back down so the copy on the phone matches the sheet
    if (ev.job.tab === 'Sets') loadLastTimeData({ fresh: true });
    if (ev.job.tab === 'VB Sessions') fetchTab('VB Sessions', { fresh: true }).catch(() => {});
  }
  if (ev.type === 'waiting') {
    const waiting = new Set(loadOutbox().map(j => j.id));
    document.querySelectorAll('.sync-note[data-save-id]').forEach(el => {
      if (waiting.has(el.dataset.saveId)) el.textContent = 'Saved on your phone · will send to Google Sheets when you have signal';
    });
  }
});

// ── Init ──
applyCachedTMs();
applyLocalHistory(); // "last time" values from the copy on the phone, so they're there on first paint
renderWeekStrip();
renderWeekInfo();
renderDayStrip();
renderContent();
// Refresh from Google in the background — re-render only if anything actually changed
loadLastTimeData().then(changed => { if (changed) renderContent(); });
// Send anything saved while offline last time
if (pendingCount()) { updateSyncPill('waiting', pendingCount()); flushOutbox(); }
// Service worker — network-first app shell so deploys appear on next open,
// with offline fallback. Relative path keeps the scope at the repo folder.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* SW unsupported or file missing — app works fine without it */ });
}
