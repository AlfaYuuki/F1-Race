import { retirementHazard, pickRetirementReason } from './regulations.js';
import { getDriverPersonality, calculatePersonalityPace, calculateTyreWearMultiplier, shouldAttemptOvertake, getDefensiveLaneOffset } from './ai-personalities.js';

const DRIVER_DATA = [
  { id:'sato', name:'K. SATO', color:'#45a5e8', pace:246, skill:.94, aggression:.82, lane:-.48 },
  { id:'tanaka', name:'M. TANAKA', color:'#f1bd4b', pace:238, skill:.87, aggression:.68, lane:.48 },
  { id:'mori', name:'L. MORI', color:'#9b79df', pace:252, skill:.97, aggression:.76, lane:-.12 },
  { id:'kobayashi', name:'A. KOBAYASHI', color:'#55c49a', pace:232, skill:.81, aggression:.91, lane:.18 },
  { id:'nakamura', name:'R. NAKAMURA', color:'#e58b55', pace:242, skill:.9, aggression:.72, lane:.62 },
  { id:'rossi', name:'G. ROSSI', color:'#e85d75', pace:249, skill:.93, aggression:.78, lane:-.62 },
  { id:'muller', name:'F. MULLER', color:'#77b7a4', pace:235, skill:.85, aggression:.65, lane:.32 },
  { id:'silva', name:'D. SILVA', color:'#d6a45b', pace:244, skill:.91, aggression:.88, lane:-.3 },
  { id:'petrov', name:'I. PETROV', color:'#8d9be8', pace:229, skill:.79, aggression:.93, lane:.7 },
  { id:'martin', name:'J. MARTIN', color:'#d879c7', pace:247, skill:.92, aggression:.71, lane:-.7 },
  { id:'kim', name:'H. KIM', color:'#65c6df', pace:239, skill:.88, aggression:.83, lane:.08 },
  { id:'dubois', name:'P. DUBOIS', color:'#c2a0ed', pace:251, skill:.96, aggression:.74, lane:.55 },
  { id:'brown', name:'T. BROWN', color:'#a5bd54', pace:234, skill:.84, aggression:.89, lane:-.42 },
  { id:'garcia', name:'E. GARCIA', color:'#e9a16e', pace:243, skill:.9, aggression:.77, lane:.42 },
  { id:'smith', name:'N. SMITH', color:'#7295c9', pace:237, skill:.86, aggression:.86, lane:-.18 },
  { id:'alvarez', name:'C. ALVAREZ', color:'#c77c65', pace:250, skill:.95, aggression:.8, lane:.22 },
  { id:'andersson', name:'O. ANDERSSON', color:'#8bb8a1', pace:231, skill:.82, aggression:.7, lane:-.55 },
  { id:'fernandez', name:'M. FERNANDEZ', color:'#d7bb65', pace:245, skill:.91, aggression:.92, lane:.65 },
  { id:'williams', name:'A. WILLIAMS', color:'#9b9da8', pace:240, skill:.89, aggression:.75, lane:-.05 }
];
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const RELATIONSHIPS=Object.freeze({
  sato:['tanaka','mori'], tanaka:['sato','nakamura'], mori:['dubois','rossi'],
  kobayashi:['petrov','brown'], nakamura:['tanaka','garcia'], rossi:['mori','martin'],
  muller:['andersson','williams'], silva:['fernandez','brown'], petrov:['kobayashi','fernandez'],
  martin:['rossi','smith'], kim:['alvarez','dubois'], dubois:['mori','kim'],
  brown:['kobayashi','silva'], garcia:['nakamura','williams'], smith:['martin','alvarez'],
  alvarez:['kim','smith'], andersson:['muller','williams'], fernandez:['petrov','silva'],
  williams:['muller','garcia']
});

export function createOpponents(lapDistance=4563) {
  let selectedGridPosition=10;
  let pendingRetirements=[],pendingPenalties=[];
  const drivers=DRIVER_DATA.map(data=>({
    ...data, personality:getDriverPersonality(data.id), distance:0, speed:0,
    currentLane:data.lane,targetLane:data.lane,gridPosition:0,launchTimer:0,
    overtakes:0,overtakeTargetId:null,fuel:100,tireWear:0,compound:'MEDIUM',
    pitTimer:0,pitStops:0,pressure:0,mistakes:0,relationshipMemory:Object.create(null),
    mistakeCooldown:0,defending:false,stintLaps:0,
    retired:false,retiredReason:null,parked:false,retireClock:0,fresh:false,
    penaltySeconds:0,timePenalty:0,trackLimitCount:0,driveThrough:null,gridDistance:0
  }));

  function findTrafficAhead(driver,traffic) {
    return traffic.filter(car=>car.id!==driver.id)
      .map(car=>({...car,gap:car.distance-driver.distance}))
      .filter(car=>car.gap>0&&car.gap<55)
      .sort((a,b)=>a.gap-b.gap)[0]||null;
  }
  function laneIsClear(driver,traffic,lane,lookAhead=24) {
    return traffic.every(car=>{
      if(car.id===driver.id)return true;
      const longitudinal=Math.abs(car.distance-driver.distance);
      const lateral=Math.abs((car.currentLane??0)-lane);
      return longitudinal>lookAhead||lateral>.34;
    });
  }
  function choosePassingLane(driver,target,traffic) {
    const candidates=[driver.currentLane-.46,driver.currentLane+.46]
      .map(lane=>clamp(lane,-.76,.76))
      .filter(lane=>laneIsClear(driver,traffic,lane,26));
    if(!candidates.length)return null;
    return candidates.sort((a,b)=>{
      const aDistance=Math.abs(a-(target.currentLane??0));
      const bDistance=Math.abs(b-(target.currentLane??0));
      return aDistance-bDistance;
    })[0];
  }
  function pitDecision(driver,weather) {
    const rain=clamp(Number(weather.rain)||0,0,1);
    const totalLaps=Math.max(0,Number(weather.totalLaps)||0);
    const currentLap=driver.distance/lapDistance;
    const remaining=totalLaps?Math.max(0,totalLaps-currentLap):0;
    const fuelPerLap=7.2;
    const fuelRange=driver.fuel/fuelPerLap;
    const wetMismatch=rain>=.58&&driver.compound!=='INTER';
    const dryMismatch=rain<=.08&&driver.compound==='INTER';
    const fuelNeed=totalLaps>0&&fuelRange<remaining+1.25;
    const tyreNeed=driver.tireWear>=78;
    const weatherNeed=(wetMismatch||dryMismatch)&&driver.pitStops<3;
    const strategicWindow=remaining>3&&driver.stintLaps>=5&&driver.tireWear>=58&&driver.tireWear<78;
    if(driver.pitStops>=3)return null;
    if(!(fuelNeed||tyreNeed||weatherNeed||strategicWindow))return null;
    return {reason:fuelNeed?'fuel':tyreNeed?'tyres':weatherNeed?'weather':'strategy',
      compound:rain>=.58?'INTER':remaining<=5?'SOFT':driver.personality.tyreCare>.88?'HARD':'MEDIUM'};
  }
  function update(dt,playerDistance,curveAt,weather={}) {
    const step=clamp(Number(dt)||0,0,.1);
    if(!step)return getStandings(playerDistance);
    const traffic=[{id:'player',distance:Number(playerDistance)||0,currentLane:Number(weather.playerLane)||0},...drivers.filter(d=>!d.parked)];
    const rc=weather.raceControl||null;
    const neutralised=rc?!!rc.neutralised||!!rc.yellow||!!rc.doubleYellow:!!(weather.yellowFlag||weather.safetyCar);
    const cap=rc?(rc.cap==null?285:rc.cap):weather.safetyCar?145:weather.yellowFlag?170:285;
    const halted=!!rc&&rc.cap===0;
    const retirementsOn=!!rc&&weather.retirements!==false&&weather.raceElapsed>25;
    for(const driver of drivers) {
      if(driver.retired) {
        // A failed car coasts to a stop, then marshals recover it and it leaves the track.
        driver.speed=Math.max(0,driver.speed-step*(driver.retiredReason==='BRAKE FAILURE'?30:60));
        driver.distance+=driver.speed/3.6*step;
        driver.retireClock+=step;
        if(!driver.parked&&driver.speed<=.5&&driver.retireClock>14){driver.parked=true;driver.collisionEnabled=false;}
        continue;
      }
      if(halted) {
        driver.speed=Math.max(0,driver.speed-step*95);
        driver.distance+=driver.speed/3.6*step;
        driver.launchTimer=.2+(1-driver.skill)*.7;
        continue;
      }
      if(retirementsOn&&driver.launchTimer===0&&driver.pitTimer===0) {
        const hazard=retirementHazard({tireWear:driver.tireWear,mistakes:driver.mistakes,risk:driver.personality.risk});
        if(Math.random()<hazard*step*(weather.retirementScale??1)) {
          const failure=pickRetirementReason();
          driver.retired=true;driver.retiredReason=failure.reason;driver.retireSeverity=failure.severity;driver.retireClock=0;
          pendingRetirements.push({id:driver.id,name:driver.name,reason:failure.reason,severity:failure.severity,distance:driver.distance});
          continue;
        }
      }
      driver.mistakeCooldown=Math.max(0,driver.mistakeCooldown-step);
      if(driver.launchTimer>0) {
        driver.launchTimer=Math.max(0,driver.launchTimer-step);
        driver.speed=Math.min(driver.pace*.72,driver.speed+step*95,cap);
        driver.distance+=driver.speed/3.6*step;
        continue;
      }
      if(driver.pitTimer>0) {
        driver.pitTimer=Math.max(0,driver.pitTimer-step);
        driver.speed=Math.max(0,driver.speed-step*85);
        if(driver.pitTimer===0) {
          driver.fuel=100;driver.tireWear=0;driver.pitStops++;
          driver.stintLaps=0;driver.compound=driver.pitCompound|| (weather.rain>=.58?'INTER':'MEDIUM');driver.pitCompound=null;
        }
        driver.distance+=driver.speed/3.6*step;
        continue;
      }
      driver.fuel=clamp(driver.fuel-step*(.055+driver.speed/330*.045),0,100);
      const wearBase=driver.compound==='SOFT'?.16:driver.compound==='HARD'?.075:.105;
      driver.tireWear=clamp(driver.tireWear+step*wearBase*(Number(weather.wear)||1)*calculateTyreWearMultiplier(driver.personality),0,100);
      const newStint=Math.floor(driver.distance/lapDistance);
      if(newStint>driver.stintLaps)driver.stintLaps=newStint;
      const pit=(rc&&!rc.pitsOpen)?null:pitDecision(driver,weather)||(rc&&rc.neutralised&&!driver.pitUnderSC&&driver.tireWear>=40&&driver.pitStops<2&&(weather.totalLaps*lapDistance-driver.distance)>lapDistance*3?(driver.pitUnderSC=true,{reason:'neutralised',compound:weather.rain>=.58?'INTER':driver.personality.tyreCare>.88?'HARD':'MEDIUM'}):null);
      if(pit) {
        driver.pitTimer=5.8+(1-driver.skill)*2.2;
        driver.speed=Math.max(0,driver.speed*.35);
        driver.pitCompound=pit.compound;
        driver.pitReason=pit.reason;
        driver.distance+=driver.speed/3.6*step;
        continue;
      }

      const progress=((driver.distance%lapDistance)+lapDistance)%lapDistance/lapDistance;
      const curve=clamp(Math.abs(Number(curveAt(progress))||0),0,1);
      const ahead=findTrafficAhead(driver,traffic);
      const relationship=ahead&&RELATIONSHIPS[driver.id]?.includes(ahead.id)?1:0;
      const sameRival=ahead&&ahead.id!=='player'&&RELATIONSHIPS[driver.id]?.includes(ahead.id);
      driver.pressure=clamp((ahead&&ahead.gap<22?(22-ahead.gap)/22:0)*.65+
        (sameRival ? .25 : 0)+(driver.fuel<20?.1:0),0,1);
      let targetLane=driver.lane+getDefensiveLaneOffset(driver.personality);
      let draftBonus=0;
      driver.defending=false;
      const threat=!neutralised?traffic.find(car=>car.distance<driver.distance&&
        driver.distance-car.distance<18&&Math.abs((car.currentLane??0)-driver.currentLane)<.45):null;
      if(threat) {
        driver.defending=true;
        const defendLane=clamp((threat.currentLane??0)+(driver.personality.defense>=.8 ? .4 : -.3),-.76,.76);
        if(laneIsClear(driver,traffic,defendLane,18))targetLane=defendLane;
      }
      if(ahead&&ahead.gap<22&&!neutralised) {
        const canAttack=shouldAttemptOvertake(driver.personality,ahead.gap);
        if(canAttack) {
          const passingLane=choosePassingLane(driver,ahead,traffic);
          if(passingLane!==null) {
            targetLane=passingLane;
            driver.overtakeTargetId=ahead.id;
          } else draftBonus=Math.max(0,3.5*(1-ahead.gap/55));
        } else if(ahead.gap<14)draftBonus=Math.max(0,2.5*(1-ahead.gap/14));
      }
      driver.targetLane=clamp(targetLane,-.76,.76);
      driver.currentLane+= (driver.targetLane-driver.currentLane)*Math.min(1,step*(1.25+driver.aggression*1.6));

      const rhythm=calculatePersonalityPace(driver.personality,{
        phase:driver.distance*.001+driver.skill*8,rain:weather.rain||0,cornerLoad:curve
      });
      const surface=weather.trackEvolution?.sample?.(progress,driver.currentLane)||{grip:1};
      const surfacePenalty=Math.max(0,1-(Number(surface.grip)||1))*34;
      const wetPenalty=(weather.rain||0)*(driver.compound==='INTER'?5:32*(1-driver.personality.wetSkill*.35));
      const cornerPenalty=curve*(15+(1-driver.skill)*27)*(1.08-driver.personality.consistency*.12);
      const wearPenalty=driver.tireWear*.13;
      const pressurePenalty=driver.pressure*(1-driver.personality.consistency)*2.2;
      const safePace=cap;
      let targetSpeed=clamp(driver.pace+rhythm+draftBonus-cornerPenalty-surfacePenalty-wetPenalty-wearPenalty-pressurePenalty,Math.min(125,safePace),safePace);

      // Deterministic, infrequent pressure errors: no random frame-to-frame jitter.
      const phase=Math.floor(driver.distance/95)+driver.id.length*17;
      const errorWindow=driver.pressure>.48&&driver.mistakeCooldown===0&&
        Math.sin(phase*2.17)>.997&&curve>.32&&!neutralised;
      if(errorWindow&&driver.skill<.96) {
        const severity=(1-driver.skill)*(.35+driver.personality.risk*.65);
        targetSpeed*=1-severity*.16;
        driver.mistakes++;driver.mistakeCooldown=18;
        driver.lastMistake='LOCKUP';
        // A lock-up runs the car wide: that is a track-limits violation; every third costs 5 s.
        driver.trackLimitCount++;
        if(weather.raceControl&&driver.trackLimitCount%3===0)addPenalty(driver,5,'TRACK LIMITS (3 VIOLATIONS)');
      }
      // Drive-through: pending until the car reaches the pit entry, served at the pit-lane limit.
      const dt0=driver.driveThrough;
      if(dt0){
        const lapNo=driver.distance/lapDistance,inPitWindow=(lapNo%1)>.9;
        if(dt0.state==='pending'&&lapNo>dt0.deadlineLap){driver.driveThrough=null;addPenalty(driver,20,'UNSERVED DRIVE-THROUGH');}
        else if(dt0.state==='pending'&&inPitWindow&&(!rc||rc.pitsOpen)&&!halted){dt0.state='serving';dt0.timer=4.5;}
        else if(dt0.state==='serving'){
          dt0.timer-=step;targetSpeed=Math.min(targetSpeed,80);
          if(dt0.timer<=0){driver.driveThrough=null;pendingPenalties.push({id:driver.id,name:driver.name,type:'served',reason:dt0.reason});}
        }
      }
      if(relationship&&ahead.gap<16) {
        driver.relationshipMemory[ahead.id]=(driver.relationshipMemory[ahead.id]||0)+step;
      }
      if(rc&&rc.bunch&&ahead&&ahead.gap<26)targetSpeed=Math.min(targetSpeed,Math.max(60,(Number(ahead.speed)||targetSpeed)*(ahead.gap<14?.82:.96)));
      if(rc&&rc.overtaking===false){driver.overtakeTargetId=null;}
      driver.speed+=(targetSpeed-driver.speed)*Math.min(1,step*(1.1+driver.skill*1.5));
      const previousDistance=driver.distance;
      driver.distance+=driver.speed/3.6*step;
      // Under any neutralisation nobody may pass: a car can never move ahead of the car in front of it.
      if(rc&&rc.overtaking===false&&ahead&&!ahead.retired&&ahead.id!=='player')driver.distance=Math.min(driver.distance,Math.max(previousDistance,ahead.distance-3));
      if(driver.overtakeTargetId) {
        const target=traffic.find(car=>car.id===driver.overtakeTargetId);
        if(target&&previousDistance<=target.distance&&driver.distance>target.distance) {
          driver.overtakes++;driver.overtakeTargetId=null;
        } else if(!target||target.distance-driver.distance>60)driver.overtakeTargetId=null;
      }
    }
    return getStandings(playerDistance);
  }
  function getStandings(playerDistance,preserveGridOrder=false) {
    const field=[{id:'player',name:'YOU',color:'#ed4148',distance:playerDistance,gridPosition:selectedGridPosition,isPlayer:true},
      ...drivers.map(driver=>({...driver,isPlayer:false}))];
    return field.sort((a,b)=>preserveGridOrder?a.gridPosition-b.gridPosition:b.distance-a.distance);
  }
  function reset(playerGridPosition=10,savedOrder=null) {
    selectedGridPosition=clamp(Math.round(Number(playerGridPosition)||10),1,20);
    const fallback=[...drivers].sort((a,b)=>(b.pace*.72+b.skill*42+b.aggression*3)-(a.pace*.72+a.skill*42+a.aggression*3));
    const saved=Array.isArray(savedOrder)?savedOrder.filter(id=>id!=='player').map(id=>drivers.find(d=>d.id===id)).filter(Boolean):[];
    const order=saved.length===drivers.length?saved:fallback;
    let index=0;
    for(let slot=1;slot<=20;slot++) {
      if(slot===selectedGridPosition)continue;
      const d=order[index++];d.gridPosition=slot;d.distance=(selectedGridPosition-slot)*8;d.speed=0;
      d.currentLane=slot%2?-.42:.42;d.targetLane=d.currentLane;
      d.launchTimer=.16+(1-d.skill)*.62;d.overtakes=0;d.overtakeTargetId=null;
      d.fuel=100;d.tireWear=0;d.compound='MEDIUM';d.pitTimer=0;d.pitStops=0;
      d.pressure=0;d.mistakes=0;d.mistakeCooldown=0;d.defending=false;d.stintLaps=0;
      d.penaltySeconds=0;d.timePenalty=0;d.trackLimitCount=0;d.driveThrough=null;pendingPenalties=[];d.retired=false;d.retiredReason=null;d.retireSeverity=0;d.parked=false;d.retireClock=0;d.pitUnderSC=false;d.collisionEnabled=true;pendingRetirements=[];d.relationshipMemory=Object.create(null);d.pitReason=null;d.pitCompound=null;d.lastMistake=null;
    }
    return {playerGridPosition:selectedGridPosition,grid:getStandings(0)};
  }
  function addPenalty(driver,seconds,reason) {
    driver.penaltySeconds+=seconds;driver.timePenalty=driver.penaltySeconds;
    pendingPenalties.push({id:driver.id,name:driver.name,type:'time',seconds,reason});
  }
  function awardDriveThrough(id,reason,currentLap=1,laps=3) {
    const driver=drivers.find(d=>d.id===id);
    if(!driver||driver.retired||driver.driveThrough)return false;
    driver.driveThrough={state:'pending',reason,deadlineLap:currentLap+laps,timer:0};
    pendingPenalties.push({id,name:driver.name,type:'driveThrough',reason});
    return true;
  }
  function drainPenalties() { const out=pendingPenalties; pendingPenalties=[]; return out; }
  // ---- Formation lap: cars roll from the start of the final stretch to their grid slots in order.
  function startFormation(length) {
    for(const d of drivers) {
      d.gridDistance=d.distance;d.distance=d.gridDistance-length;d.speed=0;d.launchTimer=0;
    }
  }
  function formationStep(dt,playerDistance,{speed=150}={}) {
    const step=clamp(Number(dt)||0,0,.1);
    const cars=[{id:'player',distance:playerDistance,speed:0},...drivers];
    let settled=true;
    for(const d of drivers) {
      const remaining=d.gridDistance-d.distance;
      if(remaining<=.05){d.distance=d.gridDistance;d.speed=0;continue;}
      settled=false;
      let cap=Math.min(speed,3.6*Math.sqrt(2*7*Math.max(0,remaining)));
      const ahead=cars.filter(c=>c.id!==d.id&&c.distance>d.distance).sort((a,b)=>a.distance-b.distance)[0];
      if(ahead&&ahead.distance-d.distance<18)cap=Math.min(cap,Math.max(8,(Number(ahead.speed)||0)*.9+(ahead.distance-d.distance-8)*2));
      d.speed+=clamp(cap-d.speed,-step*38,step*22);
      d.speed=Math.max(remaining<2?4:0,d.speed);
      d.distance=Math.min(d.gridDistance,d.distance+d.speed/3.6*step);
      d.currentLane+=(d.targetLane-d.currentLane)*Math.min(1,step*3);
    }
    return {settled};
  }
  function finishFormation() {
    for(const d of drivers){d.distance=d.gridDistance;d.speed=0;d.launchTimer=.16+(1-d.skill)*.62;}
  }
  function drainRetirements() { const out=pendingRetirements; pendingRetirements=[]; return out; }
  // Is a stopped (not yet recovered) car still blocking the track?
  function blockingCar() { return drivers.find(d=>d.retired&&!d.parked&&d.retireSeverity>=2)||null; }
  // Red-flag restart: cars re-form on the grid in running order behind the leader.
  function formUpGrid(playerDistance,spacing=8) {
    const field=getStandings(playerDistance).filter(c=>c.isPlayer||!drivers.find(d=>d.id===c.id)?.retired);
    const leader=field[0].distance;let playerNew=playerDistance;
    field.forEach((car,i)=>{
      const newDistance=leader-i*spacing;
      if(car.isPlayer)playerNew=newDistance;
      else{const d=drivers.find(x=>x.id===car.id);d.distance=newDistance;d.speed=0;d.currentLane=i%2?.42:-.42;d.targetLane=d.currentLane;d.launchTimer=.16+(1-d.skill)*.62;d.pitTimer=0;d.pitUnderSC=false;}
    });
    return {playerDistance:playerNew,gridSlot:field.findIndex(c=>c.isPlayer)+1};
  }
  return {drivers,update,getStandings,reset,drainRetirements,drainPenalties,awardDriveThrough,startFormation,formationStep,finishFormation,blockingCar,formUpGrid};
}
