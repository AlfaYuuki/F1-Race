import test from 'node:test';
import assert from 'node:assert/strict';
import { createChampionship } from '../js/championship.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

const classification = [
  { id: 'player', name: 'YOU' },
  ...Array.from({ length: 19 }, (_, index) => ({ id: 'driver-' + index, name: 'DRIVER ' + index }))
];

test('championship awards points, persists and completes five rounds', () => {
  const storage = memoryStorage();
  const series = createChampionship(storage);
  assert.equal(series.getState().hasSeason, false);
  series.startNewSeason();
  for (let round = 0; round < 5; round++) {
    const state = series.recordResult(classification);
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


test('championship rejects incomplete and duplicate classifications without awarding points', () => {
  const series = createChampionship(memoryStorage());
  series.startNewSeason();
  const incomplete = series.recordResult(classification.slice(0, 3));
  assert.equal(incomplete.round, 0);
  const duplicate = classification.map(driver => ({ ...driver }));
  duplicate[19].id = duplicate[18].id;
  const rejected = series.recordResult(duplicate);
  assert.equal(rejected.round, 0);
  assert.equal(rejected.standings.find(driver => driver.id === 'player').points, 0);
});
