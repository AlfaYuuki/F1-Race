// Procedural engine, shift, tyre and rain audio. Audio starts only after a user gesture.
export function createEngineAudio(){
  let context=null,osc=null,sub=null,filter=null,gain=null,started=false,lastGear=0,enabled=true;
  let squeal=null,squealGain=null,rainSource=null,rainGain=null;
  function ensure(){
    if(started){if(context.state==='suspended')context.resume();return;}
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    context=new Audio();osc=context.createOscillator();sub=context.createOscillator();filter=context.createBiquadFilter();gain=context.createGain();
    osc.type='sawtooth';sub.type='triangle';filter.type='lowpass';filter.frequency.value=500;gain.gain.value=0;
    osc.connect(filter);sub.connect(filter);filter.connect(gain);gain.connect(context.destination);osc.start();sub.start();
    squeal=context.createOscillator();squeal.type='sine';squeal.frequency.value=1450;squealGain=context.createGain();squealGain.gain.value=0;squeal.connect(squealGain);squealGain.connect(context.destination);squeal.start();
    const length=context.sampleRate*2,buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*.35;
    rainSource=context.createBufferSource();rainSource.buffer=buffer;rainSource.loop=true;
    const rainFilter=context.createBiquadFilter();rainFilter.type='lowpass';rainFilter.frequency.value=900;
    rainGain=context.createGain();rainGain.gain.value=0;rainSource.connect(rainFilter);rainFilter.connect(rainGain);rainGain.connect(context.destination);rainSource.start();
    started=true;
  }
  function update(rpm,throttle,gear,running,options={}){
    if(!enabled||!running){if(gain&&context){gain.gain.setTargetAtTime(0,context.currentTime,.08);squealGain.gain.setTargetAtTime(0,context.currentTime,.06);rainGain.gain.setTargetAtTime(0,context.currentTime,.15);}return;}
    ensure();if(!started)return;
    const now=context.currentTime,n=Math.max(0,Math.min(1,rpm/12000));
    osc.frequency.setTargetAtTime(34+n*150,now,.045);sub.frequency.setTargetAtTime(17+n*74,now,.06);
    filter.frequency.setTargetAtTime(240+n*1450,now,.08);gain.gain.setTargetAtTime(.018+Math.max(0,Math.min(1,throttle))*.035,now,.07);
    squeal.frequency.setTargetAtTime(1150+Math.min(1,Math.abs(options.skid||0))*950,now,.04);
    squealGain.gain.setTargetAtTime(Math.min(.018,Math.abs(options.skid||0)*.018),now,.05);
    rainGain.gain.setTargetAtTime(Math.min(.012,Math.max(0,options.rain||0)*.012),now,.2);
    if(lastGear&&gear!==lastGear){
      const shift=context.createOscillator(),g=context.createGain();shift.type='square';shift.frequency.setValueAtTime(150,now);
      shift.frequency.exponentialRampToValueAtTime(55,now+.075);g.gain.setValueAtTime(.025,now);g.gain.exponentialRampToValueAtTime(.001,now+.085);
      shift.connect(g);g.connect(context.destination);shift.start(now);shift.stop(now+.09);
    }
    lastGear=gear;
  }
  function playRadio(message){
    if(!enabled)return;
    ensure();
    if('speechSynthesis' in window && typeof SpeechSynthesisUtterance!=='undefined'){
      try{window.speechSynthesis.cancel();const line=new SpeechSynthesisUtterance(String(message).replace(/[—–]/g,','));line.rate=1.12;line.pitch=.88;line.volume=.72;window.speechSynthesis.speak(line);}catch{}
    }
  }
  function toggle(){enabled=!enabled;if(!enabled&&gain&&context){gain.gain.setTargetAtTime(0,context.currentTime,.05);squealGain.gain.setTargetAtTime(0,context.currentTime,.05);rainGain.gain.setTargetAtTime(0,context.currentTime,.05);window.speechSynthesis?.cancel?.();}return enabled;}
  return {update,toggle,playRadio,resume:()=>{if(enabled)ensure();}};
}
