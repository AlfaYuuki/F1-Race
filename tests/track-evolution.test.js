import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeather } from '../js/weather.js';
import { createTrackEvolution } from '../js/track-evolution.js';
import { createPhysics } from '../js/physics.js';

test('weather transitions smoothly and exposes a forecast',()=>{
  const weather=createWeather(()=>.5);weather.reset();
  assert.equal(weather.getState().rain,0);
  let state;
  for(let i=0;i<80;i++)state=weather.update(1);
  assert.ok(state.rain>.1);assert.ok(state.grip<1);
  assert.ok(state.forecast);assert.ok(state.nextChangeIn>0);
});

test('track surface gets wetter in rain and grip falls',()=>{
  const track=createTrackEvolution();track.reset(24);
  const dry=track.sample(.2,0);
  for(let i=0;i<80;i++)track.update(.1,{rain:.8,temperature:19},20);
  const wet=track.sample(.2,0);
  assert.ok(wet.wetness>0);assert.ok(wet.grip<dry.grip);
});

test('rubber builds on the racing line and rain washes it away',()=>{
  const track=createTrackEvolution();track.reset(24);
  for(let i=0;i<600;i++)track.update(.1,{rain:0,temperature:26},20);
  const rubbered=track.getState().rubber;
  assert.ok(rubbered>.08);
  for(let i=0;i<600;i++)track.update(.1,{rain:.9,temperature:18},20);
  assert.ok(track.getState().rubber<rubbered);
});

test('track samples give the racing line more grip than the dirty line',()=>{
  const track=createTrackEvolution();track.reset(25);
  for(let i=0;i<1000;i++)track.update(.1,{rain:0,temperature:25},35);
  assert.ok(track.sample(.4,0).grip>track.sample(.4,.9).grip);
});

test('weather clamps unusually large frame deltas to a safe simulation step',()=>{
  const weather=createWeather(()=>.5);
  weather.reset();
  const state=weather.update(100);
  assert.equal(state.nextChangeIn,62);
});

test('evolving track grip is applied to player physics',()=>{
  const normal=createPhysics(),wetSurface=createPhysics();
  normal.speed=wetSurface.speed=180;
  normal.update(.1,new Set(),0,0,{trackGrip:1});
  wetSurface.update(.1,new Set(),0,0,{trackGrip:.55});
  assert.ok(wetSurface.getTelemetry().grip<normal.getTelemetry().grip);
});
