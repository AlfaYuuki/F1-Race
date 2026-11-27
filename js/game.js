import { createPhysics } from './physics.js';
import { createRenderer } from './renderer.js';
import { curveAt, LAP_DISTANCE, TOTAL_LAPS, normalizeRaceLaps } from './track.js';
import { createOpponents } from './opponents.js';
import { createCollisionDetector } from './collision.js';
import { createWeather } from './weather.js';
import { createTrackEvolution } from './track-evolution.js';
import { createRaceStartGate } from './race-start.js';
import { createRaceControl } from './race-control.js';
const weatherSystem=createWeather();
const trackEvolution=createTrackEvolution();
const collisionDetector=createCollisionDetector();
const raceStartGate=createRaceStartGate();
const raceControl=createRaceControl();
const formatTime=ms=>{if(ms==null||!Number.isFinite(ms))return '--:--.---';const m=Math.floor(ms/60000),s=Math.floor(ms/1000)%60,mm=Math.floor(ms%1000);return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+String(mm).padStart(3,'0');};
export function createGame(canvas,callbacks={}) {
  const physics=createPhysics(),renderer=createRenderer(canvas),input=new Set(),opponents=createOpponents(LAP_DISTANCE);
  let playerColor='#df3039';
  let state='ready',last=0,elapsed=0,raceDistance=0,lap=1,countdownTimer=null,raf=0,impactPulse=0,hudAccumulator=0,weatherAccumulator=0,finishTimestamp=0;
  let sessionType='race',sessionLaps=TOTAL_LAPS,finishNotified=false;
  let lapElapsed=0,lastLap=null,bestLap=null,sector=1,sectorElapsed=0,playerHasLaunched=false;
  let lastGear=1,shiftAt=-9999,steerAxis=0,pitPhase=null,pitTimer=0,pitPlan=null,currentWeather=weatherSystem.getState(),lastYellow=false,lastSafetyCar=false;
  const notify=message=>callbacks.onMessage?.(message);
  function setInput(action,active){if(!raceStartGate.acceptsInput()&&active)return;active?input.add(action):input.delete(action);}
  function setSteerAxis(value){if(!raceStartGate.acceptsInput()){steerAxis=0;return;}steerAxis=Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;}
  function requestPit(compound='MEDIUM',fuelTarget=100,repair=true){
    if(state!=='running'||pitPhase||physics.pitStops>=3)return false;
    const allowed=['SOFT','MEDIUM','HARD','INTER'];
    pitPlan={compound:allowed.includes(compound)?compound:'MEDIUM',fuelTarget:Math.max(20,Math.min(100,Number(fuelTarget)||100)),repair:repair!==false};
    pitPhase='entry';pitTimer=1.6;input.clear();steerAxis=0;
    notify('PIT ENTRY — SPEED LIMIT 80 KM/H');
    return true;
  }
  // Slipstream: strongest when 8–35 m behind a car that is in (almost) the same lane.
  function slipstream(){
    let best=0;
    for(const d of opponents.drivers){
      const gap=d.distance-raceDistance;
      if(gap<8||gap>35)continue;
      const lateral=Math.abs((d.currentLane??d.lane)-physics.playerX);
      if(lateral>.4)continue;
      best=Math.max(best,(1-(gap-8)/27)*(1-lateral/.4));
    }
    return physics.speed>60?best:0;
  }
  function updateHud(){
    const standings=opponents.getStandings(raceDistance, state==='countdown'||state==='ready'),position=standings.findIndex(d=>d.isPlayer)+1;
    callbacks.onUpdate?.({raceControl:raceControl.getState(),speed:physics.speed,rpm:physics.rpm,gear:physics.gear,lap,totalLaps:sessionLaps,sessionType,time:formatTime(elapsed),state,position,standings,offRoad:physics.offRoad,lastLap:formatTime(lastLap),bestLap:formatTime(bestLap),lastLapMs:lastLap,bestLapMs:bestLap,sector:sector===1?'S1':sector===2?'S2':'S3',sectorTime:formatTime(sectorElapsed),fuel:physics.fuel,tireWear:physics.tireWear,compound:physics.compound,damage:physics.damage,pitStops:physics.pitStops,pitPhase,weather:currentWeather,track:trackEvolution.getState(),throttle:input.has('accelerate')?1:0,skid:Math.min(1,Math.abs(physics.lateralVelocity)),telemetry:{...physics.getTelemetry(),...physics.getDynamics()}});
  }
  function start(playerGridPosition=10,options={}){
    if(state==='running'||state==='countdown')return;
    sessionType=['practice','qualifying','race'].includes(options.type)?options.type:'race';
    sessionLaps=normalizeRaceLaps(options.laps,sessionType==='race'?10:TOTAL_LAPS);
    finishNotified=false;finishTimestamp=0;raceControl.start();
    // A new session must never inherit a held key, touch button or steering axis.
    input.clear();steerAxis=0;
    cancelAnimationFrame(raf);clearInterval(countdownTimer);state='countdown';raceStartGate.begin();physics.reset();renderer.resetEffects?.();weatherSystem.reset();currentWeather=weatherSystem.getState();lastYellow=false;lastSafetyCar=false;callbacks.onWeather?.(currentWeather);trackEvolution.reset(currentWeather.temperature);elapsed=0;raceDistance=0;lap=1;hudAccumulator=0;weatherAccumulator=0;collisionDetector.reset();impactPulse=0;opponents.reset(playerGridPosition, options.gridOrder);playerHasLaunched=false;lapElapsed=0;lastLap=null;bestLap=null;sector=1;sectorElapsed=0;pitPhase=null;pitPlan=null;
    callbacks.onPitService?.(false);notify('GET READY');let count=5;const countdown=document.querySelector('#countdown');countdown.hidden=false;countdown.classList.add('active');countdown.dataset.lit='0';countdown.textContent='';
    callbacks.onStart?.();callbacks.onWeather?.(currentWeather);updateHud();
    countdownTimer=setInterval(()=>{count--;if(count>0){countdown.dataset.lit=String(5-count);countdown.setAttribute('aria-label',String(6-count)+' of 5 start lights');}
      else if(count===0){countdown.dataset.lit='5';countdown.textContent='GO!';countdown.setAttribute('aria-label','Go');}
      else{clearInterval(countdownTimer);countdown.dataset.lit='0';countdown.textContent='';countdown.removeAttribute('aria-label');countdown.classList.remove('active');countdown.hidden=true;input.clear();steerAxis=0;raceStartGate.release();raceControl.finishFormation();state='running';notify('LIGHTS OUT — RACE ON!');last=performance.now();raf=requestAnimationFrame(frame);}},650);
  }
  function togglePause(){
    if(state==='running'&&!pitPhase){state='paused';cancelAnimationFrame(raf);input.clear();steerAxis=0;notify('PAUSED — PRESS ESC OR ▶ TO RESUME');updateHud();callbacks.onPause?.(true);}
    else if(state==='paused'){state='running';last=performance.now();notify('RACE RESUMED');raf=requestAnimationFrame(frame);callbacks.onPause?.(false);}
  }
  function frame(now){
    if(state!=='running')return;
    const dt=Math.min((now-last)/1000,.1);last=now;if(raceControl.getState().flag!=='RED'){elapsed+=dt*1000;lapElapsed+=dt*1000;sectorElapsed+=dt*1000;}
    currentWeather=weatherSystem.update(dt);\n    const controlState=raceControl.update(dt);\n    if(currentWeather.yellowFlag&&controlState.flag==='GREEN')raceControl.deploy(raceControl.FLAGS.YELLOW,'Track incident',9);\n    if(currentWeather.safetyCar&&controlState.flag!=='SAFETY CAR')raceControl.deploy(raceControl.FLAGS.SAFETY_CAR,'Incident requires field neutralisation',14);\n    const liveControl=raceControl.getState();\n    if(liveControl.flag!==lastRaceFlag){lastRaceFlag=liveControl.flag;notify(liveControl.flag==='GREEN'?'GREEN FLAG — RACING RESUMES':liveControl.flag+' — FOLLOW RACE CONTROL');}\n    const limitResult=raceControl.reportTrackLimit({now:raceControl.getState().elapsed,offTrack:physics.offRoad,corner:'FUJI CIRCUIT'});\n    if(limitResult?.penalty)notify('TIME PENALTY — '+limitResult.penalty.seconds+' SECONDS');
    if(currentWeather.yellowFlag!==lastYellow){lastYellow=currentWeather.yellowFlag;notify(lastYellow?'YELLOW FLAG — REDUCE SPEED, NO OVERTAKING':'GREEN FLAG — RACING RESUMES');}
    if(currentWeather.safetyCar!==lastSafetyCar){lastSafetyCar=currentWeather.safetyCar;notify(lastSafetyCar?'SAFETY CAR DEPLOYED — HOLD POSITION':'SAFETY CAR IN — RACE RESUMES');}
    const trackState=trackEvolution.update(dt,currentWeather,1+opponents.drivers.length);
    currentWeather={...currentWeather,trackEvolution};
    weatherAccumulator+=dt;
    if(weatherAccumulator>=.1){weatherAccumulator%=.1;callbacks.onWeather?.({...currentWeather,track:trackState});}
    const previousLapIndex=Math.floor(raceDistance/LAP_DISTANCE),previousSpeed=physics.speed;
    const progress=(raceDistance%LAP_DISTANCE)/LAP_DISTANCE,curve=curveAt(progress);
    if(pitPhase==='service'){
      physics.speed=0;physics.rpm=850;physics.update(0,new Set(),0,0);physics.speed=0;physics.rpm=850;pitTimer-=dt;
      if(pitTimer<=0){physics.applyPitService(pitPlan.compound,pitPlan.fuelTarget,pitPlan.repair);pitPhase='exit';pitTimer=1.25;callbacks.onPitService?.(false);notify('PIT SERVICE COMPLETE — RELEASED');}
    } else {
      physics.update(dt,pitPhase==='entry'?new Set():input,curve,pitPhase==='entry'?0:steerAxis,{pitLimiter:pitPhase==='entry'||pitPhase==='exit',yellowFlag:liveControl.flag==='YELLOW'||liveControl.flag==='DOUBLE YELLOW',safetyCar:liveControl.flag==='SAFETY CAR'||liveControl.flag==='VSC',raceControlSpeedLimit:liveControl.speedLimit,weatherGrip:currentWeather.grip,weatherWear:currentWeather.wear,trackGrip:trackEvolution.sample(progress,physics.playerX).grip,draft:slipstream()});
      const driftEvents=physics.consumeDriftEvents();if(driftEvents.banked)notify('DRIFT +'+driftEvents.banked+' PTS');if(driftEvents.spin)notify('SPIN — LIFT OFF AND COUNTER-STEER EARLIER');
      if(pitPhase==='entry'){pitTimer-=dt;if(pitTimer<=0){if(raceControl.getState().driveThroughPending){raceControl.serveDriveThrough(true);pitPhase='exit';pitTimer=1.25;notify('DRIVE-THROUGH SERVED — NO STOP');}else{pitPhase='service';pitTimer=4.2;physics.speed=0;callbacks.onPitService?.(true);notify('CAR IN PIT BOX — CREW AT WORK');}}}
      else if(pitPhase==='exit'){pitTimer-=dt;if(pitTimer<=0){pitPhase=null;pitPlan=null;notify('PIT EXIT — BACK TO RACING');}}
      raceDistance+=physics.speed/3.6*dt;
    }
    opponents.update(dt,raceDistance,curveAt,{...currentWeather,totalLaps:sessionLaps,playerLane:physics.playerX,yellowFlag:liveControl.flag==='YELLOW'||liveControl.flag==='DOUBLE YELLOW',doubleYellow:liveControl.flag==='DOUBLE YELLOW',vsc:liveControl.flag==='VSC',safetyCar:liveControl.flag==='SAFETY CAR',redFlag:liveControl.flag==='RED'});
    if(physics.speed>=25)playerHasLaunched=true;
    impactPulse=Math.max(0,impactPulse-dt*3.8);
    // Only genuine vehicle-footprint overlap can trigger a physical impact.
    // The detector ignores ghosts and latches each encounter until separation.
    if(playerHasLaunched&&!pitPhase){
      const rival=collisionDetector.update(raceDistance,physics.playerX,opponents.drivers);
      if(rival){
        const closingSpeed=Math.abs(physics.speed-(Number(rival.speed)||0));
        const severity=Math.min(1,Math.max(.2,.25+closingSpeed/160+Math.abs(physics.lateralVelocity)*.12));
        physics.impact(physics.playerX<=(rival.currentLane??rival.lane)?-1:1,severity);
        impactPulse=1;
        renderer.triggerImpact?.();
        notify('CONTACT — MOMENTUM LOST');
      }
    } else {
      collisionDetector.update(raceDistance,physics.playerX,opponents.drivers);
    }
    const currentLapIndex=Math.floor(raceDistance/LAP_DISTANCE),lapProgress=(raceDistance%LAP_DISTANCE)/LAP_DISTANCE;
    const currentSector=lapProgress<1/3?1:lapProgress<2/3?2:3;
    if(currentSector!==sector){notify('SECTOR '+sector+' COMPLETE — '+formatTime(sectorElapsed));callbacks.onSector?.({sector:'S'+sector,time:sectorElapsed});sector=currentSector;sectorElapsed=0;}
    if(currentLapIndex>previousLapIndex){lastLap=lapElapsed;bestLap=bestLap===null?lastLap:Math.min(bestLap,lastLap);lapElapsed=0;sector=1;sectorElapsed=0;notify('LAP '+(currentLapIndex+1)+' — '+formatTime(lastLap));}
    const sessionDistance=LAP_DISTANCE*sessionLaps;
    if(raceDistance>=sessionDistance){raceDistance=sessionDistance;state='finished';finishTimestamp=performance.now();physics.speed=0;pitPhase=null;callbacks.onPitService?.(false);notify(sessionType==='practice'?'PRACTICE COMPLETE':sessionType==='qualifying'?'QUALIFYING COMPLETE':'CHEQUERED FLAG — RACE COMPLETE!');
      if(!finishNotified){finishNotified=true;callbacks.onFinish?.({sessionType,lap:sessionLaps,elapsedMs:elapsed+raceControl.getState().penaltySeconds*1000,bestLapMs:bestLap,standings:opponents.getStandings(raceDistance),raceControl:raceControl.getState()});}}
    lap=Math.max(1,Math.min(sessionLaps,Math.floor(raceDistance/LAP_DISTANCE)+1));  // a car on the grid is still on lap 1
    const rivalCars=opponents.drivers.map(d=>({...d,relativeDistance:d.distance-raceDistance}));
    if(physics.gear!==lastGear){lastGear=physics.gear;shiftAt=now;}
    const steerCommand=Math.max(-1,Math.min(1,(input.has('right')?1:0)-(input.has('left')?1:0)+steerAxis));
    renderer.render({steer:steerCommand,braking:input.has('brake'),accelerating:input.has('accelerate'),shiftAge:now-shiftAt,driftAngle:physics.driftAngle,position:raceDistance/LAP_DISTANCE,playerX:physics.playerX,speed:physics.speed,speedDelta:(physics.speed-previousSpeed)/Math.max(dt,.001),lateralVelocity:physics.lateralVelocity,offRoad:physics.offRoad,running:state==='running',opponents:rivalCars,cameraShake:impactPulse>0?Math.sin(now*.05)*impactPulse*3:0,playerColor,skid:Math.abs(physics.lateralVelocity)>.42,dt,weather:currentWeather,elapsed,raceState:state,finishAge:state==='finished'&&finishTimestamp?Math.max(0,(now-finishTimestamp)/1000):0});
    hudAccumulator+=dt;
    if(hudAccumulator>=.05||state!=='running'){hudAccumulator%=.05;updateHud();}
    if(state==='running')raf=requestAnimationFrame(frame);else if(state==='finished')raf=requestAnimationFrame(idleFrame);
  }
  function idleFrame(now){if(state==='running'||state==='countdown')return;const finishAge=state==='finished'&&finishTimestamp?Math.max(0,(now-finishTimestamp)/1000):0;renderer.render({position:state==='finished'?raceDistance/LAP_DISTANCE:now/1000*.012,playerX:state==='finished'?physics.playerX:0,speed:0,offRoad:state==='finished'?physics.offRoad:false,running:false,opponents:[],weather:currentWeather,elapsed,raceState:state,finishAge,dt:1/60});raf=requestAnimationFrame(idleFrame);}
  function init(){opponents.reset(10);renderer.resize();renderer.render({position:0,playerX:0,speed:0,offRoad:false,running:false,opponents:[]});updateHud();raf=requestAnimationFrame(idleFrame);}
  return {init,start,setInput,setSteerAxis,togglePause,requestPit,deployRaceControl:(flag,reason,duration)=>raceControl.deploy(flag,reason,duration),addRacePenalty:(type,seconds,reason)=>raceControl.addPenalty(type,seconds,reason),retire:(reason)=>raceControl.retire(reason),setCarConfig:config=>{physics.setCarConfig(config);playerColor=config?.color||'#df3039';},getState:()=>state,getPitPhase:()=>pitPhase};
}
