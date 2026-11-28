// Sporting regulations: penalties, track limits, infringement detection, classification and
// mechanical retirements. Pure helpers so every rule can be unit-tested.
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export const PENALTY = Object.freeze({
  TRACK_LIMITS: 5,        // seconds, every third violation
  SPEEDING: 5,            // under VSC / SC / double yellow
  OVERTAKING: 5,          // passing under a neutralisation
  JUMP_START: 5,
  DRIVE_THROUGH_LAPS: 3,  // laps allowed to serve a drive-through
  UNSERVED: 20            // an unserved drive-through becomes this many seconds
});

// ---- Penalty ledger --------------------------------------------------------------------------
export function createPenaltyLedger() {
  let entries = [], pending = [], warnings = 0, nextId = 1, events = [];
  const emit = e => events.push(e);
  function reset() { entries = []; pending = []; warnings = 0; nextId = 1; events = []; }
  function addTime(seconds, reason) {
    const entry = { id: nextId++, type: 'time', seconds: Math.max(0, Number(seconds) || 0), reason: String(reason || 'INFRINGEMENT') };
    entries.push(entry); emit({ type: 'time', ...entry });
    return entry;
  }
  function addDriveThrough(reason, currentLap = 1, laps = PENALTY.DRIVE_THROUGH_LAPS) {
    const entry = { id: nextId++, type: 'driveThrough', reason: String(reason || 'INFRINGEMENT'), deadlineLap: currentLap + laps };
    pending.push(entry); emit({ type: 'driveThrough', ...entry });
    return entry;
  }
  // Serving = driving through the pit lane without stopping.
  function serveDriveThrough() {
    const served = pending.shift();
    if (served) emit({ type: 'served', id: served.id, reason: served.reason });
    return !!served;
  }
  // Called when the player completes a lap: unserved drive-throughs past their deadline become time.
  function onLapCompleted(lap) {
    const expired = pending.filter(p => lap > p.deadlineLap);
    if (!expired.length) return [];
    pending = pending.filter(p => !expired.includes(p));
    return expired.map(p => { const e = addTime(PENALTY.UNSERVED, `UNSERVED DRIVE-THROUGH — ${p.reason}`); e.converted = true; return e; });
  }
  function addWarning() { warnings += 1; return warnings; }
  function summary() {
    return { seconds: entries.reduce((sum, e) => sum + e.seconds, 0), entries: entries.map(e => ({ ...e })),
      driveThroughs: pending.map(p => ({ ...p })), pendingDriveThrough: pending.length, trackLimitWarnings: warnings };
  }
  function drainEvents() { const out = events; events = []; return out; }
  return { reset, addTime, addDriveThrough, serveDriveThrough, onLapCompleted, addWarning, summary, drainEvents,
    get seconds() { return entries.reduce((sum, e) => sum + e.seconds, 0); }, get pendingDriveThrough() { return pending.length; } };
}

// ---- Track limits ------------------------------------------------------------------------------
// A violation = the car stays beyond the white line (|playerX| > limit) for `hold` seconds.
// One violation per excursion; the car must come back inside `rearm` before another can count.
// Warning 1, warning 2, then the third violation costs a time penalty and the count restarts.
export function createTrackLimitMonitor({ limit = 1.12, rearm = 1.0, hold = .3 } = {}) {
  let outside = 0, armed = true, count = 0;
  function reset() { outside = 0; armed = true; count = 0; }
  function update(dt, playerX) {
    const x = Math.abs(Number(playerX) || 0);
    const step = clamp(Number(dt) || 0, 0, .25);
    if (x > limit) outside += step; else { outside = 0; if (x < rearm) armed = true; }
    if (armed && outside >= hold) {
      armed = false; count += 1;
      if (count >= 3) { count = 0; return { type: 'penalty', seconds: PENALTY.TRACK_LIMITS, warning: 3 }; }
      return { type: 'warning', warning: count };
    }
    return null;
  }
  return { reset, update, get violations() { return count; } };
}

// ---- Infringements -----------------------------------------------------------------------------
// Speeding under a neutralisation: must stay within cap + margin; sustained excess is penalised.
export function createSpeedingMonitor({ margin = 12, hold = 1.6, cooldown = 25 } = {}) {
  let excess = 0, cool = 0;
  function reset() { excess = 0; cool = 0; }
  function update(dt, speedKph, cap) {
    const step = clamp(Number(dt) || 0, 0, .25);
    cool = Math.max(0, cool - step);
    if (cap == null || cap <= 0 || speedKph <= cap + margin) { excess = Math.max(0, excess - step * 2); return null; }
    excess += step;
    if (excess >= hold && cool === 0) { excess = 0; cool = cooldown; return { type: 'penalty', seconds: PENALTY.SPEEDING, reason: 'SPEEDING UNDER NEUTRALISATION' }; }
    return null;
  }
  return { reset, update };
}

// Detects the player passing cars. `signs` carries last frame's relative order between calls.
export function detectOvertakes(signs, playerDistance, drivers, { range = 40, ignore = () => false } = {}) {
  const passed = [], next = {};
  for (const d of drivers) {
    const gap = playerDistance - d.distance;
    if (Math.abs(gap) > range) { continue; }
    const sign = gap >= 0 ? 1 : -1;
    next[d.id] = sign;
    if (signs[d.id] === -1 && sign === 1 && !ignore(d)) passed.push(d.id);
  }
  return { passed, signs: next };
}

// Starting early: the throttle was applied while the start lights were still on.
export function isJumpStart({ lightsLit = 0, lightsOut = false, throttle = false } = {}) {
  return !lightsOut && throttle && lightsLit >= 3;
}

// ---- Classification ----------------------------------------------------------------------------
// Applies the player's time penalty by dropping them behind every classified car that finished
// within the penalty window; retired cars (DNF) are classified after every finisher.
export function classify(standings, { penaltySeconds = 0, playerSpeedMs = 60 } = {}) {
  const list = standings.map(d => ({ ...d }));
  const running = list.filter(d => !d.retired);
  const retired = list.filter(d => d.retired).sort((a, b) => (b.distance || 0) - (a.distance || 0));
  const player = running.find(d => d.isPlayer);
  if (player && penaltySeconds > 0) {
    const speed = Math.max(30, Number(playerSpeedMs) || 60);
    const index = running.indexOf(player);
    let drop = 0;
    for (let i = index + 1; i < running.length; i++) {
      const gapSeconds = (player.distance - running[i].distance) / speed;
      if (gapSeconds <= penaltySeconds) drop++; else break;
    }
    if (drop > 0) { running.splice(index, 1); running.splice(index + drop, 0, player); }
    player.timePenalty = penaltySeconds; player.positionsLost = drop;
  }
  return [...running, ...retired];
}

// ---- Mechanical retirements --------------------------------------------------------------------
export const RETIREMENT_REASONS = Object.freeze([
  { reason: 'ENGINE FAILURE',   severity: 2, weight: 4 },
  { reason: 'GEARBOX FAILURE',  severity: 2, weight: 3 },
  { reason: 'HYDRAULICS',       severity: 1, weight: 3 },  // limps to the pits
  { reason: 'BRAKE FAILURE',    severity: 3, weight: 1.2 }, // ends in the barrier
  { reason: 'SUSPENSION DAMAGE', severity: 2, weight: 2 }
]);

// Probability per second that a car suffers a terminal mechanical problem.
export function retirementHazard({ tireWear = 0, mistakes = 0, risk = .65, damage = 0, fuel = 100 } = {}) {
  const base = .00007;
  const wear = 1 + clamp((tireWear - 70) / 30, 0, 1) * 2.5;
  const abuse = 1 + clamp(mistakes, 0, 6) * .25 + clamp(risk, 0, 1) * .5;
  const hurt = 1 + clamp(damage, 0, 100) / 100 * 6;
  return base * wear * abuse * hurt;
}
export function pickRetirementReason(random = Math.random) {
  const total = RETIREMENT_REASONS.reduce((s, r) => s + r.weight, 0);
  let roll = clamp(Number(random()) || 0, 0, .999999) * total;
  for (const r of RETIREMENT_REASONS) { roll -= r.weight; if (roll < 0) return r; }
  return RETIREMENT_REASONS[0];
}
