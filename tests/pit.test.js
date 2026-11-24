import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhysics } from '../js/physics.js';

test('fuel decreases under power and zero fuel limits the car to a limp speed', () => {
  const physics = createPhysics();
  const input = new Set(['accelerate']);
  for (let i = 0; i < 600; i++) physics.update(1 / 60, input, 0);
  assert.ok(physics.fuel < 100);
  physics.fuel = 0;
  for (let i = 0; i < 2400; i++) physics.update(1 / 60, input, 0);
  assert.ok(physics.speed <= 95);
});

test('tyre compounds wear at different rates and wear reduces grip response', () => {
  const soft = createPhysics(), hard = createPhysics();
  soft.compound = 'SOFT'; hard.compound = 'HARD';
  const input = new Set(['accelerate']);
  for (let i = 0; i < 1200; i++) { soft.update(1 / 60, input, 0); hard.update(1 / 60, input, 0); }
  assert.ok(soft.tireWear > hard.tireWear);
  assert.ok(soft.tireWear > 0);
  const fresh = createPhysics(), worn = createPhysics();
  fresh.speed = worn.speed = 200; worn.tireWear = 100;
  fresh.update(1 / 60, new Set(['right']), 0);
  worn.update(1 / 60, new Set(['right']), 0);
  assert.ok(Math.abs(fresh.lateralVelocity) > Math.abs(worn.lateralVelocity));
});

test('impacts add damage and pit service replaces tyres, fuel and repairs', () => {
  const physics = createPhysics();
  physics.impact(1);
  assert.equal(physics.damage, 8);
  physics.fuel = 30; physics.tireWear = 72; physics.compound = 'SOFT';
  physics.applyPitService('HARD', 90, true);
  assert.equal(physics.compound, 'HARD');
  assert.equal(physics.tireWear, 0);
  assert.equal(physics.fuel, 90);
  assert.equal(physics.damage, 0);
  assert.equal(physics.pitStops, 1);
});

test('pit service can leave damage unrepaired and never lower existing fuel', () => {
  const physics = createPhysics();
  physics.damage = 25; physics.fuel = 70;
  physics.applyPitService('INTER', 20, false);
  assert.equal(physics.damage, 25);
  assert.equal(physics.fuel, 70);
  assert.equal(physics.compound, 'INTER');
});
