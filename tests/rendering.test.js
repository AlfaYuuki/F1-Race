import test from 'node:test';
import assert from 'node:assert/strict';
import { isForwardOpponent as isForward3D, opponentWorldZ } from '../js/renderer.js';
import { isForwardOpponent as isForward2D } from '../js/renderer2d.js';

test('forward renderers do not draw trailing cars as if they were ahead', () => {
  for (const isForward of [isForward3D, isForward2D]) {
    assert.equal(isForward(-1), false);
    assert.equal(isForward(-18), false);
    assert.equal(isForward(0), true);
    assert.equal(isForward(12), true);
    assert.equal(isForward(235), false);
  }
});

test('3D opponent projection aligns equal-distance cars with the player plane', () => {
  assert.equal(opponentWorldZ(0), 9);
  assert.ok(opponentWorldZ(10) > 9);
  assert.ok(opponentWorldZ(-10) < 9);
});
