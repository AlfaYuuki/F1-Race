const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const COMPOUNDS=Object.freeze({SOFT:{grip:1.08,wear:.18},MEDIUM:{grip:1,wear:.115},HARD:{grip:.94,wear:.07},INTER:{grip:.86,wear:.13}});
export function evaluatePitStrategy(snapshot={}) {
 const lap=Math.max(1,Number(snapshot.lap)||1),totalLaps=Math.max(lap,Number(snapshot.totalLaps)||50),remaining=Math.max(0,totalLaps-lap+1);
 const fuel=clamp(Number(snapshot.fuel)||0,0,100),wear=clamp(Number(snapshot.tireWear)||0,0,100),rain=clamp(Number(snapshot.weather?.rain)||0,0,1);
 const raw=String(snapshot.compound||'MEDIUM').toUpperCase(),compound=COMPOUNDS[raw]?raw:'MEDIUM';
 const lapMs=Math.max(45000,Math.min(180000,Number(snapshot.lastLapMs)||85000)),flow=Math.max(0,Number(snapshot.fuelFlow)||0);
 const fuelPerLap=flow>0?flow*lapMs/60000:8,fuelRange=fuelPerLap>0?fuel/fuelPerLap:Infinity;
 const wearRate=Math.max(0,Number(snapshot.wearRatePerLap)||COMPOUNDS[compound].wear*lapMs/60000);
 const lapsToLimit=wearRate>0?Math.max(0,(88-wear)/wearRate):Infinity,wet=rain>=.58,dry=rain<=.08;
 let targetCompound=compound;
 if(wet)targetCompound='INTER';else if(compound==='INTER'&&dry)targetCompound=remaining>10?'HARD':'MEDIUM';else if(remaining<=5)targetCompound='SOFT';else if(remaining>12||wearRate>1.35)targetCompound='HARD';else targetCompound='MEDIUM';
 const fuelStop=fuelRange+.15<remaining,tyreStop=wear>=78||lapsToLimit<=1.35,weatherStop=(wet&&compound!=='INTER')||(dry&&compound==='INTER'),damageStop=Number(snapshot.damage)>=28;
 const requiredStop=fuelStop||tyreStop||weatherStop||damageStop,reasons=[];
 if(fuelStop)reasons.push('fuel range is shorter than the remaining distance');
 if(tyreStop)reasons.push('tyre life is approaching the performance limit');
 if(weatherStop)reasons.push(wet?'rain favours intermediate tyres':'the track is dry enough for slicks');
 if(damageStop)reasons.push('car damage is affecting performance');
 const fuelTarget=Math.round(Math.min(100,Math.max(fuel,fuelPerLap*Math.min(12.5,remaining)+5)));
 return {lap,remaining,compound,targetCompound,fuelPerLap:Number(fuelPerLap.toFixed(2)),fuelRange:Number.isFinite(fuelRange)?Number(fuelRange.toFixed(1)):null,wear,lapsToLimit:Number.isFinite(lapsToLimit)?Number(lapsToLimit.toFixed(1)):null,fuelTarget,requiredStop,urgency:fuelRange<=1||wear>=92?'BOX NOW':requiredStop?'PIT WINDOW OPEN':'STAY OUT',pitWindow:requiredStop?'NOW':Number.isFinite(lapsToLimit)?'IN '+Math.max(1,Math.floor(lapsToLimit))+' LAPS':'MONITOR',reasons,reason:reasons.length?reasons.join('; '):'Current tyre and fuel state can cover the planned stint.'};
}
