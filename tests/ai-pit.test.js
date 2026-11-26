import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpponents } from '../js/opponents.js';

test('AI drivers enter the pit lane, stop for service, and rejoin the race', () => {
  const field = createOpponents();
  field.reset(10);
  const driver = field.drivers[0];
  driver.launchTimer = 0;
  driver.speed = 180;
  driver.fuel = 0;

  field.update(1 / 60, 0, () => 0, { rain: 0 });
  assert.equal(driver.pitPhase, 'entry');

  for (let i = 0; i < 150; i++) field.update(1 / 60, 0, () => 0, { rain: 0 });
  assert.equal(driver.pitPhase, 'service');
  assert.equal(driver.speed, 0);

  for (let i = 0; i < 260; i++) field.update(1 / 60, 0, () => 0, { rain: 0 });
  assert.equal(driver.pitPhase, 'exit');
  assert.equal(driver.pitStops, 1);
  assert.equal(driver.fuel, 100);
  assert.equal(driver.tireWear, 0);

  for (let i = 0; i < 140; i++) field.update(1 / 60, 0, () => 0, { rain: 0 });
  assert.equal(driver.pitPhase, null);
  assert.ok(driver.distance > 0);
});
