import { createGame } from './game.js';
import { bindControls } from './controls.js';

const canvas = document.querySelector('#race-canvas');
const game = createGame(canvas, {
  onUpdate: ({ speed, lap, time, state }) => {
    document.querySelector('#speed-label').textContent = Math.round(speed);
    document.querySelector('#lap-label').innerHTML = `${String(lap).padStart(2,'0')} <span>/ 03</span>`;
    document.querySelector('#time-label').textContent = time;
    document.querySelector('#session-label').textContent = state === 'running' ? 'RACING' : state.toUpperCase();
    document.querySelector('#status-label').textContent = state === 'running' ? 'ENGINE ACTIVE' : state === 'finished' ? 'SESSION COMPLETE' : 'ENGINE STANDBY';
  },
  onMessage: message => { document.querySelector('#race-message').textContent = message; }
});
bindControls(game);
document.querySelector('#start-button').addEventListener('click', () => game.start());
game.init();
