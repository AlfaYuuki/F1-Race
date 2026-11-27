import test from 'node:test';
import assert from 'node:assert/strict';
import { getWeatherVisuals, getSurfaceEffects } from '../js/immersion.js';

test('weather visuals blend rain into wetness and visibility',()=>{
  const dry=getWeatherVisuals({rain:0,current:'dry'});
  const wet=getWeatherVisuals({rain:.8,current:'heavyRain'});
  assert.equal(dry.wetness,0);
  assert.ok(wet.wetness>dry.wetness);
  assert.ok(wet.visibility<dry.visibility);
  assert.ok(wet.rain<=1);
});

test('surface effects respond to speed, skid, off-road and rain',()=>{
  const calm=getSurfaceEffects({speed:20,skid:0,offRoad:false,weather:{rain:0}});
  const race=getSurfaceEffects({speed:180,skid:.8,offRoad:true,impact:.5,weather:{rain:.7}});
  assert.equal(calm.smoke,0);
  assert.ok(race.smoke>0);
  assert.ok(race.sparks>0);
  assert.ok(race.spray>0);
});

test('effect intensities stay within safe rendering bounds',()=>{
  const effects=getSurfaceEffects({speed:900,skid:5,offRoad:true,impact:10,weather:{rain:5}});
  for(const key of ['smoke','sparks','spray','rain','wetness','cloud','visibility']){
    assert.ok(effects[key]>=0&&effects[key]<=1,key+' out of range');
  }
});
