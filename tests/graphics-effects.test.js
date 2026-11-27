import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraProfile, suspensionOffset, createGraphicsEffects } from '../js/graphics-effects.js';

test('camera profile reacts smoothly to speed, drift and impact', () => {
  const cruise = cameraProfile({ speed: 250 });
  const drift = cameraProfile({ speed: 250, driftAngle: .5, lateralVelocity: 1.2, impact: .8 });
  assert.ok(drift.fov > cruise.fov);
  assert.ok(Math.abs(drift.roll) > 0);
  assert.ok(drift.lookAhead > cruise.lookAhead);
  assert.ok(Number.isFinite(drift.height));
});

test('suspension travel remains bounded and animates each wheel independently', () => {
  const a = suspensionOffset(1, 0, 260, false);
  const b = suspensionOffset(1.2, 0, 260, false);
  const c = suspensionOffset(1, 1, 260, false);
  assert.ok(Math.abs(a) <= .095);
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.ok(Math.abs(suspensionOffset(1, 0, 260, true)) <= .095);
});

test('weather, tyre smoke and sparks emit bounded short-lived particles', () => {
  const effects = createGraphicsEffects(() => .5);
  const car = { x: 2, y: .2, z: 9 };
  effects.update(.05, { rain: .9, speed: 220, driftAngle: .35, offRoad: true, impact: .8, car });
  const particles = effects.update(.05, { rain: .9, speed: 220, driftAngle: .35, offRoad: true, impact: .8, car });
  assert.ok(particles.some(p => p.type === 'rain'));
  assert.ok(particles.some(p => p.type === 'smoke'));
  assert.ok(particles.some(p => p.type === 'spark'));
  assert.ok(effects.count <= 150);
  for (let i = 0; i < 20; i++) effects.update(.05, { car });
  assert.equal(effects.count, 0);
});
