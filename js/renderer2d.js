import { curveAt, elevationAt } from './track.js';
const lerp = (a,b,t) => a + (b-a)*t;

export function isForwardOpponent(relativeDistance) {
  const distance = Number(relativeDistance);
  return Number.isFinite(distance) && distance >= 0 && distance < 230;
}
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0, height = 0, dpr = 1, particles = [], impactFlash = 0, skidClock = 0;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function polygon(points,color) {
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
    ctx.closePath();ctx.fill();
  }
  function mountain(cx,base,scale) {
    ctx.save();ctx.translate(cx,base);ctx.scale(scale,scale);
    polygon([[-230,0],[-140,-100],[-78,-177],[-34,-224],[0,-245],[42,-218],[92,-151],[150,-72],[230,0]],'#e9f0ed');
    polygon([[-78,-177],[-34,-224],[0,-245],[42,-218],[16,-197],[-10,-210],[-42,-183]],'#fff');
    polygon([[-230,0],[-140,-100],[-78,-177],[-34,-224],[-70,-157],[-105,-104],[-143,-55]],'#718b98');
    polygon([[0,-245],[42,-218],[92,-151],[150,-72],[230,0],[76,0],[30,-72]],'#8ca3aa');
    ctx.restore();
  }
  function car(x,y,scale,color='#df3039',player=false,rotation=0,phase=0,speed=0) {
    ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.scale(scale,scale);
    // Four animated slicks with rotating alloy spokes.
    for(const side of [-1,1])for(const axle of [-1,1]){
      ctx.save();ctx.translate(side*29,axle*12);ctx.fillStyle='#10151a';ctx.beginPath();ctx.ellipse(0,0,8,16,0,0,Math.PI*2);ctx.fill();
      ctx.rotate(phase*(.8+Math.min(1,speed/330)*2));
      ctx.strokeStyle='#aab5bb';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.stroke();
      for(let spoke=0;spoke<4;spoke++){ctx.rotate(Math.PI/2);ctx.beginPath();ctx.moveTo(0,-1);ctx.lineTo(0,-4);ctx.stroke();}
      ctx.restore();
    }
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-27,25);ctx.lineTo(-23,-24);ctx.lineTo(-12,-42);ctx.lineTo(12,-42);ctx.lineTo(23,-24);ctx.lineTo(27,25);ctx.closePath();ctx.fill();
    ctx.fillStyle='#e8edf0';ctx.fillRect(-37,20,74,5);ctx.fillRect(-22,-37,44,4);
    ctx.fillStyle=color;ctx.fillRect(-42,18,10,8);ctx.fillRect(32,18,10,8);
    ctx.fillStyle='#18212b';ctx.beginPath();ctx.ellipse(0,-12,11,16,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#c6d0d7';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-13,-22);ctx.lineTo(-5,-31);ctx.lineTo(0,-27);ctx.lineTo(5,-31);ctx.lineTo(13,-22);ctx.stroke();
    ctx.fillStyle=player?'#ffd16a':'#fff';ctx.fillRect(-3,-37,6,5);
    ctx.fillStyle='#f7f7f4';ctx.fillRect(-29,22,10,3);ctx.fillRect(19,22,10,3);
    ctx.restore();
  }
  function spawnParticles(x,y,count,sparks=false){for(let i=0;i<count;i++)particles.push({x:x+(Math.random()-.5)*22,y:y+Math.random()*7,vx:(Math.random()-.5)*(sparks?150:24),vy:sparks?-Math.random()*125:-Math.random()*30,life:sparks?.28:.7,max:sparks?.28:.7,size:sparks?1+Math.random()*2:4+Math.random()*7,sparks});if(particles.length>120)particles.splice(0,particles.length-120);}
  function drawParticles(dt){particles=particles.filter(p=>p.life>0);for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(!p.sparks)p.size+=dt*8;ctx.globalAlpha=Math.max(0,p.life/p.max)*.45;ctx.fillStyle=p.sparks?'#ffd16a':'#d5d8d4';ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
  function render({position=0,playerX=0,speed=0,lateralVelocity=0,offRoad=false,running=false,opponents=[],cameraShake=0,playerColor='#df3039',skid=false,driftAngle=0,dt=.016,weather={},elapsed=0,raceState='running'}) {
    if(!width||!height)resize();
    const horizon=height*.405 + Math.sin(position*Math.PI*2)*height*.012;
    const wetness=Math.max(0,Math.min(.9,Number(weather?.rain)||0));
    const sky=ctx.createLinearGradient(0,0,0,horizon);
    sky.addColorStop(0,wetness>.55?'#526b7c':'#6798b4');sky.addColorStop(1,wetness>.55?'#aab8bb':'#dce5df');
    ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#9bb2b2';ctx.beginPath();ctx.moveTo(0,horizon);ctx.lineTo(0,horizon-25);ctx.quadraticCurveTo(width*.2,horizon-90,width*.39,horizon-26);ctx.quadraticCurveTo(width*.72,horizon-105,width,horizon-15);ctx.lineTo(width,horizon);ctx.fill();
    mountain(width*.73,horizon+5,Math.min(width/1150,1.25)*.95);
    ctx.fillStyle=wetness>.1?'#496f59':'#527c54';ctx.fillRect(0,horizon,width,height-horizon);
    const segments=110,road=[];
    for(let i=0;i<=segments;i++){
      const t=i/segments,depth=t*t;
      const lookAhead=(1-t)*.18;
      const trackProgress=position+lookAhead;
      const curve=curveAt(trackProgress);
      const bend=curveAt(position);
      const elevation=elevationAt(trackProgress);
      const y=lerp(horizon,height,t)-elevation*height*.11*depth;
      const roadW=lerp(width*.025,width*.49,depth);
      const center=width*.5 + bend*width*.14*(1-depth) + curve*width*.105*(1-depth);
      road.push({y,center,roadW,t,depth});
    }
    for(let i=0;i<segments;i++){
      const a=road[i],b=road[i+1],stripe=(i+Math.floor(position*LAP_SCROLL))%2;
      polygon([[a.center-a.roadW,a.y],[a.center+a.roadW,a.y],[b.center+b.roadW,b.y],[b.center-b.roadW,b.y]],wetness>.1?'#303a42':'#343a40');
      if(wetness>.08)polygon([[a.center-a.roadW*.18,a.y],[a.center+a.roadW*.18,a.y],[b.center+b.roadW*.18,b.y],[b.center-b.roadW*.18,b.y]],'rgba(170,205,220,'+(wetness*.12)+')');
      const ca=a.roadW*.075,cb=b.roadW*.075;
      polygon([[a.center-a.roadW-ca,a.y],[a.center-a.roadW,a.y],[b.center-b.roadW,b.y],[b.center-b.roadW-cb,b.y]],stripe?'#f5f0e7':'#d83c42');
      polygon([[a.center+a.roadW,a.y],[a.center+a.roadW+ca,a.y],[b.center+b.roadW+cb,b.y],[b.center+b.roadW,b.y]],stripe?'#f5f0e7':'#d83c42');
      if(stripe===0){const w=lerp(1,8,b.t);polygon([[a.center-w,a.y],[a.center+w,a.y],[b.center+w*1.2,b.y],[b.center-w*1.2,b.y]],'rgba(240,240,225,.55)');}
      if(i%4===0){
        const band=(i+Math.floor(position*220))%2;
        polygon([[0,a.y],[a.center-a.roadW-ca,a.y],[b.center-b.roadW-cb,b.y],[0,b.y]],band?'#557c52':'#668d5a');
        polygon([[a.center+a.roadW+ca,a.y],[width,a.y],[width,b.y],[b.center+b.roadW+cb,b.y]],band?'#557c52':'#668d5a');
      }
    }
    for(const side of [-1,1])for(let i=0;i<17;i++){
      const t=((i/17+(position*.8)%1)%1),depth=t*t,y=horizon+(height-horizon)*t;
      const p=position+(1-t)*.18,curve=curveAt(p),roadW=lerp(width*.025,width*.49,depth);
      const cx=width*.5+curve*width*.12*(1-depth)+side*(roadW+lerp(25,115,depth)),s=lerp(.08,.95,depth);
      if(i%7===4&&depth>.15){ctx.save();ctx.translate(cx,y);ctx.scale(s,s);ctx.fillStyle='#202a31';ctx.fillRect(-31,-13,62,13);ctx.fillStyle='#f4f5ef';ctx.font='bold 8px Arial';ctx.textAlign='center';ctx.fillText(side<0?'FUJI':'RACE',0,-4);ctx.restore();continue;}
      if(i%6===2&&depth>.2){ctx.save();ctx.translate(cx,y);ctx.scale(s,s);ctx.fillStyle='#394b55';ctx.fillRect(-40,-25,80,25);for(let row=0;row<3;row++)for(let col=0;col<11;col++){ctx.fillStyle=['#e7e2d2','#df4b4b','#5f9bc0','#e8b84e'][(row*7+col*3+Math.floor(elapsed*2))%4];ctx.fillRect(-35+col*6,-22+row*6,3,3);}ctx.restore();continue;}
      ctx.fillStyle='#3e5542';ctx.fillRect(cx-3*s,y-28*s,6*s,28*s);
      ctx.fillStyle=i%2?'#234b3b':'#2d6042';ctx.beginPath();ctx.arc(cx,y-34*s,19*s,0,Math.PI*2);ctx.fill();
    }
    const visible=opponents.filter(d=>isForwardOpponent(d.relativeDistance)).sort((a,b)=>b.relativeDistance-a.relativeDistance);
    for(const driver of visible){
      const depth=1-Math.min(1,Math.abs(driver.relativeDistance)/230),perspective=depth*depth;
      const y=horizon+(height-horizon)*perspective;
      const roadW=lerp(width*.025,width*.49,perspective);
      const center=width*.5+curveAt(position)*width*.12*(1-perspective);
      const lane=driver.currentLane??driver.lane??0;
      const x=center+lane*roadW*.7;
      const scale=lerp(.12,.78,perspective)*Math.max(.75,Math.min(1.1,width/900));
      car(x,y-10*scale,scale,driver.color,false,0,(Number(driver.distance)||0)/2.6,Number(driver.speed)||0);
    }
    const playerScreenX=width*.5+playerX*width*.29-Math.max(-2,Math.min(2,lateralVelocity))*2.8,playerY=height*.875+Math.sin(elapsed*8.5)*Math.min(3,speed/330*3);
    if(running&&offRoad&&Math.random()<.8)spawnParticles(playerScreenX,playerY,2,false);
    if(running&&(skid||Math.abs(driftAngle)>.12)){skidClock+=dt*speed*.02;if(skidClock>.9){spawnParticles(playerScreenX,playerY+8,1,false);skidClock=0;}}
    ctx.save();ctx.translate(cameraShake,0);car(playerScreenX,playerY,Math.max(.68,Math.min(1.2,width/900))*(raceState==='finished'?1.12:1),playerColor,true,Math.max(-.7,Math.min(.7,driftAngle)),position*4563/2.6,speed);ctx.restore();
    drawParticles(dt);
    if(wetness>.02){ctx.save();ctx.strokeStyle='rgba(210,230,242,'+(wetness*.34)+')';ctx.lineWidth=1;for(let i=0;i<48;i++){const x=(i*97+elapsed*145)%width,y=(i*53+elapsed*390)%(height*.78);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-4,y+13+wetness*10);ctx.stroke();}ctx.restore();}
    if(raceState==='finished'){const fade=Math.min(1,elapsed*.18);ctx.fillStyle='rgba(255,255,255,'+(fade*.055)+')';ctx.fillRect(0,0,width,height);}
    if(impactFlash>0){impactFlash=Math.max(0,impactFlash-dt*4);ctx.fillStyle=`rgba(255,220,160,${impactFlash*.18})`;ctx.fillRect(0,0,width,height);}
    if(offRoad){ctx.fillStyle='rgba(110,75,35,.16)';ctx.fillRect(0,0,width,height);}
    if(!running){ctx.fillStyle='rgba(5,15,25,.06)';ctx.fillRect(0,0,width,height);}
  }
  const LAP_SCROLL=180;
  window.addEventListener('resize',resize,{passive:true});
  if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(resize);observer.observe(canvas);}
  resize();
  function triggerImpact(){impactFlash=1;spawnParticles(width*.5,height*.86,18,true);}
  return {render,resize,triggerImpact};
}
