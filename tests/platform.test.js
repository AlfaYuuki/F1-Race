import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, loadSettings, saveSetting, controlHint, gravityRoll, tiltSteer, readGamepad } from '../js/platform.js';
import { createPhysics } from '../js/physics.js';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
};

test('detectPlatform picks Android, Windows and falls back by touch support', () => {
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile', maxTouchPoints: 5 }), 'android');
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130', maxTouchPoints: 0 }), 'windows');
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile Safari', maxTouchPoints: 5 }), 'android');
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 0 }), 'windows');
});

test('settings round-trip through storage and ignore junk values', () => {
  const storage = memoryStorage();
  assert.deepEqual(loadSettings(storage), { platform: null, tilt: false, tiltInvert: false });
  saveSetting('platform', 'android', storage);
  saveSetting('tilt', true, storage);
  saveSetting('tiltInvert', true, storage);
  assert.deepEqual(loadSettings(storage), { platform: 'android', tilt: true, tiltInvert: true });
  storage.setItem('f1race.platform', 'amiga');
  assert.equal(loadSettings(storage).platform, null);
  assert.equal(saveSetting('bogus', 1, storage), false);
  assert.equal(loadSettings(null).platform, null);
});

test('control hints differ per platform', () => {
  assert.match(controlHint('windows'), /W\/↑/);
  assert.match(controlHint('android'), /TAP ◀ ▶/);
  assert.match(controlHint('android', true), /TILT/);
});

test('gravityRoll reports clockwise tilt as positive in every screen orientation', () => {
  const g = 9.81 / 2; // gravity component for a 30 degree roll
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !~ ${expected}`);
  near(gravityRoll(-g, 0, 0), 30);     // portrait, rolled clockwise
  near(gravityRoll(g, 0, 0), -30);     // portrait, rolled anticlockwise
  near(gravityRoll(0, g, 90), 30);     // landscape (angle 90)
  near(gravityRoll(g, 0, 180), 30);    // portrait upside down
  near(gravityRoll(0, -g, 270), 30);   // landscape (angle 270)
  near(gravityRoll(0, 0, 0), 0);
  assert.ok(Number.isNaN(gravityRoll(undefined, 1, 0)));
});

test('tiltSteer applies dead zone, full lock, neutral offset and inversion', () => {
  assert.equal(tiltSteer(3), 0);
  assert.equal(tiltSteer(60), 1);
  assert.equal(tiltSteer(-60), -1);
  assert.ok(tiltSteer(16) > 0 && tiltSteer(16) < 1);
  assert.equal(tiltSteer(25, 25), 0);
  assert.equal(tiltSteer(40, 25) > 0, true);
  assert.equal(tiltSteer(40, 0, { invert: true }), -1);
  assert.equal(tiltSteer(NaN), 0);
});

test('readGamepad maps triggers, stick, d-pad and start', () => {
  const pad = { axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  assert.deepEqual(readGamepad(pad), { accelerate: false, brake: false, steer: 0, pause: false });
  pad.buttons[7] = { pressed: true, value: 0.9 };
  pad.buttons[6] = { pressed: true, value: 0.5 };
  pad.buttons[9] = { pressed: true, value: 1 };
  pad.axes[0] = 1;
  const full = readGamepad(pad);
  assert.equal(full.accelerate && full.brake && full.pause, true);
  assert.equal(full.steer, 1);
  pad.axes[0] = 0.1;
  pad.buttons[14] = { pressed: true, value: 1 };
  assert.equal(readGamepad(pad).steer, -1);
});

test('physics analog steering moves the car and leaves digital steering unchanged', () => {
  const drive = (axis, keys = []) => {
    const physics = createPhysics();
    const input = new Set(['accelerate', ...keys]);
    for (let i = 0; i < 120; i++) physics.update(1 / 60, input, 0, axis);
    return physics.playerX;
  };
  assert.ok(drive(1) > 0.05);
  assert.ok(drive(-1) < -0.05);
  assert.ok(Math.abs(drive(0)) < 1e-9);
  assert.ok(Math.abs(drive(undefined, ['right']) - drive(0, ['right'])) < 1e-12);
  assert.ok(Math.abs(drive(0.5) ) < Math.abs(drive(1)));
});
