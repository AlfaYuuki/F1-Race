import { createPhysics } from './physics.js';
import { createRenderer } from './renderer.js';
import { curveAt, LAP_DISTANCE, TOTAL_LAPS, normalizeRaceLaps } from './track.js';
import { createOpponents } from './opponents.js';
import { createCollisionDetector } from './collision.js';
import { createWeather } from './weather.js';
import { createTrackEvolution } from './track-evolution.js';
import { createRaceStartGate } from './race-start.js';
import { createRaceControl, SEVERITY } from './race-control.js';
import { createPenaltyLedger, createTrackLimitMonitor, createSpeedingMonitor, detectOvertakes, classify, retirementHazard, pickRetirementReason } from './regulations.js';
const weatherSystem=createWeather();
const trackEvolution=createTrackEvolution();
const collisionDetector=createCollisionDetector();
const raceStartGate=createRaceStartGate();
const raceControl=createRaceControl(),penalties=createPenaltyLedger(),trackLimits=createTrackLimitMonitor({limit:.92,hold:.3}),speedingMonitor=createSpeedingMonitor();
const formatTime=ms=>{if(ms==null||!Number.isFinite(ms))return '--:--.---';const m=Math.floor(ms/60000),s=Math.floor(ms/1000)%60,mm=Math.floor(ms%1000);return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+String(mm).padStart(3,'0');};
export function createGame(canvas,callbacks={}) {
  const physics=createPhysics(),renderer=createRenderer(canvas),input=new Set(),opponents=createOpponents(LAP_DISTANCE);
  let playerColor='#df3039';
  let state='ready',last=0,elapsed=0,raceDistance=0,lap=1,countdownTimer=null,raf=0,impactPulse=0,hudAccumulator=0,weatherAccumulator=0,finishTimestamp=0;
  let sessionType='race',sessionLaps=TOTAL_LAPS,finishNotified=false;
  let lapElapsed=0,lastLap=null,bestLap=null,sector=1,sectorElapsed=0,playerHasLaunched=false;
  let lastGear=1,shiftAt=-9999,steerAxis=0,pitPhase=null,pitTimer=0,pitPlan=null,currentWeather=weatherSystem.getState(),lastYellow=false,lastSafetyCar=false;
  // Race control & regulations (races only; practice and qualifying keep the simple weather flags).
  let regsOn=false,rcSnap=raceControl.snapshot(),overtakeSigns={},overtakeCooldown=0,overtakeWarned=false,collisionCooldown=0,atFaultCollisions=0,speedingOffences=0,neutralAge=0,lastRcMode='green',blockerSeen=false,playerRetired=null,jumpStart=false,startLights=0,raceClock=0,flagFlash=0;
  const notify=message=>callbacks.onMessage?.(message);
  const penalise=(seconds,reason)=>{penalties.addTime(seconds,reason);notify('+'+seconds+'S PENALTY — '+reason);callbacks.onPenalty?.(penalties.summary());flagFlash=1;};
  function retirePlayer(reason){
    if(playerRetired||state!=='running')return;
    playerRetired=reason;state='finished';finishTimestamp=performance.now();physics.speed=0;pitPhase=null;callbacks.onPitService?.(false);
    notify('RETIRED — '+reason);
    if(!finishNotified){finishNotified=true;callbacks.onFinish?.(finishPayload());}
  }
  function finishPayload(){
    let standings=opponents.getStandings(raceDistance).map(d=>d.isPlayer&&playerRetired?{...d,retired:true,retiredReason:playerRetired}:d);
    if(regsOn){penalties.onLapCompleted(1e9);standings=classify(standings,{penaltySeconds:penalties.seconds,playerSpeedMs:Math.max(40,physics.speed/3.6||60)});}
    return {sessionType,lap:Math.max(1,Math.min(sessionLaps,Math.floor(raceDistance/LAP_DISTANCE)+1)),elapsedMs:elapsed,bestLapMs:bestLap,standings,penalties:penalties.summary(),retired:playerRetired};
  }
  function modeMessage(e){
    const m={yellow:'YELLOW FLAG — REDUCE SPEED, NO OVERTAKING',doubleYellow:'DOUBLE YELLOW — BE PREPARED TO STOP',vsc:'VIRTUAL SAFETY CAR — STAY UNDER THE DELTA, NO OVERTAKING',vscEnding:'VSC ENDING — GREEN FLAG AHEAD',safetyCar:'SAFETY CAR DEPLOYED — BUNCH UP, NO OVERTAKING',safetyCarIn:'SAFETY CAR IN THIS LAP — PREPARE TO RACE',red:'RED FLAG — RACE SUSPENDED, STOP THE CAR',restart:'RESTART — CARS RE-FORMED ON THE GRID',green:e.reason==='RESTART'||e.reason==='RACE RESTART'?'GREEN FLAG — RACING RESUMES':'TRACK CLEAR — GREEN FLAG'};
    return m[e.mode]||e.label;
  }
  function handleRaceControl(dt){
    // Incidents from retirements and the stopped-car blocker.
    for(const r of opponents.drainRetirements()){
      notify(r.name.toUpperCase()+' RETIRES — '+r.reason);
      const severe=r.severity>=3&&Math.random()<.2;
      raceControl.reportIncident({severity:severe?SEVERITY.SEVERE:r.severity>=3?SEVERITY.SERIOUS:r.severity===2?SEVERITY.MAJOR:SEVERITY.MINOR,carId:r.id,reason:r.reason,distance:r.distance});
    }
    const blocker=opponents.blockingCar();
    if(blocker)blockerSeen=true;else if(blockerSeen){blockerSeen=false;raceControl.clearTrack('CAR RECOVERED');}
    for(const e of raceControl.drainEvents()){
      if(e.type==='mode'){
        notify(modeMessage(e));flagFlash=1;lastRcMode=e.mode;
        if(e.mode==='restart')reformGrid();
      }
    }
  }
  function reformGrid(){
    for(const d of opponents.drivers)if(d.retired){d.parked=true;d.collisionEnabled=false;d.speed=0;}
    const g=opponents.formUpGrid(raceDistance);raceDistance=g.playerDistance;
    physics.speed=0;physics.playerX=g.gridSlot%2?-.42:.42;input.clear();
    // Red-flag rule: tyres may be changed while the race is suspended.
    if(physics.tireWear>35){physics.applyPitService(physics.compound,Math.max(physics.fuel,40),false);notify('FREE TYRE CHANGE UNDER THE RED FLAG');}
    notify('GRID SLOT P'+g.gridSlot+' — STANDING RESTART');
  }
  function setInput(action,active){if(!raceStartGate.acceptsInput()&&active){if(action==='accelerate'&&regsOn&&state==='countdown'&&startLights>=3)jumpStart=true;return;}active?input.add(action):input.delete(action);}
  function setSteerAxis(value){if(!raceStartGate.acceptsInput()){steerAxis=0;return;}steerAxis=Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;}
  function requestPit(compound='MEDIUM',fuelTarget=100,repair=true){
    if(state!=='running'||pitPhase||physics.pitStops>=3)return false;
    if(regsOn&&!rcSnap.pitsOpen){notify('PIT LANE CLOSED — RED FLAG');return false;}
    const allowed=['SOFT','MEDIUM','HARD','INTER'];
    pitPlan={compound:allowed.includes(compound)?compound:'MEDIUM',fuelTarget:Math.max(20,Math.min(100,Number(fuelTarget)||100)),repair:repair!==false};
    pitPhase='entry';pitTimer=1.6;input.clear();steerAxis=0;
    notify('PIT ENTRY — SPEED LIMIT 80 KM/H');
    return true;
  }
  // Serve a drive-through penalty: through the pit lane at 80 km/h without stopping.
  function requestDriveThrough(){
    if(state!=='running'||pitPhase||!penalties.pendingDriveThrough)return false;
    if(regsOn&&!rcSnap.pitsOpen){notify('PIT LANE CLOSED — RED FLAG');return false;}
    pitPlan={driveThrough:true};pitPhase='entry';pitTimer=1.6;input.clear();steerAxis=0;
    notify('DRIVE-THROUGH — PIT LANE 80 KM/H, DO NOT STOP');
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
    callbacks.onUpdate?.({speed:physics.speed,rpm:physics.rpm,gear:physics.gear,lap,totalLaps:sessionLaps,sessionType,time:formatTime(elapsed),state,position,standings,offRoad:physics.offRoad,lastLap:formatTime(lastLap),bestLap:formatTime(bestLap),lastLapMs:lastLap,bestLapMs:bestLap,sector:sector===1?'S1':sector===2?'S2':'S3',sectorTime:formatTime(sectorElapsed),fuel:physics.fuel,tireWear:physics.tireWear,compound:physics.compound,damage:physics.damage,pitStops:physics.pitStops,pitPhase,raceControl:regsOn?{...rcSnap,flash:flagFlash,lastMode:lastRcMode}:null,penalties:regsOn?penalties.summary():null,retired:playerRetired,weather:currentWeather,track:trackEvolution.getState(),throttle:input.has('accelerate')?1:0,skid:Math.min(1,Math.abs(physics.lateralVelocity)),telemetry:{...physics.getTelemetry(),...physics.getDynamics()}});
  }
  function start(playerGridPosition=10,options={}){
    if(state==='running'||state==='countdown')return;
    sessionType=['practice','qualifying','race'].includes(options.type)?options.type:'race';
    sessionLaps=normalizeRaceLaps(options.laps,sessionType==='race'?10:TOTAL_LAPS);
    finishNotified=false;finishTimestamp=0;
    // A new session must never inherit a held key, touch button or steering axis.
    input.clear();steerAxis=0;
    cancelAnimationFrame(raf);clearInterval(countdownTimer);state='countdown';raceStartGate.begin();physics.reset();renderer.resetEffects?.();weatherSystem.reset();currentWeather=weatherSystem.getState();lastYellow=false;lastSafetyCar=false;regsOn=sessionType==='race';raceControl.reset();penalties.reset();trackLimits.reset();speedingMonitor.reset();rcSnap=raceControl.snapshot();overtakeSigns={};overtakeCooldown=0;overtakeWarned=false;collisionCooldown=0;atFaultCollisions=0;speedingOffences=0;neutralAge=0;lastRcMode='green';blockerSeen=false;playerRetired=null;jumpStart=false;startLights=0;raceClock=0;flagFlash=0;callbacks.onWeather?.(currentWeather);trackEvolution.reset(currentWeather.temperature);elapsed=0;raceDistance=0;lap=1;hudAccumulator=0;weatherAccumulator=0;collisionDetector.reset();impactPulse=0;opponents.reset(playerGridPosition, options.gridOrder);playerHasLaunched=false;lapElapsed=0;lastLap=null;bestLap=null;sector=1;sectorElapsed=0;pitPhase=null;pitPlan=null;
    callbacks.onPitService?.(false);notify(sessionType==='race'?'FORMATION LAP COMPLETE — CARS ON THE GRID':'GET READY');let count=5;const countdown=document.querySelector('#countdown');countdown.hidden=false;countdown.classList.add('active');countdown.dataset.lit='0';countdown.textContent='';
    callbacks.onStart?.();callbacks.onWeather?.(currentWeather);updateHud();
    let hold=0;
    countdownTimer=setInterval(()=>{count--;
      if(count>0){startLights=5-count;countdown.dataset.lit=String(startLights);countdown.setAttribute('aria-label',String(startLights)+' of 5 start lights');}
      else if(count===0){startLights=5;countdown.dataset.lit='5';countdown.setAttribute('aria-label','5 of 5 start lights — wait for lights out');hold=1+Math.floor(Math.random()*3);}
      else if(hold>1&&regsOn){hold--;}
      else{
        clearInterval(countdownTimer);
        countdown.dataset.lit='0';countdown.textContent='GO!';countdown.setAttribute('aria-label','Lights out, go');
        setTimeout(()=>{if(state==='running'){countdown.textContent='';countdown.removeAttribute('aria-label');countdown.classList.remove('active');countdown.hidden=true;}},650);
        input.clear();steerAxis=0;raceStartGate.release();state='running';notify('LIGHTS OUT — RACE ON!');
        if(jumpStart){penalise(5,'JUMP START');}
        last=performance.now();raf=requestAnimationFrame(frame);
      }},650);
  }
  function togglePause(){
    if(state==='running'&&!pitPhase){state='paused';cancelAnimationFrame(raf);input.clear();steerAxis=0;notify('PAUSED — PRESS ESC OR ▶ TO RESUME');updateHud();callbacks.onPause?.(true);}
    else if(state==='paused'){state='running';last=performance.now();notify('RACE RESUMED');raf=requestAnimationFrame(frame);callbacks.onPause?.(false);}
  }
  // Regulation speed ceiling: lowered smoothly, and a little above the limit so over-speeding is a real, penalised choice.
  function effectiveCap(dt){
    if(rcSnap.cap==null)return null;
    const target=rcSnap.cap===0?0:rcSnap.cap+45;
    return Math.max(target,physics.speed-(rcSnap.cap===0?95:70)*dt);
  }
  function frame(now){
    if(state!=='running')return;
    const dt=Math.min((now-last)/1000,.1);last=now;elapsed+=dt*1000;lapElapsed+=dt*1000;sectorElapsed+=dt*1000;
    currentWeather=weatherSystem.update(dt);
    if(regsOn){raceClock+=dt;flagFlash=Math.max(0,flagFlash-dt*1.5);
      const field=opponents.drivers.filter(d=>!d.retired);
      const leaderDist=Math.max(raceDistance,...field.map(d=>d.distance));
      raceControl.update(dt,{leaderLap:Math.floor(leaderDist/LAP_DISTANCE)+1,rain:currentWeather.rain});
      rcSnap=raceControl.snapshot();handleRaceControl(dt);rcSnap=raceControl.snapshot();
      neutralAge=rcSnap.neutralised?neutralAge+dt:0;
      currentWeather={...currentWeather,yellowFlag:rcSnap.yellow||rcSnap.doubleYellow,safetyCar:rcSnap.safetyCar||rcSnap.vsc};lastYellow=currentWeather.yellowFlag;lastSafetyCar=currentWeather.safetyCar;
    }
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
      physics.update(dt,pitPhase==='entry'?new Set():input,curve,pitPhase==='entry'?0:steerAxis,{pitLimiter:pitPhase==='entry'||pitPhase==='exit',yellowFlag:currentWeather.yellowFlag,safetyCar:currentWeather.safetyCar,speedCap:regsOn?effectiveCap(dt):null,weatherGrip:currentWeather.grip,weatherWear:currentWeather.wear,trackGrip:trackEvolution.sample(progress,physics.playerX).grip,draft:slipstream()});
      const driftEvents=physics.consumeDriftEvents();if(driftEvents.banked)notify('DRIFT +'+driftEvents.banked+' PTS');if(driftEvents.spin)notify('SPIN — LIFT OFF AND COUNTER-STEER EARLIER');
      if(pitPhase==='entry'){pitTimer-=dt;if(pitTimer<=0&&pitPlan?.driveThrough){penalties.serveDriveThrough();pitPhase='exit';pitTimer=1.25;notify('DRIVE-THROUGH SERVED');callbacks.onPenalty?.(penalties.summary());}else if(pitTimer<=0){pitPhase='service';pitTimer=4.2;physics.speed=0;callbacks.onPitService?.(true);notify('CAR IN PIT BOX — CREW AT WORK');}}
      else if(pitPhase==='exit'){pitTimer-=dt;if(pitTimer<=0){pitPhase=null;pitPlan=null;notify('PIT EXIT — BACK TO RACING');}}
      raceDistance+=physics.speed/3.6*dt;
    }
    opponents.update(dt,raceDistance,curveAt,{...currentWeather,totalLaps:sessionLaps,playerLane:physics.playerX,raceControl:regsOn?rcSnap:null,raceElapsed:raceClock,retirements:regsOn});
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
        if(regsOn){
          if(severity>.55)raceControl.reportIncident({severity:SEVERITY.MINOR,carId:rival.id,reason:'CONTACT'});
          collisionCooldown=Math.max(0,collisionCooldown);
          if(collisionCooldown===0&&rival.distance>raceDistance&&closingSpeed>30){
            collisionCooldown=20;atFaultCollisions++;
            if(atFaultCollisions>=2){penalties.addDriveThrough('CAUSING A COLLISION',lap);notify('DRIVE-THROUGH PENALTY — CAUSING A COLLISION');callbacks.onPenalty?.(penalties.summary());flagFlash=1;}
            else penalise(5,'CAUSING A COLLISION');
          }
        }
      }
    } else {
      collisionDetector.update(raceDistance,physics.playerX,opponents.drivers);
    }
    if(regsOn&&playerHasLaunched){
      collisionCooldown=Math.max(0,collisionCooldown-dt);overtakeCooldown=Math.max(0,overtakeCooldown-dt);
      if(!pitPhase&&!rcSnap.suspended){
        const tl=trackLimits.update(dt,physics.playerX);
        if(tl?.type==='warning')notify('TRACK LIMITS — WARNING '+tl.warning+'/3');
        else if(tl?.type==='penalty')penalise(tl.seconds,'TRACK LIMITS (3 VIOLATIONS)');
        if(rcSnap.neutralised&&neutralAge>4&&rcSnap.cap>0){
          const sp=speedingMonitor.update(dt,physics.speed,rcSnap.cap);
          if(sp){speedingOffences++;if(speedingOffences>=2){penalties.addDriveThrough(sp.reason,lap);notify('DRIVE-THROUGH PENALTY — '+sp.reason);callbacks.onPenalty?.(penalties.summary());flagFlash=1;}else penalise(sp.seconds,sp.reason);}
        } else speedingMonitor.update(dt,0,null);
        const ot=detectOvertakes(overtakeSigns,raceDistance,opponents.drivers.filter(d=>!d.retired&&d.pitTimer===0).map(d=>({id:d.id,distance:d.distance})));
        overtakeSigns=ot.signs;
        if(ot.passed.length&&!rcSnap.overtaking&&neutralAge>2&&overtakeCooldown===0){
          overtakeCooldown=6;
          if(rcSnap.mode==='yellow'&&!overtakeWarned){overtakeWarned=true;notify('NO OVERTAKING UNDER YELLOW — WARNING');}
          else penalise(5,'OVERTAKING UNDER '+rcSnap.label);
        }
      }
      if(rcSnap.mode!=='red'&&rcSnap.mode!=='restart'){
        if(physics.damage>=100)retirePlayer('CAR TOO DAMAGED');
        else if(Math.random()<retirementHazard({tireWear:physics.tireWear,damage:physics.damage,risk:.6})*dt*.5&&raceClock>40){const f=pickRetirementReason();raceControl.reportIncident({severity:Math.min(3,f.severity),carId:'player',reason:'YOU — '+f.reason});retirePlayer(f.reason);}
      }
    }
    const currentLapIndex=Math.floor(raceDistance/LAP_DISTANCE),lapProgress=(raceDistance%LAP_DISTANCE)/LAP_DISTANCE;
    const currentSector=lapProgress<1/3?1:lapProgress<2/3?2:3;
    if(currentSector!==sector){notify('SECTOR '+sector+' COMPLETE — '+formatTime(sectorElapsed));callbacks.onSector?.({sector:'S'+sector,time:sectorElapsed});sector=currentSector;sectorElapsed=0;}
    if(currentLapIndex>previousLapIndex){lastLap=lapElapsed;bestLap=bestLap===null?lastLap:Math.min(bestLap,lastLap);if(regsOn)for(const c of penalties.onLapCompleted(currentLapIndex+1)){notify('DRIVE-THROUGH NOT SERVED — +'+c.seconds+'S');callbacks.onPenalty?.(penalties.summary());}lapElapsed=0;sector=1;sectorElapsed=0;notify('LAP '+(currentLapIndex+1)+' — '+formatTime(lastLap));}
    const sessionDistance=LAP_DISTANCE*sessionLaps;
    if(raceDistance>=sessionDistance){raceDistance=sessionDistance;state='finished';finishTimestamp=performance.now();physics.speed=0;pitPhase=null;callbacks.onPitService?.(false);notify(sessionType==='practice'?'PRACTICE COMPLETE':sessionType==='qualifying'?'QUALIFYING COMPLETE':'CHEQUERED FLAG — RACE COMPLETE!');
      if(!finishNotified){finishNotified=true;callbacks.onFinish?.(finishPayload());}}
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
  return {init,start,setInput,setSteerAxis,togglePause,requestPit,requestDriveThrough,setCarConfig:config=>{physics.setCarConfig(config);playerColor=config?.color||'#df3039';},getState:()=>state,getPitPhase:()=>pitPhase};
}
