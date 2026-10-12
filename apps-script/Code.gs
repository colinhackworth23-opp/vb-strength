// VB Strength — Google Apps Script backend (version 3)
//
// Paste this whole file into Extensions → Apps Script, then
// Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy.
// Never "New deployment" — that changes the web address the app talks to.
//
// Tabs
//   Sets     — one row per set (the training log). Created automatically from Log the first time it's needed.
//   Log      — the old one-row-per-exercise log. Kept untouched as a backup; nothing writes to it any more.
//   Feedback — one row per exercise per session: how it felt (easy / right / grind) and an optional note.
//   Program  — exercises, cues and target weights by week. The app fills it in the first time it opens.
//   VB Sessions, Check-ins, Maxes — unchanged.
//
// Endpoints
//   GET  ?tab=Name               every row of a tab
//   GET  ?tab=Name&from=N        only rows after the first N, plus the total row count
//   GET  ?tab=__meta             { version } — lets the app know which features this script has
//   GET  ?confirm=ID&tab=Name    { saved } — did the save with this ID reach the sheet?
//   POST { tab, rows, saveId }   write rows in one go; a repeated saveId is ignored
//   POST { tab, row }            single row (older app versions)
//   POST { action:'seedProgram', rows }  fill the Program tab, only if it's empty

var VERSION = 3;
var WEEK_COUNT = 10;
var SETS_HEADER = ['Date', 'Week', 'Day', 'Session', 'Exercise ID', 'Exercise', 'Set', 'Value', 'Weight', 'Reps', 'Save ID', 'Block'];
var FEEDBACK_HEADER = ['Date', 'Week', 'Day', 'Session', 'Exercise ID', 'Exercise', 'Effort', 'Note', 'Save ID'];
// Tabs whose rows carry a Save ID column: duplicates are detected from the sheet itself, not a short-lived cache
var SAVEID_COL = { Sets: 11, Feedback: 9 };
var TAB_WIDTH = { Sets: 12, Feedback: 9 };
var PROGRAM_HEADER = ['Group', 'Order', 'Exercise ID', 'Name', 'Superset', 'Sets × reps', 'Rec', 'Rest (s)', 'Increment', 'Cue']
  .concat(weekHeaders_());

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.tab === '__meta') return json_({ version: VERSION });
  if (p.confirm) return json_({ saved: isSaved_(p.confirm, p.tab || 'Sets') });

  var tabName = p.tab || 'Log';
  if (tabName === 'Sets') ensureSets_();
  var ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
  if (!ws) return json_({ rows: [], total: 0 });

  var lastRow = ws.getLastRow();
  var lastCol = ws.getLastColumn();
  var from = parseInt(p.from, 10);

  // Incremental read: the app already has the first `from` rows
  if (!isNaN(from) && from >= 0) {
    if (from >= lastRow || lastCol === 0) return json_({ rows: [], from: from, total: lastRow });
    return json_({ rows: ws.getRange(from + 1, 1, lastRow - from, lastCol).getValues(), from: from, total: lastRow });
  }
  var rows = lastRow ? ws.getDataRange().getValues() : [];
  return json_({ rows: rows, total: rows.length });
}

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var lock = LockService.getScriptLock();
  lock.waitLock(25000); // one write at a time, so simultaneous saves can't overwrite each other
  try {
    if (data.action === 'seedProgram') return json_(seedProgram_(data.rows || []));

    var tabName = data.tab || 'Log';
    if (tabName === 'Sets') ensureSets_(true);
    var ws = getOrCreateTab_(tabName);
    if (tabName === 'Sets') ensureSetsHeader_(ws);
    var cache = CacheService.getScriptCache();

    // Ignore a save we've already written (double tap, retry after bad signal)
    var batchKey = data.saveId ? 'save:' + data.saveId : null;
    var partKey = (batchKey && data.part !== undefined) ? batchKey + ':' + data.part : null;
    var idCol = SAVEID_COL[tabName];
    if (idCol && data.saveId && tabHasSaveId_(ws, idCol, data.saveId)) {
      return json_({ status: 'ok', written: 0, duplicate: true, version: VERSION });
    }
    if (!idCol && ((batchKey && cache.get(batchKey)) || (partKey && cache.get(partKey)))) {
      return json_({ status: 'ok', written: 0, duplicate: true, version: VERSION });
    }

    var rows = Array.isArray(data.rows) ? data.rows : (data.row ? [data.row] : []);
    rows = rows.filter(function (r) { return Array.isArray(r) && r.length; });
    if (idCol) {
      rows = rows.map(function (r) {
        var x = r.slice(0, TAB_WIDTH[tabName]);
        while (x.length < TAB_WIDTH[tabName]) x.push('');
        x[idCol - 1] = data.saveId || '';
        return x;
      });
    }
    writeRows_(ws, rows);

    if (!idCol) {
      if (partKey) cache.put(partKey, '1', 21600);
      else if (batchKey) cache.put(batchKey, '1', 21600);
    }
    return json_({ status: 'ok', written: rows.length, version: VERSION });
  } finally {
    lock.releaseLock();
  }
}

// ── Sets tab ──

// Creates the Sets tab the first time it's needed, converting every row of the old Log tab.
// The Log tab itself is left exactly as it is.
function ensureSets_(haveLock) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName('Sets')) return;
  var lock = haveLock ? null : LockService.getScriptLock();
  if (lock) lock.waitLock(25000);
  try {
    if (ss.getSheetByName('Sets')) return; // another request created it while we waited
    var rows = convertLog_(ss.getSheetByName('Log'), ss.getSpreadsheetTimeZone());
    var ws = ss.insertSheet('Sets');
    ws.getRange(1, 1, 1, SETS_HEADER.length).setValues([SETS_HEADER]).setFontWeight('bold');
    ws.setFrozenRows(1);
    ws.getRange('H:H').setNumberFormat('@'); // Value column stays exactly as typed ("8bw + 2 band", "45s")
    writeRows_(ws, rows);
  } finally {
    if (lock) lock.releaseLock();
  }
}

// Older Sets tabs have 11 columns — add the Block header once, without touching any rows
function ensureSetsHeader_(ws) {
  if (ws.getRange(1, SETS_HEADER.length).getValue() !== 'Block') {
    ws.getRange(1, SETS_HEADER.length).setValue('Block').setFontWeight('bold');
  }
}

function convertLog_(logWs, tz) {
  if (!logWs || logWs.getLastRow() < 2) return [];
  var values = logWs.getDataRange().getValues();
  var out = [];
  var seen = {};
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    var date = r[0], week = r[1], day = r[2], exRaw = String(r[3] || '').trim();
    if (!date || !exRaw) continue;
    var session = sessionId_(date, day, tz);
    var id = exId_(exRaw);
    var name = exRaw.split('__')[0].trim();
    for (var s = 0; s < 5; s++) {
      var v = r[6 + s];
      if (v === '' || v === null || v === undefined || v === '-') continue;
      var key = session + '|' + id + '|' + (s + 1);
      if (seen[key]) continue; // same set logged twice (old duplicate rows)
      seen[key] = true;
      var parsed = parseSetValue_(v);
      out.push([date, week, day, session, id, name, s + 1, String(v), parsed.weight, parsed.reps, 'from-log']);
    }
  }
  return out;
}

function tabHasSaveId_(ws, idCol, saveId) {
  var last = ws.getLastRow();
  if (last < 2) return false;
  var start = Math.max(2, last - 3000);
  var ids = ws.getRange(start, idCol, last - start + 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) if (ids[i][0] === saveId) return true;
  return false;
}

function isSaved_(saveId, tabName) {
  if (SAVEID_COL[tabName]) {
    var ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
    return !!ws && tabHasSaveId_(ws, SAVEID_COL[tabName], saveId);
  }
  return !!CacheService.getScriptCache().get('save:' + saveId);
}

// ── Program tab ──

function seedProgram_(rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Program');
  if (ws && ws.getLastRow() > 1) return { status: 'ok', seeded: false, version: VERSION };
  if (!ws) ws = ss.insertSheet('Program');
  ws.clear();
  ws.getRange(1, 1, 1, PROGRAM_HEADER.length).setValues([PROGRAM_HEADER]).setFontWeight('bold');
  ws.setFrozenRows(1);
  // Week columns as plain text, so "5/5/5" stays sets and never turns into a date
  ws.getRange(1, PROGRAM_HEADER.length - WEEK_COUNT + 1, ws.getMaxRows(), WEEK_COUNT).setNumberFormat('@');
  var clean = rows.filter(function (r) { return Array.isArray(r) && r.length; }).map(function (r) {
    var x = r.slice(0, PROGRAM_HEADER.length);
    while (x.length < PROGRAM_HEADER.length) x.push('');
    return x;
  });
  writeRows_(ws, clean);
  ws.setColumnWidth(10, 320);
  return { status: 'ok', seeded: true, written: clean.length, version: VERSION };
}

// ── Helpers (exId_ and parseSetValue_ must match the app's versions) ──

function exId_(raw) {
  var parts = String(raw || '').split('__');
  if (parts.length > 1 && parts[1].trim()) return parts[1].trim().toLowerCase();
  return parts[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function parseSetValue_(v) {
  var s = String(v).trim();
  var m = /^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)$/i.exec(s);
  if (m) return { weight: parseFloat(m[1]), reps: parseInt(m[2], 10) };
  if (/^\d+(?:\.\d+)?$/.test(s)) return { weight: parseFloat(s), reps: '' };
  m = /^(\d+)\s*reps?$/i.exec(s);
  if (m) return { weight: '', reps: parseInt(m[1], 10) };
  return { weight: '', reps: '' };
}

function sessionId_(date, day, tz) {
  var d = (date instanceof Date) ? Utilities.formatDate(date, tz, 'yyyy-MM-dd') : String(date);
  return d + '-' + String(day || '');
}

function writeRows_(ws, rows) {
  if (!rows.length) return;
  var width = Math.max.apply(null, rows.map(function (r) { return r.length; }));
  var padded = rows.map(function (r) { return r.concat(new Array(width - r.length).fill('')); });
  ws.getRange(ws.getLastRow() + 1, 1, padded.length, width).setValues(padded);
}

function getOrCreateTab_(tabName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(tabName);
  if (!ws) {
    ws = ss.insertSheet(tabName);
    if (tabName === 'Log') ws.appendRow(['Date', 'Week', 'Day', 'Exercise', 'Sets', 'Reps', 'Set1', 'Set2', 'Set3', 'Set4', 'Set5', 'Notes']);
    if (tabName === 'Maxes') ws.appendRow(['Date', 'Squat TM', 'Bench TM', 'Hex DL TM', 'OHP TM']);
  }
  if (tabName === 'Feedback' && ws.getLastRow() === 0) {
    ws.getRange(1, 1, 1, FEEDBACK_HEADER.length).setValues([FEEDBACK_HEADER]).setFontWeight('bold');
    ws.setFrozenRows(1);
    ws.getRange('H:H').setNumberFormat('@'); // notes stay exactly as typed
  }
  return ws;
}

function weekHeaders_() {
  var h = [];
  for (var w = 1; w <= WEEK_COUNT; w++) h.push('W' + w);
  return h;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
