import { gravityRoll, tiltSteer, readGamepad } from './platform.js';

const KEY_MAP = {
  ArrowUp: 'accelerate', KeyW: 'accelerate',
  ArrowDown: 'brake', KeyS: 'brake', Space: 'brake',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right'
};

/**
 * Wires every input source to the game.
 *  - Windows profile: keyboard + gamepad
 *  - Android profile: on-screen touch buttons, optional tilt steering, Bluetooth gamepad
 * Options: getPlatform(), getTilt() -> {enabled, invert}, isBlocked(), onTilt(axis), onTiltReady(ready)
 */
export function bindControls(game, options = {}) {
  const getPlatform = options.getPlatform ?? (() => 'windows');
  const getTilt = options.getTilt ?? (() => ({ enabled: false, invert: false }));
  const isBlocked = options.isBlocked ?? (() => false);
  const held = new Set();

  const press = (action, active) => { if (active) held.add(action); else held.delete(action); game.setInput(action, active); };
  const releaseAll = () => {
    held.forEach(action => game.setInput(action, false));
    held.clear();
    game.setSteerAxis(0);
    options.onTilt?.(0);
  };

  /* ---------- Keyboard (Windows scheme; also works with any hardware keyboard) ---------- */
  window.addEventListener('keydown', event => {
    if (isBlocked()) return;
    if (event.code === 'Escape' || event.code === 'KeyP') {
      if (event.repeat) return;
      event.preventDefault();
      game.togglePause();
      return;
    }
    const action = KEY_MAP[event.code];
    if (!action) return;
    event.preventDefault();
    press(action, true);
  });
  window.addEventListener('keyup', event => {
    const action = KEY_MAP[event.code];
    if (action) press(action, false);
  });
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  /* ---------- Touch buttons (Android scheme) ---------- */
  const touchRoot = document.querySelector('.mobile-controls');
  touchRoot?.addEventListener('contextmenu', event => event.preventDefault());
  document.querySelectorAll('[data-control]').forEach(button => {
    const action = button.dataset.control;
    const down = event => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      if (getPlatform() === 'android') navigator.vibrate?.(8);
      press(action, true);
    };
    const up = event => { event.preventDefault(); press(action, false); };
    button.addEventListener('pointerdown', down);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => button.addEventListener(type, up));
  });

  /* ---------- Tilt steering (Android scheme, optional) ---------- */
  let tiltActive = false, tiltReady = false, neutral = null, lastRoll = NaN, sampleWaiters = [];
  const screenAngle = () => screen.orientation?.angle ?? window.orientation ?? 0;

  function onMotion(event) {
    const g = event.accelerationIncludingGravity;
    const roll = gravityRoll(g?.x, g?.y, screenAngle());
    if (!Number.isFinite(roll)) return;
    lastRoll = roll;
    if (neutral === null) neutral = roll;
    if (!tiltReady) {
      tiltReady = true;
      options.onTiltReady?.(true);
      sampleWaiters.splice(0).forEach(resolve => resolve(true));
    }
    if (isBlocked()) return;
    const axis = tiltSteer(roll, neutral, { invert: !!getTilt().invert });
    game.setSteerAxis(axis);
    options.onTilt?.(axis);
  }

  function startTilt() {
    if (tiltActive) return;
    tiltActive = true;
    window.addEventListener('devicemotion', onMotion);
  }
  function stopTilt() {
    if (!tiltActive) return;
    tiltActive = false;
    window.removeEventListener('devicemotion', onMotion);
    if (tiltReady) { tiltReady = false; options.onTiltReady?.(false); }
    neutral = null;
    game.setSteerAxis(0);
    options.onTilt?.(0);
  }
  /** Start/stop the sensor to match the current platform + tilt setting. */
  function syncTilt() {
    if (getPlatform() === 'android' && getTilt().enabled) startTilt(); else stopTilt();
  }
  /** Ask for sensor permission (iOS-style prompt where needed) and wait for a first reading. */
  async function requestTiltAccess(timeout = 1500) {
    if (typeof window.DeviceMotionEvent === 'undefined') return false;
    try {
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        if (await DeviceMotionEvent.requestPermission() !== 'granted') return false;
      }
    } catch { return false; }
    startTilt();
    if (tiltReady) return true;
    return new Promise(resolve => {
      const timer = setTimeout(() => { sampleWaiters = sampleWaiters.filter(fn => fn !== done); resolve(false); }, timeout);
      const done = ok => { clearTimeout(timer); resolve(ok); };
      sampleWaiters.push(done);
    });
  }
  /** Treat the current phone angle as "straight ahead". */
  function calibrate() { if (Number.isFinite(lastRoll)) neutral = lastRoll; }

  /* ---------- Gamepad (Windows scheme; Bluetooth pads on Android too) ---------- */
  let padRaf = 0, padWasPause = false;
  const padState = { accelerate: false, brake: false, steer: 0 };
  function pollGamepads() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    if (!pads.length) { padRaf = 0; return; }
    const pad = pads.find(candidate => candidate.connected) ?? pads[0];
    if (!isBlocked()) {
      const next = readGamepad(pad);
      if (next.accelerate !== padState.accelerate) { padState.accelerate = next.accelerate; press('accelerate', next.accelerate); }
      if (next.brake !== padState.brake) { padState.brake = next.brake; press('brake', next.brake); }
      if (next.steer !== padState.steer) {
        padState.steer = next.steer;
        // Tilt owns the axis while it is active and the stick is centred.
        if (!(tiltActive && tiltReady && next.steer === 0)) game.setSteerAxis(next.steer);
      }
      if (next.pause && !padWasPause) game.togglePause();
      padWasPause = next.pause;
    }
    padRaf = requestAnimationFrame(pollGamepads);
  }
  window.addEventListener('gamepadconnected', () => { if (!padRaf) padRaf = requestAnimationFrame(pollGamepads); });
  window.addEventListener('gamepaddisconnected', () => {
    padState.accelerate = padState.brake = false; padState.steer = 0;
    press('accelerate', false); press('brake', false); game.setSteerAxis(0);
  });

  return { releaseAll, syncTilt, requestTiltAccess, calibrate };
}
