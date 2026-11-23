import { createGame } from './game.js';
import { bindControls } from './controls.js';
const canvas=document.querySelector('#race-canvas'),leaderboard=document.querySelector('#leaderboard-list');
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const startScreen=document.querySelector('#start-screen'),startButton=document.querySelector('#start-button');
const game=createGame(canvas,{
  onUpdate:({speed,lap,time,state,position,standings,offRoad})=>{
    document.querySelector('#speed-label').textContent=String(Math.round(speed)).padStart(3,'0');
    document.querySelector('#speed-bar').style.width=`${Math.min(100,speed/330*100)}%`;
    document.querySelector('#time-label').textContent=time;
    document.querySelector('#lap-label').innerHTML=`${String(lap).padStart(2,'0')}<span> / 03</span>`;
    document.querySelector('#position-label').innerHTML=`P${position}<span> / 06</span>`;
    document.querySelector('#status-label').textContent=offRoad?'OFF TRACK':state==='running'?'ENGINE ACTIVE':state==='finished'?'SESSION COMPLETE':state==='paused'?'PAUSED':'ENGINE STANDBY';
    if(state==='finished'){startScreen.classList.remove('hidden');startButton.textContent='RACE AGAIN ↗';}
    if(standings)leaderboard.innerHTML=standings.map((driver,index)=>`<li class="${driver.isPlayer?'player-row':''}"><span class="rank">${String(index+1).padStart(2,'0')}</span><i style="--driver-color:${driver.color}"></i><span>${escapeHtml(driver.name)}</span><b>${state==='ready'?'GRID':`L${Math.min(3,Math.floor(driver.distance/4563)+1)}`}</b></li>`).join('');
  },
  onMessage:message=>{document.querySelector('#race-message').textContent=message;},
  onStart:()=>{startScreen.classList.add('hidden');startButton.textContent='RESTART RACE ↗';},
  onPause:paused=>{document.querySelector('#pause-button').textContent=paused?'▶':'Ⅱ';}
});
bindControls(game);
startButton.addEventListener('click',()=>game.start());
document.querySelector('#pause-button').addEventListener('click',()=>game.togglePause());
document.querySelector('#fullscreen-button').addEventListener('click',async()=>{
  try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch(error){document.querySelector('#race-message').textContent='FULLSCREEN IS NOT AVAILABLE IN THIS BROWSER';}
});
game.init();
