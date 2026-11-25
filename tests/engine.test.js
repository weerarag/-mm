const test = require('node:test'), assert = require('node:assert/strict');
const { BPEngine: E } = require('./helpers/load')();
const base = { id: 't', sbp: 120, dbp: 80, hr: 70, armCirc: 28 };
const ok = { cuffSize: 'ok', armLevel: 'heart', deflationRate: 2 };
const lcg = (s = 7) => () => (s = (s * 16807) % 2147483647) / 2147483647;

test('apparentPressures: no error', () => {
  const a = E.apparentPressures(base, ok);
  assert.equal(a.sbp, 120); assert.equal(a.dbp, 80);
});
test('apparentPressures: cuff size and arm level offsets', () => {
  assert.equal(E.apparentPressures(base, { ...ok, cuffSize: 'small' }).sbp, 130);
  assert.equal(E.apparentPressures(base, { ...ok, cuffSize: 'large' }).dbp, 75);
  assert.equal(E.apparentPressures(base, { ...ok, armLevel: 'below' }).sbp, 128);
  assert.equal(E.apparentPressures(base, { ...ok, armLevel: 'above' }).dbp, 72);
});
test('korotkoff: sound only between dbp and sbp', () => {
  assert.equal(E.korotkoff(base, ok, 130).sound, false);
  assert.equal(E.korotkoff(base, ok, 100).sound, true);
  assert.equal(E.korotkoff(base, ok, 70).sound, false);
  assert.equal(E.korotkoff(base, ok, 119).phase, 1);
  assert.equal(E.korotkoff(base, ok, 70).phase, 5);
});
test('korotkoff: auscultatory gap is silent', () => {
  const g = { ...base, sbp: 150, dbp: 85, gap: [100, 90] };
  assert.equal(E.korotkoff(g, ok, 95).sound, false);
  assert.equal(E.korotkoff(g, ok, 120).sound, true);
  assert.equal(E.korotkoff(g, ok, 88).sound, true);
});
test('oscAmplitude: peaks at MAP, zero far outside', () => {
  const m = E.mapOf(base, ok);
  assert.ok(Math.abs(m - 93.333) < 0.01);
  assert.equal(E.oscAmplitude(base, ok, m), 1);
  assert.ok(E.oscAmplitude(base, ok, m + 5) < 1 && E.oscAmplitude(base, ok, m - 5) < 1);
  assert.equal(E.oscAmplitude(base, ok, 150), 0);
  assert.equal(E.oscAmplitude(base, ok, 50), 0);
});
test('oscAmplitude: ratios at sbp/dbp match defaults', () => {
  assert.ok(Math.abs(E.oscAmplitude(base, ok, 120) - 0.55) < 0.01);
  assert.ok(Math.abs(E.oscAmplitude(base, ok, 80) - 0.75) < 0.01);
});
test('cuffFit: too small / ok / too large for arm', () => {
  assert.equal(E.cuffFit({ armCirc: 40 }, 'm'), 'small');
  assert.equal(E.cuffFit({ armCirc: 28 }, 'm'), 'ok');
  assert.equal(E.cuffFit({ armCirc: 20 }, 'l'), 'large');
});
test('estimateOscillometric recovers 120/80', () => {
  const b = E.simulateBeats(base, ok, 150);
  const r = E.estimateOscillometric(b);
  assert.ok(Math.abs(r.sbp - 120) <= 8, 'sbp ' + r.sbp);
  assert.ok(Math.abs(r.dbp - 80) <= 8, 'dbp ' + r.dbp);
  assert.ok(Math.abs(r.map - 93) <= 4, 'map ' + r.map);
  assert.equal(r.reliable, true);
});
test('fast deflation makes auscultatory sbp too low', () => {
  const fast = E.auscultatoryReading(E.simulateBeats(base, { ...ok, deflationRate: 8 }, 170));
  const slow = E.auscultatoryReading(E.simulateBeats(base, ok, 170));
  assert.ok(120 - fast.sbp >= 3, 'fast ' + fast.sbp);
  assert.ok(120 - slow.sbp <= 3, 'slow ' + slow.sbp);
});
test('review focus: starting below sbp is flagged, no NaN', () => {
  const c = { ...base, sbp: 150, dbp: 85 };
  const b = E.simulateBeats(c, ok, 100);
  assert.equal(E.auscultatoryReading(b).onsetValid, false);
  const r = E.estimateOscillometric(b);
  assert.equal(r.reliable, false);
  assert.ok(Number.isFinite(r.sbp) && Number.isFinite(r.dbp) && Number.isFinite(r.map));
});
test('review focus: no beats / hypotension / AF', () => {
  assert.equal(E.estimateOscillometric([]).reliable, false);
  assert.equal(E.auscultatoryReading([]), null);
  const lo = { ...base, sbp: 80, dbp: 50, hr: 96 };
  const r = E.estimateOscillometric(E.simulateBeats(lo, ok, 110));
  assert.ok(Math.abs(r.map - 60) <= 4, 'map ' + r.map);
  const af = { ...base, hr: 110, irregular: true };
  const a = E.estimateOscillometric(E.simulateBeats(af, ok, 150, lcg()));
  assert.equal(a.reliable, false);
  assert.ok(Number.isFinite(a.sbp) && Number.isFinite(a.dbp) && Number.isFinite(a.map));
});
test('simulateBeats stops when deflation rate is not positive', () => {
  assert.equal(E.simulateBeats(base, { ...ok, deflationRate: 0 }, 150).length, 0);
});
