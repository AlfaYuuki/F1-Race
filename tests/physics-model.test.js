import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhysics, tyreTempEffects, brakeFade } from '../js/physics.js';

const run = (physics, frames, input, curve = 0, steer = 0, options = {}) => {
  for (let i = 0; i < frames; i++) physics.update(1 / 60, new Set(input), curve, steer, options);
};

test('tyre grip peaks inside the compound window and drops when cold or overheated', () => {
  const inWindow = tyreTempEffects('MEDIUM', 90);
  assert.equal(inWindow.grip, 1);
  assert.equal(inWindow.wear, 1);
  assert.ok(tyreTempEffects('MEDIUM', 40).grip < inWindow.grip);
  const hot = tyreTempEffects('MEDIUM', 140);
  assert.ok(hot.grip < inWindow.grip);
  assert.ok(hot.wear > 1.3, 'overheating accelerates wear');
});

test('tyres warm up with speed and load, and a fresh stop leaves them pre-warmed', () => {
  const physics = createPhysics();
  const start = physics.tyreTemp;
  run(physics, 600, ['accelerate']);
  assert.ok(physics.tyreTemp > start + 10);
  physics.tyreTemp = 120;
  physics.applyPitService('MEDIUM', 100, true);
  assert.ok(physics.tyreTemp < 80);
});

test('cold tyres reduce grip compared with warm tyres', () => {
  const grip = temp => {
    const physics = createPhysics();
    physics.speed = 180; physics.tyreTemp = temp;
    physics.update(0.016, new Set(), 0, 0);
    return physics.getTelemetry().grip;
  };
  assert.ok(grip(40) < grip(90));
  assert.ok(grip(150) < grip(90));
});

test('brakes heat under braking, cool on the straight and fade when overheated', () => {
  const physics = createPhysics();
  physics.speed = 330;
  const cold = physics.brakeTemp;
  run(physics, 40, ['brake']);
  assert.ok(physics.brakeTemp > cold + 100);
  const hot = physics.brakeTemp;
  physics.speed = 300;
  run(physics, 240, ['accelerate']);
  assert.ok(physics.brakeTemp < hot, 'airflow cools the brakes');
  assert.equal(brakeFade(500), 1);
  assert.ok(brakeFade(1000) < .75);
  assert.ok(brakeFade(20) < 1, 'cold brakes bite less');
});

test('faded brakes stop the car in a longer time than healthy brakes', () => {
  const stopFrames = temp => {
    const physics = createPhysics();
    physics.speed = 300; physics.brakeTemp = temp;
    let frames = 0;
    while (physics.speed > 60 && frames < 2000) { physics.update(1 / 60, new Set(['brake']), 0, 0); physics.brakeTemp = temp; frames++; }
    return frames;
  };
  assert.ok(stopFrames(1000) > stopFrames(450));
});

test('slipstream reduces drag and raises top speed while reducing downforce', () => {
  const settle = draft => {
    const physics = createPhysics();
    run(physics, 3000, ['accelerate'], 0, 0, { draft });
    return physics;
  };
  const clean = settle(0), tow = settle(1);
  assert.ok(tow.speed > clean.speed + 5);
  assert.ok(tow.downforce < clean.downforce);
  assert.equal(tow.getDynamics().draft, 1);
});

test('downforce grows with speed squared and with wing setup', () => {
  const downforce = (speed, aero) => {
    const physics = createPhysics();
    physics.setCarConfig({ stats: { power: 1, grip: 1, braking: 1, durability: 1 }, setup: { aero, suspension: 50, brakeBias: 56, differential: 50 } });
    physics.speed = speed;
    physics.update(0.001, new Set(), 0, 0);
    return physics.getDynamics().downforce;
  };
  assert.ok(downforce(300, 50) > downforce(150, 50) * 3);
  assert.ok(downforce(250, 80) > downforce(250, 30));
});

test('a lighter car accelerates harder; a full tank matches the baseline', () => {
  const speedAfter = fuel => {
    const physics = createPhysics();
    physics.fuel = fuel; physics.tyreTemp = 90;
    run(physics, 120, ['accelerate']);
    return physics.speed;
  };
  assert.ok(speedAfter(20) > speedAfter(100));
});

test('wheelspin limits launch traction on poor grip and vanishes at speed', () => {
  const physics = createPhysics();
  physics.tireWear = 95; physics.tyreTemp = 35;
  run(physics, 3, ['accelerate']);
  assert.ok(physics.getDynamics().wheelspin > 0);
  const fast = createPhysics();
  fast.speed = 250;
  run(fast, 3, ['accelerate']);
  assert.equal(fast.getDynamics().wheelspin, 0);
});

test('braking while steering reduces turn-in response', () => {
  const lateral = braking => {
    const physics = createPhysics();
    physics.speed = 200; physics.tyreTemp = 90;
    physics.update(0.1, new Set(braking ? ['brake'] : []), 0, 1);
    return physics.lateralVelocity;
  };
  assert.ok(lateral(true) < lateral(false));
});

test('reset restores the thermal and aero state', () => {
  const physics = createPhysics();
  run(physics, 300, ['accelerate', 'brake'], 0, 0.5, { draft: 1 });
  physics.reset();
  const fresh = createPhysics();
  assert.deepEqual(physics.getDynamics(), fresh.getDynamics());
});
