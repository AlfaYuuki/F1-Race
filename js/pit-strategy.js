const COMPOUND_LIFE = { SOFT: 4.5, MEDIUM: 2.9, HARD: 1.8, INTER: 3.3 };
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

export function createPitStrategy() {
  let lastLap=1,lastPitStops=0,lapFuelStart=100,lapWearStart=0;
  let fuelPerLap=2.2,wearPerLap=COMPOUND_LIFE.MEDIUM;

  function reset(snapshot={}) {
    lastLap=Math.max(1,Number(snapshot.lap)||1);
    lastPitStops=Math.max(0,Number(snapshot.pitStops)||0);
    lapFuelStart=clamp(Number(snapshot.fuel)||0,0,100);
    lapWearStart=clamp(Number(snapshot.tireWear)||0,0,100);
    fuelPerLap=2.2;
    wearPerLap=COMPOUND_LIFE[snapshot.compound]||COMPOUND_LIFE.MEDIUM;
  }

  function update(snapshot={}) {
    const lap=Math.max(1,Number(snapshot.lap)||1);
    const fuel=clamp(Number(snapshot.fuel)||0,0,100);
    const tireWear=clamp(Number(snapshot.tireWear)||0,0,100);
    const compound=Object.hasOwn(COMPOUND_LIFE,snapshot.compound)?snapshot.compound:'MEDIUM';
    const pitStops=Math.max(0,Number(snapshot.pitStops)||0);
    const totalLaps=Math.max(lap,Number(snapshot.totalLaps)||50);

    if(pitStops!==lastPitStops||lap<lastLap) reset(snapshot);
    else if(lap>lastLap) {
      const completed=lap-lastLap;
      const measuredFuel=(lapFuelStart-fuel)/completed;
      const measuredWear=(tireWear-lapWearStart)/completed;
      if(Number.isFinite(measuredFuel)&&measuredFuel>0&&measuredFuel<20) fuelPerLap=fuelPerLap*.55+measuredFuel*.45;
      if(Number.isFinite(measuredWear)&&measuredWear>0&&measuredWear<40) wearPerLap=wearPerLap*.55+measuredWear*.45;
      lastLap=lap;lapFuelStart=fuel;lapWearStart=tireWear;
    }

    const remainingLaps=Math.max(0,totalLaps-lap+1);
    const rain=clamp(Number(snapshot.weather?.rain)||0,0,1);
    const wet=rain>=.35;
    const requiredFuel=remainingLaps*fuelPerLap*1.08+3;
    const projectedWear=tireWear+wearPerLap*remainingLaps;
    const fuelCritical=fuel<requiredFuel;
    const tyresCritical=projectedWear>=100||tireWear>=82;
    const shouldPit=remainingLaps>1&&(fuelCritical||tyresCritical)&&pitStops<3;
    let recommendedCompound=wet?'INTER':remainingLaps<=8?'SOFT':remainingLaps>24?'HARD':'MEDIUM';
    if(!wet&&remainingLaps>15&&rain>.18) recommendedCompound='INTER';
    const targetFuel=clamp(Math.ceil(requiredFuel/5)*5,Math.ceil(fuel/5)*5,100);

    let status='ON STRATEGY',priority='normal';
    let message='Estimated range '+Math.max(0,Math.floor(fuel/Math.max(.1,fuelPerLap)))+' laps · projected tyre wear '+Math.round(projectedWear)+'% at the flag.';
    if(shouldPit) {
      status='BOX THIS LAP';priority='urgent';
      message=fuelCritical
        ?'Fuel range is short by approximately '+Math.ceil(requiredFuel-fuel)+'%. Take '+recommendedCompound+' tyres and refuel to '+targetFuel+'%.'
        :'Tyres are projected to reach '+Math.round(projectedWear)+'% wear. Switch to '+recommendedCompound+' for the remaining '+remainingLaps+' laps.';
    } else if(pitStops>=3&&(fuelCritical||tyresCritical)) {
      status='PROTECT THE STINT';priority='warning';
      message='Pit-stop allowance reached. Manage pace, avoid kerbs and protect remaining fuel and tyre life.';
    } else if(remainingLaps>1&&(projectedWear>=72||fuel<requiredFuel+12)) {
      status='PLAN A STOP';priority='warning';
      message='Prepare a '+recommendedCompound+' stop. '+Math.round(tireWear)+'% tyre wear now; estimated fuel need '+Math.ceil(requiredFuel)+'%.';
    }
    return {status,priority,message,shouldPit,compound:recommendedCompound,fuelTarget:targetFuel,
      repair:Number(snapshot.damage)>4,remainingLaps,fuelPerLap:Number(fuelPerLap.toFixed(2)),
      requiredFuel:Number(requiredFuel.toFixed(1)),projectedWear:Math.round(projectedWear)};
  }
  return {update,reset};
}
