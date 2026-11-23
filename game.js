import { createPhysics } from './physics.js';
import { createRenderer } from './renderer.js';
import { curveAt } from './track.js';

const formatTime = ms => {
  const minutes = Math.floor(ms/60000), seconds = Math.floor(ms/1000)%60, millis = Math.floor(ms%1000);
  return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(millis).padStart(3,'0')}`;
};
export function createGame(canvas, callbacks = {}) {
  const physics = createPhysics(), renderer = createRenderer(canvas), input = new Set();
  let state='ready', last=0, elapsed=0, raceDistance=0, lap=1, countdownTimer=null, raf=0;
  const LAP_DISTANCE=1350;
  const notify = message => callbacks.onMessage?.(message);
  function setInput(action, active){ active ? input.add(action) : input.delete(action); }
  function start(){
    if(state==='running'||state==='countdown') return;
    cancelAnimationFrame(raf); clearInterval(countdownTimer);
    physics.speed=0;physics.playerX=0;physics.distance=0;elapsed=0;raceDistance=0;lap=1;state='countdown';
    notify('GET READY');let count=3;
    const counter=document.querySelector('#countdown');counter.textContent=count;
    countdownTimer=setInterval(()=>{
      count--;
      if(count>0) counter.textContent=count;
      else if(count===0) counter.textContent='GO!';
      else {clearInterval(countdownTimer);counter.textContent='';state='running';notify('GOOD LUCK — FIND YOUR RACING LINE');last=performance.now();raf=requestAnimationFrame(frame);}
    },750);
    updateHud();
  }
  function updateHud(){
    callbacks.onUpdate?.({speed:physics.speed,lap,time:formatTime(elapsed),state});
  }
  function frame(now){
    if(state!=='running') return;
    const dt=Math.min((now-last)/1000,.04);last=now;elapsed+=dt*1000;
    const curve=curveAt((raceDistance%LAP_DISTANCE)/LAP_DISTANCE);
    physics.update(dt,input,curve);
    raceDistance += physics.speed/3.6*dt;
    if(raceDistance>=LAP_DISTANCE*3){state='finished';physics.speed=0;notify('CHEQUERED FLAG — RACE COMPLETE!');}
    lap=Math.min(3,Math.floor(raceDistance/LAP_DISTANCE)+1);
    renderer.render({position:raceDistance/LAP_DISTANCE,playerX:physics.playerX,speed:physics.speed,offRoad:physics.offRoad,running:state==='running'});
    updateHud();
    if(state==='running') raf=requestAnimationFrame(frame); else updateHud();
  }
  function idleFrame(now){
    if(state==='running'||state==='countdown') return;
    const time=now/1000;
    renderer.render({position:time*.025,playerX:0,speed:0,offRoad:false,running:false});
    raf=requestAnimationFrame(idleFrame);
  }
  function init(){renderer.resize();renderer.render({position:0,playerX:0,speed:0,offRoad:false,running:false});raf=requestAnimationFrame(idleFrame);}
  return {init,start,setInput};
}
