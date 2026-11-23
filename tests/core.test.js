import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhysics } from '../js/physics.js';
import { createOpponents } from '../js/opponents.js';
import { curveAt, elevationAt, LAP_DISTANCE, TOTAL_DISTANCE } from '../js/track.js';

test('track samples stay finite and wrap around one lap', () => {
  for (let i = -20; i <= 120; i++) {
    const p = i / 100;
    assert.ok(Number.isFinite(curveAt(p)));
    assert.ok(Number.isFinite(elevationAt(p)));
  }
  assert.equal(LAP_DISTANCE, 4563);
  assert.equal(TOTAL_DISTANCE, LAP_DISTANCE * 3);
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

test('AI roster produces six ordered competitors and resets deterministically', () => {
  const ai = createOpponents(LAP_DISTANCE);
  assert.equal(ai.drivers.length, 5);
  ai.update(1 / 60, 0, curveAt);
  const standings = ai.getStandings(0);
  assert.equal(standings.length, 6);
  for (let i = 1; i < standings.length; i++) {
    assert.ok(standings[i - 1].distance >= standings[i].distance);
  }
  ai.reset();
  assert.equal(ai.drivers[0].distance, 18);
});
