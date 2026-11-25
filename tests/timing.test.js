import test from 'node:test';
import assert from 'node:assert/strict';
import { formatGap } from '../js/timing.js';

test('timing tower shows GRID before the race starts', () => {
  assert.equal(formatGap({ position: 4, state: 'ready', distance: 0, aheadDistance: 8 }), 'GRID');
});

test('race leader is clearly marked', () => {
  assert.equal(formatGap({ position: 1, state: 'running', distance: 120, aheadDistance: 120 }), 'LEAD');
});

test('cars show their exact simulated distance to the car ahead', () => {
  assert.equal(formatGap({ position: 3, state: 'running', distance: 250, aheadDistance: 284 }), '+34m');
});

test('lapped cars show a compact lap deficit', () => {
  assert.equal(formatGap({ position: 8, state: 'running', distance: 100, aheadDistance: 4700, lapDistance: 4563 }), '+1L');
});

test('negative or missing distance differences never produce a negative gap', () => {
  assert.equal(formatGap({ position: 2, state: 'running', distance: 300, aheadDistance: 290 }), '+0m');
});
