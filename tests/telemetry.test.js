import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhysics } from '../js/physics.js';

test('telemetry reports accelerator input and positive fuel flow', () => {
  const physics = createPhysics();
  physics.speed = 100;
  physics.update(0.1, new Set(['accelerate']), 0, 0);
  const telemetry = physics.getTelemetry();
  assert.equal(telemetry.throttle, 100);
  assert.equal(telemetry.brake, 0);
  assert.ok(telemetry.fuelFlow > 0);
  assert.ok(telemetry.longitudinalG > 0);
});

test('telemetry reports braking and negative longitudinal acceleration', () => {
  const physics = createPhysics();
  physics.speed = 200;
  physics.update(0.1, new Set(['brake']), 0, 0);
  const telemetry = physics.getTelemetry();
  assert.equal(telemetry.brake, 100);
  assert.equal(telemetry.throttle, 0);
  assert.ok(telemetry.longitudinalG < 0);
});

test('telemetry reports signed steering and estimated lateral G', () => {
  const physics = createPhysics();
  physics.speed = 220;
  physics.update(0.1, new Set(), 0, 0.75);
  const telemetry = physics.getTelemetry();
  assert.equal(telemetry.steering, 75);
  assert.ok(telemetry.lateralG > 0);
  physics.update(0.1, new Set(), 0, -0.75);
  assert.equal(physics.getTelemetry().steering, -75);
});

test('grip telemetry responds to tyre wear and damage', () => {
  const physics = createPhysics();
  physics.speed = 180;
  physics.update(0.1, new Set(), 0, 0);
  const freshGrip = physics.getTelemetry().grip;
  physics.tireWear = 80;
  physics.damage = 40;
  physics.update(0.1, new Set(), 0, 0);
  assert.ok(physics.getTelemetry().grip < freshGrip);
});

test('reset clears live driver inputs and restores baseline grip', () => {
  const physics = createPhysics();
  physics.speed = 180;
  physics.update(0.1, new Set(['accelerate']), 0, 1);
  physics.reset();
  const telemetry = physics.getTelemetry();
  assert.deepEqual(telemetry, {
    throttle: 0, brake: 0, steering: 0,
    lateralG: 0, longitudinalG: 0, grip: 100, fuelFlow: 0
  });
});
