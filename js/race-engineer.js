const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function parseLapTime(value) {
  if (Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const match=value.match(/^(\d+):(\d{2})\.(\d{3})$/);
  return match ? Number(match[1])*60000+Number(match[2])*1000+Number(match[3]) : null;
}

export function createRaceEngineer(options={}) {
  const cooldownMs=Math.max(5000,Number(options.cooldownMs)||18000);
  let lastIssued=new Map(),lastAlert=null,lastPosition=null,lastLap=null,lastAnyIssued=-Infinity,bestSectors=new Map();
  function reset() {
    lastIssued=new Map();lastAlert=null;lastPosition=null;lastLap=null;lastAnyIssued=-Infinity;bestSectors=new Map();
    return getStatus();
  }
  function getStatus() {
    return lastAlert ? {...lastAlert} : {
      level:'info',title:'ENGINEER ONLINE',
      message:'Monitoring fuel, tyres, pace and track conditions.',
      action:'PUSH WHEN READY'
    };
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
      action:'FIND TIME IN '+key,priority:35,at:now
    };
    if(now-(lastIssued.get(alert.key)??-Infinity)<cooldownMs)return null;
    lastIssued.set(alert.key,now);lastAnyIssued=now;lastAlert=alert;
    return getStatus();
  }
  function update(snapshot={}) {
    if(snapshot.state!=='running') return null;
    const now=Number.isFinite(snapshot.now)?snapshot.now:Date.now();
    const fuel=clamp(Number(snapshot.fuel)||0,0,100);
    const wear=clamp(Number(snapshot.tireWear)||0,0,100);
    const damage=clamp(Number(snapshot.damage)||0,0,100);
    const flow=Math.max(0,Number(snapshot.fuelFlow)||0);
    const lap=Math.max(1,Number(snapshot.lap)||1);
    const remainingLaps=Math.max(0,(Number(snapshot.totalLaps)||50)-lap+1);
    const lapMs=parseLapTime(snapshot.lastLapMs??snapshot.lastLap);
    const bestMs=parseLapTime(snapshot.bestLapMs??snapshot.bestLap);
    const weather=snapshot.weather||{};
    const compound=String(snapshot.compound||'MEDIUM').toUpperCase();
    const candidates=[];

    if(damage>=55)candidates.push({key:'damage-critical',level:'critical',title:'CAR DAMAGE CRITICAL',message:'Damage is severely affecting the car. Avoid contact and box for repairs.',action:'BOX FOR REPAIRS',priority:100});
    else if(damage>=28)candidates.push({key:'damage-high',level:'warning',title:'CAR DAMAGE RISING',message:'The car is losing performance from damage. Keep clear of traffic and plan repairs.',action:'REPAIR AT NEXT STOP',priority:75});

    const lapMinutes=lapMs?lapMs/60000:1.35;
    const fuelPerLap=flow>0.15?flow*lapMinutes:0;
    const fuelRange=fuelPerLap>0?fuel/fuelPerLap:Infinity;
    if(fuel<=8)candidates.push({key:'fuel-critical',level:'critical',title:'FUEL CRITICAL',message:'Fuel is critically low. Lift and coast where safe, then pit immediately.',action:'BOX NOW',priority:98});
    else if(fuelRange<1.35&&remainingLaps>fuelRange+.2)candidates.push({key:'fuel-box',level:'critical',title:'FUEL WILL NOT REACH FINISH',message:'At the current fuel rate, the tank will not cover the remaining distance.',action:'PLAN A PIT STOP NOW',priority:92});
    else if(fuelRange<2.5&&remainingLaps>fuelRange+.5)candidates.push({key:'fuel-watch',level:'warning',title:'FUEL STRATEGY',message:'Fuel range is getting tight. Reduce unnecessary throttle or prepare a fuel stop.',action:'SAVE FUEL / PLAN BOX',priority:68});

    if(wear>=88)candidates.push({key:'tyres-critical',level:'critical',title:'TYRES AT THE LIMIT',message:'Tyre wear is extremely high. Grip may fall away quickly.',action:'BOX FOR FRESH TYRES',priority:95});
    else if(wear>=70)candidates.push({key:'tyres-worn',level:'warning',title:'TYRE DEGRADED',message:'Tyre wear is costing grip. Smooth steering and braking will help preserve the set.',action:'CONSIDER A TYRE STOP',priority:72});

    if(weather.rain>=.58&&compound!=='INTER')candidates.push({key:'wet-tyres',level:'warning',title:'WET WEATHER STRATEGY',message:'Track is very wet. Intermediate tyres are likely to provide better control.',action:'CONSIDER INTERMEDIATES',priority:82});
    else if(weather.rain<=.08&&compound==='INTER')candidates.push({key:'dry-tyres',level:'warning',title:'DRY TRACK — WRONG TYRE',message:'The track is dry. Intermediate tyres are likely costing pace and wearing faster.',action:'SWITCH TO SLICKS',priority:76});

    if(snapshot.offRoad)candidates.push({key:'off-track',level:'warning',title:'OFF TRACK',message:'You are off the racing surface. Rejoin carefully and avoid abrupt steering.',action:'SAFE REJOIN',priority:60});
    if(lapMs&&bestMs&&lapMs>bestMs*1.035)candidates.push({key:'pace-loss',level:'info',title:'PACE DELTA',message:'This lap is more than 3.5% slower than your best. Review corner exits and braking consistency.',action:'FOCUS ON CLEAN EXITS',priority:35});

    const standings=Array.isArray(snapshot.standings)?snapshot.standings:[];
    const playerIndex=standings.findIndex(driver=>driver.isPlayer||driver.id==='player');
    if(playerIndex>0){
      const ahead=standings[playerIndex-1],gap=Math.max(0,(Number(ahead.distance)||0)-(Number(standings[playerIndex]?.distance)||0));
      if(gap>0&&gap<32)candidates.push({key:'car-ahead',level:'info',title:'CAR AHEAD',message:`${ahead.name||'RIVAL'} is only ${Math.round(gap)} metres ahead. Prepare a clean passing opportunity.`,action:'ATTACK WHEN SAFE',priority:28});
    }
    if(lastPosition!==null&&Number(snapshot.position)<lastPosition)candidates.push({key:'overtake',level:'success',title:'POSITION GAINED',message:`Good work — you are now P${snapshot.position}. Keep the momentum.`,action:'DEFEND YOUR POSITION',priority:45});
    lastPosition=Number.isFinite(Number(snapshot.position))?Number(snapshot.position):lastPosition;

    if(Number.isFinite(Number(snapshot.lap))&&lastLap!==null&&Number(snapshot.lap)>lastLap){
      lastIssued.delete('pace-loss');
      lastIssued.delete('fuel-watch');
    }
    lastLap=lap;

    candidates.sort((a,b)=>b.priority-a.priority);
    if(now-lastAnyIssued<cooldownMs)return null;
    const next=candidates.find(candidate=>now-(lastIssued.get(candidate.key)??-Infinity)>=cooldownMs);
    if(!next)return null;
    lastIssued.set(next.key,now);lastAnyIssued=now;
    lastAlert={...next,at:now};
    return getStatus();
  }
  return {update,reset,getStatus,recordSector};
}
