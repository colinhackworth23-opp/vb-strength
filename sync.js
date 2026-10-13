// VB Strength — Google Sheets sync
//
// Reads:  each tab is kept on the phone and refreshed in the background (only new rows are downloaded).
// Writes: every save goes into an outbox on the phone first, so it is never lost to bad signal.
//         The outbox sends it to Google, confirms it arrived, and retries until it does.

const SHEET_URL = 'https://script.google.com/macros/s/AKfycbzLuijUOxwOOV2NESQGajLZQwe4ZTf1d7xjdW5xXdBp6Oh7BFQ70pknZsLgaCGOEB47/exec';

// ── Shared helpers (must match exId_ / parseSetValue_ in the Apps Script) ──
// Stable exercise id: primary lifts use their key ("Hex bar deadlift__dl" → "dl"),
// everything else a slug of the name ("Barbell hip thrust" → "barbell-hip-thrust").
function exId(raw) {
  const parts = String(raw || '').split('__');
  if (parts.length > 1 && parts[1].trim()) return parts[1].trim().toLowerCase();
  return parts[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function parseSetValue(v) {
  const s = String(v).trim();
  let m = /^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)$/i.exec(s);
  if (m) return { weight: parseFloat(m[1]), reps: parseInt(m[2], 10) };
  if (/^\d+(?:\.\d+)?$/.test(s)) return { weight: parseFloat(s), reps: '' };
  m = /^(\d+)\s*reps?$/i.exec(s);
  if (m) return { weight: '', reps: parseInt(m[1], 10) };
  return { weight: '', reps: '' };
}
// ── Rep-logged exercises (pull-ups) ──
// These are logged as reps. The planned load (BW, +10) is shown as a label, not typed.
// Saved Value formats are ones parseSetValue already reads: "6 reps" (bodyweight) and "10x6" (load x reps).
// Dead hang is time-based and is not in this list.
const REP_LOGGED_IDS = ['weighted-pull-up', 'pull-up-practice-doorframe-bar', 'banded-negative-pull-up', 'scapular-pull-up'];
function isRepLogged(idOrName) { return REP_LOGGED_IDS.indexOf(exId(idOrName)) !== -1; }
// Whole number of reps, 1-99, or null
function cleanReps(raw) {
  const s = String(raw === null || raw === undefined ? '' : raw).trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = parseInt(s, 10);
  return n >= 1 && n <= 99 ? n : null;
}
// Plan or typed load → added pounds (0 = bodyweight), or null when it isn't a plain load
function loadPounds(load) {
  const s = String(load === null || load === undefined ? '' : load).trim();
  if (/^bw$/i.test(s)) return 0;
  const m = /^\+?(\d+(?:\.\d+)?)$/.exec(s);
  return m ? parseFloat(m[1]) : null;
}
// What the person typed when changing a set's load → "BW" or "+N", or null if it isn't a load
function normalizeLoadInput(text) {
  const s = String(text === null || text === undefined ? '' : text).trim().replace(/\s*lbs?\.?$/i, '').trim();
  if (s === '' || /^bw$/i.test(s)) return 'BW';
  const m = /^\+?(\d+(?:\.\d+)?)$/.exec(s);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (n === 0) return 'BW';
  return n <= 999 ? '+' + n : null;
}
function loadLabel(load) {
  const lb = loadPounds(load);
  if (lb === 0) return 'BW';
  if (lb !== null) return '+' + lb + ' lb';
  return String(load === null || load === undefined ? '' : load);
}
// Value saved to the Sets tab for one set, or null when there are no valid reps (nothing is saved)
function composeRepValue(reps, load) {
  const r = cleanReps(reps);
  if (r === null) return null;
  const lb = loadPounds(load);
  return lb !== null && lb > 0 ? lb + 'x' + r : r + ' reps';
}
function repEsc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// How a stored value reads on the "Last:" line for a rep-logged exercise. Old rows are shown as they were
// logged and marked when reps were never recorded — reps are never guessed.
function describeRepValue(stored) {
  const s = String(stored === null || stored === undefined ? '' : stored).trim();
  let m = /^(\d+)\s*reps?$/i.exec(s);
  if (m) return m[1] + ' reps';
  m = /^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)$/i.exec(s);
  if (m) return '+' + m[1] + ' lb × ' + m[2];
  if (/^\d+(?:\.\d+)?$/.test(s)) return '+' + s + ' lb (reps not recorded)';
  if (/^bw$/i.test(s)) return 'BW (reps not recorded)';
  return repEsc(s);
}
function localSessionId(date, dayLabel) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${dayLabel}`;
}
function newSaveId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Reads — one shared request per tab, with a copy kept on the phone ──
const TAB_CACHE_PREFIX = 'vb-strength-tab-';
const _tabInflight = {};
function getCachedTab(tab) {
  try {
    const c = JSON.parse(localStorage.getItem(TAB_CACHE_PREFIX + tab));
    return c && c.data ? c.data : null;
  } catch(e) { return null; }
}
// Re-download the whole tab at least daily, so edits made directly in the sheet get picked up
const TAB_FULL_REFRESH_MS = 24 * 60 * 60 * 1000;
function storeTab(tab, data, fullAt) {
  try { localStorage.setItem(TAB_CACHE_PREFIX + tab, JSON.stringify({ t: Date.now(), fullAt, data })); } catch(e) { /* storage full or blocked */ }
}
function requestTab(tab, from) {
  const q = '?tab=' + encodeURIComponent(tab) + (from != null ? '&from=' + from : '');
  return fetch(SHEET_URL + q).then(r => r.json());
}
// Resolves to { data, changed } — `changed` is false when the sheet matches the saved copy.
// When the saved copy is recent, only rows added since then are downloaded.
// Pass { fresh: true } after a write so an older in-flight read isn't reused.
function fetchTab(tab, opts) {
  const fresh = opts && opts.fresh;
  if (!fresh && _tabInflight[tab]) return _tabInflight[tab];
  const run = async () => {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(TAB_CACHE_PREFIX + tab)); } catch(e) {}
    const cachedRows = cached && cached.data && Array.isArray(cached.data.rows) ? cached.data.rows : null;
    const canIncrement = !(opts && opts.full) && cachedRows && cachedRows.length > 0 && cached.fullAt && (Date.now() - cached.fullAt) < TAB_FULL_REFRESH_MS;
    if (canIncrement) {
      const from = cachedRows.length;
      const inc = await requestTab(tab, from);
      if (typeof inc.total === 'number' && inc.from === from && inc.total >= from) {
        const added = inc.rows || [];
        if (!added.length) return { data: cached.data, changed: false };
        const data = { rows: cachedRows.concat(added) };
        storeTab(tab, data, cached.fullAt);
        return { data, changed: true };
      }
      if (typeof inc.total !== 'number') {
        // Older Apps Script ignores `from` and sends everything — use it as a full read
        return finishFull(tab, inc, cached);
      }
      // Sheet has fewer rows than our copy (rows were deleted) — fall through to a full read
    }
    return finishFull(tab, await requestTab(tab, null), cached);
  };
  const req = run().finally(() => { if (_tabInflight[tab] === req) delete _tabInflight[tab]; });
  _tabInflight[tab] = req;
  return req;
}
function finishFull(tab, raw, cached) {
  const data = { rows: (raw && raw.rows) || [] };
  const changed = !cached || JSON.stringify(cached.data) !== JSON.stringify(data);
  storeTab(tab, data, Date.now());
  return { data, changed };
}
const tabRows = d => (d && d.rows ? d.rows.slice(1) : []);

// ── Which Apps Script is live? ──
// Version 2 has the Sets and Program tabs and can confirm saves. Version 1 is the
// older script, which only takes one row per request — the outbox falls back to that.
let _serverVersion = null;
async function getServerVersion() {
  if (_serverVersion) return _serverVersion;
  const j = await fetch(SHEET_URL + '?tab=__meta').then(r => r.json());
  _serverVersion = (j && j.version) || 1;
  return _serverVersion;
}

// ── Outbox — saves wait here on the phone until Google confirms them ──
// Job: { id, tab, rows, legacy: [{ tab, row }], label, createdAt, tries }
const OUTBOX_KEY = 'vb-strength-outbox-v1';
function loadOutbox() {
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY)) || []; } catch(e) { return []; }
}
function saveOutbox(list) {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(list)); } catch(e) { /* storage blocked — the in-flight send still runs */ }
}
function pendingCount() { return loadOutbox().length; }
// Rows still waiting to sync, for a tab — merged into what the app shows so a save appears immediately
function pendingRows(tab) {
  return loadOutbox().filter(j => j.tab === tab).flatMap(j => j.rows);
}

let _flushing = false;
let _retryTimer = null;
let _retryDelay = 5000;
const _syncListeners = [];
function onSync(fn) { _syncListeners.push(fn); }
function emitSync(event) { _syncListeners.forEach(fn => { try { fn(event); } catch(e) {} }); }

// A job with no rows can never be confirmed (nothing is written, so no Save ID lands in the
// sheet) and would block every save behind it. There is nothing in it to lose, so it is dropped.
function jobHasNothingToSend(job) {
  return !job || !Array.isArray(job.rows) || job.rows.length === 0;
}

function queueSave(job) {
  if (jobHasNothingToSend(job)) return false; // nothing to save — never queue an unconfirmable job
  const list = loadOutbox();
  list.push({ ...job, createdAt: Date.now(), tries: 0 });
  saveOutbox(list);
  emitSync({ type: 'queued', job, pending: list.length });
  flushOutbox();
  return true;
}

async function flushOutbox() {
  if (_flushing) return;
  _flushing = true;
  clearTimeout(_retryTimer);
  let failed = false;
  try {
    let list = loadOutbox();
    while (list.length) {
      const job = list[0];
      if (jobHasNothingToSend(job)) {
        // An empty job already stuck in the outbox (saved by an older version): clear it so the saves behind it can send
        list = list.filter(x => x.id !== job.id);
        saveOutbox(list);
        emitSync({ type: 'synced', pending: list.length });
        continue;
      }
      emitSync({ type: 'sending', job, pending: list.length });
      const ok = await sendJob(job);
      list = loadOutbox();
      if (!ok) {
        const j = list.find(x => x.id === job.id);
        if (j) { j.tries = (j.tries || 0) + 1; saveOutbox(list); }
        failed = true;
        break;
      }
      list = list.filter(x => x.id !== job.id);
      saveOutbox(list);
      emitSync({ type: 'synced', job, pending: list.length });
    }
  } finally {
    _flushing = false;
  }
  if (failed) {
    emitSync({ type: 'waiting', pending: pendingCount() });
    _retryTimer = setTimeout(flushOutbox, _retryDelay);
    _retryDelay = Math.min(_retryDelay * 2, 120000); // 5s, 10s, 20s … up to 2 min
  } else {
    _retryDelay = 5000;
  }
}

// true = Google has it (or the old script took it); false = try again later
async function sendJob(job) {
  let version;
  try { version = await getServerVersion(); } catch(e) { return false; } // offline
  if (version >= 2) {
    try {
      await fetch(SHEET_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ tab: job.tab, rows: job.rows, saveId: job.id })
      });
    } catch(e) { /* may or may not have arrived — the confirm below decides */ }
    try {
      const j = await fetch(SHEET_URL + '?confirm=' + encodeURIComponent(job.id) + '&tab=' + encodeURIComponent(job.tab)).then(r => r.json());
      return !!(j && j.saved);
    } catch(e) {
      return false;
    }
  }
  // Older script: one request per row, the original way. It can't confirm, so this is best effort.
  try {
    for (const l of job.legacy || []) {
      await fetch(SHEET_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ tab: l.tab, row: l.row })
      });
    }
    return true;
  } catch(e) {
    return false;
  }
}

// Try again whenever the phone gets signal back or the app comes to the front
window.addEventListener('online', () => { _retryDelay = 5000; flushOutbox(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && pendingCount()) flushOutbox(); });
