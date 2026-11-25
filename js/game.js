import { createPhysics } from './physics.js';
import { createRenderer } from './renderer.js';
import { curveAt, LAP_DISTANCE, TOTAL_DISTANCE, TOTAL_LAPS } from './track.js';
import { createOpponents } from './opponents.js';
import { createWeather } from './weather.js';
const weatherSystem=createWeather();
const formatTime=ms=>{if(ms==null||!Number.isFinite(ms))return '--:--.---';const m=Math.floor(ms/60000),s=Math.floor(ms/1000)%60,mm=Math.floor(ms%1000);return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+String(mm).padStart(3,'0');};
export function createGame(canvas,callbacks={}) {
  const physics=createPhysics(),renderer=createRenderer(canvas),input=new Set(),opponents=createOpponents(LAP_DISTANCE);
  let playerColor='#df3039';
  let state='ready',last=0,elapsed=0,raceDistance=0,lap=1,countdownTimer=null,raf=0,collisionCooldown=0,impactPulse=0;
  let lapElapsed=0,lastLap=null,bestLap=null,sector=1,sectorElapsed=0,playerHasLaunched=false;
  let steerAxis=0,pitPhase=null,pitTimer=0,pitPlan=null,currentWeather=weatherSystem.getState(),lastYellow=false,lastSafetyCar=false;
  const notify=message=>callbacks.onMessage?.(message);
  function setInput(action,active){active?input.add(action):input.delete(action);}
  function setSteerAxis(value){steerAxis=Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;}
  function requestPit(compound='MEDIUM',fuelTarget=100,repair=true){
    if(state!=='running'||pitPhase||physics.pitStops>=3)return false;
    const allowed=['SOFT','MEDIUM','HARD','INTER'];
    pitPlan={compound:allowed.includes(compound)?compound:'MEDIUM',fuelTarget:Math.max(20,Math.min(100,Number(fuelTarget)||100)),repair:repair!==false};
    pitPhase='entry';pitTimer=1.6;input.clear();steerAxis=0;
    notify('PIT ENTRY — SPEED LIMIT 80 KM/H');
    return true;
  }
  function updateHud(){
    const standings=opponents.getStandings(raceDistance),position=standings.findIndex(d=>d.isPlayer)+1;
    callbacks.onUpdate?.({speed:physics.speed,rpm:physics.rpm,gear:physics.gear,lap,time:formatTime(elapsed),state,position,standings,offRoad:physics.offRoad,lastLap:formatTime(lastLap),bestLap:formatTime(bestLap),lastLapMs:lastLap,bestLapMs:bestLap,sector:sector===1?'S1':sector===2?'S2':'S3',sectorTime:formatTime(sectorElapsed),fuel:physics.fuel,tireWear:physics.tireWear,compound:physics.compound,damage:physics.damage,pitStops:physics.pitStops,pitPhase,weather:currentWeather,throttle:input.has('accelerate')?1:0,skid:Math.min(1,Math.abs(physics.lateralVelocity)),telemetry:physics.getTelemetry()});
  }
  function start(playerGridPosition=10){
    if(state==='running'||state==='countdown')return;
    cancelAnimationFrame(raf);clearInterval(countdownTimer);state='countdown';physics.reset();weatherSystem.reset();currentWeather=weatherSystem.getState();lastYellow=false;lastSafetyCar=false;callbacks.onWeather?.(currentWeather);elapsed=0;raceDistance=0;lap=1;collisionCooldown=0;impactPulse=0;opponents.reset(playerGridPosition);playerHasLaunched=false;lapElapsed=0;lastLap=null;bestLap=null;sector=1;sectorElapsed=0;pitPhase=null;pitPlan=null;
    callbacks.onPitService?.(false);notify('GET READY');let count=5;const countdown=document.querySelector('#countdown');countdown.hidden=false;countdown.classList.add('active');countdown.dataset.lit='0';countdown.textContent='';
    callbacks.onStart?.();callbacks.onWeather?.(currentWeather);updateHud();
    countdownTimer=setInterval(()=>{count--;if(count>0){countdown.dataset.lit=String(5-count);countdown.setAttribute('aria-label',String(6-count)+' of 5 start lights');}
      else if(count===0){countdown.dataset.lit='5';countdown.textContent='GO!';countdown.setAttribute('aria-label','Go');}
      else{clearInterval(countdownTimer);countdown.dataset.lit='0';countdown.textContent='';countdown.removeAttribute('aria-label');countdown.classList.remove('active');countdown.hidden=true;state='running';notify('RACE ON — FIND YOUR LINE!');last=performance.now();raf=requestAnimationFrame(frame);}},650);
  }
  function togglePause(){
    if(state==='running'&&!pitPhase){state='paused';cancelAnimationFrame(raf);input.clear();steerAxis=0;notify('PAUSED — PRESS ESC OR ▶ TO RESUME');updateHud();callbacks.onPause?.(true);}
    else if(state==='paused'){state='running';last=performance.now();notify('RACE RESUMED');raf=requestAnimationFrame(frame);callbacks.onPause?.(false);}
  }
  function frame(now){
    if(state!=='running')return;
    const dt=Math.min((now-last)/1000,.035);last=now;elapsed+=dt*1000;
    currentWeather=weatherSystem.update(dt);
    if(currentWeather.yellowFlag!==lastYellow){lastYellow=currentWeather.yellowFlag;notify(lastYellow?'YELLOW FLAG — REDUCE SPEED, NO OVERTAKING':'GREEN FLAG — RACING RESUMES');}
    if(currentWeather.safetyCar!==lastSafetyCar){lastSafetyCar=currentWeather.safetyCar;notify(lastSafetyCar?'SAFETY CAR DEPLOYED — HOLD POSITION':'SAFETY CAR IN — RACE RESUMES');}
    callbacks.onWeather?.(currentWeather);
    const previousLapIndex=Math.floor(raceDistance/LAP_DISTANCE),previousSpeed=physics.speed;
    const progress=(raceDistance%LAP_DISTANCE)/LAP_DISTANCE,curve=curveAt(progress);
    if(pitPhase==='service'){
      physics.speed=0;physics.rpm=850;pitTimer-=dt;
      if(pitTimer<=0){physics.applyPitService(pitPlan.compound,pitPlan.fuelTarget,pitPlan.repair);pitPhase='exit';pitTimer=1.25;callbacks.onPitService?.(false);notify('PIT SERVICE COMPLETE — RELEASED');}
    } else {
      physics.update(dt,pitPhase==='entry'?new Set():input,curve,pitPhase==='entry'?0:steerAxis,{pitLimiter:pitPhase==='entry'||pitPhase==='exit',yellowFlag:currentWeather.yellowFlag,safetyCar:currentWeather.safetyCar,weatherGrip:currentWeather.grip,weatherWear:currentWeather.wear});
      if(pitPhase==='entry'){pitTimer-=dt;if(pitTimer<=0){pitPhase='service';pitTimer=4.2;physics.speed=0;callbacks.onPitService?.(true);notify('CAR IN PIT BOX — CREW AT WORK');}}
      else if(pitPhase==='exit'){pitTimer-=dt;if(pitTimer<=0){pitPhase=null;pitPlan=null;notify('PIT EXIT — BACK TO RACING');}}
      raceDistance+=physics.speed/3.6*dt;
    }
    opponents.update(dt,raceDistance,curveAt,currentWeather);
    if(physics.speed>=25)playerHasLaunched=true;
    collisionCooldown=Math.max(0,collisionCooldown-dt);impactPulse=Math.max(0,impactPulse-dt*3.8);
    // Cars may safely pass a stationary player on the opening launch. Only
    // enable contact damage after the player has actually joined the race.
    if(playerHasLaunched&&!pitPhase&&collisionCooldown===0){
      const rival=opponents.drivers.find(d=>Math.abs(d.distance-raceDistance)<7.5&&Math.abs((d.currentLane??d.lane)-physics.playerX)<.27);
      if(rival){physics.impact(physics.playerX<=(rival.currentLane??rival.lane)?-1:1);collisionCooldown=1.1;impactPulse=1;renderer.triggerImpact?.();notify('CONTACT — MOMENTUM LOST');}
    }
    const currentLapIndex=Math.floor(raceDistance/LAP_DISTANCE),lapProgress=(raceDistance%LAP_DISTANCE)/LAP_DISTANCE;
    const currentSector=lapProgress<1/3?1:lapProgress<2/3?2:3;
    if(currentSector!==sector){notify('SECTOR '+sector+' COMPLETE — '+formatTime(sectorElapsed));callbacks.onSector?.({sector:'S'+sector,time:sectorElapsed});sector=currentSector;sectorElapsed=0;}
    if(currentLapIndex>previousLapIndex){lastLap=lapElapsed;bestLap=bestLap===null?lastLap:Math.min(bestLap,lastLap);lapElapsed=0;sector=1;sectorElapsed=0;notify('LAP '+(currentLapIndex+1)+' — '+formatTime(lastLap));}
    if(raceDistance>=TOTAL_DISTANCE){raceDistance=TOTAL_DISTANCE;state='finished';physics.speed=0;pitPhase=null;callbacks.onPitService?.(false);notify('CHEQUERED FLAG — RACE COMPLETE!');}
    lap=Math.min(TOTAL_LAPS,Math.floor(raceDistance/LAP_DISTANCE)+1);
    const rivalCars=opponents.drivers.map(d=>({...d,relativeDistance:d.distance-raceDistance}));
    renderer.render({position:raceDistance/LAP_DISTANCE,playerX:physics.playerX,speed:physics.speed,speedDelta:(physics.speed-previousSpeed)/Math.max(dt,.001),lateralVelocity:physics.lateralVelocity,offRoad:physics.offRoad,running:state==='running',opponents:rivalCars,cameraShake:impactPulse>0?Math.sin(now*.05)*impactPulse*3:0,playerColor,skid:Math.abs(physics.lateralVelocity)>.42,dt});
    updateHud();if(state==='running')raf=requestAnimationFrame(frame);else updateHud();
  }
  function idleFrame(now){if(state==='running'||state==='countdown')return;renderer.render({position:now/1000*.012,playerX:0,speed:0,offRoad:false,running:false,opponents:[]});raf=requestAnimationFrame(idleFrame);}
  function init(){opponents.reset(10);renderer.resize();renderer.render({position:0,playerX:0,speed:0,offRoad:false,running:false,opponents:[]});updateHud();raf=requestAnimationFrame(idleFrame);}
  return {init,start,setInput,setSteerAxis,togglePause,requestPit,setCarConfig:config=>{physics.setCarConfig(config);playerColor=config?.color||'#df3039';},getState:()=>state,getPitPhase:()=>pitPhase};
}
