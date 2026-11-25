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
