// Lightweight synthesized engine tone; initialized only after the player's first gesture.
export function createEngineAudio(){
  let context=null,osc=null,sub=null,filter=null,gain=null,started=false,enabled=true,lastGear=0;
  function ensure(){
    if(started){if(context.state==='suspended')context.resume();return;}
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    context=new Audio();osc=context.createOscillator();sub=context.createOscillator();filter=context.createBiquadFilter();gain=context.createGain();
    osc.type='sawtooth';sub.type='triangle';filter.type='lowpass';filter.frequency.value=500;gain.gain.value=0;
    osc.connect(filter);sub.connect(filter);filter.connect(gain);gain.connect(context.destination);osc.start();sub.start();started=true;
  }
  function update(rpm,throttle,gear,running){
    if(!enabled||!running){if(gain&&context)gain.gain.setTargetAtTime(0,context.currentTime,.08);return;}
    ensure();if(!started)return;const now=context.currentTime,n=Math.max(0,Math.min(1,rpm/12000));
    osc.frequency.setTargetAtTime(34+n*150,now,.045);sub.frequency.setTargetAtTime(17+n*74,now,.06);filter.frequency.setTargetAtTime(240+n*1450,now,.08);gain.gain.setTargetAtTime(.018+throttle*.035,now,.07);
    if(lastGear&&gear!==lastGear){const shift=context.createOscillator(),g=context.createGain();shift.type='square';shift.frequency.setValueAtTime(150,now);shift.frequency.exponentialRampToValueAtTime(55,now+.075);g.gain.setValueAtTime(.025,now);g.gain.exponentialRampToValueAtTime(.001,now+.085);shift.connect(g);g.connect(context.destination);shift.start(now);shift.stop(now+.09);}lastGear=gear;
  }
  function toggle(){enabled=!enabled;if(!enabled&&gain&&context)gain.gain.setTargetAtTime(0,context.currentTime,.05);return enabled;}
  return {update,toggle,resume:()=>{if(enabled)ensure();}};
}
