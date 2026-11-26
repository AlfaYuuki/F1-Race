import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhysics, driftTarget, DRIFT } from '../js/physics.js';
import { buildRoadPath, pointAt, lateral } from '../js/road-path.js';
import { curveAt } from '../js/track.js';

const drive = (physics, frames, steerFn, input = ['accelerate']) => {
  for (let i = 0; i < frames; i++) physics.update(1 / 60, new Set(input), 0, steerFn(i));
};

test('road is straight where the track is straight and bends where the track bends', () => {
  const straight = buildRoadPath({ position: 0.97, curveFn: () => 0 });
  assert.ok(straight.points.every(p => Math.abs(p.x) < 1e-6 && Math.abs(p.h) < 1e-9));
  const right = buildRoadPath({ position: 0.1, curveFn: () => 0.7 });
  assert.ok(right.points.at(-1).x > 40, 'right-hand corner sweeps to +X');
  const left = buildRoadPath({ position: 0.1, curveFn: () => -0.7 });
  assert.ok(left.points.at(-1).x < -40, 'left-hand corner sweeps to -X');
});

test('the real Fuji layout produces visible corners', () => {
  const lateralSweep = [0.1, 0.17, 0.33, 0.5].map(position => Math.abs(buildRoadPath({ position }).points.at(-1).x));
  assert.ok(Math.max(...lateralSweep) > 40);
});

test('heading and position are pinned at the player so the camera stays aligned', () => {
  for (const position of [0, 0.1, 0.33, 0.5, 0.71]) {
    const car = pointAt(buildRoadPath({ position }), 9);
    assert.ok(Math.abs(car.h) < 0.02, `heading at car ~0 (position ${position})`);
    assert.ok(Math.abs(car.x) < 0.3, `road centre under car (position ${position})`);
  }
});

test('road path is continuous with equal segment lengths and correct normals', () => {
  const path = buildRoadPath({ position: 0.5 });
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1], b = path.points[i];
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - path.segmentLength) < 1e-6);
  }
  const p = path.points[40];
  assert.ok(Math.abs(p.nx * p.dx + p.nz * p.dz) < 1e-12, 'normal is perpendicular to heading');
  const [x, z] = lateral(p, 5);
  assert.ok(Math.abs(Math.hypot(x - p.x, z - p.z) - 5) < 1e-9);
});

test('scrolling the road forward keeps the corner geometry stable (no popping)', () => {
  const a = buildRoadPath({ position: 0.2 }), b = buildRoadPath({ position: 0.2 + 1 / 4563 });
  const ahead = (path, s) => pointAt(path, s);
  assert.ok(Math.abs(ahead(a, 120).h - ahead(b, 120).h) < 0.02);
  assert.ok(Math.abs(ahead(a, 300).x - ahead(b, 300).x) < 1.5);
});

test('gentle steering never drifts; hard steering at speed does', () => {
  const base = { speed: 150, grip: 1, braking: false, accelerating: true };
  assert.equal(driftTarget({ ...base, steer: .3 }), 0);
  assert.equal(driftTarget({ ...base, steer: 1 }), 0, 'low speed full lock stays gripped');
  assert.ok(driftTarget({ ...base, speed: 320, steer: 1 }) > 0);
  assert.ok(driftTarget({ ...base, speed: 320, steer: -1 }) < 0);
  assert.equal(driftTarget({ ...base, speed: 320, steer: 1, offRoad: true }), 0);
  assert.ok(driftTarget({ ...base, speed: 320, steer: 1 }) <= DRIFT.maxAngle);
});

test('lower grip and a looser differential make the car drift earlier', () => {
  const args = { speed: 230, steer: 1, braking: false, accelerating: false };
  assert.ok(driftTarget({ ...args, grip: .6 }) > driftTarget({ ...args, grip: 1.1 }));
  assert.ok(driftTarget({ ...args, grip: 1, diffSetup: 10 }) > driftTarget({ ...args, grip: 1, diffSetup: 90 }));
});

test('a held slide builds a slip angle, scrubs speed and scores points', () => {
  const physics = createPhysics();
  physics.speed = 300; physics.tyreTemp = 90;
  drive(physics, 40, () => 1);
  assert.ok(Math.abs(physics.driftAngle) > DRIFT.enter);
  assert.ok(physics.getDynamics().driftScore > 0);
  assert.ok(physics.speed < 300);
});

test('counter-steering recovers the slide and banks the points once', () => {
  const physics = createPhysics();
  physics.speed = 300; physics.tyreTemp = 90;
  drive(physics, 45, () => 1);
  const peak = Math.abs(physics.driftAngle);
  drive(physics, 40, () => -.6);
  assert.ok(Math.abs(physics.driftAngle) < peak);
  drive(physics, 80, () => 0);
  const events = physics.consumeDriftEvents();
  assert.ok(events.banked >= 100, 'drift was banked');
  assert.equal(physics.consumeDriftEvents().banked, 0, 'bank event is consumed once');
  assert.ok(physics.getDynamics().driftTotal >= events.banked);
});

test('sliding heats and wears tyres faster than driving straight', () => {
  const settle = steer => {
    const physics = createPhysics();
    physics.speed = 300; physics.tyreTemp = 90;
    drive(physics, 90, () => steer);
    return physics;
  };
  const sliding = settle(1), straight = settle(0);
  assert.ok(sliding.tyreTemp > straight.tyreTemp);
  assert.ok(sliding.tireWear > straight.tireWear);
});

test('overcooking a drift ends in a spin that costs speed and the drift score', () => {
  const physics = createPhysics();
  physics.speed = 330; physics.tyreTemp = 90;
  let spun = false;
  for (let i = 0; i < 400 && !spun; i++) {
    physics.update(1 / 60, new Set(['accelerate']), 0, 1);
    spun = physics.consumeDriftEvents().spin === 1;
    physics.speed = Math.max(physics.speed, 330); physics.playerX = 0;
  }
  assert.ok(spun, 'a spin occurred');
  assert.equal(physics.getDynamics().driftScore, 0);
  assert.equal(physics.driftAngle, 0);
});

test('the corner-following calibration bot stays on track and never needs to drift', () => {
  const physics = createPhysics();
  for (let i = 0; i < 60 * 130; i++) {
    const c = curveAt((physics.distance % 4563) / 4563);
    physics.update(1 / 60, new Set(['accelerate']), c, c * .1 - physics.playerX * .4 - physics.lateralVelocity * .2);
    assert.equal(physics.offRoad, false);
  }
  assert.equal(physics.getDynamics().driftTotal, 0);
});

test('reset clears drift state', () => {
  const physics = createPhysics();
  physics.speed = 300; drive(physics, 60, () => 1);
  physics.reset();
  assert.equal(physics.driftAngle, 0);
  assert.equal(physics.driftScore, 0);
  assert.equal(physics.driftTotal, 0);
});
