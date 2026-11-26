import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpponents } from '../js/opponents.js';
import {
  getDriverPersonality,
  calculatePersonalityPace,
  calculateTyreWearMultiplier,
  shouldAttemptOvertake,
  getDefensiveLaneOffset
} from '../js/ai-personalities.js';
import { LAP_DISTANCE, curveAt } from '../js/track.js';

test('all nineteen rivals have a distinct, bounded racing identity', () => {
  const ai=createOpponents(LAP_DISTANCE);
  assert.equal(ai.drivers.length,19);
  const styles=ai.drivers.map(driver=>driver.personality.style);
  assert.equal(new Set(styles).size,19);
  for(const driver of ai.drivers){
    for(const key of ['overtaking','defense','consistency','wetSkill','tyreCare','risk']){
      assert.ok(driver.personality[key]>=0 && driver.personality[key]<=1, key);
    }
  }
});

test('personality pace remains bounded and wet specialists lose less pace in rain', () => {
  const rainAce=getDriverPersonality('mori');
  const drySpecialist=getDriverPersonality('sato');
  const wetDelta=calculatePersonalityPace(rainAce,{phase:0,rain:1,cornerLoad:.7});
  const dryDelta=calculatePersonalityPace(drySpecialist,{phase:0,rain:1,cornerLoad:.7});
  assert.ok(Number.isFinite(wetDelta));
  assert.ok(wetDelta>dryDelta);
  assert.ok(Math.abs(wetDelta)<=8);
});

test('tyre savers preserve tyres better than aggressive wear profiles', () => {
  assert.ok(calculateTyreWearMultiplier(getDriverPersonality('andersson')) <
    calculateTyreWearMultiplier(getDriverPersonality('brown')));
});

test('overtaking decisions reflect risk and safe traffic gaps', () => {
  assert.equal(shouldAttemptOvertake(getDriverPersonality('petrov'),10),true);
  assert.equal(shouldAttemptOvertake(getDriverPersonality('andersson'),10),false);
  assert.equal(shouldAttemptOvertake(getDriverPersonality('petrov'),10,true),false);
  assert.equal(shouldAttemptOvertake(getDriverPersonality('petrov'),35),false);
});

test('defensive traits produce a stable lane preference', () => {
  const defender=getDefensiveLaneOffset(getDriverPersonality('tanaka'));
  const attacker=getDefensiveLaneOffset(getDriverPersonality('sato'));
  assert.ok(defender>attacker);
  assert.ok(Math.abs(defender)<=.08);
});

test('personality-driven opponents complete updates with finite race state', () => {
  const ai=createOpponents(LAP_DISTANCE);
  ai.reset(10);
  for(let i=0;i<900;i++) ai.update(1/60, i*2, curveAt, {rain:i>450?.4:0,wear:1,grip:.9});
  assert.equal(ai.getStandings(1800).length,20);
  for(const driver of ai.drivers){
    assert.ok(Number.isFinite(driver.speed));
    assert.ok(Number.isFinite(driver.distance));
    assert.ok(driver.tireWear>=0 && driver.tireWear<=100);
  }
});


test('AI only counts a pass after its distance crosses the selected rival', () => {
  const field = createOpponents(LAP_DISTANCE);
  field.reset(20);
  const attacker = field.drivers.find(driver => driver.id === 'sato');
  const target = field.drivers.find(driver => driver.id === 'tanaka');
  for (const driver of field.drivers) {
    driver.distance = -1000;
    driver.currentLane = 1;
    driver.speed = 200;
  }
  attacker.distance = 0;
  attacker.currentLane = 0;
  attacker.launchTimer = 0;
  attacker.speed = 300;
  attacker.pace = 285;
  target.pace = 125;
  target.distance = 10;
  target.currentLane = 0;
  target.launchTimer = 0;
  target.speed = 200;
  field.update(.1, -1000, () => 0, {});
  assert.equal(attacker.overtakes, 0);
  assert.equal(attacker.overtakeTargetId, 'tanaka');
  for (let i = 0; i < 12 && attacker.overtakes === 0; i++) field.update(.1, -1000, () => 0, {});
  assert.equal(attacker.overtakes, 1);
  assert.equal(attacker.overtakeTargetId, null);
});

test('AI does not initiate overtaking while yellow flag or safety car is active', () => {
  for (const neutralisation of [{ yellowFlag: true }, { safetyCar: true }]) {
    const field = createOpponents(LAP_DISTANCE);
    field.reset(20);
    const attacker = field.drivers.find(driver => driver.id === 'sato');
    const target = field.drivers.find(driver => driver.id === 'tanaka');
    for (const driver of field.drivers) {
      driver.distance = -1000;
      driver.currentLane = 1;
      driver.speed = 200;
    }
    attacker.distance = 0;
    attacker.currentLane = 0;
    target.distance = 10;
    target.currentLane = 0;
    field.update(1 / 60, -1000, () => 0, neutralisation);
    assert.equal(attacker.overtakeTargetId, null);
    assert.equal(attacker.overtakes, 0);
  }
});


test('AI pit decisions react to race distance, fuel and changing weather', () => {
  const field = createOpponents(LAP_DISTANCE);
  field.reset(20);
  const driver = field.drivers.find(item => item.id === 'mori');
  driver.distance = 0;
  driver.launchTimer = 0;
  driver.fuel = 5;
  driver.speed = 220;
  field.update(1 / 60, -1000, () => 0, { totalLaps: 10, rain: 0 });
  assert.ok(driver.pitTimer > 0, 'low fuel must trigger a strategic stop');
  assert.equal(driver.pitReason, 'fuel');

  const wetField = createOpponents(LAP_DISTANCE);
  wetField.reset(20);
  const wetDriver = wetField.drivers.find(item => item.id === 'mori');
  wetDriver.launchTimer = 0;
  wetDriver.distance = 0;
  wetDriver.speed = 220;
  wetField.update(1 / 60, -1000, () => 0, { totalLaps: 10, rain: 0.8 });
  assert.ok(wetDriver.pitTimer > 0, 'rain tyre mismatch must trigger a stop');
  assert.equal(wetDriver.pitReason, 'weather');
});

test('AI exposes pressure, defensive state, rival memory and bounded mistakes', () => {
  const field = createOpponents(LAP_DISTANCE);
  field.reset(20);
  const driver = field.drivers.find(item => item.id === 'sato');
  assert.ok(driver.personality);
  assert.ok(driver.relationshipMemory);
  assert.equal(driver.mistakes, 0);
  for (let i = 0; i < 600; i++) {
    field.update(1 / 60, i * 2, curveAt, { totalLaps: 10, rain: i > 300 ? 0.35 : 0 });
  }
  for (const rival of field.drivers) {
    assert.ok(Number.isFinite(rival.pressure));
    assert.ok(rival.pressure >= 0 && rival.pressure <= 1);
    assert.ok(Number.isFinite(rival.currentLane));
    assert.ok(rival.currentLane >= -0.76 && rival.currentLane <= 0.76);
    assert.ok(rival.mistakes >= 0);
  }
});

test('AI pit stops are capped and neutralisation prevents passing attempts', () => {
  const field = createOpponents(LAP_DISTANCE);
  field.reset(20);
  const attacker = field.drivers.find(driver => driver.id === 'sato');
  const target = field.drivers.find(driver => driver.id === 'tanaka');
  for (const driver of field.drivers) {
    driver.distance = -1000;
    driver.currentLane = 1;
    driver.speed = 200;
  }
  attacker.distance = 0;
  attacker.currentLane = 0;
  attacker.launchTimer = 0;
  target.distance = 10;
  target.currentLane = 0;
  target.launchTimer = 0;
  field.update(1 / 60, -1000, () => 0, { yellowFlag: true, totalLaps: 10 });
  assert.equal(attacker.overtakeTargetId, null);
  assert.equal(attacker.overtakes, 0);
});
