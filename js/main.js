import { createGame } from './game.js';
import { bindControls } from './controls.js';

const canvas = document.querySelector('#race-canvas');
const leaderboard = document.querySelector('#leaderboard-list');
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

const game = createGame(canvas, {
  onUpdate: ({ speed, lap, time, state, position, standings }) => {
    document.querySelector('#speed-label').textContent = Math.round(speed);
    document.querySelector('#time-label').textContent = time;
    document.querySelector('#lap-label').innerHTML = `${String(lap).padStart(2,'0')} <span>/ 03</span>`;
    document.querySelector('#session-label').textContent = state === 'running' ? 'RACING' : state.toUpperCase();
    document.querySelector('#position-label').innerHTML = `P${position} <span>/ 06</span>`;
    document.querySelector('#status-label').textContent = state === 'running' ? 'ENGINE ACTIVE' : state === 'finished' ? 'SESSION COMPLETE' : 'ENGINE STANDBY';
    if (standings) {
      leaderboard.innerHTML = standings.map((driver,index) => `
        <li class="${driver.isPlayer ? 'player-row' : ''}">
          <span class="rank">${String(index+1).padStart(2,'0')}</span>
          <span class="driver-swatch" style="--driver-color:${driver.color}"></span>
          <span class="driver-name">${escapeHtml(driver.name)}${driver.isPlayer ? ' <small>PLAYER</small>' : ''}</span>
          <b>${state === 'ready' ? 'GRID' : `L${Math.min(3,Math.floor(driver.distance/1350)+1)}`}</b>
        </li>`).join('');
    }
  },
  onMessage: message => { document.querySelector('#race-message').textContent = message; }
});
bindControls(game);
document.querySelector('#start-button').addEventListener('click', () => game.start());
game.init();
