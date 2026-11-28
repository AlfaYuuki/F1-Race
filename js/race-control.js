// Race Control: flags, Virtual Safety Car, Safety Car, red flag and restart procedures.
//
// A small, deterministic (when given a seeded random) state machine. The game loop feeds it
// incidents and elapsed time; it answers with the current regulation state: which flag is out, the
// speed cap every car must respect, whether overtaking is allowed, and whether the pit lane is open.
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export const MODE = Object.freeze({
  GREEN: 'green',
  YELLOW: 'yellow',
  DOUBLE_YELLOW: 'doubleYellow',
  VSC: 'vsc',
  VSC_ENDING: 'vscEnding',
  SAFETY_CAR: 'safetyCar',
  SAFETY_CAR_IN: 'safetyCarIn',
  RED: 'red',
  RESTART: 'restart'
});

// Regulation table: speed caps are km/h (null = unrestricted).
export const RULES = Object.freeze({
  [MODE.GREEN]:         { label: 'GREEN',         cap: null, overtaking: true,  pitsOpen: true,  neutralised: false, tone: 'green' },
  [MODE.YELLOW]:        { label: 'YELLOW',        cap: 170,  overtaking: false, pitsOpen: true,  neutralised: true,  tone: 'yellow' },
  [MODE.DOUBLE_YELLOW]: { label: 'DOUBLE YELLOW', cap: 120,  overtaking: false, pitsOpen: true,  neutralised: true,  tone: 'yellow' },
  [MODE.VSC]:           { label: 'VSC',           cap: 140,  overtaking: false, pitsOpen: true,  neutralised: true,  tone: 'vsc' },
  [MODE.VSC_ENDING]:    { label: 'VSC ENDING',    cap: 170,  overtaking: false, pitsOpen: true,  neutralised: true,  tone: 'vsc' },
  [MODE.SAFETY_CAR]:    { label: 'SAFETY CAR',    cap: 125,  overtaking: false, pitsOpen: true,  neutralised: true,  tone: 'sc' },
  [MODE.SAFETY_CAR_IN]: { label: 'SC IN THIS LAP', cap: 150, overtaking: false, pitsOpen: true,  neutralised: true,  tone: 'sc' },
  [MODE.RED]:           { label: 'RED FLAG',      cap: 0,    overtaking: false, pitsOpen: false, neutralised: true,  tone: 'red' },
  [MODE.RESTART]:       { label: 'RESTART',       cap: 0,    overtaking: false, pitsOpen: false, neutralised: true,  tone: 'red' }
});

// Incident severity decides the response.
//   1 = local yellow, 2 = double yellow (may escalate to VSC), 3 = safety car, 4 = red flag.
export const SEVERITY = Object.freeze({ MINOR: 1, MAJOR: 2, SERIOUS: 3, SEVERE: 4 });

const DURATION = Object.freeze({
  yellow: [12, 18],
  doubleYellow: [14, 20],
  vsc: [24, 40],
  vscEnding: 6,
  safetyCarMin: [34, 55],
  redFlag: [16, 22],
  restartCount: 5,
  cooldown: 45
});

export function createRaceControl(random = Math.random) {
  const span = ([a, b]) => a + (b - a) * clamp(Number(random()) || 0, 0, .999999);
  let mode = MODE.GREEN, timer = 0, incidentAge = 0, elapsed = 0, cooldown = 0, lastLeaderLap = 0;
  let incident = null, events = [], history = [];

  function emit(type, payload = {}) { events.push({ type, ...payload }); }
  function setMode(next, duration = 0, reason = '') {
    if (next === mode) { timer = Math.max(timer, duration); return; }
    const previous = mode;
    mode = next; timer = duration;
    emit('mode', { mode: next, previous, label: RULES[next].label, reason });
    history.push({ at: elapsed, mode: next, reason });
    if (history.length > 40) history.shift();
  }
  function reset() {
    mode = MODE.GREEN; timer = 0; incidentAge = 0; elapsed = 0; cooldown = 0;
    lastLeaderLap = 0; incident = null; events = []; history = [];
  }

  // Severity escalation order — a worse incident never gets downgraded by a lesser one.
  const rank = m => ({ [MODE.GREEN]: 0, [MODE.YELLOW]: 1, [MODE.DOUBLE_YELLOW]: 2, [MODE.VSC]: 3, [MODE.VSC_ENDING]: 3,
    [MODE.SAFETY_CAR]: 4, [MODE.SAFETY_CAR_IN]: 4, [MODE.RESTART]: 5, [MODE.RED]: 6 })[m] ?? 0;

  function reportIncident({ severity = 1, carId = null, reason = 'INCIDENT', distance = 0 } = {}) {
    const level = clamp(Math.round(Number(severity) || 1), 1, 4);
    if (mode === MODE.RED || mode === MODE.RESTART) return false;
    const target = level >= 4 ? MODE.RED : level === 3 ? MODE.SAFETY_CAR : level === 2 ? MODE.DOUBLE_YELLOW : MODE.YELLOW;
    incident = { severity: level, carId, reason, distance, age: 0 };
    incidentAge = 0;
    emit('incident', { severity: level, carId, reason });
    if (rank(target) < rank(mode)) { timer = Math.max(timer, 6); return true; }
    const duration = target === MODE.RED ? span(DURATION.redFlag) : target === MODE.SAFETY_CAR ? span(DURATION.safetyCarMin)
      : target === MODE.DOUBLE_YELLOW ? span(DURATION.doubleYellow) : span(DURATION.yellow);
    setMode(target, duration, reason);
    cooldown = DURATION.cooldown;
    return true;
  }

  function update(dt, { leaderLap = 0, rain = 0 } = {}) {
    const step = clamp(Number(dt) || 0, 0, .25);
    elapsed += step; cooldown = Math.max(0, cooldown - step);
    if (mode !== MODE.GREEN) incidentAge += step;
    timer = Math.max(0, timer - step);
    const crossedLine = leaderLap > lastLeaderLap;
    lastLeaderLap = Math.max(lastLeaderLap, leaderLap);

    switch (mode) {
      case MODE.YELLOW:
        // A yellow that is not cleared within its window escalates to double yellow.
        if (timer === 0) setMode(MODE.GREEN, 0, 'TRACK CLEAR');
        break;
      case MODE.DOUBLE_YELLOW:
        // Still blocked after a few seconds: neutralise with a Virtual Safety Car.
        if (incident && incident.severity >= 2 && incidentAge > 8 && incident.blocking !== false && random() < step * .22) setMode(MODE.VSC, span(DURATION.vsc), 'TRACK BLOCKED');
        else if (timer === 0) setMode(MODE.GREEN, 0, 'TRACK CLEAR');
        break;
      case MODE.VSC:
        if (timer === 0) setMode(MODE.VSC_ENDING, DURATION.vscEnding, 'VSC ENDING');
        break;
      case MODE.VSC_ENDING:
        if (timer === 0) setMode(MODE.GREEN, 0, 'GREEN FLAG');
        break;
      case MODE.SAFETY_CAR:
        // Minimum deployment time elapses, then the Safety Car comes in at the end of the lap.
        if (timer === 0) setMode(MODE.SAFETY_CAR_IN, 0, 'SAFETY CAR IN THIS LAP');
        break;
      case MODE.SAFETY_CAR_IN:
        // Restart: green flag when the leader crosses the line.
        if (crossedLine) { setMode(MODE.GREEN, 0, 'RESTART'); emit('restart', { kind: 'safetyCar' }); }
        break;
      case MODE.RED:
        if (timer === 0) setMode(MODE.RESTART, DURATION.restartCount, 'RESTART PROCEDURE');
        break;
      case MODE.RESTART:
        if (timer === 0) { setMode(MODE.GREEN, 0, 'RACE RESTART'); emit('restart', { kind: 'red' }); }
        break;
      default:
        break;
    }
    // Torrential rain can suspend a race (once, and not too early).
    if (mode === MODE.GREEN && cooldown === 0 && rain > .8 && elapsed > 90 && random() < step * .004) {
      reportIncident({ severity: SEVERITY.SEVERE, reason: 'WEATHER — RACE SUSPENDED' });
    }
    return snapshot();
  }

  function snapshot() {
    const rules = RULES[mode];
    return {
      mode, label: rules.label, tone: rules.tone, cap: rules.cap, overtaking: rules.overtaking,
      pitsOpen: rules.pitsOpen, neutralised: rules.neutralised,
      yellow: mode === MODE.YELLOW || mode === MODE.DOUBLE_YELLOW,
      doubleYellow: mode === MODE.DOUBLE_YELLOW,
      vsc: mode === MODE.VSC || mode === MODE.VSC_ENDING,
      safetyCar: mode === MODE.SAFETY_CAR || mode === MODE.SAFETY_CAR_IN,
      red: mode === MODE.RED, restart: mode === MODE.RESTART,
      suspended: mode === MODE.RED || mode === MODE.RESTART,
      timer, incident: incident ? { ...incident } : null,
      // When a Safety Car is out, cars bunch up behind the leader.
      bunch: mode === MODE.SAFETY_CAR || mode === MODE.SAFETY_CAR_IN
    };
  }

  // Clear all events (called each frame by the game after it has handled them).
  function drainEvents() { const out = events; events = []; return out; }
  function clearTrack(reason = 'TRACK CLEAR') {
    // The blocking incident has been recovered: neutralisations may end early.
    if (incident) incident.blocking = false;
    if (mode === MODE.YELLOW || mode === MODE.DOUBLE_YELLOW) setMode(MODE.GREEN, 0, reason);
    else if (mode === MODE.VSC) setMode(MODE.VSC_ENDING, DURATION.vscEnding, reason);
  }

  return { reset, update, reportIncident, snapshot, drainEvents, clearTrack, get mode() { return mode; }, get history() { return history; } };
}
