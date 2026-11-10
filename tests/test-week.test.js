// Run with: node tests/test-week.test.js
// Checks the Week 11 test-week definition in program.js against SPEC.md "Test week at the end of Block 1".
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'program.js'), 'utf8') + '\n;this.__out = JSON.stringify({ WEEKS, ACC, TEST_WEEK });';
const ctx = {}; vm.createContext(ctx); vm.runInContext(src, ctx);
const { WEEKS, ACC, TEST_WEEK } = JSON.parse(ctx.__out);
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }
const slug = n => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

test('Week 11 follows Week 10: Dec 7-13, test days Mon/Wed/Fri, Sat prehab, Tue/Thu/Sun recovery', () => {
  assert.strictEqual(WEEKS.length, 11);
  const w = WEEKS[10];
  assert.strictEqual(w.n, 11); assert.strictEqual(w.testWeek, true); assert.strictEqual(w.dates, 'Dec 7 – Dec 13');
  assert.deepStrictEqual(w.days, ['lower', 'off', 'push-pull', 'off', 'power', 'prehab', 'off']);
  assert.strictEqual(w.lastLiftSlot, 'power');
});
test('Weeks 1-10 are unchanged in count and none is a test week', () => {
  WEEKS.slice(0, 10).forEach((w, i) => { assert.strictEqual(w.n, i + 1); assert.ok(!w.testWeek); });
  assert.strictEqual(WEEKS[9].deload, true);
});
test('Top-set options match SPEC (floor / good / stretch)', () => {
  assert.deepStrictEqual(TEST_WEEK.lifts.squat.options, { floor: 220, good: 225, stretch: 235 });
  assert.deepStrictEqual(TEST_WEEK.lifts.dl.options, { floor: 310, good: 320, stretch: 325 });
  assert.deepStrictEqual(TEST_WEEK.lifts.bench.options, { floor: 160, good: 165, stretch: 170 });
  assert.ok(!TEST_WEEK.lifts.ohp, 'no OHP test');
});
test('Ramps match SPEC and every ramp single sits below the Floor option', () => {
  assert.deepStrictEqual(TEST_WEEK.lifts.squat.ramp, [['bar', 8, 1], [95, 5, 1], [135, 4, 2], [165, 3, 2], [185, 2, 3], [205, 1, 4.5]]);
  assert.deepStrictEqual(TEST_WEEK.lifts.dl.ramp, [[135, 5, 1], [185, 4, 2], [225, 3, 2], [255, 2, 3], [285, 1, 4.5]]);
  assert.deepStrictEqual(TEST_WEEK.lifts.bench.ramp, [['bar', 8, 1], [65, 6, 1], [95, 5, 2], [115, 4, 2], [135, 3, 3], [150, 1, 4.5]]);
  Object.values(TEST_WEEK.lifts).forEach(t => {
    const last = t.ramp[t.ramp.length - 1];
    assert.strictEqual(last[1], 1, 'last ramp set is a single');
    assert.ok(last[0] < t.options.floor);
  });
  assert.ok(/Spotter or safeties/.test(TEST_WEEK.lifts.bench.note));
});
test('Every kept accessory exists in that day\'s built-in group, with at most half its Week 4 sets (rounded up)', () => {
  Object.entries(TEST_WEEK.keep).forEach(([slot, keep]) => {
    Object.entries(keep).forEach(([id, n]) => {
      const ex = ACC[slot].find(e => (e.id || slug(e.name)) === id);
      assert.ok(ex, `${id} in ${slot}`);
      const w4 = Array.isArray(ex.sets) ? ex.sets : ex.sets[TEST_WEEK.refWeek];
      assert.ok(n >= 1 && n <= Math.ceil(w4.length / 2), `${id}: ${n} of ${w4.length}`);
    });
  });
  assert.ok(!('single-arm-db-clean-and-jerk' in TEST_WEEK.keep.pushPull), 'clean and jerk dropped on Wednesday');
});
console.log(`\n${passed} passed`);
