import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePitStrategy } from '../js/pit-strategy.js';
test('wet conditions recommend intermediates',()=>{const p=evaluatePitStrategy({lap:12,totalLaps:50,fuel:80,tireWear:20,compound:'MEDIUM',weather:{rain:.82}});assert.equal(p.targetCompound,'INTER');assert.equal(p.requiredStop,true);});
test('fuel range triggers a stop before the remaining distance',()=>{const p=evaluatePitStrategy({lap:30,totalLaps:50,fuel:18,fuelFlow:14,lastLapMs:90000,tireWear:10,compound:'HARD',weather:{rain:0}});assert.equal(p.requiredStop,true);assert.ok(p.fuelRange<p.remaining);});
test('healthy tyres and sufficient fuel recommend staying out',()=>{const p=evaluatePitStrategy({lap:4,totalLaps:20,fuel:95,fuelFlow:3,tireWear:5,compound:'HARD',weather:{rain:0}});assert.equal(p.requiredStop,false);assert.equal(p.urgency,'STAY OUT');});
test('late dry stint recommends soft tyres and fuel target stays within tank capacity',()=>{const p=evaluatePitStrategy({lap:47,totalLaps:50,fuel:30,tireWear:80,compound:'MEDIUM',weather:{rain:0}});assert.equal(p.targetCompound,'SOFT');assert.ok(p.fuelTarget<=100);});
