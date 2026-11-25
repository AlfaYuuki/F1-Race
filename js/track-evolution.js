const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const lerp=(a,b,t)=>a+(b-a)*t;

// A compact surface model: water accumulates across the circuit while the
// racing line gains rubber under traffic and gradually loses it in rain.
export function createTrackEvolution() {
  let wetness=0,rubber=0.08,elapsed=0,trackTemperature=27;
  function reset(airTemperature=24) {
    wetness=0;rubber=.08;elapsed=0;trackTemperature=Number(airTemperature)+5;
    return getState();
  }
  function update(dt,weather={},traffic=20) {
    const step=clamp(Number(dt)||0,0,.1),rain=clamp(Number(weather.rain)||0,0,1);
    elapsed+=step;
    const rainGain=rain*(.012+rain*.018);
    const drying=(1-rain)*(.0018+Math.max(0,trackTemperature-18)*.00012);
    wetness=clamp(wetness+(rainGain-drying)*step,0,1);
    const rubberGain=clamp(Number(traffic)||0,0,40)*.0000025*step*(1-rain*.8);
    rubber=clamp(rubber+rubberGain-rain*.0008*step,0,1);
    const air=Number(weather.temperature)||24;
    const targetTemp=air+7-rain*5;
    trackTemperature=lerp(trackTemperature,targetTemp,Math.min(1,step*.018));
    return getState();
  }
  function sample(progress=0,lane=0) {
    const lineFactor=clamp(1-Math.abs(Number(lane)||0)*.72,0,1);
    const localRubber=rubber*lineFactor;
    const wetGrip=1-wetness*.34;
    const rubberGrip=1+localRubber*.045;
    const offLinePenalty=Math.abs(lane)>.62?.035:0;
    return {grip:clamp(wetGrip*rubberGrip-offLinePenalty,.55,1.06),
      wetness,rubber:localRubber,trackTemperature:Math.round(trackTemperature),
      progress:((Number(progress)||0)%1+1)%1};
  }
  function getState(){
    const grip=clamp((1-wetness*.34)*(1+rubber*.045),.55,1.06);
    return {wetness:Number(wetness.toFixed(3)),rubber:Number(rubber.toFixed(3)),
      grip:Number(grip.toFixed(3)),trackTemperature:Math.round(trackTemperature),
      condition:wetness>.68?'WET':wetness>.28?'DAMP':'DRY',
      rubbering:rubber>.62?'HIGH':rubber>.25?'BUILDING':'LOW',elapsed};
  }
  reset();
  return {reset,update,sample,getState};
}
