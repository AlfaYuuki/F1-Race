const STORAGE_KEY = 'the-f1-race-garage-v1';

export const CARS = [
  { id:'falcon', name:'FALCON GP', className:'BALANCED', color:'#ed3548', price:0, stats:{ power:1, grip:1, braking:1, durability:1 }, description:'A predictable all-rounder for every circuit.' },
  { id:'vortex', name:'VORTEX R', className:'HIGH DOWNFORCE', color:'#42a5df', price:1200, stats:{ power:.96, grip:1.12, braking:1.1, durability:.98 }, description:'Confident through fast corners with extra grip.' },
  { id:'titan', name:'TITAN V8', className:'POWER', color:'#e8b94b', price:1600, stats:{ power:1.12, grip:.96, braking:.96, durability:1.04 }, description:'Strong acceleration and top speed on long straights.' }
];

const DEFAULT_STATE = {
  credits: 2500, selectedCar: 'falcon',
  ownedCars: ['falcon'],
  upgrades: { power:0, grip:0, braking:0, durability:0 },
  setup: { aero:50, suspension:50, brakeBias:56, differential:50 },
  livery: '#ed3548'
};
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
const copy = value => JSON.parse(JSON.stringify(value));

export function createGarage(storage = (() => { try { return globalThis.localStorage; } catch { return null; } })()) {
  let state = copy(DEFAULT_STATE);
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
    const validCars = Array.isArray(saved?.ownedCars) && saved.ownedCars.length > 0 &&
      saved.ownedCars.every(id => CARS.some(car => car.id === id)) &&
      CARS.some(car => car.id === saved.selectedCar) && saved.ownedCars.includes(saved.selectedCar);
    if (validCars) {
      const upgrades = Object.fromEntries(Object.keys(DEFAULT_STATE.upgrades).map(key => {
        const value = saved.upgrades?.[key];
        return [key, Number.isInteger(value) && value >= 0 && value <= 5 ? value : DEFAULT_STATE.upgrades[key]];
      }));
      const setup = Object.fromEntries(Object.keys(DEFAULT_STATE.setup).map(key => {
        const value = saved.setup?.[key];
        return [key, Number.isFinite(value) && value >= 0 && value <= 100 ? value : DEFAULT_STATE.setup[key]];
      }));
      const credits = Number(saved.credits);
      state = {
        credits: Number.isFinite(credits) ? Math.max(0, credits) : DEFAULT_STATE.credits,
        selectedCar: saved.selectedCar,
        ownedCars: [...new Set(['falcon', ...saved.ownedCars])],
        upgrades,
        setup,
        livery: /^#[0-9a-f]{6}$/i.test(saved.livery || '') ? saved.livery : DEFAULT_STATE.livery
      };
      // Store the normalized form so backups and future loads see the same valid state.
      try { storage?.setItem?.(STORAGE_KEY, JSON.stringify(state)); } catch { /* Storage may be read-only. */ }
    }
  } catch { /* Start with a clean garage if storage is unavailable or corrupt. */ }

  function save() {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Private browsing may disable storage. */ }
  }
  function getState() { return copy(state); }
  function getCar() {
    const car = CARS.find(item => item.id === state.selectedCar) || CARS[0];
    const upgrades = state.upgrades;
    const setup = state.setup;
    return {
      ...car,
      color: state.livery,
      stats: {
        power: car.stats.power * (1 + upgrades.power * .035),
        grip: car.stats.grip * (1 + upgrades.grip * .025) * (.9 + setup.aero / 500),
        braking: car.stats.braking * (1 + upgrades.braking * .03) * (.92 + setup.brakeBias / 700),
        durability: car.stats.durability * (1 + upgrades.durability * .04)
      },
      setup: { ...setup }
    };
  }
  function selectCar(id) {
    if (!CARS.some(car => car.id === id) || !state.ownedCars.includes(id)) return false;
    state.selectedCar = id; save(); return true;
  }
  function purchaseCar(id) {
    const car = CARS.find(item => item.id === id);
    if (!car || state.ownedCars.includes(id) || state.credits < car.price) return false;
    state.credits -= car.price; state.ownedCars.push(id); state.selectedCar = id; save(); return true;
  }
  function upgrade(key) {
    if (!Object.hasOwn(state.upgrades, key) || state.upgrades[key] >= 5) return false;
    const price = 350 + state.upgrades[key] * 300;
    if (state.credits < price) return false;
    state.credits -= price; state.upgrades[key]++; save(); return true;
  }
  function setSetup(key, value) {
    if (!Object.hasOwn(state.setup, key)) return false;
    state.setup[key] = clamp(Number(value) || 0, 0, 100); save(); return true;
  }
  function setLivery(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return false;
    state.livery = color; save(); return true;
  }
  function addCredits(amount) {
    const reward=Math.max(0,Math.min(100000,Math.floor(Number(amount)||0)));
    state.credits+=reward;save();return reward;
  }
  function awardCredits(position) {
    const reward = [1200,850,650,500,400,300][clamp(position - 1,0,5)] || 300;
    state.credits += reward; save(); return reward;
  }
  return { getState, getCar, selectCar, purchaseCar, upgrade, setSetup, setLivery, addCredits, awardCredits };
}
