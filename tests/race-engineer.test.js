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

test('engineer stays quiet when the car and strategy are healthy', () => {
  const engineer = createRaceEngineer();
  assert.equal(engineer.update(base), null);
  assert.equal(engineer.getStatus().title, 'ENGINEER ONLINE');
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
