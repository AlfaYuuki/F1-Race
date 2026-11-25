import test from 'node:test';
import assert from 'node:assert/strict';
import { createPitStrategy } from '../js/pit-strategy.js';

test('pit strategy recommends a stop when fuel cannot cover the remaining race',()=>{
  const advice=createPitStrategy().update({lap:20,totalLaps:50,fuel:35,tireWear:25,compound:'MEDIUM',pitStops:0,weather:{rain:0}});
  assert.equal(advice.shouldPit,true);
  assert.equal(advice.status,'BOX THIS LAP');
  assert.ok(advice.fuelTarget>=20&&advice.fuelTarget<=100);
});

test('pit strategy selects intermediate tyres for wet conditions',()=>{
  const advice=createPitStrategy().update({lap:12,totalLaps:50,fuel:90,tireWear:10,compound:'MEDIUM',pitStops:0,weather:{rain:.7}});
  assert.equal(advice.compound,'INTER');
});

test('pit strategy favours hard tyres for a long dry stint and soft for a short finish',()=>{
  const strategy=createPitStrategy();
  assert.equal(strategy.update({lap:2,totalLaps:50,fuel:98,tireWear:0,compound:'MEDIUM',weather:{rain:0}}).compound,'HARD');
  assert.equal(strategy.update({lap:46,totalLaps:50,fuel:90,tireWear:5,compound:'MEDIUM',weather:{rain:0}}).compound,'SOFT');
});

test('pit strategy resets stint estimates after a pit stop',()=>{
  const strategy=createPitStrategy();
  strategy.update({lap:8,totalLaps:50,fuel:82,tireWear:20,compound:'SOFT',pitStops:0,weather:{rain:0}});
  const afterStop=strategy.update({lap:9,totalLaps:50,fuel:100,tireWear:0,compound:'HARD',pitStops:1,weather:{rain:0}});
  assert.equal(afterStop.projectedWear,Math.round(1.8*41));
});
