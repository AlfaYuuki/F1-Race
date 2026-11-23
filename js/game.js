import { createPhysics } from './physics.js';
import { createRenderer } from './renderer.js';
import { curveAt, LAP_DISTANCE, TOTAL_DISTANCE, TOTAL_LAPS } from './track.js';
import { createOpponents } from './opponents.js';
const formatTime=ms=>{const m=Math.floor(ms/60000),s=Math.floor(ms/1000)%60,mm=Math.floor(ms%1000);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(mm).padStart(3,'0')}`;};
export function createGame(canvas,callbacks={}) {
  const physics=createPhysics(),renderer=createRenderer(canvas),input=new Set(),opponents=createOpponents(LAP_DISTANCE);
  let state='ready',last=0,elapsed=0,raceDistance=0,lap=1,countdownTimer=null,raf=0,collisionCooldown=0;
  const notify=message=>callbacks.onMessage?.(message);
  function setInput(action,active){active?input.add(action):input.delete(action);}
  function updateHud(){
    const standings=opponents.getStandings(raceDistance),position=standings.findIndex(d=>d.isPlayer)+1;
    callbacks.onUpdate?.({speed:physics.speed,lap,time:formatTime(elapsed),state,position,standings,offRoad:physics.offRoad});
  }
  function start(){
    if(state==='running'||state==='countdown')return;
    cancelAnimationFrame(raf);clearInterval(countdownTimer);physics.reset();elapsed=0;raceDistance=0;lap=1;collisionCooldown=0;opponents.reset();state='countdown';
    notify('GET READY');let count=3;document.querySelector('#countdown').textContent=count;
    callbacks.onStart?.();
    updateHud();
    countdownTimer=setInterval(()=>{count--;if(count>0)document.querySelector('#countdown').textContent=count;
      else if(count===0)document.querySelector('#countdown').textContent='GO!';
      else{clearInterval(countdownTimer);document.querySelector('#countdown').textContent='';state='running';notify('RACE ON — FIND YOUR LINE!');last=performance.now();raf=requestAnimationFrame(frame);}},800);
  }
  function togglePause(){
    if(state==='running'){state='paused';cancelAnimationFrame(raf);input.clear();notify('PAUSED — PRESS ESC OR ▶ TO RESUME');updateHud();callbacks.onPause?.(true);}
    else if(state==='paused'){state='running';last=performance.now();notify('RACE RESUMED');raf=requestAnimationFrame(frame);callbacks.onPause?.(false);}
  }
  function frame(now){
    if(state!=='running')return;
    const dt=Math.min((now-last)/1000,.035);last=now;elapsed+=dt*1000;
    const progress=(raceDistance%LAP_DISTANCE)/LAP_DISTANCE,curve=curveAt(progress);
    physics.update(dt,input,curve);
    raceDistance+=physics.speed/3.6*dt;
    opponents.update(dt,raceDistance,curveAt);
    collisionCooldown=Math.max(0,collisionCooldown-dt);
    if(collisionCooldown===0){
      const rival=opponents.drivers.find(d=>Math.abs(d.distance-raceDistance)<7.5&&Math.abs((d.currentLane??d.lane)-physics.playerX)<.27);
      if(rival){physics.impact(physics.playerX<=rival.currentLane? -1:1);collisionCooldown=1.1;notify('CONTACT — KEEP IT CLEAN!');}
    }
    if(raceDistance>=TOTAL_DISTANCE){raceDistance=TOTAL_DISTANCE;state='finished';physics.speed=0;notify('CHEQUERED FLAG — RACE COMPLETE!');}
    lap=Math.min(TOTAL_LAPS,Math.floor(raceDistance/LAP_DISTANCE)+1);
    const rivalCars=opponents.drivers.map(d=>({...d,relativeDistance:d.distance-raceDistance}));
    renderer.render({position:raceDistance/LAP_DISTANCE,playerX:physics.playerX,speed:physics.speed,offRoad:physics.offRoad,running:state==='running',opponents:rivalCars,cameraShake:collisionCooldown>0?Math.sin(now*.05)*2:0});
    updateHud();if(state==='running')raf=requestAnimationFrame(frame);else updateHud();
  }
  function idleFrame(now){
    if(state==='running'||state==='countdown')return;
    const progress=now/1000*.012;
    renderer.render({position:progress,playerX:0,speed:0,offRoad:false,running:false,opponents:[]});
    raf=requestAnimationFrame(idleFrame);
  }
  function init(){renderer.resize();renderer.render({position:0,playerX:0,speed:0,offRoad:false,running:false,opponents:[]});raf=requestAnimationFrame(idleFrame);}
  return {init,start,setInput,togglePause,getState:()=>state};
}
