const test = require('node:test'), assert = require('node:assert/strict');
const { BPCases: C } = require('./helpers/load')();
const ok = { cuffSize: 'ok', armLevel: 'heart', deflationRate: 2 };

test('case library covers required scenarios', () => {
  assert.ok(C.CASES.length >= 5);
  assert.ok(C.CASES.some(c => c.gap));
  assert.ok(C.CASES.some(c => c.irregular));
  assert.ok(C.CASES.some(c => c.armCirc > 35) && C.CASES.some(c => c.armCirc < 24));
  for (const c of C.CASES) { assert.ok(c.sbp > c.dbp + 15, c.id); assert.ok(c.story && c.teach, c.id); }
});
test('scoreReading tolerance is +-5', () => {
  const c = C.CASES[0];
  assert.equal(C.scoreReading(c, ok, { sbp: c.sbp + 5, dbp: c.dbp - 5 }).ok, true);
  assert.equal(C.scoreReading(c, ok, { sbp: c.sbp + 6, dbp: c.dbp }).ok, false);
});
test('scoreReading explains causes', () => {
  const c = C.CASES[0];
  const s = C.scoreReading(c, { ...ok, cuffSize: 'small' }, { sbp: c.sbp + 10, dbp: c.dbp + 10 });
  assert.equal(s.ok, false); assert.ok(s.explanation.includes('cuff'));
  assert.ok(C.scoreReading(c, { ...ok, armLevel: 'below' }, { sbp: c.sbp + 8, dbp: c.dbp + 8 }).explanation.includes('หัวใจ'));
  assert.ok(C.scoreReading(c, { ...ok, deflationRate: 8 }, { sbp: c.sbp - 6, dbp: c.dbp }).explanation.includes('เร็ว'));
});
