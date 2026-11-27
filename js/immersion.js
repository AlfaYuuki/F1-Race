const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));

export function getWeatherVisuals(weather={}) {
  const rain=clamp(weather.rain,0,1);
  const wetness=clamp(rain*.9+(weather.transition ? .08 : 0),0,.9);
  return {
    rain,
    wetness,
    cloud:clamp((weather.current==='cloudy' ? .42 : 0)+rain*.5,0,.9),
    visibility:1-rain*.16,
    temperature:Number(weather.temperature)||24
  };
}

export function getSurfaceEffects({speed=0,skid=0,offRoad=false,impact=0,weather={}}={}) {
  const visuals=getWeatherVisuals(weather);
  return {
    smoke:clamp(Math.max(Number(skid)||0,offRoad ? .42 : 0)*(speed>45?1:0),0,1),
    sparks:clamp((offRoad?1:0)*Math.max(0,(Number(speed)||0)-115)/160+clamp(impact,0,1)*.35,0,1),
    spray:clamp(visuals.wetness*Math.max(0,Number(speed)||0)/210,0,1),
    ...visuals
  };
}

export function createImmersionEffects(canvas) {
  const parent=canvas?.parentElement;
  if(!parent||typeof document==='undefined')return {update(){},setPhase(){},destroy(){}};
  if(getComputedStyle(parent).position==='static')parent.style.position='relative';
  const layer=document.createElement('canvas');
  layer.className='race-immersion-layer';
  layer.setAttribute('aria-hidden','true');
  layer.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';
  parent.appendChild(layer);
  const ctx=layer.getContext('2d');
  let width=1,height=1,dpr=1,clock=0,phase='idle',phaseTime=0,particles=[];
  let lastWidth=0,lastHeight=0;
  const style=document.createElement('style');
  style.dataset.immersion='true';
  style.textContent=`
    .race-immersion-layer{mix-blend-mode:screen;opacity:.92}
    .race-immersion-layer.cinematic-start{animation:race-start-flash 1.2s ease-out both}
    .race-immersion-layer.cinematic-finish{animation:race-finish-glow 2.8s ease-out both}
    .race-cinematic-label{position:absolute;z-index:3;left:50%;top:23%;transform:translate(-50%,-12px);padding:10px 18px;border:1px solid #ffffff80;background:#071522b8;color:#fff;font:700 clamp(12px,2vw,20px) ui-monospace,monospace;letter-spacing:.22em;text-align:center;opacity:0;pointer-events:none;text-shadow:0 2px 12px #000}
    .race-cinematic-label.active{animation:race-label-in 2.4s ease both}
    @keyframes race-start-flash{0%{opacity:0}18%{opacity:1}100%{opacity:.4}}
    @keyframes race-finish-glow{0%{opacity:0}15%{opacity:1}100%{opacity:.15}}
    @keyframes race-label-in{0%{opacity:0;transform:translate(-50%,10px)}18%,75%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-10px)}}
    @media(prefers-reduced-motion:reduce){.race-immersion-layer,.race-cinematic-label{animation:none!important}}
  `;
  document.head.appendChild(style);
  const label=document.createElement('div');
  label.className='race-cinematic-label';
  label.setAttribute('aria-hidden','true');
  parent.appendChild(label);
  function resize(){
    const rect=canvas.getBoundingClientRect();
    width=Math.max(1,rect.width);height=Math.max(1,rect.height);
    dpr=Math.min(window.devicePixelRatio||1,1.15);
    layer.width=Math.round(width*dpr);layer.height=Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    lastWidth=width;lastHeight=height;
  }
  function setPhase(next){
    if(next===phase)return;
    phase=next;phaseTime=0;
    layer.classList.remove('cinematic-start','cinematic-finish');
    label.classList.remove('active');
    if(next==='start'){
      layer.classList.add('cinematic-start');label.textContent='LIGHTS OUT · RACE ON';label.classList.add('active');
    }else if(next==='finish'){
      layer.classList.add('cinematic-finish');label.textContent='CHEQUERED FLAG';label.classList.add('active');
    }
  }
  function spawn(x,y,count,kind){
    for(let i=0;i<count;i++){
      const angle=Math.random()*Math.PI*2,velocity=kind==='spark' ? 70+Math.random()*210 : 8+Math.random()*30;
      particles.push({x,y,vx:Math.cos(angle)*velocity,vy:Math.sin(angle)*velocity-(kind==='spark'?60:12),
        life:kind==='spark' ? .22+.2*Math.random() : .45+.55*Math.random(),max:kind==='spark' ? .42 : 1,
        size:kind==='spark' ? 1+Math.random()*2 : 5+Math.random()*12,kind});
    }
    if(particles.length>100)particles.splice(0,particles.length-100);
  }
  function update(dt,state={}){
    const step=clamp(dt,0,.05);clock+=step;phaseTime+=step;
    if(width!==lastWidth||height!==lastHeight)resize();
    const effects=getSurfaceEffects(state);
    ctx.clearRect(0,0,width,height);
    if(effects.wetness>0){
      const sheen=ctx.createLinearGradient(0,height*.45,0,height);
      sheen.addColorStop(0,'rgba(150,190,220,0)');
      sheen.addColorStop(1,`rgba(155,195,225,${effects.wetness*.105})`);
      ctx.fillStyle=sheen;ctx.fillRect(0,0,width,height);
    }
    if(effects.rain>.02){
      ctx.strokeStyle=`rgba(220,238,250,${.12+effects.rain*.2})`;ctx.lineWidth=1;
      const count=Math.round(18+effects.rain*42);
      ctx.beginPath();
      for(let i=0;i<count;i++){
        const x=(i*83+clock*(95+i%5*17))%(width+30)-15;
        const y=(i*137+clock*(310+i%7*24))%(height+35)-18;
        ctx.moveTo(x,y);ctx.lineTo(x-5,y+13+effects.rain*8);
      }
      ctx.stroke();
    }
    // Crowd flags and arms sway subtly along the distant grandstand line.
    if(width>480){
      ctx.strokeStyle='rgba(245,245,235,.34)';ctx.lineWidth=1;
      ctx.beginPath();
      for(let i=0;i<18;i++){
        const x=(i+.5)*width/18,y=height*.39+Math.sin(clock*2.4+i*1.7)*2;
        ctx.moveTo(x,y+5);ctx.lineTo(x+Math.sin(clock*3+i)*3,y-3);
        ctx.lineTo(x+Math.sin(clock*3+i)*5,y-6);
      }
      ctx.stroke();
    }
    const carX=width*.5,carY=height*.865;
    if(effects.smoke>.08&&Math.random()<step*18)spawn(carX+(Math.random()-.5)*width*.1,carY,2,'smoke');
    if(effects.sparks>.1&&Math.random()<step*22)spawn(carX+(Math.random()-.5)*width*.12,carY+height*.015,3,'spark');
    particles=particles.filter(p=>p.life>0);
    for(const p of particles){
      p.life-=step;p.x+=p.vx*step;p.y+=p.vy*step;p.vy+=p.kind==='spark'?150:8;
      ctx.globalAlpha=Math.max(0,p.life/p.max)*(p.kind==='spark' ? .9 : .28);
      ctx.fillStyle=p.kind==='spark'?'#ffd78a':'#d7dce0';
      ctx.beginPath();ctx.arc(p.x,p.y,p.size*(p.kind==='smoke'?1+(1-p.life)*.5:1),0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
    // Subtle wheel rotation cues at the player's four tyre contact points.
    if(state.running&&state.speed>35){
      const rotation=clock*state.speed*.075;
      const wheelX=width*.047,wheelY=height*.018;
      ctx.strokeStyle='rgba(225,235,240,.22)';ctx.lineWidth=1;
      for(const side of [-1,1])for(const axle of [-1,1]){
        const x=carX+side*wheelX,y=carY+axle*wheelY;
        ctx.beginPath();ctx.arc(x,y,Math.max(3,width*.004),rotation,rotation+Math.PI*.72);ctx.stroke();
      }
    }
    if(effects.spray>.04){
      const gradient=ctx.createRadialGradient(carX,carY,2,carX,carY,height*.16);
      gradient.addColorStop(0,`rgba(210,225,235,${effects.spray*.11})`);
      gradient.addColorStop(1,'rgba(210,225,235,0)');
      ctx.fillStyle=gradient;ctx.fillRect(carX-width*.2,carY-height*.18,width*.4,height*.2);
    }
  }
  resize();
  window.addEventListener('resize',resize,{passive:true});
  return {update,setPhase,destroy(){layer.remove();label.remove();style.remove();window.removeEventListener('resize',resize);}};
}
