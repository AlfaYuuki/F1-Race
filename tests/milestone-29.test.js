import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpponents } from '../js/opponents.js';
import { createRaceControl, MODE, SEVERITY, RULES } from '../js/race-control.js';
import { createRaceLog, classify, createPenaltyLedger } from '../js/regulations.js';
import { LAP_DISTANCE, curveAt } from '../js/track.js';

const seeded = (seed = 11) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const field = () => { const o = createOpponents(LAP_DISTANCE); o.reset(10); return o; };
const lead = o => Math.max(...o.drivers.filter(d => !d.retired).map(d => d.distance));
function race(o, rc, seconds, extra = {}) {
  for (let t = 0; t < seconds; t += .05) {
    rc.update(.05, { leaderLap: Math.floor(lead(o) / LAP_DISTANCE) + 1, rain: 0 });
    o.update(.05, 0, curveAt, { totalLaps: 10, raceControl: rc.snapshot(), raceElapsed: 100 + t, retirements: false, ...extra });
    rc.drainEvents();
  }
}
function warmUp(o, rc) { race(o, rc, 40); }

test('every RULES state is reachable and restrictions are consistent', () => {
  for (const [mode, rule] of Object.entries(RULES)) {
    if (rule.cap === 0) assert.equal(rule.pitsOpen, false, mode);
    if (rule.neutralised) assert.equal(rule.overtaking, false, mode);
  }
  const reach = (sev) => { const rc = createRaceControl(seeded()); rc.reportIncident({ severity: sev }); return rc.mode; };
  assert.equal(reach(SEVERITY.MINOR), MODE.YELLOW);
  assert.equal(reach(SEVERITY.MAJOR), MODE.DOUBLE_YELLOW);
  assert.equal(reach(SEVERITY.SERIOUS), MODE.SAFETY_CAR);
  assert.equal(reach(SEVERITY.SEVERE), MODE.RED);
});

test('double yellow with a blocking incident escalates to VSC, then ends back to green', () => {
  let escalated = false;
  for (let seed = 1; seed < 40 && !escalated; seed++) {
    const rc = createRaceControl(seeded(seed));
    rc.reportIncident({ severity: SEVERITY.MAJOR, reason: 'ENGINE' });
    const seen = new Set();
    for (let t = 0; t < 120; t += .1) { rc.update(.1, { leaderLap: 1 }); seen.add(rc.mode); }
    if (seen.has(MODE.VSC)) { escalated = true; assert.ok(seen.has(MODE.VSC_ENDING)); assert.equal(rc.mode, MODE.GREEN); }
  }
  assert.ok(escalated, 'a double yellow should be able to escalate to a VSC');
});

test('red flag never auto-greens before its stop period and restarts through RESTART', () => {
  const rc = createRaceControl(seeded());
  rc.reportIncident({ severity: SEVERITY.SEVERE });
  const modes = [];
  for (let t = 0; t < 12; t += .1) { rc.update(.1, { leaderLap: 2 }); modes.push(rc.mode); }
  assert.ok(modes.every(m => m === MODE.RED), 'still red after 12 s');
  for (let t = 0; t < 40; t += .1) { rc.update(.1, { leaderLap: 2 }); modes.push(rc.mode); }
  assert.ok(modes.includes(MODE.RESTART));
  assert.equal(rc.mode, MODE.GREEN);
  assert.ok(rc.drainEvents().some(e => e.type === 'restart' && e.kind === 'red'));
});

test('formation lap: cars roll to their grid slots in the correct order and settle', () => {
  const o = field();
  const grid = o.getStandings(0).map(d => d.id);
  o.startFormation(1400);
  let settled = false, topSpeed = 0;
  for (let t = 0; t < 140 && !settled; t += .05) {
    settled = o.formationStep(.05, -1400 + Math.min(1400, t * 40), { speed: 150 }).settled;
    topSpeed = Math.max(topSpeed, ...o.drivers.map(d => d.speed));
  }
  assert.ok(topSpeed <= 150.5, 'formation speed limit respected');
  o.finishFormation();
  const after = o.getStandings(0).map(d => d.id);
  assert.deepEqual(after.filter(id => id !== 'player'), grid.filter(id => id !== 'player'));
  assert.ok(o.drivers.every(d => d.speed === 0));
});

test('AI obey VSC and Safety Car speed limits and never overtake under them', () => {
  for (const [mode, cap] of [[MODE.VSC, 140], [MODE.SAFETY_CAR, 125]]) {
    const o = field(), rc = createRaceControl(seeded());
    warmUp(o, rc);
    const order = () => o.getStandings(0).map(d => d.id).join(',');
    rc.reportIncident({ severity: mode === MODE.VSC ? SEVERITY.MAJOR : SEVERITY.SERIOUS });
    if (mode === MODE.VSC) { rc.update(0, {}); /* force VSC */ }
    for (let t = 0; t < 8; t += .05) { rc.update(.05, { leaderLap: 1 }); o.update(.05, 0, curveAt, { totalLaps: 10, raceControl: rc.snapshot(), raceElapsed: 100, retirements: false }); }
    const before = order();
    let over = 0;
    for (let t = 0; t < 30; t += .05) {
      rc.update(.05, { leaderLap: 1 });
      const snap = rc.snapshot();
      o.update(.05, 0, curveAt, { totalLaps: 10, raceControl: snap, raceElapsed: 100, retirements: false });
      if (t > 6 && snap.cap) over = Math.max(over, ...o.drivers.map(d => d.speed - snap.cap));
    }
    assert.ok(over <= 6, `${mode}: AI exceeded cap by ${over.toFixed(1)}`);
    if (mode === MODE.SAFETY_CAR) assert.equal(order(), before, 'no order changes under the Safety Car');
  }
});

test('red flag stops every AI car and a restart re-forms them in running order', () => {
  const o = field(), rc = createRaceControl(seeded());
  warmUp(o, rc);
  const runningOrder = o.getStandings(0).map(d => d.id);
  rc.reportIncident({ severity: SEVERITY.SEVERE });
  race(o, rc, 8);
  assert.ok(o.drivers.every(d => d.speed < 1), 'all cars stopped');
  const g = o.formUpGrid(lead(o) - 50);
  assert.ok(g.gridSlot >= 1 && g.gridSlot <= 20);
  const spaced = o.drivers.filter(d => !d.retired).map(d => d.distance).sort((a, b) => b - a);
  for (let i = 1; i < spaced.length; i++) assert.ok(spaced[i - 1] - spaced[i] >= 7.9);
  assert.equal(o.getStandings(0).filter(d => !d.isPlayer).map(d => d.id).join(), runningOrder.filter(id => id !== 'player').join());
});

test('AI mechanical DNF: retires, stops, is parked, reports an incident and is classified last', () => {
  const o = field(), rc = createRaceControl(seeded(5));
  let reports = [];
  for (let t = 0; t < 200 && !reports.length; t += .05) {
    rc.update(.05, { leaderLap: 1 });
    o.update(.05, 0, curveAt, { totalLaps: 10, raceControl: rc.snapshot(), raceElapsed: 100 + t, retirements: true, retirementScale: 400 });
    reports.push(...o.drainRetirements());
  }
  assert.ok(reports.length, 'a car retired');
  const r = reports[0]; const car = o.drivers.find(d => d.id === r.id);
  assert.ok(car.retired && car.retiredReason);
  race(o, rc, 40, { retirements: false });
  assert.equal(car.speed, 0);
  assert.equal(car.parked, true);
  assert.equal(car.collisionEnabled, false);
  const out = classify(o.getStandings(500), {});
  assert.equal(out.filter(d => d.retired).every(d => out.indexOf(d) >= out.filter(x => !x.retired).length), true);
});

test('AI drive-through is served at the pit-lane limit without stopping, or becomes +20 s', () => {
  const o = field();
  const car = o.drivers[3];
  assert.equal(o.awardDriveThrough(car.id, 'JUMP START', 1, 3), true);
  assert.equal(o.awardDriveThrough(car.id, 'again', 1, 3), false, 'no duplicate penalty');
  let slowest = 999, served = false;
  const rc = { neutralised: false, pitsOpen: true, cap: null, overtaking: true };
  for (let t = 0; t < 400 && !served; t += .05) {
    o.update(.05, 0, curveAt, { totalLaps: 10, raceControl: rc, raceElapsed: 10, retirements: false });
    if (car.driveThrough?.state === 'serving') slowest = Math.min(slowest, car.speed);
    served = o.drainPenalties().some(p => p.type === 'served' && p.id === car.id);
  }
  assert.ok(served, 'served');
  assert.ok(slowest > 20, 'drive-through must not be a stop');
  assert.equal(car.pitStops, 0, 'no normal pit service triggered');
  // Unserved -> converted to time.
  o.reset(10);
  const c2 = o.drivers[4]; o.awardDriveThrough(c2.id, 'X', 0, 0); c2.distance = LAP_DISTANCE * 1.2; c2.driveThrough.state = 'pending'; c2.launchTimer = 0;
  o.update(.05, 0, curveAt, { totalLaps: 10, raceControl: { neutralised: true, pitsOpen: false, cap: 125, overtaking: false }, retirements: false });
  assert.equal(c2.penaltySeconds, 20);
});

test('classification: player and AI time penalties and DNFs change the final order', () => {
  const standings = [
    { id: 'player', isPlayer: true, distance: 5000 },
    { id: 'a', distance: 4990 },
    { id: 'b', distance: 4980, timePenalty: 10 },
    { id: 'c', distance: 4500 },
    { id: 'z', distance: 1000, retired: true },
    { id: 'y', distance: 3000, retired: true }
  ];
  const out = classify(standings, { penaltySeconds: 5, playerSpeedMs: 60 });
  assert.deepEqual(out.map(d => d.id), ['a', 'player', 'c', 'b', 'y', 'z']);
  assert.equal(out[0].id, 'a');
  assert.equal(out.at(-2).id, 'y');
  assert.equal(out.at(-1).id, 'z');
  assert.ok(out.findIndex(d => d.id === 'b') > out.findIndex(d => d.id === 'a'));
  const player = out.find(d => d.isPlayer);
  assert.equal(player.timePenalty, 5);
  assert.ok(out.indexOf(player) >= 1);
});

test('player DNF is classified behind every finisher regardless of distance', () => {
  const out = classify([
    { id: 'player', isPlayer: true, distance: 9000, retired: true },
    { id: 'a', distance: 100 }, { id: 'b', distance: 50 }
  ], {});
  assert.equal(out.at(-1).id, 'player');
});

test('penalty ledger: deadline lap conversion and serving', () => {
  const l = createPenaltyLedger();
  l.addDriveThrough('TEST', 2, 3);
  assert.deepEqual(l.onLapCompleted(5), []);
  assert.equal(l.onLapCompleted(6).length, 1);
  assert.equal(l.seconds, 20);
  l.addDriveThrough('TEST2', 1);
  assert.equal(l.serveDriveThrough(), true);
  assert.equal(l.serveDriveThrough(), false);
});

test('race log records and filters history', () => {
  const log = createRaceLog(3);
  log.add('flag', 'YELLOW'); log.add('penalty', '+5S'); log.add('flag', 'GREEN'); log.add('decision', 'FINAL');
  assert.equal(log.length, 3);
  assert.deepEqual(log.entries('flag').map(e => e.text), ['GREEN']);
});
