// VB Strength — weekly proposals
//
// Every Sunday the assessment writes proposed changes into the sheet's Proposals tab.
// This file shows them (banner, chip on the exercise, review sheet) and records your answers.
//
// The Proposals tab is an event log: the app only ever ADDS rows. A decision is a new row with the
// same Proposal ID, and the latest row for an ID wins — so decisions sync across devices and
// work offline through the same outbox as everything else.
//
// Columns: Proposal ID, Created, Type, Week, Exercise ID, Exercise, From, To, Reason,
//          Last week, Flags, Status, Decided, Decline reason, Note, Source
// Types:   'weight' (a new sets string for one exercise in one week) — more can be added later;
//          'run' is a heartbeat row the assessment writes each time it runs.
// Status:  pending → accepted | edited | declined → applied (written into the Program tab) | expired

const PROPOSALS_TAB = 'Proposals';
const PC = { id: 0, created: 1, type: 2, week: 3, exid: 4, name: 5, from: 6, to: 7, reason: 8, last: 9, flags: 10, status: 11, decided: 12, decline: 13, note: 14, source: 15 };
const DECLINE_REASONS = [['too-heavy', 'Too heavy'], ['joint-pain', 'Joint pain'], ['not-feeling-it', 'Not feeling it'], ['other', 'Other']];

let PROPOSALS = {};      // id → latest state
let PROPOSAL_RUN_AT = ''; // when the assessment last ran (ISO), from its heartbeat rows
const _draftTo = {};     // id → value picked with the −/+ stepper, not saved until Accept

const propEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const weekNum = v => { const m = /(\d+)/.exec(String(v || '')); return m ? parseInt(m[1], 10) : 0; };
const splitSets = s => String(s || '').split('/').map(x => x.trim()).filter(x => x !== '');
const joinSets = a => a.join(' / ');

function proposalFromRow(r) {
  const g = i => (r[i] === undefined || r[i] === null ? '' : String(r[i]));
  return { id: g(PC.id), created: g(PC.created), type: g(PC.type) || 'weight', week: weekNum(g(PC.week)), exid: g(PC.exid), name: g(PC.name),
    from: g(PC.from), to: g(PC.to), reason: g(PC.reason), last: g(PC.last), flags: g(PC.flags),
    status: g(PC.status) || 'pending', decided: g(PC.decided), decline: g(PC.decline), note: g(PC.note), source: g(PC.source) };
}
function proposalToRow(p, source) {
  return [p.id, p.created, p.type, `Week ${p.week}`, p.exid, p.name, p.from, p.to, p.reason, p.last, p.flags, p.status, p.decided, p.decline || '', p.note || '', source || 'app'];
}

// Latest row per ID wins; an empty cell never wipes something an earlier row filled in
function buildProposals(rows) {
  const out = {};
  let runAt = '';
  rows.forEach(r => {
    if (!r || !r[PC.id]) return;
    const p = proposalFromRow(r);
    if (p.type === 'run') { if (p.created > runAt) runAt = p.created; return; }
    const prev = out[p.id];
    if (!prev) { out[p.id] = p; return; }
    const merged = { ...prev };
    Object.keys(p).forEach(k => { if (p[k] !== '' && p[k] !== 0) merged[k] = p[k]; });
    // decline reason / note can be cleared by an undo (status back to pending)
    if (p.status === 'pending') { merged.decline = ''; merged.note = ''; merged.decided = ''; }
    out[p.id] = merged;
  });
  PROPOSALS = out;
  PROPOSAL_RUN_AT = runAt;
}
function proposalRowsFrom(data) {
  const rows = (data && data.rows ? data.rows.slice(1) : []).concat(pendingRows(PROPOSALS_TAB));
  return rows;
}
function applyCachedProposals() {
  buildProposals(proposalRowsFrom(getCachedTab(PROPOSALS_TAB)));
  updateProposalBanner();
}
// Resolves true if anything changed (so the screen should repaint)
async function loadProposals(opts) {
  try {
    const { data, changed } = await fetchTab(PROPOSALS_TAB, opts);
    buildProposals(proposalRowsFrom(data));
    updateProposalBanner();
    return changed;
  } catch (e) { return false; }
}

const proposalFor = (weekN, exid) => Object.values(PROPOSALS).find(p => p.type === 'weight' && p.week === weekN && p.exid === exid && p.status !== 'expired' && p.status !== 'applied') || null;
const todayWeekN = () => getTodayWeekIdx() + 1;
const openProposals = () => Object.values(PROPOSALS).filter(p => p.type === 'weight' && p.status === 'pending' && p.week >= todayWeekN());
function findAccEx(exid) {
  for (const arr of Object.values(ACC)) { if (!Array.isArray(arr)) continue; const e = arr.find(x => (x.id || exId(x.name)) === exid); if (e) return e; }
  return null;
}
const stepFor = exid => { const e = findAccEx(exid); return (e && e.inc) || 5; };
const hasNumbers = s => splitSets(s).some(x => /^\+?\d+(\.\d+)?$/.test(x));

// Accepted proposals replace the planned sets for that exercise and week (until the run writes them into the Program tab)
function applyProposalOverride(sets, weekN, exid) {
  const p = proposalFor(weekN, exid);
  if (!p || (p.status !== 'accepted' && p.status !== 'edited')) return sets;
  const to = splitSets(p.to);
  return to.length === sets.length ? to : sets;
}

// ── What you see ──
function proposalChipHTML(exid, weekN) {
  const p = proposalFor(weekN, exid);
  if (!p) return '';
  if (p.status === 'accepted' || p.status === 'edited') {
    return `<div class="prop-chip done" data-pid="${propEsc(p.id)}"><span class="prop-done-text">Updated to ${propEsc(p.to)}</span><button class="prop-undo" onclick="undoProposal('${propEsc(p.id)}')">Undo</button></div>`;
  }
  if (p.status !== 'pending') return '';
  const to = _draftTo[p.id] || p.to;
  const stepper = hasNumbers(to) ? `<span class="prop-step"><button onclick="stepProposal('${propEsc(p.id)}',-1)" aria-label="Lower">−</button><button onclick="stepProposal('${propEsc(p.id)}',1)" aria-label="Raise">+</button></span>` : '';
  return `<div class="prop-chip" data-pid="${propEsc(p.id)}">
    <div class="prop-head"><span class="prop-title">Proposed <b class="prop-to">${propEsc(to)}</b></span><span class="prop-was">now ${propEsc(p.from)}</span></div>
    ${p.reason ? `<div class="prop-why">${propEsc(p.reason)}</div>` : ''}
    ${p.last ? `<div class="prop-last">${propEsc(p.last)}</div>` : ''}
    ${p.flags ? `<span class="prop-flag">${propEsc(p.flags)}</span>` : ''}
    <div class="prop-actions"><button class="prog-chip prog-clean" onclick="acceptProposal('${propEsc(p.id)}')">Accept</button><button class="prog-chip prog-hold" onclick="declineProposal('${propEsc(p.id)}')">Keep plan</button>${stepper}</div>
  </div>`;
}
function runStampText() {
  if (!PROPOSAL_RUN_AT) return '';
  const d = new Date(PROPOSAL_RUN_AT);
  if (isNaN(d)) return '';
  return 'Assessed ' + d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function updateProposalBanner() {
  const el = document.getElementById('propBanner');
  if (!el) return;
  const n = openProposals().length;
  if (!n) { el.hidden = true; return; }
  const wk = Math.min(...openProposals().map(p => p.week));
  el.hidden = false;
  el.innerHTML = `<span class="prop-banner-text"><b>${n} change${n === 1 ? '' : 's'} proposed for week ${wk}</b><span class="prop-banner-sub">${propEsc(runStampText() || 'Based on your recent logs')}</span></span><span class="prop-banner-go">Review</span>`;
}

// ── What happens when you answer ──
function setPlanInputs(weekN, exid, fromStr, toStr) {
  const from = splitSets(fromStr), to = splitSets(toStr);
  document.querySelectorAll(`.set-input[data-week="${weekN}"][data-exid="${exid}"]`).forEach(inp => {
    const i = parseInt(inp.dataset.s, 10);
    // Only overwrite a box still showing the old plan — never something you typed
    if (to[i] !== undefined && from[i] !== undefined && inp.value.trim() === from[i]) inp.value = to[i];
  });
}
function saveProposalState(p, status, extra) {
  const next = { ...p, ...(extra || {}), status, decided: new Date().toISOString() };
  PROPOSALS[p.id] = next;
  const row = proposalToRow(next, 'app');
  queueSave({ id: newSaveId(), tab: PROPOSALS_TAB, rows: [row], legacy: [{ tab: PROPOSALS_TAB, row }], label: 'Plan change' });
  return next;
}
function refreshProposalUI() {
  updateProposalBanner();
  document.querySelectorAll('.prop-chip[data-pid]').forEach(el => {
    const p = PROPOSALS[el.dataset.pid];
    if (!p) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = proposalChipHTML(p.exid, p.week);
    if (wrap.firstElementChild) el.replaceWith(wrap.firstElementChild); else el.remove();
  });
  if (document.getElementById('propSheet') && !document.getElementById('propSheet').hidden) renderProposalSheet();
}
function acceptProposal(id) {
  const p = PROPOSALS[id]; if (!p || p.status !== 'pending') return;
  const to = _draftTo[id] || p.to;
  delete _draftTo[id];
  const status = to !== p.to ? 'edited' : 'accepted';
  saveProposalState(p, status, { to });
  setPlanInputs(p.week, p.exid, p.from, to);
  haptic(12);
  refreshProposalUI();
}
function declineProposal(id) {
  const p = PROPOSALS[id]; if (!p || p.status !== 'pending') return;
  delete _draftTo[id];
  saveProposalState(p, 'declined');
  haptic(8);
  refreshProposalUI();
}
function undoProposal(id) {
  const p = PROPOSALS[id]; if (!p) return;
  const wasTo = p.to;
  saveProposalState(p, 'pending', { decline: '', note: '' });
  setPlanInputs(p.week, p.exid, wasTo, p.from);
  refreshProposalUI();
}
function stepProposal(id, dir) {
  const p = PROPOSALS[id]; if (!p) return;
  const step = stepFor(p.exid) * dir;
  const cur = splitSets(_draftTo[id] || p.to);
  _draftTo[id] = joinSets(cur.map(v => bumpVal(v, step)));
  document.querySelectorAll(`.prop-chip[data-pid="${id}"] .prop-to`).forEach(el => { el.textContent = _draftTo[id]; });
  document.querySelectorAll(`.prop-item[data-pid="${id}"] .prop-to`).forEach(el => { el.textContent = _draftTo[id]; });
}
function declineWithReason(id, reason) {
  const p = PROPOSALS[id]; if (!p || p.status !== 'declined') return;
  saveProposalState(p, 'declined', { decline: reason });
  refreshProposalUI();
}
function declineNote(id, text) {
  const p = PROPOSALS[id]; if (!p || p.status !== 'declined') return;
  // No re-draw here: this runs when the box loses focus, and replacing it mid-blur throws
  saveProposalState(p, 'declined', { note: String(text || '').trim().slice(0, 400) });
}
function acceptAllProposals() {
  openProposals().forEach(p => acceptProposal(p.id));
}

// ── Review sheet — everything in one place ──
function openProposalSheet() {
  let el = document.getElementById('propSheet');
  if (!el) {
    el = document.createElement('div');
    el.id = 'propSheet';
    el.className = 'prop-sheet';
    document.body.appendChild(el);
  }
  el.hidden = false;
  document.body.classList.add('prop-sheet-open');
  renderProposalSheet();
}
function closeProposalSheet() {
  const el = document.getElementById('propSheet');
  if (el) el.hidden = true;
  document.body.classList.remove('prop-sheet-open');
}
function proposalItemHTML(p) {
  const id = propEsc(p.id);
  const to = _draftTo[p.id] || p.to;
  let body;
  if (p.status === 'pending') {
    const stepper = hasNumbers(to) ? `<span class="prop-step"><button onclick="stepProposal('${id}',-1)" aria-label="Lower">−</button><button onclick="stepProposal('${id}',1)" aria-label="Raise">+</button></span>` : '';
    body = `<div class="prop-actions"><button class="prog-chip prog-clean" onclick="acceptProposal('${id}')">Accept</button><button class="prog-chip prog-hold" onclick="declineProposal('${id}')">Keep plan</button>${stepper}</div>`;
  } else if (p.status === 'accepted' || p.status === 'edited') {
    body = `<div class="prop-done-line"><span>Accepted</span><button class="prop-undo" onclick="undoProposal('${id}')">Undo</button></div>`;
  } else if (p.status === 'declined') {
    const chips = DECLINE_REASONS.map(([v, l]) => `<button class="prog-chip prop-reason${p.decline === v ? ' selected' : ''}" onclick="declineWithReason('${id}','${v}')">${l}</button>`).join('');
    body = `<div class="prop-done-line"><span>Kept plan — why? <i>(optional)</i></span><button class="prop-undo" onclick="undoProposal('${id}')">Undo</button></div>
      <div class="prop-reasons">${chips}</div>
      <textarea class="eff-note prop-note" rows="2" maxlength="400" placeholder="Tell Claude more, if you like" onchange="declineNote('${id}',this.value)">${propEsc(p.note)}</textarea>`;
  } else { body = `<div class="prop-done-line"><span>${propEsc(p.status)}</span></div>`; }
  return `<div class="prop-item" data-pid="${id}">
    <div class="prop-item-head"><span class="prop-item-name">${propEsc(p.name)}</span><span class="prop-item-week">Week ${p.week}</span></div>
    <div class="prop-head"><span class="prop-title"><b class="prop-to">${propEsc(to)}</b></span><span class="prop-was">now ${propEsc(p.from)}</span></div>
    ${p.reason ? `<div class="prop-why">${propEsc(p.reason)}</div>` : ''}
    ${p.last ? `<div class="prop-last">${propEsc(p.last)}</div>` : ''}
    ${p.flags ? `<span class="prop-flag">${propEsc(p.flags)}</span>` : ''}
    ${body}
  </div>`;
}
function renderProposalSheet() {
  const el = document.getElementById('propSheet');
  if (!el) return;
  const all = Object.values(PROPOSALS).filter(p => p.type === 'weight' && p.week >= todayWeekN() && p.status !== 'expired' && p.status !== 'applied');
  const pend = all.filter(p => p.status === 'pending').length;
  el.innerHTML = `<div class="prop-sheet-inner">
    <div class="prop-sheet-top"><div><div class="prop-sheet-title">Plan changes</div><div class="prop-sheet-sub">${propEsc(runStampText())}</div></div><button class="prop-close" onclick="closeProposalSheet()" aria-label="Close">Done</button></div>
    ${pend > 1 ? `<button class="prog-chip prog-clean prop-all" onclick="acceptAllProposals()">Accept all ${pend}</button>` : ''}
    ${all.length ? all.map(proposalItemHTML).join('') : '<div class="empty-state">Nothing waiting. New proposals appear after the Sunday assessment.</div>'}
  </div>`;
}
