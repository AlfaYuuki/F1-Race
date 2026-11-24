import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhysics } from '../js/physics.js';
import { curveAt, LAP_DISTANCE, TOTAL_LAPS } from '../js/track.js';

test('Fuji bot calibration supports four fuel-and-tyre stints across the 50-lap race', () => {
  const physics = createPhysics();
  const input = new Set(['accelerate']);
  const stintDistance = LAP_DISTANCE * (TOTAL_LAPS / 4);
  const dt = 1 / 60;

  for (let stint = 0; stint < 4; stint++) {
    const targetDistance = physics.distance + stintDistance;
    let frames = 0;
    while (physics.distance < targetDistance && frames < 100000) {
      const progress = (physics.distance % LAP_DISTANCE) / LAP_DISTANCE;
      const curve = curveAt(progress);
      // Follow Fuji's sampled curvature while correcting lateral drift.
      const steer = curve * 0.1 - physics.playerX * 0.4 - physics.lateralVelocity * 0.2;
      physics.update(dt, input, curve, steer);
      frames++;
    }
    assert.ok(frames < 100000, `stint ${stint + 1} should complete`);
    assert.ok(physics.fuel > 10, `stint ${stint + 1} should retain a fuel reserve`);
    assert.ok(physics.tireWear < 100, `stint ${stint + 1} should finish before tyre wear is exhausted`);
    assert.equal(physics.offRoad, false, `bot should remain on track in stint ${stint + 1}`);
    if (stint < 3) physics.applyPitService('MEDIUM', 100, true);
  }

  assert.equal(physics.pitStops, 3, '50 laps should be achievable with the three-stop limit');
  assert.ok(physics.distance >= LAP_DISTANCE * TOTAL_LAPS);
});
