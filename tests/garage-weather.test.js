import test from 'node:test';
import assert from 'node:assert/strict';
import { createGarage, CARS } from '../js/garage.js';
import { createWeather } from '../js/weather.js';

function memoryStorage() {
  const data = new Map();
  return { getItem:key=>data.get(key)??null, setItem:(key,value)=>data.set(key,String(value)) };
}

test('garage persists owned cars, upgrades, setup and livery', () => {
  const storage=memoryStorage(),garage=createGarage(storage);
  assert.equal(garage.getState().selectedCar,'falcon');
  assert.equal(garage.purchaseCar('vortex'),true);
  assert.equal(garage.selectCar('vortex'),true);
  assert.equal(garage.upgrade('power'),true);
  garage.setSetup('aero',80);
  garage.setLivery('#336699');
  const restored=createGarage(storage);
  assert.equal(restored.getState().selectedCar,'vortex');
  assert.equal(restored.getState().upgrades.power,1);
  assert.equal(restored.getState().setup.aero,80);
  assert.equal(restored.getState().livery,'#336699');
  assert.ok(restored.getCar().stats.power>CARS[1].stats.power);
});

test('garage rejects invalid purchases, upgrades and livery values', () => {
  const garage=createGarage(memoryStorage());
  assert.equal(garage.purchaseCar('unknown'),false);
  assert.equal(garage.upgrade('unknown'),false);
  assert.equal(garage.setLivery('red'),false);
  assert.equal(garage.setSetup('aero',150),true);
  assert.equal(garage.getState().setup.aero,100);
});

test('weather transitions from dry to rain and reports a grip reduction', () => {
  const weather=createWeather(()=>.5);
  weather.reset();
  const dry=weather.getState();
  assert.equal(dry.grip,1);
  let state;
  for(let i=0;i<80;i++) state=weather.update(1);
  assert.ok(state.rain>.1);
  assert.ok(state.grip<1);
  assert.ok(['LIGHT RAIN','HEAVY RAIN'].includes(state.label));
});
