import { evaluatePitStrategy } from './pit-strategy.js';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function parseLapTime(value) {
  if(Number.isFinite(value))return value;
  if(typeof value!=='string')return null;
  const match=value.match(/^(\d+):(\d{2})\.(\d{3})$/);
  return match?Number(match[1])*60000+Number(match[2])*1000+Number(match[3]):null;
}

export function createRaceEngineer(options={}) {
  const cooldownMs=Math.max(5000,Number(options.cooldownMs)||12000);
  const sampleMs=Math.max(500,Number(options.sampleMs)||1000);
  const alertDurationMs=Math.max(5000,Number(options.alertDurationMs)||11000);
  let lastIssued=new Map(),lastAlert=null,lastPosition=null,lastLap=null,lastAnyIssued=-Infinity;
  let bestSectors=new Map(),previousSample=null,lastSampleAt=-Infinity,lastRenderAt=-Infinity;
  let averageFuelFlow=0,wearRatePerMinute=0,previousGap=null,gapClosing=0,lastRain=null;
  let currentStatus=null;

  function reset() {
    lastIssued=new Map();lastAlert=null;lastPosition=null;lastLap=null;lastAnyIssued=-Infinity;
    bestSectors=new Map();previousSample=null;lastSampleAt=-Infinity;lastRenderAt=-Infinity;
    averageFuelFlow=0;wearRatePerMinute=0;previousGap=null;gapClosing=0;lastRain=null;currentStatus=null;
    return getStatus();
  }
  function getStatus() {
    return currentStatus?{...currentStatus}:{
      level:'info',title:'ENGINEER ONLINE',
      message:'Monitoring race pace, fuel, tyres, traffic and track conditions.',
      action:'PUSH WHEN READY',isAlert:false
    };
  }
  function publish(status,now) {
    currentStatus={...status};
    lastRenderAt=now;
    return getStatus();
  }
  function recordSector({sector,time,now=Date.now()}={}) {
    const value=Number(time);
    if(!Number.isFinite(value)||value<=0)return null;
    const key=String(sector||'SECTOR');
    const previous=bestSectors.get(key);
    if(previous===undefined||value<previous){bestSectors.set(key,value);return null;}
    const delta=(value/previous-1)*100;
    if(delta<3.5||now-lastAnyIssued<cooldownMs)return null;
    const alert={
      key:'sector-loss-'+key,level:'info',title:key+' TIME LOSS',
      message:`This sector was ${delta.toFixed(1)}% slower than your best. Focus on clean braking and corner exits.`,
      action:'FIND TIME IN '+key,priority:35,isAlert:true,at:now
    };
    if(now-(lastIssued.get(alert.key)??-Infinity)<cooldownMs)return null;
    lastIssued.set(alert.key,now);lastAnyIssued=now;lastAlert={...alert,expiresAt:now+alertDurationMs};
    return publish(lastAlert,now);
  }

  function update(snapshot={}) {
    if(snapshot.state!=='running')return null;
    const now=Number.isFinite(snapshot.now)?snapshot.now:Date.now();
    const fuel=clamp(Number(snapshot.fuel)||0,0,100);
    const wear=clamp(Number(snapshot.tireWear)||0,0,100);
    const damage=clamp(Number(snapshot.damage)||0,0,100);
    const flow=Math.max(0,Number(snapshot.fuelFlow)||0);
    const lap=Math.max(1,Number(snapshot.lap)||1);
    const totalLaps=Math.max(lap,Number(snapshot.totalLaps)||50);
    const remainingLaps=Math.max(0,totalLaps-lap+1);
    const lapMs=parseLapTime(snapshot.lastLapMs??snapshot.lastLap)||85000;
    const lapMinutes=lapMs/60000;
    const weather=snapshot.weather||{};
    const rain=clamp(Number(weather.rain)||0,0,1);
    const compound=String(snapshot.compound||'MEDIUM').toUpperCase();
    const telemetry=snapshot.telemetry||{};
    const candidates=[];
    const pitPlan=evaluatePitStrategy({lap,totalLaps,fuel,tireWear:wear,compound,damage,weather,lastLapMs:lapMs,fuelFlow:averageFuelFlow});
    if(pitPlan.requiredStop&&typeof document!=='undefined'){
      const compoundInput=document.querySelector('#pit-compound');
      const fuelInput=document.querySelector('#pit-fuel');
      const fuelOutput=document.querySelector('#fuel-choice');
      if(compoundInput)compoundInput.value=pitPlan.targetCompound;
      if(fuelInput)fuelInput.value=String(pitPlan.fuelTarget);
      if(fuelOutput)fuelOutput.textContent=pitPlan.fuelTarget+'%';
    }
    if(pitPlan.requiredStop)candidates.push({key:'pit-strategy',level:pitPlan.urgency==='BOX NOW'?'critical':'warning',title:'PIT WALL STRATEGY',message:pitPlan.reason+'. Recommended compound: '+pitPlan.targetCompound+'. Fuel target: '+pitPlan.fuelTarget+'%.',action:'BOX · '+pitPlan.targetCompound+' · '+pitPlan.fuelTarget+'%',priority:pitPlan.urgency==='BOX NOW'?97:82});

    if(now-lastSampleAt>=sampleMs){
      if(previousSample){
        const dt=(now-previousSample.now)/60000;
        if(dt>0){
          if(flow>0)averageFuelFlow=averageFuelFlow?averageFuelFlow*.72+flow*.28:flow;
          const wearDelta=wear-previousSample.wear;
          if(wearDelta>=0&&wearDelta/dt<45){
            const measured=wearDelta/dt;
            wearRatePerMinute=wearRatePerMinute?wearRatePerMinute*.7+measured*.3:measured;
          }
          const standings=Array.isArray(snapshot.standings)?snapshot.standings:[];
          const playerIndex=standings.findIndex(driver=>driver.isPlayer||driver.id==='player');
          if(playerIndex>0){
            const gap=Math.max(0,(Number(standings[playerIndex-1].distance)||0)-(Number(standings[playerIndex].distance)||0));
            if(previousGap!==null)gapClosing=(previousGap-gap)/((now-previousSample.now)/1000);
            previousGap=gap;
          }else previousGap=null;
        }
      }
      if(flow>0&&!averageFuelFlow)averageFuelFlow=flow;
      previousSample={now,fuel,wear,damage,lap,rain,position:Number(snapshot.position)||0};
      lastSampleAt=now;
    } else if(flow>0&&!averageFuelFlow)averageFuelFlow=flow;

    const fuelPerLap=averageFuelFlow>0?averageFuelFlow*lapMinutes:0;
    const fuelRange=fuelPerLap>0?fuel/fuelPerLap:Infinity;
    const wearPerLap=wearRatePerMinute*lapMinutes;
    const lapsToTyreLimit=wearPerLap>0?(88-wear)/wearPerLap:Infinity;

    if(damage>=55)candidates.push({key:'damage-critical',level:'critical',title:'CAR DAMAGE CRITICAL',message:'Damage is severely affecting the car. Avoid wheel-to-wheel contact and box for repairs.',action:'BOX FOR REPAIRS',priority:100});
    else if(damage>=28)candidates.push({key:'damage-high',level:'warning',title:'CAR DAMAGE RISING',message:`Car damage is at ${Math.round(damage)}%. Performance is compromised; keep clear of traffic and plan repairs.`,action:'REPAIR AT NEXT STOP',priority:76});

    if(fuel<=8)candidates.push({key:'fuel-critical',level:'critical',title:'FUEL CRITICAL',message:'Fuel is critically low. Short-shift and lift where safe, then pit immediately.',action:'BOX NOW',priority:99});
    else if(Number.isFinite(fuelRange)&&fuelRange<remainingLaps&&fuelRange<1.35)candidates.push({key:'fuel-box',level:'critical',title:'FUEL WILL NOT REACH FINISH',message:`Estimated range is ${fuelRange.toFixed(1)} laps for ${remainingLaps} laps remaining. A fuel stop is required.`,action:'PLAN A PIT STOP NOW',priority:96});
    else if(Number.isFinite(fuelRange)&&fuelRange<remainingLaps&&fuelRange<2.5)candidates.push({key:'fuel-watch',level:'warning',title:'FUEL STRATEGY',message:`Fuel range is approximately ${fuelRange.toFixed(1)} laps. Save fuel and plan the next pit window.`,action:'SAVE FUEL / PLAN BOX',priority:70});

    if(wear>=90)candidates.push({key:'tyres-critical',level:'critical',title:'TYRES AT THE LIMIT',message:`Tyre wear is ${Math.round(wear)}%. Grip is likely to fall away; pit for a fresh set.`,action:'BOX FOR FRESH TYRES',priority:95});
    else if(wear>=70){const tyreDetail=Number.isFinite(lapsToTyreLimit)?`; about ${Math.max(0,lapsToTyreLimit).toFixed(1)} laps to the limit`:'';candidates.push({key:'tyres-worn',level:'warning',title:'TYRE DEGRADED',message:`Tyre wear is ${Math.round(wear)}%${tyreDetail}. Smooth inputs will preserve grip.`,action:'CONSIDER A TYRE STOP',priority:74});}
    else if(wearRatePerMinute>0&&lapsToTyreLimit<1.25&&remainingLaps>lapsToTyreLimit)candidates.push({key:'tyre-window',level:'warning',title:'TYRE WINDOW APPROACHING',message:`At the current wear rate, this set has about ${Math.max(0,lapsToTyreLimit).toFixed(1)} laps before the limit. Prepare a stop.`,action:'PLAN TYRE CHANGE',priority:73});

    if(rain>=.58&&compound!=='INTER')candidates.push({key:'wet-tyres',level:'warning',title:'WET WEATHER STRATEGY',message:'The track is very wet. Intermediate tyres should provide more control and confidence.',action:'CONSIDER INTERMEDIATES',priority:84});
    else if(rain<=.08&&compound==='INTER')candidates.push({key:'dry-tyres',level:'warning',title:'DRY TRACK — WRONG TYRE',message:'The track is dry. Intermediate tyres are likely costing pace and wearing faster.',action:'SWITCH TO SLICKS',priority:78});
    else if(rain>=.25&&rain<.58&&compound!=='INTER')candidates.push({key:'rain-watch',level:'info',title:'RAIN BUILDING',message:'Grip is falling as rain builds. Be smooth on throttle and avoid aggressive kerbs.',action:'WATCH TRACK CONDITIONS',priority:48});

    if(snapshot.offRoad)candidates.push({key:'off-track',level:'warning',title:'OFF TRACK',message:'You are outside the racing surface. Rejoin carefully and avoid abrupt steering.',action:'SAFE REJOIN',priority:64});
    if(Number(telemetry.grip)>0&&Number(telemetry.grip)<58)candidates.push({key:'grip-low',level:'warning',title:'LOW MECHANICAL GRIP',message:`Estimated grip has fallen to ${Math.round(telemetry.grip)}%. Brake earlier and make smoother steering inputs.`,action:'PROTECT THE TYRES',priority:69});

    if(weather.yellowFlag)candidates.push({key:'yellow-flag',level:'warning',title:'YELLOW FLAG',message:'Incident ahead. Lift off, reduce speed and do not overtake until the green flag.',action:'SLOW DOWN · NO OVERTAKING',priority:88});
    if(weather.safetyCar)candidates.push({key:'safety-car',level:'warning',title:'SAFETY CAR DEPLOYED',message:'The field is neutralised. Hold position, avoid sudden braking and use the reduced pace to manage tyres.',action:'HOLD POSITION',priority:90});

    if(lastRain!==null&&Math.abs(rain-lastRain)>=.22){
      const wetting=rain>lastRain;
      candidates.push({key:wetting?'rain-increasing':'rain-easing',level:'info',title:wetting?'RAIN INTENSIFYING':'TRACK BEGINNING TO DRY',message:wetting?'Rain is increasing and grip is falling. Reassess tyre choice before the next sector.':'Rain is easing. Watch the racing line for a dry line before switching compounds.',action:'REASSESS TYRE STRATEGY',priority:58});
    }
    lastRain=rain;

    const standings=Array.isArray(snapshot.standings)?snapshot.standings:[];
    const playerIndex=standings.findIndex(driver=>driver.isPlayer||driver.id==='player');
    if(playerIndex>0){
      const ahead=standings[playerIndex-1];
      const gap=Math.max(0,(Number(ahead.distance)||0)-(Number(standings[playerIndex].distance)||0));
      if(gap<42){
        const closing=gapClosing>0.5?` Closing at ${Math.round(gapClosing*3.6)} km/h.`:'';
        candidates.push({key:'car-ahead',level:'info',title:'CAR AHEAD',message:`${ahead.name||'RIVAL'} is ${Math.round(gap)} metres ahead.${closing} Prepare a clean passing opportunity.`,action:gap<16?'LOOK FOR THE EXIT':'ATTACK WHEN SAFE',priority:38});
      }else if(gap<115&&gapClosing>1.5){
        candidates.push({key:'closing-on-rival',level:'info',title:'CLOSING THE GAP',message:`You are gaining on ${ahead.name||'the car ahead'}; ${Math.round(gap)} metres remain. Stay in the slipstream.`,action:'BUILD THE ATTACK',priority:31});
      }
    }
    if(playerIndex>=0&&playerIndex<standings.length-1){
      const behind=standings[playerIndex+1];
      const gap=Math.max(0,(Number(standings[playerIndex].distance)||0)-(Number(behind.distance)||0));
      if(gap<24)candidates.push({key:'car-behind',level:'info',title:'CAR BEHIND',message:`${behind.name||'RIVAL'} is only ${Math.round(gap)} metres behind. Prioritise a clean exit and defend safely.`,action:'DEFEND THE LINE',priority:34});
    }

    const position=Number(snapshot.position);
    if(lastPosition!==null&&Number.isFinite(position)&&position<lastPosition)candidates.push({key:'overtake',level:'success',title:'POSITION GAINED',message:`Excellent move — up to P${position}. Keep the momentum and manage the tyres.`,action:'DEFEND YOUR POSITION',priority:46});
    else if(lastPosition!==null&&Number.isFinite(position)&&position>lastPosition)candidates.push({key:'position-lost',level:'warning',title:'POSITION LOST',message:`We have dropped to P${position}. Stay calm; focus on clean exits and the next opportunity.`,action:'RESET THE ATTACK',priority:42});
    if(Number.isFinite(position))lastPosition=position;

    const bestMs=parseLapTime(snapshot.bestLapMs??snapshot.bestLap);
    const currentLapMs=parseLapTime(snapshot.lastLapMs??snapshot.lastLap);
    if(currentLapMs&&bestMs&&currentLapMs>bestMs*1.035)candidates.push({key:'pace-loss',level:'info',title:'PACE DELTA',message:`This lap is ${((currentLapMs/bestMs-1)*100).toFixed(1)}% slower than your best. Review braking consistency and corner exits.`,action:'FOCUS ON CLEAN EXITS',priority:32});

    if(Number.isFinite(Number(snapshot.lap))&&lastLap!==null&&Number(snapshot.lap)>lastLap){
      lastIssued.delete('pace-loss');lastIssued.delete('fuel-watch');lastIssued.delete('closing-on-rival');
    }
    lastLap=lap;

    candidates.sort((a,b)=>b.priority-a.priority);
    const next=candidates.find(candidate=>{
      const previous=lastIssued.get(candidate.key)??-Infinity;
      const ready=now-previous>=cooldownMs;
      const urgent=candidate.level==='critical'||candidate.key==='safety-car'||candidate.key==='yellow-flag';
      return ready&&(urgent||now-lastAnyIssued>=cooldownMs);
    });
    if(next){
      const alert={...next,isAlert:true,at:now,expiresAt:now+alertDurationMs};
      lastIssued.set(next.key,now);lastAnyIssued=now;lastAlert=alert;
      return publish(alert,now);
    }

    if(lastAlert&&now<lastAlert.expiresAt)return null;
    lastAlert=null;
    if(now-lastRenderAt<1500)return null;

    const ahead=playerIndex>0?standings[playerIndex-1]:null;
    const gap=ahead?Math.max(0,(Number(ahead.distance)||0)-(Number(standings[playerIndex]?.distance)||0)):null;
    const fuelText=Number.isFinite(fuelRange)?`Fuel range ${fuelRange.toFixed(1)} laps`:`Fuel ${Math.round(fuel)}%`;
    const tyreText=wearRatePerMinute>0?`tyre life ~${Math.max(0,lapsToTyreLimit).toFixed(1)} laps`:`${compound} tyres ${Math.round(wear)}% worn`;
    const trafficText=gap!==null&&gap<150?` · ${Math.round(gap)}m to ${ahead.name||'rival'}`:'';
    const level=damage>=28||wear>=65?'warning':'info';
    const title=weather.safetyCar?'SAFETY CAR STRATEGY':weather.yellowFlag?'YELLOW FLAG PROCEDURE':'RACE STRATEGY';
    const message=`P${position||'?'} · Lap ${lap}/${totalLaps} · ${fuelText} · ${tyreText}${trafficText}.`;
    const action=damage>=28?'PLAN REPAIRS':wear>=65?'MANAGE TYRE LOAD':fuelRange<remainingLaps?'SAVE FUEL':'HOLD PACE · CLEAN EXITS';
    if(!currentStatus||currentStatus.isAlert||currentStatus.message!==message||currentStatus.title!==title||now-lastRenderAt>=3500){
      return publish({level,title,message,action,isAlert:false},now);
    }
    return null;
  }

  return {update,reset,getStatus,recordSector};
}
