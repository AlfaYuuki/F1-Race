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

test('garage ignores malformed or out-of-range saved configuration', () => {
  const storage=memoryStorage();
  storage.setItem('the-f1-race-garage-v1',JSON.stringify({
    credits:Infinity,selectedCar:'missing',ownedCars:['falcon'],
    upgrades:{power:99,grip:0,braking:0,durability:0},
    setup:{aero:50,suspension:50,brakeBias:56,differential:50},livery:'bad'
  }));
  const garage=createGarage(storage);
  assert.equal(garage.getState().selectedCar,'falcon');
  assert.equal(garage.getState().credits,2500);
  assert.equal(garage.getState().upgrades.power,0);
});

test('garage repairs partial legacy saves without discarding owned cars or credits', () => {
  const storage=memoryStorage();
  storage.setItem('the-f1-race-garage-v1',JSON.stringify({
    credits:900,selectedCar:'vortex',ownedCars:['falcon','vortex'],
    upgrades:{power:2},setup:{aero:70}
  }));
  const garage=createGarage(storage);
  const state=garage.getState();
  assert.equal(state.credits,900);
  assert.equal(state.selectedCar,'vortex');
  assert.deepEqual(state.ownedCars,['falcon','vortex']);
  assert.equal(state.upgrades.power,2);
  assert.equal(state.upgrades.grip,0);
  assert.equal(state.setup.aero,70);
  assert.equal(state.setup.suspension,50);
  assert.equal(state.livery,'#ed3548');
});
