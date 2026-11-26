import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataManager, DATA_KEYS } from '../js/data-manager.js';
import { createChampionship } from '../js/championship.js';
import { createRaceWeekend } from '../js/race-weekend.js';
import { createGarage } from '../js/garage.js';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
    values
  };
}

const garage = JSON.stringify({
  credits: 900, selectedCar: 'falcon', ownedCars: ['falcon'],
  upgrades: { power: 1, grip: 0, braking: 0, durability: 0 },
  setup: { aero: 50, suspension: 50, brakeBias: 56, differential: 50 },
  livery: '#ed3548'
});

test('save manager exports only game save keys and reports local save status', () => {
  const storage = memoryStorage({ 'the-f1-race-garage-v1': garage, unrelated: 'keep me' });
  const manager = createDataManager(storage);
  const backup = manager.createBackup();
  assert.equal(backup.format, 'the-f1-race-save');
  assert.equal(backup.version, 1);
  assert.deepEqual(Object.keys(backup.data), ['the-f1-race-garage-v1']);
  assert.equal(manager.getSummary().garage, true);
  assert.equal(manager.getSummary().available, true);
});

test('save manager restores a valid backup and leaves unrelated browser data untouched', () => {
  const storage = memoryStorage({ 'the-f1-race-garage-v1': garage, 'f1race.platform': 'windows', unrelated: 'keep' });
  const manager = createDataManager(storage);
  const backup = manager.createBackup();
  storage.setItem('the-f1-race-garage-v1', 'corrupt');
  storage.setItem('f1race.platform', 'android');
  assert.deepEqual(manager.restoreBackup(backup), { ok: true });
  assert.equal(storage.getItem('the-f1-race-garage-v1'), garage);
  assert.equal(storage.getItem('f1race.platform'), 'windows');
  assert.equal(storage.getItem('unrelated'), 'keep');
});

test('save manager rejects malformed or unsafe backups without changing data', () => {
  const storage = memoryStorage({ 'the-f1-race-garage-v1': garage });
  const manager = createDataManager(storage);
  const invalid = { format: 'the-f1-race-save', version: 1, data: { 'the-f1-race-garage-v1': '{bad json' } };
  assert.equal(manager.restoreBackup(invalid).ok, false);
  assert.equal(storage.getItem('the-f1-race-garage-v1'), garage);
  assert.equal(manager.restoreBackup({ format: 'other', version: 1, data: {} }).ok, false);
  assert.equal(manager.restoreBackup({ format: 'the-f1-race-save', version: 1, data: { 'unknown.key': 'x' } }).ok, false);
  assert.equal(DATA_KEYS.includes('unrelated'), false);
});

test('delete all removes game progress and controls but not unrelated browser data', () => {
  const storage = memoryStorage({
    'the-f1-race-garage-v1': garage,
    'the-f1-race-weekend-v1': JSON.stringify({round:1,completed:[],results:[],qualifyingOrder:[]}),
    'f1race.platform': 'android',
    'f1race.tilt': '1',
    unrelated: 'keep'
  });
  const manager = createDataManager(storage);
  assert.deepEqual(manager.deleteAll(), { ok: true });
  assert.deepEqual(manager.getSummary().keys, []);
  assert.equal(storage.getItem('unrelated'), 'keep');
});

test('save manager handles unavailable storage safely', () => {
  const manager = createDataManager(null);
  assert.equal(manager.getSummary().available, false);
  assert.throws(() => manager.createBackup());
  assert.equal(manager.deleteAll().ok, false);
  assert.equal(manager.restoreBackup({}).ok, false);
});


test('save manager accepts a real championship save', () => {
  const storage = memoryStorage();
  const series = createChampionship(storage);
  series.startNewSeason();
  series.recordResult([
    { id: 'player', name: 'YOU' },
    ...Array.from({ length: 19 }, (_, index) => ({ id: 'driver-' + index, name: 'DRIVER ' + index }))
  ]);
  const backup = createDataManager(storage).createBackup();
  const target = memoryStorage();
  assert.deepEqual(createDataManager(target).restoreBackup(backup), { ok: true });
  assert.equal(createChampionship(target).getState().round, 1);
});

test('save manager backs up and restores race weekend progress and qualifying order', () => {
  const storage = memoryStorage();
  const weekend = createRaceWeekend(storage);
  const order = Array.from({ length: 20 }, (_, index) => ({
    id: index === 7 ? 'player' : 'driver-' + index,
    name: index === 7 ? 'YOU' : 'DRIVER ' + index
  }));
  weekend.recordResult('practice', {});
  weekend.recordResult('qualifying', { order });
  const backup = createDataManager(storage).createBackup();
  assert.ok(Object.hasOwn(backup.data, 'the-f1-race-weekend-v1'));
  const target = memoryStorage();
  assert.deepEqual(createDataManager(target).restoreBackup(backup), { ok: true });
  const restored = createRaceWeekend(target);
  assert.equal(restored.getState().nextSession, 'race');
  assert.equal(restored.getGridPosition('player'), 8);
});

test('save manager rejects malformed race weekend progress', () => {
  const storage = memoryStorage();
  const manager = createDataManager(storage);
  const invalid = {
    format: 'the-f1-race-save', version: 1,
    data: { 'the-f1-race-weekend-v1': JSON.stringify({
      round: 1, completed: ['qualifying'], results: [], qualifyingOrder: []
    }) }
  };
  assert.equal(manager.restoreBackup(invalid).ok, false);
  assert.equal(storage.getItem('the-f1-race-weekend-v1'), null);
});

test('legacy partial garage saves are normalized before backup export', () => {
  const storage = memoryStorage({
    'the-f1-race-garage-v1': JSON.stringify({
      credits: 900, selectedCar: 'falcon', ownedCars: ['falcon'],
      upgrades: { power: 2 }, setup: { aero: 70 }
    })
  });
  createGarage(storage);
  const backup = createDataManager(storage).createBackup();
  assert.equal(backup.data['the-f1-race-garage-v1'] !== undefined, true);
  const target = memoryStorage();
  assert.deepEqual(createDataManager(target).restoreBackup(backup), { ok: true });
  const restored = createGarage(target).getState();
  assert.equal(restored.credits, 900);
  assert.equal(restored.upgrades.power, 2);
  assert.equal(restored.setup.aero, 70);
  assert.equal(restored.setup.suspension, 50);
});


test('save manager rejects championship saves with duplicate finishers', () => {
  const storage = memoryStorage();
  const manager = createDataManager(storage);
  const order = [
    { id: 'player', name: 'YOU' },
    ...Array.from({ length: 19 }, (_, index) => ({ id: 'driver-' + index, name: 'DRIVER ' + index }))
  ];
  order[19].id = order[18].id;
  const invalid = {
    format: 'the-f1-race-save', version: 1,
    data: { 'the-f1-race-championship-v1': JSON.stringify({
      round: 1, completed: false,
      results: [{ round: 1, order }],
      standings: [
        { id: 'player', name: 'YOU', points: 25 },
        ...['sato', 'tanaka', 'mori', 'kobayashi', 'nakamura'].map(id => ({ id, name: id, points: 0 }))
      ]
    }) }
  };
  assert.equal(manager.restoreBackup(invalid).ok, false);
  assert.equal(storage.getItem('the-f1-race-championship-v1'), null);
});

test('save manager rejects a weekend backup whose grid disagrees with qualifying', () => {
  const storage = memoryStorage();
  const manager = createDataManager(storage);
  const order = Array.from({ length: 20 }, (_, index) => ({
    id: index === 7 ? 'player' : 'driver-' + index,
    name: index === 7 ? 'YOU' : 'DRIVER ' + index
  }));
  const invalid = {
    format: 'the-f1-race-save', version: 1,
    data: { 'the-f1-race-weekend-v1': JSON.stringify({
      round: 1, completed: ['practice', 'qualifying'],
      results: [
        { session: 'practice', order: [], playerPosition: null, bestLapMs: null, elapsedMs: null },
        { session: 'qualifying', order, playerPosition: 8, bestLapMs: null, elapsedMs: null }
      ],
      qualifyingOrder: order.map(driver => driver.id).reverse()
    }) }
  };
  assert.equal(manager.restoreBackup(invalid).ok, false);
  assert.equal(storage.getItem('the-f1-race-weekend-v1'), null);
});
