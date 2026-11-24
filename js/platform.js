// Platform profiles, persisted settings and the pure input helpers behind them.
// Everything here is DOM-free so it can be unit-tested in Node.

export const PLATFORMS = {
  android: { id: 'android', label: 'ANDROID' },
  windows: { id: 'windows', label: 'WINDOWS' }
};

const STORAGE_PREFIX = 'f1race.';
const DEFAULTS = { platform: null, tilt: false, tiltInvert: false };

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function safeStorage() {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Best guess for the device. Touch-first devices get the touch scheme, everything else the keyboard scheme. */
export function detectPlatform(nav = globalThis.navigator) {
  const ua = String(nav?.userAgent ?? '');
  if (/android/i.test(ua)) return 'android';
  if (/windows/i.test(ua)) return 'windows';
  return (nav?.maxTouchPoints ?? 0) > 0 && /mobile|iphone|ipad|tablet/i.test(ua) ? 'android' : 'windows';
}

export function loadSettings(storage = safeStorage()) {
  const settings = { ...DEFAULTS };
  if (!storage) return settings;
  try {
    const platform = storage.getItem(STORAGE_PREFIX + 'platform');
    if (platform in PLATFORMS) settings.platform = platform;
    settings.tilt = storage.getItem(STORAGE_PREFIX + 'tilt') === '1';
    settings.tiltInvert = storage.getItem(STORAGE_PREFIX + 'tiltInvert') === '1';
  } catch { /* storage blocked: fall back to defaults */ }
  return settings;
}

export function saveSetting(name, value, storage = safeStorage()) {
  if (!storage || !(name in DEFAULTS)) return false;
  try {
    storage.setItem(STORAGE_PREFIX + name, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
    return true;
  } catch {
    return false;
  }
}

/** One-line control summary shown on the start card. */
export function controlHint(platform, tilt = false) {
  if (platform === 'android') {
    return tilt
      ? 'TILT TO STEER · HOLD GO TO ACCELERATE · BRAKE TO SLOW'
      : 'TAP ◀ ▶ TO STEER · HOLD GO TO ACCELERATE · BRAKE TO SLOW';
  }
  return 'W/↑ GAS · S/↓ BRAKE · A/D/←/→ STEER · SPACE BRAKE · P/ESC PAUSE · M MUTE · F FULLSCREEN';
}

/**
 * Steering-wheel roll in degrees (clockwise positive) from a devicemotion gravity reading.
 * x/y are accelerationIncludingGravity; `angle` is the screen orientation angle (0/90/180/270).
 */
export function gravityRoll(x, y, angle = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return NaN;
  const quarter = ((Math.round((angle || 0) / 90) % 4) + 4) % 4;
  const screenX = [x, -y, -x, y][quarter]; // gravity reading along the screen's right-hand axis
  return Math.asin(clamp(-screenX / 9.81, -1, 1)) * 180 / Math.PI;
}

/** Map a roll angle to a steering axis in [-1, 1] with a dead zone and a full-lock angle. */
export function tiltSteer(roll, neutral = 0, { deadzone = 4, lock = 28, invert = false } = {}) {
  if (!Number.isFinite(roll)) return 0;
  let delta = roll - (Number.isFinite(neutral) ? neutral : 0);
  if (invert) delta = -delta;
  const magnitude = Math.abs(delta);
  if (magnitude <= deadzone) return 0;
  return Math.sign(delta) * clamp((magnitude - deadzone) / (lock - deadzone), 0, 1);
}

/** Translate a standard-mapping gamepad into the game's actions. */
export function readGamepad(pad, deadzone = 0.22) {
  const button = index => !!pad?.buttons?.[index]?.pressed;
  const value = index => pad?.buttons?.[index]?.value ?? (button(index) ? 1 : 0);
  let steer = pad?.axes?.[0] ?? 0;
  steer = Math.abs(steer) < deadzone ? 0 : Math.sign(steer) * (Math.abs(steer) - deadzone) / (1 - deadzone);
  if (steer === 0) steer = (button(15) ? 1 : 0) - (button(14) ? 1 : 0);
  return {
    accelerate: value(7) > 0.1 || button(0),
    brake: value(6) > 0.1 || button(1) || button(2),
    steer: clamp(steer, -1, 1),
    pause: button(9)
  };
}
