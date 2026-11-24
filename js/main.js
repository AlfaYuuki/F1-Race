import { createGame } from './game.js';
import { bindControls } from './controls.js';
import { createEngineAudio } from './audio.js';
import { createChampionship } from './championship.js';
import { createGarage, CARS } from './garage.js';
import { LAP_DISTANCE, TOTAL_LAPS } from './track.js';
import { PLATFORMS, detectPlatform, loadSettings, saveSetting, controlHint } from './platform.js';

const canvas = document.querySelector('#race-canvas');
const leaderboard = document.querySelector('#leaderboard-list');
const startScreen = document.querySelector('#start-screen');
const startButton = document.querySelector('#start-button');
const championshipButton = document.querySelector('#championship-button');
const championshipSummary = document.querySelector('#championship-summary');
const audioButton = document.querySelector('#audio-button');
const audio = createEngineAudio();
const championship = createChampionship();
const garage = createGarage();
let raceRewardRecorded = false;
let championshipActive = false;
let roundRecorded = false;

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function renderChampionshipSummary() {
  const season = championship.getState();
  if (!season.hasSeason) {
    championshipSummary.textContent = '5 ROUNDS · POINTS SERIES · YOUR RESULTS SAVE ON THIS DEVICE';
    return;
  }
  const player = season.standings.find(driver => driver.id === 'player');
  const leader = season.standings[0];
  const status = season.completed ? 'SEASON COMPLETE' : `ROUND ${season.round + 1}/${championship.rounds}`;
  championshipSummary.textContent = `${status} · YOU: ${player?.points ?? 0} PTS · LEADER: ${leader.name} ${leader.points} PTS`;
  championshipButton.textContent = season.completed ? 'START NEW SEASON 🏆' :
    season.round > 0 ? 'NEXT CHAMPIONSHIP ROUND ↗' : 'START CHAMPIONSHIP 🏆';
}


function renderGarage() {
  const state = garage.getState();
  document.querySelector('#garage-credits').textContent = 'CR ' + state.credits.toLocaleString();
  document.querySelector('#garage-cars').innerHTML = CARS.map(car => {
    const owned = state.ownedCars.includes(car.id);
    const selected = state.selectedCar === car.id;
    return `<button type="button" class="garage-car ${selected?'selected':''}" data-car="${car.id}" style="--car-color:${car.id==='falcon'?state.livery:car.color}">
      <span class="car-swatch"></span><span><b>${car.name}</b><small>${car.className}</small><p>${car.description}</p><em>${owned?(selected?'SELECTED':'OWNED'):'CR '+car.price.toLocaleString()}</em></span></button>`;
  }).join('');
  const labels={power:'ENGINE',grip:'AERO / GRIP',braking:'BRAKES',durability:'CHASSIS'};
  document.querySelector('#garage-upgrades').innerHTML=Object.entries(state.upgrades).map(([key,level])=>{
    const price=350+level*300;
    return `<div class="garage-upgrade"><b>${labels[key]} · LV ${level}/5</b><small>LEVEL ${level} → ${Math.min(5,level+1)}</small><button type="button" data-upgrade="${key}" ${level>=5?'disabled':''}>${level>=5?'MAX LEVEL':'UPGRADE · CR '+price.toLocaleString()}</button></div>`;
  }).join('');
  document.querySelectorAll('[data-setup]').forEach(input=>{input.value=state.setup[input.dataset.setup];});
  document.querySelector('#garage-livery').value=state.livery;
  document.querySelector('#garage-feedback').textContent='Selected: '+garage.getCar().name+' · Upgrades and setup save on this device.';
}
function openGarage() {
  if(game.getState()==='running') game.togglePause();
  controls?.releaseAll();
  renderGarage();
  document.querySelector('#garage-screen').hidden=false;
}
function closeGarage() { document.querySelector('#garage-screen').hidden=true; }

// ---- Platform / control scheme ----
const platformScreen = document.querySelector('#platform-screen');
const platformClose = document.querySelector('#platform-close');
const tiltToggle = document.querySelector('#tilt-toggle');
const tiltInvertToggle = document.querySelector('#tilt-invert');
const tiltStatus = document.querySelector('#tilt-status');
const settings = loadSettings();
const detectedPlatform = detectPlatform();
let platform = settings.platform ?? detectedPlatform;
let hasChosenPlatform = settings.platform !== null;
let tiltEnabled = settings.tilt;
let tiltInvert = settings.tiltInvert;
let tiltReady = false;
let controls;

function applyPlatform() {
  const tiltOn = platform === 'android' && tiltEnabled;
  document.documentElement.dataset.platform = platform;
  document.body.classList.toggle('tilt-on', tiltOn && tiltReady);
  document.querySelector('#controls-help').textContent = controlHint(platform, tiltOn && tiltReady);
  document.querySelector('#platform-current').textContent = PLATFORMS[platform].label + (tiltOn ? ' + TILT' : '');
  for (const id of Object.keys(PLATFORMS)) {
    const card = document.querySelector(`#card-${id}`);
    card.classList.toggle('is-current', id === platform);
    card.classList.toggle('is-detected', id === detectedPlatform);
  }
  tiltToggle.checked = tiltEnabled;
  tiltInvertToggle.checked = tiltInvert;
  controls?.syncTilt();
}

function openPlatformPicker() {
  if (game.getState() === 'running') game.togglePause();
  controls?.releaseAll();
  tiltStatus.textContent = '';
  applyPlatform();
  platformClose.hidden = !hasChosenPlatform;
  platformScreen.hidden = false;
  document.querySelector(`#platform-${platform}`).focus();
}

function closePlatformPicker() {
  platformScreen.hidden = true;
}

function choosePlatform(id) {
  platform = id;
  hasChosenPlatform = true;
  saveSetting('platform', id);
  applyPlatform();
  closePlatformPicker();
}

const game = createGame(canvas, {
  onUpdate: ({ speed, lap, time, state, position, standings, offRoad, lastLap, bestLap, sector, sectorTime, fuel, tireWear, compound, damage, pitStops, pitPhase, weather, throttle, skid }) => {
    const gear = speed < 8 ? 0 : Math.min(8, Math.floor(speed / 42) + 1);
    const rpm = Math.round(Math.min(12000, 900 + (speed % 42) / 42 * 9300 + (state === 'running' ? 500 : 0)));

    document.querySelector('#speed-label').textContent = String(Math.round(speed)).padStart(3, '0');
    document.querySelector('#speed-bar').style.width = `${Math.min(100, speed / 330 * 100)}%`;
    document.querySelector('#gear-label').textContent = gear || 'N';
    document.querySelector('#rpm-label').textContent = `${Math.round(rpm / 100) * 100} RPM`;
    document.querySelector('#rpm-bar').style.width = `${Math.min(100, rpm / 12000 * 100)}%`;
    document.querySelector('#last-lap-label').textContent = lastLap || '--:--.---';
    document.querySelector('#best-lap-label').textContent = bestLap || '--:--.---';
    document.querySelector('#sector-label').textContent = `${sector || 'S1'} ${sectorTime || '--:--.---'}`;
    document.querySelector('#time-label').textContent = time;
    document.querySelector('#lap-label').innerHTML = `${String(lap).padStart(2, '0')}<span> / ${String(TOTAL_LAPS).padStart(2, '0')}</span>`;
    document.querySelector('#position-label').innerHTML = `P${position}<span> / 06</span>`;
    document.querySelector('#status-label').textContent = pitPhase ? 'PIT LANE' : offRoad ? 'OFF TRACK' :
      state === 'running' ? 'ENGINE ACTIVE' :
      state === 'finished' ? 'SESSION COMPLETE' :
      state === 'paused' ? 'PAUSED' : 'ENGINE STANDBY';

    document.querySelector('#fuel-value').textContent=Math.round(fuel)+'%';
    document.querySelector('#fuel-bar').style.width=fuel+'%';
    document.querySelector('#tyre-value').textContent=compound+' · '+Math.round(tireWear)+'%';
    document.querySelector('#tyre-bar').style.width=tireWear+'%';
    document.querySelector('#damage-value').textContent=Math.round(damage)+'%';
    document.querySelector('#pit-stops-value').textContent=String(pitStops);
    document.querySelector('#pit-button').textContent=pitPhase ? (pitPhase==='service'?'IN BOX':'PIT '+pitPhase.toUpperCase()) : 'BOX ↗';
    document.querySelector('#pit-button').disabled=state!=='running';
    audio.update(rpm, throttle ?? 0, gear, state === 'running', { skid: skid ?? 0, rain: weather?.rain ?? 0 });
    if (state === 'finished') {
      if (!raceRewardRecorded) { const reward=garage.awardCredits(position); raceRewardRecorded=true; document.querySelector('#garage-feedback').textContent='RACE REWARD · CR '+reward.toLocaleString(); renderGarage(); }
      if (championshipActive && !roundRecorded) {
        const season = championship.recordResult(standings);
        roundRecorded = true;
        const player = season.standings.find(driver => driver.id === 'player');
        const playerPosition = standings.findIndex(driver => driver.isPlayer) + 1;
        document.querySelector('#race-message').textContent = season.completed
          ? `CHAMPIONSHIP COMPLETE — YOU FINISHED P${season.standings.findIndex(driver => driver.id === 'player') + 1} · ${player.points} PTS`
          : `ROUND ${season.round} COMPLETE — P${playerPosition} · ${player.points} CHAMPIONSHIP POINTS`;
        renderChampionshipSummary();
      }
      startScreen.classList.remove('hidden');
      startButton.textContent = 'QUICK RACE ↗';
      championshipButton.classList.remove('hidden');
    }
    if (standings) {
      leaderboard.innerHTML = standings.map((driver, index) =>
        `<li class="${driver.isPlayer ? 'player-row' : ''}"><span class="rank">${String(index + 1).padStart(2, '0')}</span><i style="--driver-color:${driver.color}"></i><span>${escapeHtml(driver.name)}</span><b>${state === 'ready' ? 'GRID' : `L${Math.min(TOTAL_LAPS, Math.floor(driver.distance / LAP_DISTANCE) + 1)}`}</b></li>`
      ).join('');
    }
  },
  onMessage: message => {
    if (/PIT|YELLOW FLAG|GREEN FLAG|SAFETY CAR|TIME PENALTY|CONTACT|CHEQUERED/i.test(message)) audio.playRadio(message);
    document.querySelector('#race-message').textContent = platform === 'android'
      ? message.replace('PRESS ESC OR ▶', 'TAP ▶')
      : message;
  },
  onStart: () => {
    raceRewardRecorded=false;
    audio.resume();
    controls?.calibrate();
    startScreen.classList.add('hidden');
    roundRecorded = false;
    startButton.textContent = 'QUICK RACE ↗';
  },
  onPitService: active => { document.querySelector('#pit-overlay').hidden=!active; },
  onWeather: weather => {
    const root=document.querySelector('.race-game');
    root.dataset.weather=weather.rain>.65?'heavyRain':weather.rain>.12?'lightRain':weather.label==='OVERCAST'?'cloudy':'dry';
    const label=document.querySelector('.race-bottom>span:first-child');
    label.innerHTML='<i></i> '+(weather.safetyCar?'SAFETY CAR':weather.yellowFlag?'YELLOW FLAG':weather.label);
  },
  onPause: paused => {
    document.querySelector('#pause-button').textContent = paused ? '▶' : 'Ⅱ';
  }
});

controls = bindControls(game, {
  getPlatform: () => platform,
  getTilt: () => ({ enabled: tiltEnabled, invert: tiltInvert }),
  isBlocked: () => !platformScreen.hidden,
  onTilt: axis => document.querySelector('#tilt-dot').style.setProperty('--tilt', axis.toFixed(2)),
  onTiltReady: ready => { tiltReady = ready; applyPlatform(); }
});
const pitDialog=document.querySelector('#pit-dialog');
document.querySelector('#pit-button').addEventListener('click',()=>{if(game.getState()==='running')pitDialog.hidden=false;});
document.querySelector('#pit-cancel').addEventListener('click',()=>{pitDialog.hidden=true;});
document.querySelector('#pit-confirm').addEventListener('click',()=>{if(game.requestPit(document.querySelector('#pit-compound').value,Number(document.querySelector('#pit-fuel').value),document.querySelector('#pit-repair').checked))pitDialog.hidden=true;});
document.querySelector('#pit-fuel').addEventListener('input',event=>{document.querySelector('#fuel-choice').textContent=event.target.value+'%';});

startButton.addEventListener('click', () => {
  championshipActive = false;
  startScreen.classList.add('hidden');
  game.setCarConfig(garage.getCar());
  game.start();
});
championshipButton.addEventListener('click', () => {
  let season = championship.getState();
  if (!season.hasSeason || season.completed) season = championship.startNewSeason();
  championshipActive = true;
  startScreen.classList.add('hidden');
  game.setCarConfig(garage.getCar());
  renderChampionshipSummary();
  document.querySelector('#race-message').textContent = `CHAMPIONSHIP ROUND ${season.round + 1} OF ${championship.rounds}`;
  game.start();
});
audioButton.addEventListener('click', () => {
  const enabled = audio.toggle();
  audioButton.classList.toggle('muted', !enabled);
  audioButton.textContent = enabled ? '♫' : '♪';
});
window.addEventListener('keydown', event => {
  if (!platformScreen.hidden) {
    if (event.code === 'Escape' && hasChosenPlatform) { event.preventDefault(); closePlatformPicker(); }
    return;
  }
  if (event.repeat) return;
  if (event.code === 'KeyM') {
    const enabled = audio.toggle();
    audioButton.classList.toggle('muted', !enabled);
    audioButton.textContent = enabled ? '♫' : '♪';
  } else if (event.code === 'KeyF') {
    toggleFullscreen();
  }
});
document.querySelector('#pause-button').addEventListener('click', () => game.togglePause());
document.querySelector('#garage-open').addEventListener('click', openGarage);
document.querySelector('#garage-close').addEventListener('click', closeGarage);
document.querySelector('#garage-screen').addEventListener('click', event => {
  const carButton=event.target.closest('[data-car]');
  const upgradeButton=event.target.closest('[data-upgrade]');
  if(carButton){const id=carButton.dataset.car;const ok=garage.selectCar(id)||garage.purchaseCar(id);if(ok){game.setCarConfig(garage.getCar());renderGarage();}else document.querySelector('#garage-feedback').textContent='Not enough credits to unlock this car.';}
  if(upgradeButton){const ok=garage.upgrade(upgradeButton.dataset.upgrade);if(ok){game.setCarConfig(garage.getCar());renderGarage();}else document.querySelector('#garage-feedback').textContent='Upgrade unavailable — check credits or level cap.';}
});
document.querySelectorAll('[data-setup]').forEach(input=>input.addEventListener('input',()=>{garage.setSetup(input.dataset.setup,input.value);game.setCarConfig(garage.getCar());}));
document.querySelector('#garage-livery').addEventListener('input',event=>{garage.setLivery(event.target.value);renderGarage();game.setCarConfig(garage.getCar());});
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    document.querySelector('#race-message').textContent = 'FULLSCREEN IS NOT AVAILABLE IN THIS BROWSER';
  }
}
document.querySelector('#fullscreen-button').addEventListener('click', toggleFullscreen);

// ---- Platform picker events ----
document.querySelector('#controls-button').addEventListener('click', openPlatformPicker);
document.querySelector('#platform-change').addEventListener('click', openPlatformPicker);
platformClose.addEventListener('click', closePlatformPicker);
document.querySelectorAll('.platform-choice').forEach(button => {
  button.addEventListener('click', () => choosePlatform(button.dataset.platform));
});
tiltToggle.addEventListener('change', async () => {
  if (!tiltToggle.checked) {
    tiltEnabled = false;
    saveSetting('tilt', false);
    tiltStatus.textContent = '';
    applyPlatform();
    return;
  }
  tiltStatus.textContent = 'CHECKING TILT SENSOR…';
  const ok = await controls.requestTiltAccess();
  tiltEnabled = ok;
  saveSetting('tilt', ok);
  tiltStatus.textContent = ok ? 'TILT READY — HOLD YOUR PHONE LEVEL, LIKE A WHEEL' : 'NO TILT SENSOR FOUND — USING BUTTONS INSTEAD';
  applyPlatform();
});
tiltInvertToggle.addEventListener('change', () => {
  tiltInvert = tiltInvertToggle.checked;
  saveSetting('tiltInvert', tiltInvert);
});

renderChampionshipSummary();
renderGarage();
game.init();
applyPlatform();
if (!hasChosenPlatform) openPlatformPicker();
