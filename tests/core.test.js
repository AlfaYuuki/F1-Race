import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhysics } from '../js/physics.js';
import { createOpponents } from '../js/opponents.js';
import { curveAt, elevationAt, LAP_DISTANCE, TOTAL_DISTANCE, TOTAL_LAPS } from '../js/track.js';

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
    const positions = grid.map(driver => driver.distance);
    assert.equal(new Set(positions).size, 20);
    ai.update(1 / 60, 0, curveAt);
  }
  ai.reset(10);
  assert.equal(ai.getStandings(0).findIndex(driver => driver.isPlayer) + 1, 10);
});
