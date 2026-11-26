import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaceEngineer } from '../js/race-engineer.js';

const base = {
  state: 'running', position: 4, lap: 8, totalLaps: 50,
  fuel: 70, tireWear: 25, compound: 'MEDIUM', damage: 0,
  weather: { rain: 0 }, fuelFlow: 5.5,
  lastLapMs: 85000, bestLapMs: 84000,
  standings: [], now: 1000
};

test('engineer provides a live race strategy status when conditions are healthy', () => {
  const engineer = createRaceEngineer();
  const status = engineer.update(base);
  assert.equal(status.isAlert, false);
  assert.match(status.title, /RACE STRATEGY/);
  assert.match(status.message, /P4 · Lap 8/);
});

test('engineer recommends a pit stop when fuel range cannot cover the race', () => {
  const engineer = createRaceEngineer();
  const alert = engineer.update({ ...base, fuel: 10, fuelFlow: 7, lastLapMs: 80000 });
  assert.equal(alert.level, 'critical');
  assert.match(alert.title, /FUEL/);
  assert.match(alert.action, /PIT/);
});

test('engineer warns about worn tyres and severe damage with priority for damage', () => {
  const engineer = createRaceEngineer();
  const alert = engineer.update({ ...base, tireWear: 90, damage: 60 });
  assert.equal(alert.key, 'damage-critical');
  assert.equal(alert.level, 'critical');
});

test('engineer recommends wet-weather tyre strategy', () => {
  const engineer = createRaceEngineer();
  const alert = engineer.update({ ...base, weather: { rain: .8 }, compound: 'MEDIUM' });
  assert.equal(alert.key, 'wet-tyres');
  assert.match(alert.action, /INTERMEDIATES/);
});

test('engineer spots a rival within passing range', () => {
  const engineer = createRaceEngineer();
  const alert = engineer.update({
    ...base, position: 2,
    standings: [
      { id: 'sato', name: 'K. SATO', distance: 1000 },
      { id: 'player', name: 'YOU', isPlayer: true, distance: 980 },
      { id: 'tanaka', name: 'M. TANAKA', distance: 900 }
    ]
  });
  assert.equal(alert.key, 'car-ahead');
  assert.match(alert.message, /20 metres ahead/);
});

test('engineer celebrates a gained position', () => {
  const engineer = createRaceEngineer();
  engineer.update({ ...base, position: 3 });
  const alert = engineer.update({ ...base, position: 2, now: 2000 });
  assert.equal(alert.key, 'overtake');
  assert.equal(alert.level, 'success');
});

test('engineer applies per-alert cooldowns to avoid radio spam', () => {
  const engineer = createRaceEngineer({ cooldownMs: 10000 });
  const first = engineer.update({ ...base, tireWear: 75, now: 1000 });
  const second = engineer.update({ ...base, tireWear: 76, now: 5000 });
  const third = engineer.update({ ...base, tireWear: 77, now: 12000 });
  assert.equal(first.key, 'tyres-worn');
  assert.equal(second, null);
  assert.equal(third.key, 'tyres-worn');
});

test('engineer ignores telemetry outside an active race and resets cleanly', () => {
  const engineer = createRaceEngineer();
  assert.equal(engineer.update({ ...base, state: 'paused', damage: 80 }), null);
  engineer.update({ ...base, tireWear: 75 });
  assert.equal(engineer.reset().title, 'ENGINEER ONLINE');
});


test('engineer compares completed sector times against the personal best', () => {
  const engineer = createRaceEngineer({ cooldownMs: 5000 });
  assert.equal(engineer.recordSector({ sector: 'S1', time: 28000, now: 1000 }), null);
  const alert = engineer.recordSector({ sector: 'S1', time: 30000, now: 7000 });
  assert.equal(alert.key, 'sector-loss-S1');
  assert.match(alert.message, /7.1% slower/);
  assert.equal(engineer.recordSector({ sector: 'S1', time: 27000, now: 13000 }), null);
});


test('critical alerts pre-empt the normal radio cooldown', () => {
  const engineer = createRaceEngineer({ cooldownMs: 10000 });
  const first = engineer.update({ ...base, tireWear: 78, now: 1000 });
  assert.equal(first.key, 'tyres-worn');
  const critical = engineer.update({ ...base, damage: 65, now: 2000 });
  assert.equal(critical.key, 'damage-critical');
  assert.equal(critical.level, 'critical');
});

test('engineer warns about a close rival behind', () => {
  const engineer = createRaceEngineer();
  const alert = engineer.update({
    ...base, position: 2,
    standings: [
      { id: 'player', name: 'YOU', isPlayer: true, distance: 1000 },
      { id: 'sato', name: 'K. SATO', distance: 982 }
    ]
  });
  assert.equal(alert.key, 'car-behind');
  assert.match(alert.message, /18 metres behind/);
});

test('engineer gives a yellow-flag instruction immediately', () => {
  const engineer = createRaceEngineer({ cooldownMs: 18000 });
  engineer.update(base);
  const alert = engineer.update({ ...base, weather: { rain: 0, yellowFlag: true }, now: 1100 });
  assert.equal(alert.key, 'yellow-flag');
  assert.match(alert.action, /NO OVERTAKING/);
});

test('engineer uses live grip telemetry to recommend protecting the car', () => {
  const engineer = createRaceEngineer();
  const alert = engineer.update({ ...base, telemetry: { grip: 52 }, now: 1000 });
  assert.equal(alert.key, 'grip-low');
  assert.match(alert.message, /52%/);
});

test('engineer status returns to a live strategy summary after an alert expires', () => {
  const engineer = createRaceEngineer({ alertDurationMs: 5000 });
  engineer.update({ ...base, damage: 60, now: 1000 });
  const status = engineer.update({ ...base, damage: 0, now: 8000 });
  assert.equal(status.isAlert, false);
  assert.match(status.title, /RACE STRATEGY/);
});


test('engineer preserves manual pit selections while the pit dialog is visible', () => {
  const previousDocument = globalThis.document;
  const fields = {
    '#pit-dialog': { hidden: false },
    '#pit-compound': { value: 'HARD' },
    '#pit-fuel': { value: '65' },
    '#fuel-choice': { textContent: '65%' }
  };
  globalThis.document = { querySelector: selector => fields[selector] ?? null };
  try {
    const engineer = createRaceEngineer();
    engineer.update({ ...base, fuel: 10, now: 2000 });
    assert.equal(fields['#pit-compound'].value, 'HARD');
    assert.equal(fields['#pit-fuel'].value, '65');
    assert.equal(fields['#fuel-choice'].textContent, '65%');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
