import { createPhysics } from './physics.js';
import { createRenderer } from './renderer.js';
import { curveAt, LAP_DISTANCE, TOTAL_DISTANCE, TOTAL_LAPS } from './track.js';
import { createOpponents } from './opponents.js';
const formatTime=ms=>{if(ms==null||!Number.isFinite(ms))return '--:--.---';const m=Math.floor(ms/60000),s=Math.floor(ms/1000)%60,mm=Math.floor(ms%1000);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(mm).padStart(3,'0')}`;};
export function createGame(canvas,callbacks={}) {
  const physics=createPhysics(),renderer=createRenderer(canvas),input=new Set(),opponents=createOpponents(LAP_DISTANCE);
  let state='ready',last=0,elapsed=0,raceDistance=0,lap=1,countdownTimer=null,raf=0,collisionCooldown=0,impactPulse=0;
  let lapElapsed=0,lastLap=null,bestLap=null,sector=1,sectorElapsed=0,pitTimer=0,pitCompound='MEDIUM',pitFuel=100,pitStops=0;
  const notify=message=>callbacks.onMessage?.(message);
  function setInput(action,active){active?input.add(action):input.delete(action);}
  function updateHud(){
    const standings=opponents.getStandings(raceDistance),position=standings.findIndex(d=>d.isPlayer)+1;
    callbacks.onUpdate?.({speed:physics.speed,rpm:physics.rpm,gear:physics.gear,lap,time:formatTime(elapsed),state,position,standings,offRoad:physics.offRoad,lastLap:formatTime(lastLap),bestLap:formatTime(bestLap),sector:sector===1?'S1':sector===2?'S2':'S3',sectorTime:formatTime(sectorElapsed),fuel:physics.fuel,tireWear:physics.tireWear,compound:physics.compound,damage:physics.damage,pitStops});
  }
  function start(){
    if(state==='running'||state==='countdown')return;
    cancelAnimationFrame(raf);clearInterval(countdownTimer);physics.reset();elapsed=0;raceDistance=0;lap=1;collisionCooldown=0;impactPulse=0;opponents.reset();lapElapsed=0;lastLap=null;bestLap=null;sector=1;sectorElapsed=0;state='countdown';
    notify('GET READY');let count=5;const countdown=document.querySelector('#countdown');countdown.dataset.lit='0';countdown.textContent='';
    callbacks.onStart?.();
    updateHud();
    countdownTimer=setInterval(()=>{count--;if(count>0){countdown.dataset.lit=String(5-count);countdown.setAttribute('aria-label',`${6-count} of 5 start lights`);}
      else if(count===0){countdown.dataset.lit='5';countdown.textContent='GO!';countdown.setAttribute('aria-label','Go');}
      else{clearInterval(countdownTimer);countdown.dataset.lit='0';countdown.textContent='';countdown.removeAttribute('aria-label');state='running';notify('RACE ON — FIND YOUR LINE!');last=performance.now();raf=requestAnimationFrame(frame);}},650);
  }
  function requestPit(compound='MEDIUM',fuel=100){if(state!=='running'||pitStops>=TOTAL_LAPS)return false;pitCompound=['SOFT','MEDIUM','HARD','INTER'].includes(compound)?compound:'MEDIUM';pitFuel=Math.max(20,Math.min(100,Number(fuel)||100));state='pit-entry';input.clear();notify('PIT ENTRY — BRAKING TO PIT SPEED');updateHud();return true;}
  function togglePause(){
    if(state==='running'){state='paused';cancelAnimationFrame(raf);input.clear();notify('PAUSED — PRESS ESC OR ▶ TO RESUME');updateHud();callbacks.onPause?.(true);}
    else if(state==='paused'){state='running';last=performance.now();notify('RACE RESUMED');raf=requestAnimationFrame(frame);callbacks.onPause?.(false);}
  }
  function frame(now){
    if(!['running','pit-entry','pit-service'].includes(state))return;
    const dt=Math.min((now-last)/1000,.035);last=now;elapsed+=dt*1000;if(state==='running'){lapElapsed+=dt*1000;sectorElapsed+=dt*1000;}
    const previousLapIndex=Math.floor(raceDistance/LAP_DISTANCE);
    const previousSpeed=physics.speed;
    const progress=(raceDistance%LAP_DISTANCE)/LAP_DISTANCE,curve=curveAt(progress);
    if(state==='pit-entry'){physics.speed=Math.max(0,physics.speed-125*dt);if(physics.speed<=1){physics.speed=0;state='pit-service';pitTimer=4.2;notify('PIT BOX — CREW WORKING');callbacks.onPitService?.(true);}}
    else if(state==='pit-service'){pitTimer-=dt;if(pitTimer<=0){physics.service(pitCompound,pitFuel);pitStops++;state='running';notify('PIT RELEASE — '+pitCompound+' TYRES FITTED');callbacks.onPitService?.(false);}}
    else{physics.update(dt,input,curve);raceDistance+=physics.speed/3.6*dt;opponents.update(dt,raceDistance,curveAt);}
    collisionCooldown=Math.max(0,collisionCooldown-dt);impactPulse=Math.max(0,impactPulse-dt*3.8);
    if(collisionCooldown===0){
      const rival=opponents.drivers.find(d=>Math.abs(d.distance-raceDistance)<7.5&&Math.abs((d.currentLane??d.lane)-physics.playerX)<.27);
      if(rival){physics.impact(physics.playerX<=rival.currentLane? -1:1);collisionCooldown=1.1;impactPulse=1;renderer.triggerImpact?.();notify('CONTACT — KEEP IT CLEAN!');}
    }
    const currentLapIndex=Math.floor(raceDistance/LAP_DISTANCE);
    const lapProgress=(raceDistance%LAP_DISTANCE)/LAP_DISTANCE;
    const currentSector=lapProgress<1/3?1:lapProgress<2/3?2:3;
    if(currentSector!==sector){notify(`SECTOR ${sector} COMPLETE — ${formatTime(sectorElapsed)}`);sector=currentSector;sectorElapsed=0;}
    if(currentLapIndex>previousLapIndex){lastLap=lapElapsed;bestLap=bestLap===null?lastLap:Math.min(bestLap,lastLap);lapElapsed=0;sector=1;sectorElapsed=0;notify(`LAP ${currentLapIndex+1} — ${formatTime(lastLap)}`);}
    if(raceDistance>=TOTAL_DISTANCE){raceDistance=TOTAL_DISTANCE;state='finished';physics.speed=0;notify('CHEQUERED FLAG — RACE COMPLETE!');}
    lap=Math.min(TOTAL_LAPS,Math.floor(raceDistance/LAP_DISTANCE)+1);
    const rivalCars=opponents.drivers.map(d=>({...d,relativeDistance:d.distance-raceDistance}));
    renderer.render({position:raceDistance/LAP_DISTANCE,playerX:physics.playerX,speed:physics.speed,speedDelta:(physics.speed-previousSpeed)/Math.max(dt,.001),lateralVelocity:physics.lateralVelocity,offRoad:physics.offRoad,running:state==='running',opponents:rivalCars,cameraShake:impactPulse>0?Math.sin(now*.05)*impactPulse*3:0,skid:Math.abs(physics.lateralVelocity)>.42,dt});
    updateHud();if(['running','pit-entry','pit-service'].includes(state))raf=requestAnimationFrame(frame);else updateHud();
  }
  function idleFrame(now){
    if(state==='running'||state==='countdown')return;
    const progress=now/1000*.012;
    renderer.render({position:progress,playerX:0,speed:0,offRoad:false,running:false,opponents:[]});
    raf=requestAnimationFrame(idleFrame);
  }
  function init(){renderer.resize();renderer.render({position:0,playerX:0,speed:0,offRoad:false,running:false,opponents:[]});raf=requestAnimationFrame(idleFrame);}
  return {init,start,setInput,togglePause,requestPit,getState:()=>state};
}
