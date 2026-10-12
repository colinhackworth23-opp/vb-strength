// VB Strength — Google Sheets sync

const SHEET_URL = 'https://script.google.com/macros/s/AKfycbzLuijUOxwOOV2NESQGajLZQwe4ZTf1d7xjdW5xXdBp6Oh7BFQ70pknZsLgaCGOEB47/exec';

// ── Sheet reads — one shared request per tab, with a copy kept on the phone ──
// The app paints from the saved copy instantly, then refreshes it in the background.
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
    const canIncrement = cachedRows && cachedRows.length > 0 && cached.fullAt && (Date.now() - cached.fullAt) < TAB_FULL_REFRESH_MS;
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
// Writes several rows in one request. If the Apps Script hasn't been updated to accept
// batches yet, falls back to one request per row (the old, slower way).
// saveId lets the updated script ignore a save it has already written.
async function postRowsToSheet(tab, rows) {
  if (!rows.length) return;
  const saveId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  try {
    // No custom headers → a "simple" request Apps Script lets us read the reply from
    const res = await fetch(SHEET_URL, { method: 'POST', body: JSON.stringify({ tab, rows, saveId }) });
    const out = await res.json();
    if (out && typeof out.written === 'number') return; // saved (or already saved)
  } catch(e) { /* old script returns an error page, or the reply was unreadable */ }
  for (let i = 0; i < rows.length; i++) {
    await fetch(SHEET_URL, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tab, row: rows[i], saveId, part: i })
    });
  }
}
const tabRows = d => (d && d.rows ? d.rows.slice(1) : []);
