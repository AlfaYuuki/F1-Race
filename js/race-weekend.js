const KEY = 'the-f1-race-weekend-v1';
const SESSION_ORDER = [
  { id: 'practice', label: 'PRACTICE', laps: 3 },
  { id: 'qualifying', label: 'QUALIFYING', laps: 1 },
  { id: 'race', label: 'GRAND PRIX', laps: 50 }
];

function safeStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function createRaceWeekend(storage = safeStorage()) {
  let state = { round: 1, completed: [], results: [], qualifyingOrder: [] };

  function save() {
    try { storage?.setItem(KEY, JSON.stringify(state)); } catch { /* Private browsing or quota limits. */ }
  }

  function load() {
    try {
      const parsed = JSON.parse(storage?.getItem(KEY) || 'null');
      if (parsed && Array.isArray(parsed.completed) && Array.isArray(parsed.results) &&
          Array.isArray(parsed.qualifyingOrder) && Number.isInteger(parsed.round) && parsed.round > 0) {
        state = parsed;
      }
    } catch { /* Start with a clean weekend if stored data is invalid. */ }
  }

  function getState() {
    const next = SESSION_ORDER.find(session => !state.completed.includes(session.id));
    return {
      round: state.round,
      sessions: SESSION_ORDER.map(session => ({
        ...session,
        status: state.completed.includes(session.id) ? 'complete' :
          session.id === next?.id ? 'available' : 'locked'
      })),
      nextSession: next?.id ?? null,
      completed: [...state.completed],
      results: state.results.map(result => ({ ...result, order: [...(result.order || [])] })),
      qualifyingOrder: [...state.qualifyingOrder],
      weekendComplete: !next
    };
  }

  function startSession(id) {
    const session = SESSION_ORDER.find(item => item.id === id);
    if (!session || getState().nextSession !== id) return null;
    return { ...session, gridPosition: id === 'race' ? getGridPosition('player') : 10 };
  }

  function recordResult(id, result = {}) {
    const session = SESSION_ORDER.find(item => item.id === id);
    if (!session || getState().nextSession !== id) return { ok: false, error: 'Session is not the next available session.' };
    const order = Array.isArray(result.order)
      ? result.order.map(driver => ({ id: String(driver.id), name: String(driver.name) }))
      : [];
    if (id === 'qualifying' && (order.length !== 20 || !order.some(driver => driver.id === 'player'))) {
      return { ok: false, error: 'Qualifying must contain all 20 drivers, including the player.' };
    }
    const playerPosition = order.findIndex(driver => driver.id === 'player') + 1;
    const record = {
      session: id,
      playerPosition: playerPosition || null,
      bestLapMs: Number.isFinite(result.bestLapMs) ? result.bestLapMs : null,
      elapsedMs: Number.isFinite(result.elapsedMs) ? result.elapsedMs : null,
      order
    };
    state.results.push(record);
    state.completed.push(id);
    if (id === 'qualifying') state.qualifyingOrder = order.map(driver => driver.id);
    save();
    return { ok: true, state: getState(), result: { ...record, order: [...order] } };
  }

  function getGridPosition(driverId = 'player') {
    const index = state.qualifyingOrder.indexOf(driverId);
    return index < 0 ? 10 : index + 1;
  }

  function startNewWeekend() {
    state = { round: state.round + 1, completed: [], results: [], qualifyingOrder: [] };
    save();
    return getState();
  }

  load();
  return { getState, startSession, recordResult, getGridPosition, startNewWeekend };
}

export const RACE_WEEKEND_SESSIONS = SESSION_ORDER.map(session => ({ ...session }));
