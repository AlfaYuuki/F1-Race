import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhysics } from '../js/physics.js';
import { createOpponents } from '../js/opponents.js';
import { curveAt, elevationAt, LAP_DISTANCE, TOTAL_DISTANCE, TOTAL_LAPS, normalizeRaceLaps } from '../js/track.js';

test('track samples stay finite and wrap around one lap', () => {
  for (let i = -20; i <= 120; i++) {
    const p = i / 100;
    assert.ok(Number.isFinite(curveAt(p)));
    assert.ok(Number.isFinite(elevationAt(p)));
  }
  assert.equal(LAP_DISTANCE, 4563);
  assert.equal(TOTAL_DISTANCE, LAP_DISTANCE * TOTAL_LAPS);
  assert.equal(curveAt(0), curveAt(1));
});

test('physics accelerates, brakes, remains bounded and resets', () => {
  const physics = createPhysics();
  const throttle = new Set(['accelerate']);
  for (let i = 0; i < 240; i++) physics.update(1 / 60, throttle, 0);
  assert.ok(physics.speed > 0 && physics.speed <= 330);
  const beforeBrake = physics.speed;
  for (let i = 0; i < 30; i++) physics.update(1 / 60, new Set(['brake']), 0);
  assert.ok(physics.speed < beforeBrake);
  physics.reset();
  assert.equal(physics.speed, 0);
  assert.equal(physics.playerX, 0);
  assert.equal(physics.offRoad, false);
});

test('AI roster forms a selectable twenty-car grid and launches deterministically', () => {
  const ai = createOpponents(LAP_DISTANCE);
  assert.equal(ai.drivers.length, 19);
  for (const playerGridPosition of [1, 10, 20]) {
    const grid = ai.reset(playerGridPosition).grid;
    assert.equal(grid.length, 20);
    assert.equal(grid.filter(driver => driver.isPlayer).length, 1);
    assert.equal(grid.findIndex(driver => driver.isPlayer) + 1, playerGridPosition);
    assert.equal(new Set(ai.drivers.map(driver => driver.gridPosition)).size, 19);
    assert.ok(ai.drivers.every(driver => driver.distance !== 0));
    for (const driver of ai.drivers) assert.equal(Math.abs(driver.distance), Math.abs(driver.gridPosition - playerGridPosition) * 8);
    const positions = grid.map(driver => driver.distance);
    assert.equal(new Set(positions).size, 20);
    ai.update(1 / 60, 0, curveAt);
  }
  ai.reset(10);
  assert.equal(ai.getStandings(0).findIndex(driver => driver.isPlayer) + 1, 10);
});


test('qualifying order is carried into the Grand Prix grid without reshuffling', () => {
  const ai = createOpponents(LAP_DISTANCE);
  const order = ['sato','player','tanaka','mori','kobayashi',
    'nakamura','rossi','muller','silva','petrov','martin','kim',
    'dubois','brown','garcia','smith','alvarez','andersson','fernandez','williams'];
  const grid = ai.reset(2, order).grid;
  assert.deepEqual(grid.map(driver => driver.id), order);
  assert.equal(grid.findIndex(driver => driver.id === 'player') + 1, 2);
});


test('Quick Race lap counts are constrained to one through ten laps', () => {
  assert.equal(normalizeRaceLaps(1), 1);
  assert.equal(normalizeRaceLaps(5), 5);
  assert.equal(normalizeRaceLaps(10), 10);
  assert.equal(normalizeRaceLaps(11), 10);
  assert.equal(normalizeRaceLaps(-2), 1);
  assert.equal(normalizeRaceLaps(0), TOTAL_LAPS);
  assert.equal(normalizeRaceLaps('invalid'), TOTAL_LAPS);
  assert.equal(normalizeRaceLaps(6, 5), 5);
});

test('AI drivers use the pit lane, stop for service and rejoin the racing line', () => {
  const ai = createOpponents(LAP_DISTANCE);
  ai.reset(10);
  const driver = ai.drivers[0];
  driver.launchTimer = 0;
  driver.distance = LAP_DISTANCE * .85;
  driver.speed = 240;
  driver.fuel = 0;

  ai.update(.01, 0, curveAt, { rain: 0 });
  assert.equal(driver.pitPhase, 'entry');
  assert.equal(driver.targetLane, 1.12);

  for (let i = 0; i < 300 && driver.pitPhase !== 'service'; i++) ai.update(.01, 0, curveAt, { rain: 0 });
  assert.equal(driver.pitPhase, 'service');
  assert.equal(driver.speed, 0);

  for (let i = 0; i < 500 && driver.pitPhase !== 'exit'; i++) ai.update(.01, 0, curveAt, { rain: 0 });
  assert.equal(driver.pitPhase, 'exit');
  assert.equal(driver.pitStops, 1);
  assert.equal(driver.fuel, 100);
  assert.equal(driver.tireWear, 0);

  for (let i = 0; i < 300 && driver.pitPhase !== null; i++) ai.update(.01, 0, curveAt, { rain: 0 });
  assert.equal(driver.pitPhase, null);
  assert.equal(driver.pitRequested, false);
  assert.ok(driver.distance > LAP_DISTANCE * .85);
});

test('physics recognises the marked pit lane as a valid surface', () => {
  const physics = createPhysics();
  physics.playerX = 1.1;
  physics.update(1 / 60, new Set(), 0, 0, { pitLane: true, pitLimiter: true });
  assert.equal(physics.offRoad, false);
  assert.ok(physics.speed <= 80);
});
