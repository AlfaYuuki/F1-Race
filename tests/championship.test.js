import test from 'node:test';
import assert from 'node:assert/strict';
import { createChampionship } from '../js/championship.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('championship awards points, persists and completes five rounds', () => {
  const storage = memoryStorage();
  const series = createChampionship(storage);
  assert.equal(series.getState().hasSeason, false);
  series.startNewSeason();
  for (let round = 0; round < 5; round++) {
    const state = series.recordResult([
      { id: 'player', name: 'YOU' },
      { id: 'sato', name: 'K. SATO' },
      { id: 'tanaka', name: 'M. TANAKA' }
    ]);
    assert.equal(state.round, round + 1);
  }
  const final = series.getState();
  assert.equal(final.completed, true);
  assert.equal(final.standings.find(driver => driver.id === 'player').points, 125);
  assert.equal(createChampionship(storage).getState().round, 5);
});

test('championship ignores structurally corrupt saved seasons', () => {
  const storage = memoryStorage();
  storage.setItem('the-f1-race-championship-v1', JSON.stringify({
    round: 4, completed: false, results: [], standings: [{ id: 'player', name: 'YOU', points: 999 }]
  }));
  const series = createChampionship(storage);
  assert.equal(series.getState().hasSeason, false);
  assert.equal(series.getState().round, 0);
});
