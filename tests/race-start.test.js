import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaceStartGate } from '../js/race-start.js';

test('race-start gate blocks input during countdown and releases at GO', () => {
  const gate = createRaceStartGate();
  gate.begin();
  assert.equal(gate.acceptsInput(), false);
  gate.release();
  assert.equal(gate.acceptsInput(), true);
});

test('race-start gate can be reset between sessions', () => {
  const gate = createRaceStartGate();
  gate.begin();
  gate.reset();
  assert.equal(gate.acceptsInput(), true);
});
