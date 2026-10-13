// Run with: node tests/sync-helpers.test.js
// Loads sync.js in a fake browser and checks the pure helpers and the save outbox. No network, no packages.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function makeEnv(opts) {
  opts = opts || {};
  const store = {};
  const calls = []; // every fetch the app made: { method, url, body }
  const confirmed = new Set(opts.alreadySaved || []);
  const sandbox = {
    console,
    JSON, Math, Date, Promise, setTimeout, clearTimeout,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    window: { addEventListener() {} },
    document: { addEventListener() {}, hidden: false },
    fetch: async (url, init) => {
      const method = (init && init.method) || 'GET';
      const body = init && init.body ? JSON.parse(init.body) : null;
      calls.push({ method, url, body });
      if (opts.offline) throw new Error('offline');
      if (url.includes('tab=__meta')) return { json: async () => ({ version: 3 }) };
      if (method === 'POST') { if (body && body.saveId && body.rows && body.rows.length) confirmed.add(body.saveId); return {}; }
      const m = /confirm=([^&]+)/.exec(url);
      if (m) return { json: async () => ({ saved: confirmed.has(decodeURIComponent(m[1])) }) };
      return { json: async () => ({ rows: [], total: 0 }) };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sync.js'), 'utf8'), sandbox);
  const run = code => vm.runInContext(code, sandbox);
  return { run, store, calls, sandbox };
}

// ── Rep-logged helpers ──
test('rep-logged ids: the four pull-up variants only, not dead hang', () => {
  const { run } = makeEnv();
  assert.strictEqual(run("isRepLogged('Weighted pull-up')"), true);
  assert.strictEqual(run("isRepLogged('weighted-pull-up')"), true);
  assert.strictEqual(run("isRepLogged('Pull-up practice (doorframe bar)')"), true);
  assert.strictEqual(run("isRepLogged('Banded negative pull-up')"), true);
  assert.strictEqual(run("isRepLogged('Scapular pull-up')"), true);
  assert.strictEqual(run("isRepLogged('Dead hang')"), false);
  assert.strictEqual(run("isRepLogged('Lat pulldown')"), false);
  assert.strictEqual(run("isRepLogged('Dips')"), false);
});

test('cleanReps accepts whole numbers 1-99 only', () => {
  const { run } = makeEnv();
  assert.strictEqual(run("cleanReps('6')"), 6);
  assert.strictEqual(run("cleanReps(' 12 ')"), 12);
  assert.strictEqual(run("cleanReps('99')"), 99);
  ['', '0', '00', '100', '-3', '6.5', 'six', '6 reps', 'BW', null, undefined].forEach(v =>
    assert.strictEqual(run('cleanReps(' + JSON.stringify(v === undefined ? null : v) + ')'), null, 'should reject ' + v));
});

test('composeRepValue: bodyweight → "N reps", loaded → "LxN", no reps → null', () => {
  const { run } = makeEnv();
  assert.strictEqual(run("composeRepValue('6','BW')"), '6 reps');
  assert.strictEqual(run("composeRepValue('6','+10')"), '10x6');
  assert.strictEqual(run("composeRepValue('5','+25')"), '25x5');
  assert.strictEqual(run("composeRepValue('5','+2.5')"), '2.5x5');
  assert.strictEqual(run("composeRepValue('5','+0')"), '5 reps');
  assert.strictEqual(run("composeRepValue('', 'BW')"), null);
  assert.strictEqual(run("composeRepValue('0','+10')"), null);
  // plan text is never saved as a result
  assert.strictEqual(run("composeRepValue('', '+10')"), null);
});

test('composed values are read back correctly by the existing parseSetValue (and the sheet script copy)', () => {
  const { run } = makeEnv();
  assert.deepStrictEqual(JSON.parse(run("JSON.stringify(parseSetValue(composeRepValue('6','BW')))")), { weight: '', reps: 6 });
  assert.deepStrictEqual(JSON.parse(run("JSON.stringify(parseSetValue(composeRepValue('6','+10')))")), { weight: 10, reps: 6 });
  // Apps Script copy uses the same three regexes — check the source still matches ours
  const gs = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  assert.ok(gs.includes("/^(\\d+(?:\\.\\d+)?)\\s*[x×]\\s*(\\d+)$/i"), 'Code.gs LxR regex changed');
  assert.ok(gs.includes("/^(\\d+)\\s*reps?$/i"), 'Code.gs "N reps" regex changed');
});

test('normalizeLoadInput', () => {
  const { run } = makeEnv();
  const n = v => run('normalizeLoadInput(' + JSON.stringify(v) + ')');
  assert.strictEqual(n('bw'), 'BW');
  assert.strictEqual(n(''), 'BW');
  assert.strictEqual(n('0'), 'BW');
  assert.strictEqual(n('15'), '+15');
  assert.strictEqual(n('+15'), '+15');
  assert.strictEqual(n('15 lb'), '+15');
  assert.strictEqual(n('15 LBS'), '+15');
  assert.strictEqual(n('2.5'), '+2.5');
  assert.strictEqual(n('abc'), null);
  assert.strictEqual(n('-5'), null);
  assert.strictEqual(n('1000'), null);
});

test('loadLabel', () => {
  const { run } = makeEnv();
  assert.strictEqual(run("loadLabel('BW')"), 'BW');
  assert.strictEqual(run("loadLabel('+10')"), '+10 lb');
  assert.strictEqual(run("loadLabel('+0')"), 'BW');
});

test('describeRepValue: every stored format already in the Sets tab', () => {
  const { run } = makeEnv();
  const d = v => run('describeRepValue(' + JSON.stringify(v) + ')');
  assert.strictEqual(d('6 reps'), '6 reps');
  assert.strictEqual(d('5 reps'), '5 reps');
  assert.strictEqual(d('10x6'), '+10 lb × 6');
  assert.strictEqual(d('25x4'), '+25 lb × 4');
  assert.strictEqual(d('45x3'), '+45 lb × 3');
  assert.strictEqual(d('25'), '+25 lb (reps not recorded)');
  assert.strictEqual(d('BW'), 'BW (reps not recorded)');
  assert.strictEqual(d('30 failed'), '30 failed');
  assert.strictEqual(d('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
});

// ── Outbox: Gap A ──
test('queueSave refuses a job with no rows and stores nothing', () => {
  const { run, store, calls } = makeEnv();
  assert.strictEqual(run("queueSave({ id: 'empty1', tab: 'Sets', rows: [], legacy: [], label: 'x' })"), false);
  assert.strictEqual(store['vb-strength-outbox-v1'], undefined);
  assert.strictEqual(calls.length, 0);
});

test('an empty job already stuck in the outbox is cleared and the real save behind it sends once', async () => {
  const { run, store, calls } = makeEnv();
  const stuck = { id: 'stuck1', tab: 'Sets', rows: [], legacy: [{ tab: 'Log', row: ['x'] }], label: 'old', createdAt: 1, tries: 7 };
  const real = { id: 'real1', tab: 'Sets', rows: [['10/13/2026', 'Week 3', 'Tuesday', 's', 'weighted-pull-up', 'Weighted pull-up', 1, '6 reps', '', 6, '', 'b']], legacy: [], label: 'real', createdAt: 2, tries: 0 };
  store['vb-strength-outbox-v1'] = JSON.stringify([stuck, real]);
  await run('flushOutbox()');
  const posts = calls.filter(c => c.method === 'POST');
  assert.strictEqual(posts.length, 1, 'only the real save is posted');
  assert.strictEqual(posts[0].body.saveId, 'real1');
  assert.deepStrictEqual(JSON.parse(store['vb-strength-outbox-v1']), []);
  assert.ok(!calls.some(c => c.url.includes('stuck1')), 'nothing was asked about the empty job');
});

test('an outbox holding only an empty job empties itself', async () => {
  const { run, store } = makeEnv();
  store['vb-strength-outbox-v1'] = JSON.stringify([{ id: 'stuck2', tab: 'Sets', rows: [], legacy: [], label: 'old', createdAt: 1, tries: 3 }]);
  await run('flushOutbox()');
  assert.deepStrictEqual(JSON.parse(store['vb-strength-outbox-v1']), []);
});

// ── Outbox: existing behavior must not change ──
test('a normal save is sent once and removed after the sheet confirms it', async () => {
  const { run, store, calls } = makeEnv();
  const ok = run("queueSave({ id: 'a1', tab: 'Sets', rows: [['d','w','day','s','dl','Hex',1,'315x5','',5,'','b']], legacy: [], label: 'x' })");
  assert.strictEqual(ok, true);
  await new Promise(r => setTimeout(r, 50));
  assert.strictEqual(calls.filter(c => c.method === 'POST').length, 1);
  assert.deepStrictEqual(JSON.parse(store['vb-strength-outbox-v1']), []);
});

test('a save that was never confirmed stays in the outbox for retry (offline)', async () => {
  const { run, store } = makeEnv({ offline: true });
  run("queueSave({ id: 'b1', tab: 'Sets', rows: [['d','w','day','s','dl','Hex',1,'315x5','',5,'','b']], legacy: [], label: 'x' })");
  await new Promise(r => setTimeout(r, 50));
  const left = JSON.parse(store['vb-strength-outbox-v1']);
  assert.strictEqual(left.length, 1);
  assert.strictEqual(left[0].id, 'b1');
  assert.ok(left[0].tries >= 1);
});

test('a save the sheet already has is confirmed without being lost or duplicated', async () => {
  const { run, store, calls } = makeEnv({ alreadySaved: ['c1'] });
  store['vb-strength-outbox-v1'] = JSON.stringify([{ id: 'c1', tab: 'Sets', rows: [['d']], legacy: [], label: 'x', createdAt: 1, tries: 2 }]);
  await run('flushOutbox()');
  assert.deepStrictEqual(JSON.parse(store['vb-strength-outbox-v1']), []);
  // every POST carries the same Save ID, which the script uses to ignore a repeat
  calls.filter(c => c.method === 'POST').forEach(c => assert.strictEqual(c.body.saveId, 'c1'));
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; console.log('  ok   ' + t.name); }
    catch (e) { failed++; console.log('  FAIL ' + t.name + '\n       ' + (e && e.message)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
