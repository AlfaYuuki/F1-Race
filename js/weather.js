const WEATHER = {
  dry: { label:'DRY TRACK', grip:1, wear:1, rain:0, temperature:29 },
  cloudy: { label:'OVERCAST', grip:.985, wear:1.02, rain:0, temperature:24 },
  lightRain: { label:'LIGHT RAIN', grip:.84, wear:1.12, rain:.35, temperature:19 },
  heavyRain: { label:'HEAVY RAIN', grip:.68, wear:1.24, rain:.85, temperature:16 }
};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

export function createWeather(random = Math.random) {
  let current='dry', target='dry', transition=0, elapsed=0, nextChange=45, yellowFlag=0, safetyCar=0, eventCooldown=0;
  function reset() {
    current='dry'; target=random()<.35?'cloudy':'dry'; transition=0; elapsed=0; nextChange=45+random()*35; yellowFlag=0; eventCooldown=0;
  }
  function update(dt) {
    elapsed+=dt; eventCooldown=Math.max(0,eventCooldown-dt);
    if (elapsed>=nextChange) {
      const roll=random();
      target = current==='dry' ? (roll<.48?'cloudy':roll<.78?'lightRain':'dry')
        : current==='cloudy' ? (roll<.35?'dry':roll<.78?'lightRain':'cloudy')
        : current==='lightRain' ? (roll<.25?'cloudy':roll<.72?'heavyRain':'lightRain')
        : (roll<.55?'lightRain':'heavyRain');
      if(target!==current) transition=8;
      nextChange=elapsed+45+random()*65;
    }
    if(transition>0){transition=Math.max(0,transition-dt);if(!transition)current=target;}
    if(yellowFlag>0)yellowFlag=Math.max(0,yellowFlag-dt);
    if(eventCooldown===0 && yellowFlag===0 && elapsed>35 && random()<dt*.0008){yellowFlag=12+random()*5;eventCooldown=65;}
    const a=WEATHER[current],b=WEATHER[target],blend=transition>0?1-transition/8:0;
    return {
      ...a,
      grip:a.grip+(b.grip-a.grip)*blend,
      wear:a.wear+(b.wear-a.wear)*blend,
      rain:a.rain+(b.rain-a.rain)*blend,
      temperature:Math.round(a.temperature+(b.temperature-a.temperature)*blend),
      yellowFlag:yellowFlag>0,
      flagTime:yellowFlag,
      changed: transition>0
    };
  }
  function getState(){return { ...WEATHER[current], current, target, yellowFlag:yellowFlag>0, safetyCar:safetyCar>0, flagTime:yellowFlag }; }
  reset();
  return { reset, update, getState };
}
