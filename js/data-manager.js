export const DATA_KEYS = Object.freeze([
  'the-f1-race-garage-v1',
  'the-f1-race-championship-v1',
  'the-f1-race-weekend-v1',
  'f1race.platform',
  'f1race.tilt',
  'f1race.tiltInvert'
]);

const BACKUP_FORMAT = 'the-f1-race-save';
const BACKUP_VERSION = 1;
const CAR_IDS = new Set(['falcon', 'vortex', 'titan']);
const UPGRADE_KEYS = ['power', 'grip', 'braking', 'durability'];
const SETUP_KEYS = ['aero', 'suspension', 'brakeBias', 'differential'];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isValidClassification = order => Array.isArray(order) && order.length === 20 &&
  order.every(driver => isObject(driver) && typeof driver.id === 'string' && driver.id.length > 0 &&
    typeof driver.name === 'string' && driver.name.length > 0) &&
  new Set(order.map(driver => driver.id)).size === 20 &&
  order.some(driver => driver.id === 'player');

function validateGarage(raw) {
  let value;
  try { value = JSON.parse(raw); } catch { return false; }
  if (!isObject(value) || !Array.isArray(value.ownedCars) ||
      !value.ownedCars.length || !value.ownedCars.every(id => CAR_IDS.has(id)) ||
      !CAR_IDS.has(value.selectedCar) || !value.ownedCars.includes(value.selectedCar) ||
      !Number.isFinite(value.credits) || value.credits < 0 ||
      !isObject(value.upgrades) || !isObject(value.setup) ||
      !/^#[0-9a-f]{6}$/i.test(value.livery || '')) return false;
  return UPGRADE_KEYS.every(key => Number.isInteger(value.upgrades[key]) && value.upgrades[key] >= 0 && value.upgrades[key] <= 5) &&
    SETUP_KEYS.every(key => Number.isFinite(value.setup[key]) && value.setup[key] >= 0 && value.setup[key] <= 100);
}

function validateChampionship(raw) {
  let value;
  try { value = JSON.parse(raw); } catch { return false; }
  const standings = value?.standings;
  const results = value?.results;
  if (!isObject(value) || !Number.isInteger(value.round) || value.round < 0 || value.round > 5 ||
      typeof value.completed !== 'boolean' || value.completed !== (value.round === 5) ||
      !Array.isArray(results) || results.length !== value.round ||
      !Array.isArray(standings) || standings.length !== 6) return false;
  const validDriver = driver => isObject(driver) && typeof driver.id === 'string' &&
    driver.id.length > 0 && typeof driver.name === 'string' &&
    Number.isFinite(driver.points) && driver.points >= 0;
  return standings.every(validDriver) &&
    new Set(standings.map(driver => driver.id)).size === 6 &&
    standings.some(driver => driver.id === 'player') &&
    results.every((result, index) => isObject(result) && result.round === index + 1 &&
      isValidClassification(result.order));
}

function validateWeekend(raw) {
  let value;
  try { value = JSON.parse(raw); } catch { return false; }
  const sessions = ['practice', 'qualifying', 'race'];
  const completed = value?.completed;
  const results = value?.results;
  const qualifyingOrder = value?.qualifyingOrder;
  if (!isObject(value) || !Number.isInteger(value.round) || value.round < 1 ||
      !Array.isArray(completed) || completed.length > 3 ||
      !completed.every((session, index) => session === sessions[index]) ||
      !Array.isArray(results) || results.length !== completed.length ||
      !Array.isArray(qualifyingOrder)) return false;
  const validOrder = order => Array.isArray(order) && order.every(driver =>
    isObject(driver) && typeof driver.id === 'string' && driver.id.length > 0 &&
    typeof driver.name === 'string' && driver.name.length > 0);
  if (!results.every((result, index) => isObject(result) &&
      result.session === completed[index] && validOrder(result.order) &&
      (result.session !== 'qualifying' || isValidClassification(result.order)) &&
      (result.playerPosition === null || (Number.isInteger(result.playerPosition) &&
        result.playerPosition >= 1 && result.playerPosition <= 20)) &&
      (result.bestLapMs === null || (Number.isFinite(result.bestLapMs) && result.bestLapMs >= 0)) &&
      (result.elapsedMs === null || (Number.isFinite(result.elapsedMs) && result.elapsedMs >= 0)))) return false;
  if (qualifyingOrder.length === 0) return !completed.includes('qualifying');
  const qualifying = results.find(result => result.session === 'qualifying');
  return qualifyingOrder.length === 20 &&
    qualifyingOrder.every(id => typeof id === 'string' && id.length > 0) &&
    new Set(qualifyingOrder).size === 20 && qualifyingOrder.includes('player') &&
    completed.includes('qualifying') && qualifying &&
    qualifying.order.map(driver => driver.id).join('|') === qualifyingOrder.join('|');
}

function validateEntries(entries) {
  if (!isObject(entries)) return false;
  if (Object.keys(entries).some(key => !DATA_KEYS.includes(key))) return false;
  for (const [key, raw] of Object.entries(entries)) {
    if (typeof raw !== 'string' || raw.length > 250000) return false;
    if (key === 'the-f1-race-garage-v1' && !validateGarage(raw)) return false;
    if (key === 'the-f1-race-championship-v1' && !validateChampionship(raw)) return false;
    if (key === 'the-f1-race-weekend-v1' && !validateWeekend(raw)) return false;
    if (key === 'f1race.platform' && !['android', 'windows'].includes(raw)) return false;
    if ((key === 'f1race.tilt' || key === 'f1race.tiltInvert') && !['0', '1'].includes(raw)) return false;
  }
  return true;
}

function safeStorage() {
  try { return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null; }
  catch { return null; }
}

export function createDataManager(storage = safeStorage()) {
  function readEntries() {
    const entries = {};
    if (!storage) return entries;
    for (const key of DATA_KEYS) {
      try {
        const value = storage.getItem(key);
        if (value !== null) entries[key] = value;
      } catch { /* Report unavailable storage through the summary. */ }
    }
    return entries;
  }

  function getSummary() {
    const entries = readEntries();
    return {
      available: !!storage,
      keys: Object.keys(entries),
      bytes: Object.values(entries).reduce((sum, value) => sum + value.length * 2, 0),
      garage: !!entries['the-f1-race-garage-v1'],
      championship: !!entries['the-f1-race-championship-v1']
    };
  }

  function createBackup() {
    if (!storage) throw new Error('Device storage is unavailable.');
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      game: 'The F1 Race',
      data: readEntries()
    };
  }

  function restoreBackup(backup) {
    if (!storage) return { ok: false, error: 'Device storage is unavailable.' };
    if (!isObject(backup) || backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION ||
        !validateEntries(backup.data)) {
      return { ok: false, error: 'This backup is invalid or uses an unsupported version. No data was changed.' };
    }
    const previous = readEntries();
    try {
      for (const key of DATA_KEYS) storage.removeItem(key);
      for (const [key, value] of Object.entries(backup.data)) storage.setItem(key, value);
      return { ok: true };
    } catch {
      try {
        for (const key of DATA_KEYS) storage.removeItem(key);
        for (const [key, value] of Object.entries(previous)) storage.setItem(key, value);
      } catch { /* Best-effort rollback when browser storage is full or blocked. */ }
      return { ok: false, error: 'Restore failed. The previous save was preserved where browser storage allowed.' };
    }
  }

  function deleteAll() {
    if (!storage) return { ok: false, error: 'Device storage is unavailable.' };
    try {
      for (const key of DATA_KEYS) storage.removeItem(key);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Some data could not be deleted because browser storage is unavailable.' };
    }
  }

  return { getSummary, createBackup, restoreBackup, deleteAll };
}
