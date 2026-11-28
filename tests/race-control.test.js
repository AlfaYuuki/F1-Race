import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaceControl, MODE, RULES, SEVERITY } from '../js/race-control.js';
import {
  createPenaltyLedger, createTrackLimitMonitor, createSpeedingMonitor, detectOvertakes,
  isJumpStart, classify, retirementHazard, pickRetirementReason, PENALTY
} from '../js/regulations.js';

const seeded = () => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const run = (rc, seconds, opts = {}) => { for (let t = 0; t < seconds; t += .1) rc.update(.1, opts); };

test('race control starts green with no cap', () => {
  const rc = createRaceControl(seeded());
  assert.equal(rc.mode, MODE.GREEN);
  assert.equal(rc.snapshot().neutralised, false);
});

test('severity picks the right neutralisation and never downgrades', () => {
  const rc = createRaceControl(seeded());
  rc.reportIncident({ severity: SEVERITY.MINOR, reason: 'SPIN' });
  assert.equal(rc.mode, MODE.YELLOW);
  rc.reportIncident({ severity: SEVERITY.SERIOUS, reason: 'CRASH' });
  assert.equal(rc.mode, MODE.SAFETY_CAR);
  rc.reportIncident({ severity: SEVERITY.MINOR, reason: 'SPIN' });
  assert.equal(rc.mode, MODE.SAFETY_CAR);
  assert.ok(rc.snapshot().cap > 0 && rc.snapshot().cap <= RULES[MODE.SAFETY_CAR].cap);
});

test('severe incident throws the red flag and the race restarts then goes green', () => {
  const rc = createRaceControl(seeded());
  rc.reportIncident({ severity: SEVERITY.SEVERE, reason: 'BARRIER' });
  assert.equal(rc.mode, MODE.RED);
  assert.equal(rc.snapshot().suspended, true);
  assert.equal(rc.snapshot().cap, 0);
  run(rc, 40, { leaderLap: 1 });
  assert.notEqual(rc.mode, MODE.RED);
  run(rc, 20, { leaderLap: 1 });
  assert.equal(rc.mode, MODE.GREEN);
  assert.ok(rc.drainEvents().some(e => e.type === 'restart'));
});

test('safety car comes in and releases the field when the leader starts a new lap', () => {
  const rc = createRaceControl(seeded());
  rc.reportIncident({ severity: SEVERITY.SERIOUS });
  run(rc, 90, { leaderLap: 3 });
  assert.notEqual(rc.mode, MODE.GREEN);
  rc.update(.1, { leaderLap: 4 });
  run(rc, 1, { leaderLap: 4 });
  assert.equal(rc.mode, MODE.GREEN);
});

test('yellow flags clear on their own', () => {
  const rc = createRaceControl(seeded());
  rc.reportIncident({ severity: SEVERITY.MINOR });
  run(rc, 40);
  assert.equal(rc.mode, MODE.GREEN);
});

test('penalty ledger sums time, queues and expires drive-throughs', () => {
  const l = createPenaltyLedger();
  l.addTime(5, 'TRACK LIMITS');
  l.addDriveThrough('SPEEDING', 2);
  assert.equal(l.pendingDriveThrough, 1);
  assert.deepEqual(l.onLapCompleted(4), []);
  const converted = l.onLapCompleted(6);
  assert.equal(converted.length, 1);
  assert.equal(l.seconds, 5 + PENALTY.UNSERVED);
  l.addDriveThrough('X', 1);
  assert.equal(l.serveDriveThrough(), true);
  assert.equal(l.pendingDriveThrough, 0);
});

test('track limits: two warnings then a 5s penalty, once per excursion', () => {
  const m = createTrackLimitMonitor();
  const out = [];
  for (let i = 0; i < 3; i++) {
    for (let t = 0; t < 1; t += .1) { const r = m.update(.1, 1.4); if (r) out.push(r); }
    for (let t = 0; t < 1; t += .1) m.update(.1, 0);
  }
  assert.deepEqual(out.map(r => r.type), ['warning', 'warning', 'penalty']);
  assert.equal(out[2].seconds, 5);
});

test('speeding under neutralisation is penalised only when sustained', () => {
  const m = createSpeedingMonitor();
  let hit = null;
  for (let t = 0; t < 1; t += .1) hit = m.update(.1, 200, 120) || hit;
  assert.equal(hit, null);
  for (let t = 0; t < 2; t += .1) hit = m.update(.1, 200, 120) || hit;
  assert.equal(hit.seconds, 5);
});

test('overtake detection and jump start', () => {
  let r = detectOvertakes({}, 90, [{ id: 'a', distance: 100 }]);
  r = detectOvertakes(r.signs, 110, [{ id: 'a', distance: 100 }]);
  assert.deepEqual(r.passed, ['a']);
  assert.equal(isJumpStart({ lightsLit: 4, throttle: true }), true);
  assert.equal(isJumpStart({ lightsLit: 5, lightsOut: true, throttle: true }), false);
});

test('classification applies time penalties and puts DNFs last', () => {
  const s = [
    { id: 'p', isPlayer: true, distance: 1000 },
    { id: 'a', distance: 990 },
    { id: 'd', distance: 900 },
    { id: 'b', distance: 700 },
    { id: 'c', distance: 500, retired: true }
  ];
  const out = classify(s, { penaltySeconds: 5, playerSpeedMs: 60 });
  assert.equal(out[0].id, 'a');
  assert.equal(out[1].id, 'd');
  assert.equal(out[3].id, 'p');
  assert.equal(out.at(-1).id, 'c');
});

test('retirement hazard rises with wear and abuse, reasons are valid', () => {
  assert.ok(retirementHazard({ tireWear: 95, mistakes: 4 }) > retirementHazard({ tireWear: 10 }));
  assert.ok(pickRetirementReason(() => .5).reason);
});
