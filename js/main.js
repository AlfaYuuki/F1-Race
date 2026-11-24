import { createGame } from './game.js';
import { bindControls } from './controls.js';
import { createEngineAudio } from './audio.js';
import { createChampionship } from './championship.js';

const canvas = document.querySelector('#race-canvas');
const leaderboard = document.querySelector('#leaderboard-list');
const startScreen = document.querySelector('#start-screen');
const startButton = document.querySelector('#start-button');
const championshipButton = document.querySelector('#championship-button');
const championshipSummary = document.querySelector('#championship-summary');
const audioButton = document.querySelector('#audio-button');
const audio = createEngineAudio();
const championship = createChampionship();
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

const game = createGame(canvas, {
  onUpdate: ({ speed, lap, time, state, position, standings, offRoad, lastLap, bestLap, sector, sectorTime }) => {
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
    document.querySelector('#lap-label').innerHTML = `${String(lap).padStart(2, '0')}<span> / 03</span>`;
    document.querySelector('#position-label').innerHTML = `P${position}<span> / 06</span>`;
    document.querySelector('#status-label').textContent = offRoad ? 'OFF TRACK' :
      state === 'running' ? 'ENGINE ACTIVE' :
      state === 'finished' ? 'SESSION COMPLETE' :
      state === 'paused' ? 'PAUSED' : 'ENGINE STANDBY';

    audio.update(rpm, 0, gear, state === 'running');
    if (state === 'finished') {
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
        `<li class="${driver.isPlayer ? 'player-row' : ''}"><span class="rank">${String(index + 1).padStart(2, '0')}</span><i style="--driver-color:${driver.color}"></i><span>${escapeHtml(driver.name)}</span><b>${state === 'ready' ? 'GRID' : `L${Math.min(3, Math.floor(driver.distance / 4563) + 1)}`}</b></li>`
      ).join('');
    }
  },
  onMessage: message => {
    document.querySelector('#race-message').textContent = message;
  },
  onStart: () => {
    audio.resume();
    startScreen.classList.add('hidden');
    roundRecorded = false;
    startButton.textContent = 'QUICK RACE ↗';
  },
  onPause: paused => {
    document.querySelector('#pause-button').textContent = paused ? '▶' : 'Ⅱ';
  }
});

bindControls(game);

startButton.addEventListener('click', () => {
  championshipActive = false;
  game.start();
});
championshipButton.addEventListener('click', () => {
  let season = championship.getState();
  if (!season.hasSeason || season.completed) season = championship.startNewSeason();
  championshipActive = true;
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
  if (event.code === 'KeyM') {
    const enabled = audio.toggle();
    audioButton.classList.toggle('muted', !enabled);
    audioButton.textContent = enabled ? '♫' : '♪';
  }
});
document.querySelector('#pause-button').addEventListener('click', () => game.togglePause());
document.querySelector('#fullscreen-button').addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    document.querySelector('#race-message').textContent = 'FULLSCREEN IS NOT AVAILABLE IN THIS BROWSER';
  }
});

renderChampionshipSummary();
game.init();
