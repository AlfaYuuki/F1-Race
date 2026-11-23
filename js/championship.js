const POINTS = [25, 18, 15, 12, 10, 8];
const ROUNDS = 5;
const KEY = 'the-f1-race-championship-v1';

function availableStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function createChampionship(storage = availableStorage()) {
  let season = null;

  function blankSeason() {
    return {
      round: 0,
      completed: false,
      results: [],
      standings: [{ id: 'player', name: 'YOU', points: 0 },
        { id: 'sato', name: 'K. SATO', points: 0 },
        { id: 'tanaka', name: 'M. TANAKA', points: 0 },
        { id: 'mori', name: 'L. MORI', points: 0 },
        { id: 'kobayashi', name: 'A. KOBAYASHI', points: 0 },
        { id: 'nakamura', name: 'R. NAKAMURA', points: 0 }]
    };
  }

  function save() {
    try { storage?.setItem(KEY, JSON.stringify(season)); } catch { /* Storage may be unavailable. */ }
  }

  function load() {
    try {
      const raw = storage?.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.standings) && Array.isArray(parsed.results) &&
          Number.isInteger(parsed.round) && parsed.round >= 0 && parsed.round <= ROUNDS) season = parsed;
    } catch { season = null; }
  }

  function startNewSeason() {
    season = blankSeason();
    save();
    return getState();
  }

  function getState() {
    if (!season) return { ...blankSeason(), round: 0, hasSeason: false };
    return { ...season, hasSeason: true,
      standings: season.standings.map(driver => ({ ...driver })),
      results: season.results.map(result => ({ ...result, order: [...result.order] })) };
  }

  function recordResult(order) {
    if (!season || season.completed || season.round >= ROUNDS) return getState();
    const finishOrder = order.map(driver => ({ id: driver.id, name: driver.name }));
    const roundNumber = season.round + 1;
    finishOrder.forEach((driver, index) => {
      const entry = season.standings.find(item => item.id === driver.id);
      if (entry) entry.points += POINTS[index] || 0;
    });
    season.results.push({ round: roundNumber, order: finishOrder });
    season.round = roundNumber;
    season.completed = season.round >= ROUNDS;
    season.standings.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    save();
    return getState();
  }

  load();
  return { startNewSeason, getState, recordResult, rounds: ROUNDS };
}
