// Run with: node tests/week8.test.js
// Checks the Week 8 extra-set change in program.js: five lifts gain one optional set, nothing else moves.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function load(file) {
  const src = fs.readFileSync(file, 'utf8') + '\n;this.__out = { WEEKS, ACC, isOptionalSet, OPTIONAL_LAST_SET };';
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: file });
  // Clone through JSON so arrays come from this realm (deepStrictEqual checks prototypes)
  const data = JSON.parse(JSON.stringify({ WEEKS: ctx.__out.WEEKS, ACC: ctx.__out.ACC }));
  return { WEEKS: data.WEEKS, ACC: data.ACC, isOptionalSet: ctx.__out.isOptionalSet };
}
const cur = load(path.join(__dirname, '..', 'program.js'));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }

test('Week 8 squat and bench have 5 sets, hex bar has 4, extra = same % as last planned set', () => {
  const w = cur.WEEKS[7].pcts;
  assert.deepStrictEqual(w.squat, [0.78, 0.80, 0.82, 0.84, 0.84]);
  assert.deepStrictEqual(w.bench, [0.78, 0.80, 0.82, 0.84, 0.84]);
  assert.deepStrictEqual(w.dl, [0.78, 0.80, 0.82, 0.82]);
});
test('Week 8 reps and every other Week 8 field are unchanged', () => {
  const w = cur.WEEKS[7];
  assert.strictEqual(w.reps, 6); assert.strictEqual(w.volume, '4×6'); assert.strictEqual(w.intensity, '78–84% TM'); assert.strictEqual(w.rpe, '8–9');
});
test('Weeks 1-7, 9 and 10 percentages match the Week 7 pattern they had before (no change)', () => {
  const expect = {
    1: { squat: [.65,.65,.65,.65], bench: [.65,.65,.65,.65], dl: [.65,.65,.65] },
    7: { squat: [.78,.80,.82,.84], bench: [.78,.80,.82,.84], dl: [.78,.80,.82] },
    9: { squat: [.80,.82,.84,.86], bench: [.80,.82,.84,.86], dl: [.80,.82,.84] },
    10: { squat: [.55,.60,.65], bench: [.55,.60,.65], dl: [.55,.60,.65] },
  };
  Object.entries(expect).forEach(([n, p]) => assert.deepStrictEqual(cur.WEEKS[n - 1].pcts, p, 'week ' + n));
});
test('Built-in defaults: RDL and hip thrust W8 gain one set (last value repeated); other weeks untouched', () => {
  const all = [].concat(...Object.values(cur.ACC).filter(Array.isArray));
  const rdl = all.find(e => e.name === 'Romanian deadlift (barbell)');
  const ht = all.find(e => e.name === 'Barbell hip thrust');
  assert.deepStrictEqual(rdl.sets[8], ['135', '145', '155', '155']);
  assert.deepStrictEqual(ht.sets[8], ['275', '305', '340', '340']);
  assert.strictEqual(rdl.sets[7].length, 3); assert.strictEqual(rdl.sets[9].length, 3);
  assert.strictEqual(ht.sets[7].length, 3); assert.strictEqual(ht.sets[9].length, 3);
});
test('isOptionalSet: only the LAST set of the five lifts, only in Week 8', () => {
  const f = cur.isOptionalSet;
  assert.strictEqual(f(8, 'squat', 4, 5), true);
  assert.strictEqual(f(8, 'squat', 3, 5), false);
  assert.strictEqual(f(8, 'bench', 4, 5), true);
  assert.strictEqual(f(8, 'dl', 3, 4), true);
  assert.strictEqual(f(8, 'romanian-deadlift-barbell', 3, 4), true);
  assert.strictEqual(f(8, 'barbell-hip-thrust', 3, 4), true);
  assert.strictEqual(f(7, 'squat', 3, 4), false);
  assert.strictEqual(f(9, 'squat', 4, 5), false);
  assert.strictEqual(f(8, 'leg-press', 2, 3), false);
  assert.strictEqual(f(8, 'squat', 0, 1), false);
});
console.log(`\n${passed} passed`);
