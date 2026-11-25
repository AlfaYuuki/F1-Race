const WEATHER = Object.freeze({
  dry: { label:'DRY', grip:1, wear:1, rain:0, temperature:29 },
  cloudy: { label:'OVERCAST', grip:.985, wear:1.02, rain:0, temperature:24 },
  lightRain: { label:'LIGHT RAIN', grip:.84, wear:1.12, rain:.35, temperature:19 },
  heavyRain: { label:'HEAVY RAIN', grip:.68, wear:1.24, rain:.85, temperature:16 }
});
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const STATES=Object.keys(WEATHER);

export function createWeather(random=Math.random) {
  let current='dry',target='dry',transition=0,elapsed=0,nextChange=45,yellowFlag=0,safetyCar=0,eventCooldown=0;
  let intensity=0,temperature=29,forecast='dry';
  function reset() {
    current='dry';target=random()<.35?'cloudy':'dry';transition=0;elapsed=0;
    nextChange=45+random()*35;yellowFlag=0;safetyCar=0;eventCooldown=0;
    intensity=WEATHER[current].rain;temperature=WEATHER[current].temperature;forecast=target;
  }
  function chooseNext() {
    const roll=random();
    if(current==='dry') target=roll<.34?'cloudy':roll<.72?'lightRain':'dry';
    else if(current==='cloudy') target=roll<.3?'dry':roll<.72?'lightRain':'cloudy';
    else if(current==='lightRain') target=roll<.24?'cloudy':roll<.68?'heavyRain':'lightRain';
    else target=roll<.58?'lightRain':'heavyRain';
    forecast=target;
    if(target!==current) transition=18;
    nextChange=elapsed+55+random()*75;
  }
  function update(dt) {
    const step=clamp(Number(dt)||0,0,.1);
    elapsed+=step;eventCooldown=Math.max(0,eventCooldown-step);
    if(elapsed>=nextChange) chooseNext();
    if(transition>0) {
      const from=WEATHER[current],to=WEATHER[target],blend=1-transition/18;
      intensity=from.rain+(to.rain-from.rain)*blend;
      temperature=from.temperature+(to.temperature-from.temperature)*blend;
      transition=Math.max(0,transition-step);
      if(transition===0){current=target;intensity=WEATHER[current].rain;temperature=WEATHER[current].temperature;}
    } else { intensity=WEATHER[current].rain;temperature=WEATHER[current].temperature; }
    if(yellowFlag>0)yellowFlag=Math.max(0,yellowFlag-step);
    if(safetyCar>0)safetyCar=Math.max(0,safetyCar-step);
    if(eventCooldown===0&&yellowFlag===0&&elapsed>35&&random()<step*.0035){
      yellowFlag=12+random()*5;if(random()<.28)safetyCar=18+random()*8;eventCooldown=65;
    }
    const base=WEATHER[current];
    const nearest=STATES.reduce((best,key)=>Math.abs(WEATHER[key].rain-intensity)<Math.abs(WEATHER[best].rain-intensity)?key:best,'dry');
    return {
      ...base,label:transition>0?(intensity>.58?'HEAVY RAIN':intensity>.12?'LIGHT RAIN':'OVERCAST'):base.label,
      current,target,forecast,rain:clamp(intensity,0,.9),
      grip:1-.32*intensity,wear:1+.28*intensity,
      temperature:Math.round(temperature),airTemperature:Math.round(temperature+5),
      windKph:Math.round(5+intensity*18),nextChangeIn:Math.max(0,Math.ceil(nextChange-elapsed)),
      transition:transition>0,yellowFlag:yellowFlag>0,safetyCar:safetyCar>0,flagTime:yellowFlag,
      condition:nearest
    };
  }
  function getState(){
    const base=WEATHER[current];
    return {...base,current,target,forecast,rain:intensity,grip:1-.32*intensity,wear:1+.28*intensity,
      temperature:Math.round(temperature),airTemperature:Math.round(temperature+5),
      windKph:Math.round(5+intensity*18),nextChangeIn:Math.max(0,Math.ceil(nextChange-elapsed)),
      transition:transition>0,yellowFlag:yellowFlag>0,safetyCar:safetyCar>0,flagTime:yellowFlag};
  }
  reset();
  return {reset,update,getState};
}
