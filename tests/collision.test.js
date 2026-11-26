import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionDetector } from '../js/collision.js';

const car = (overrides = {}) => ({
  id: 'rival', distance: 100, currentLane: 0, ...overrides
});

test('five metres of separation is proximity, not physical contact', () => {
  const detector = createCollisionDetector();
  assert.equal(detector.update(100, 0, [car({ distance: 105 })]), null);
});

test('contact requires both longitudinal and lateral footprint overlap', () => {
  const detector = createCollisionDetector();
  assert.equal(detector.update(100, 0, [car({ distance: 103, currentLane: 0 })]).id, 'rival');
  detector.reset();
  assert.equal(detector.update(100, 0, [car({ distance: 101, currentLane: 0.7 })]), null);
});

test('ghost and explicitly non-collidable cars never cause contact', () => {
  const detector = createCollisionDetector();
  assert.equal(detector.update(100, 0, [car({ distance: 100, ghost: true })]), null);
  assert.equal(detector.update(100, 0, [car({ distance: 100, isGhost: true })]), null);
  assert.equal(detector.update(100, 0, [car({ distance: 100, collisionEnabled: false })]), null);
});

test('a single encounter causes one impact until the cars separate', () => {
  const detector = createCollisionDetector();
  assert.equal(detector.update(100, 0, [car({ distance: 100 })]).id, 'rival');
  assert.equal(detector.update(100, 0, [car({ distance: 100 })]), null);
  assert.equal(detector.update(100, 0, [car({ distance: 108 })]), null);
  assert.equal(detector.update(100, 0, [car({ distance: 100 })]).id, 'rival');
});

test('invalid and removed cars cannot leave stale contact state', () => {
  const detector = createCollisionDetector();
  assert.equal(detector.update(100, 0, [car({ distance: 100 })]).id, 'rival');
  assert.equal(detector.update(100, 0, []), null);
  assert.equal(detector.update(100, 0, [car({ distance: 100 })]).id, 'rival');
  assert.equal(detector.update(NaN, 0, [car({ distance: 100 })]), null);
});
