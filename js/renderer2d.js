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
  function car(x,y,scale,color='#df3039',player=false,rotation=0,wheelRotation=0) {
    ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.scale(scale,scale);
    ctx.fillStyle='#101720';ctx.fillRect(-39,-5,15,38);ctx.fillRect(24,-5,15,38);
    ctx.strokeStyle='#8d969c';ctx.lineWidth=1.4;
    for(const side of [-1,1])for(const axle of [-1,1]){ctx.save();ctx.translate(side*31,axle*10);ctx.rotate(wheelRotation);ctx.beginPath();ctx.ellipse(0,0,3.5,7,0,0,Math.PI*2);ctx.moveTo(0,-5);ctx.lineTo(0,5);ctx.moveTo(-2.5,0);ctx.lineTo(2.5,0);ctx.stroke();ctx.restore();}
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-27,25);ctx.lineTo(-22,-25);ctx.lineTo(-12,-42);ctx.lineTo(12,-42);ctx.lineTo(22,-25);ctx.lineTo(27,25);ctx.closePath();ctx.fill();
    ctx.fillStyle='#e8edf0';ctx.fillRect(-35,20,70,6);ctx.fillRect(-21,-35,42,5);
    ctx.fillStyle='#18212b';ctx.beginPath();ctx.ellipse(0,-12,11,16,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=player?'#ffd16a':'#fff';ctx.fillRect(-3,-37,6,5);
    ctx.fillStyle='#f7f7f4';ctx.fillRect(-29,22,10,3);ctx.fillRect(19,22,10,3);
    ctx.restore();
  }
  function spawnParticles(x,y,count,sparks=false){for(let i=0;i<count;i++)particles.push({x:x+(Math.random()-.5)*22,y:y+Math.random()*7,vx:(Math.random()-.5)*(sparks?150:24),vy:sparks?-Math.random()*125:-Math.random()*30,life:sparks?.28:.7,max:sparks?.28:.7,size:sparks?1+Math.random()*2:4+Math.random()*7,sparks});if(particles.length>120)particles.splice(0,particles.length-120);}
  function drawParticles(dt){particles=particles.filter(p=>p.life>0);for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(!p.sparks)p.size+=dt*8;ctx.globalAlpha=Math.max(0,p.life/p.max)*.45;ctx.fillStyle=p.sparks?'#ffd16a':'#d5d8d4';ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
  function render({position=0,playerX=0,speed=0,offRoad=false,running=false,opponents=[],cameraShake=0,playerColor='#df3039',skid=false,driftAngle=0,weather={},finished=false,dt=.016}) {
    if(!width||!height)resize();
    const horizon=height*.405 + Math.sin(position*Math.PI*2)*height*.012;
    const sky=ctx.createLinearGradient(0,0,0,horizon);
    const rain=Math.max(0,Math.min(1,Number(weather.rain)||0));
    sky.addColorStop(0,rain>.45?'#566f82':rain>.08?'#62839a':'#6798b4');sky.addColorStop(1,rain>.45?'#aab8bd':'#dce5df');
    ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#9bb2b2';ctx.beginPath();ctx.moveTo(0,horizon);ctx.lineTo(0,horizon-25);ctx.quadraticCurveTo(width*.2,horizon-90,width*.39,horizon-26);ctx.quadraticCurveTo(width*.72,horizon-105,width,horizon-15);ctx.lineTo(width,horizon);ctx.fill();
    mountain(width*.73,horizon+5,Math.min(width/1150,1.25)*.95);
    ctx.fillStyle='#527c54';ctx.fillRect(0,horizon,width,height-horizon);
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
      polygon([[a.center-a.roadW,a.y],[a.center+a.roadW,a.y],[b.center+b.roadW,b.y],[b.center-b.roadW,b.y]],rain>.05?'#252f38':'#343a40');
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
      if(i%6===2&&depth>.2){ctx.save();ctx.translate(cx,y);ctx.scale(s,s);ctx.fillStyle='#394b55';ctx.fillRect(-40,-25,80,25);for(let row=0;row<3;row++)for(let col=0;col<11;col++){ctx.fillStyle=['#e7e2d2','#df4b4b','#5f9bc0','#e8b84e'][(row*7+col*3)%4];ctx.fillRect(-35+col*6,-22+row*6,3,3);}ctx.restore();continue;}
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
      car(x,y-10*scale,scale,driver.color,false,0,position*4563*.65+Number(driver.relativeDistance||0)*.08);
    }
    const playerScreenX=width*.5+playerX*width*.29,playerY=height*.875;
    if(running&&offRoad&&Math.random()<.8)spawnParticles(playerScreenX,playerY,2,false);
    if(running&&(skid||Math.abs(driftAngle)>.12)){skidClock+=dt*speed*.02;if(skidClock>.9){spawnParticles(playerScreenX,playerY+8,1,false);skidClock=0;}}
    ctx.save();ctx.translate(cameraShake+Math.max(-8,Math.min(8,playerX*3)),Math.sin(position*4563*1.8)*Math.min(2,speed/180));car(playerScreenX,playerY,Math.max(.68,Math.min(1.2,width/900)),playerColor,true,Math.max(-.7,Math.min(.7,driftAngle)),position*4563*.65);ctx.restore();
    if(rain>.08){const sheen=ctx.createLinearGradient(0,height*.55,0,height);sheen.addColorStop(0,'rgba(180,205,220,0)');sheen.addColorStop(1,`rgba(180,205,220,${rain*.12})`);ctx.fillStyle=sheen;ctx.fillRect(0,height*.55,width,height*.45);}
    drawParticles(dt);
    if(impactFlash>0){impactFlash=Math.max(0,impactFlash-dt*4);ctx.fillStyle=`rgba(255,220,160,${impactFlash*.18})`;ctx.fillRect(0,0,width,height);}
    if(offRoad){ctx.fillStyle='rgba(110,75,35,.16)';ctx.fillRect(0,0,width,height);}
    if(finished){ctx.fillStyle='rgba(5,15,25,.12)';ctx.fillRect(0,0,width,height);}
    else if(!running){ctx.fillStyle='rgba(5,15,25,.06)';ctx.fillRect(0,0,width,height);}
  }
  const LAP_SCROLL=180;
  window.addEventListener('resize',resize,{passive:true});
  if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(resize);observer.observe(canvas);}
  resize();
  function triggerImpact(){impactFlash=1;spawnParticles(width*.5,height*.86,18,true);}
  return {render,resize,triggerImpact};
}
