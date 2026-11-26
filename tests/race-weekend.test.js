import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaceWeekend } from '../js/race-weekend.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

const order = Array.from({ length: 20 }, (_, index) => ({
  id: index === 7 ? 'player' : 'driver-' + index,
  name: index === 7 ? 'YOU' : 'DRIVER ' + index
}));

test('race weekend unlocks practice, qualifying and grand prix in sequence', () => {
  const weekend = createRaceWeekend(memoryStorage());
  assert.equal(weekend.getState().nextSession, 'practice');
  assert.equal(weekend.startSession('qualifying'), null);
  assert.equal(weekend.startSession('practice').laps, 3);
  assert.equal(weekend.recordResult('practice', { bestLapMs: 95000 }).ok, true);
  assert.equal(weekend.getState().nextSession, 'qualifying');
  assert.equal(weekend.startSession('qualifying').laps, 1);
  assert.equal(weekend.recordResult('qualifying', { order }).ok, true);
  assert.equal(weekend.getState().nextSession, 'race');
  assert.equal(weekend.startSession('race').laps, 50);
  assert.equal(weekend.startSession('race').gridPosition, 8);
  assert.deepEqual(weekend.startSession('race').gridOrder, order.map(driver => driver.id));
});

test('qualifying requires a complete twenty-driver classification', () => {
  const weekend = createRaceWeekend(memoryStorage());
  weekend.recordResult('practice', {});
  assert.equal(weekend.recordResult('qualifying', { order: order.slice(0, 10) }).ok, false);
  assert.equal(weekend.getState().nextSession, 'qualifying');
});

test('qualifying rejects duplicate driver identities and blank driver names', () => {
  const weekend = createRaceWeekend(memoryStorage());
  weekend.recordResult('practice', {});
  const duplicate = order.map(driver => ({ ...driver }));
  duplicate[19].id = duplicate[18].id;
  assert.equal(weekend.recordResult('qualifying', { order: duplicate }).ok, false);
  const unnamed = order.map(driver => ({ ...driver }));
  unnamed[3].name = '';
  assert.equal(weekend.recordResult('qualifying', { order: unnamed }).ok, false);
  assert.equal(weekend.getState().nextSession, 'qualifying');
});

test('race weekend saves progress and restores qualifying grid', () => {
  const storage = memoryStorage();
  const weekend = createRaceWeekend(storage);
  weekend.recordResult('practice', {});
  weekend.recordResult('qualifying', { order });
  const restored = createRaceWeekend(storage);
  assert.equal(restored.getState().nextSession, 'race');
  assert.equal(restored.getGridPosition('player'), 8);
  assert.equal(restored.getState().results.length, 2);
});

test('a completed weekend can be restarted without losing round numbering', () => {
  const weekend = createRaceWeekend(memoryStorage());
  weekend.recordResult('practice', {});
  weekend.recordResult('qualifying', { order });
  weekend.recordResult('race', { order });
  assert.equal(weekend.getState().weekendComplete, true);
  assert.equal(weekend.startSession('race'), null);
  assert.equal(weekend.startNewWeekend().round, 2);
  assert.equal(weekend.getState().nextSession, 'practice');
});

test('race weekend ignores corrupt persisted session order and grid data', () => {
  const storage = memoryStorage();
  storage.setItem('the-f1-race-weekend-v1', JSON.stringify({
    round: 2, completed: ['qualifying'], results: [], qualifyingOrder: ['player']
  }));
  const weekend = createRaceWeekend(storage);
  assert.equal(weekend.getState().round, 1);
  assert.equal(weekend.getState().nextSession, 'practice');
});

test('race weekend rejects a saved qualifying classification with duplicate identities', () => {
  const storage = memoryStorage();
  const duplicate = order.map(driver => ({ ...driver }));
  duplicate[19].id = duplicate[18].id;
  storage.setItem('the-f1-race-weekend-v1', JSON.stringify({
    round: 1,
    completed: ['practice', 'qualifying'],
    results: [{ session: 'practice', order: [] }, { session: 'qualifying', order: duplicate }],
    qualifyingOrder: duplicate.map(driver => driver.id)
  }));
  const weekend = createRaceWeekend(storage);
  assert.equal(weekend.getState().round, 1);
  assert.equal(weekend.getState().nextSession, 'practice');
});
