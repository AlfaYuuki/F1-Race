const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function cameraProfile({speed=0,driftAngle=0,lateralVelocity=0,offRoad=false,impact=0}={}) {
  const velocity=clamp(Number(speed)/330,0,1);
  const drift=clamp(Number(driftAngle),-.9,.9);
  const lateral=clamp(Number(lateralVelocity),-2,2);
  const hit=clamp(Number(impact),0,1);
  return {
    fov:.96+velocity*.12+Math.abs(drift)*.035+hit*.025,
    height:5.5+velocity*.28+(offRoad?.34:0)+hit*.12,
    lateral:clamp(lateral*.22+drift*.8,-.9,.9),
    roll:clamp(-lateral*.018-drift*.055,-.09,.09),
    lookAhead:33+velocity*19+Math.abs(drift)*7
  };
}

export function suspensionOffset(time,wheelIndex,speed,offRoad=false) {
  const phase=Number(time||0)*8.5+(Number(wheelIndex)||0)*1.71;
  const travel=Math.sin(phase)*(.018+clamp(Number(speed)/330,0,1)*.045);
  return clamp(travel+(offRoad?Math.sin(phase*1.8)*.035:0),-.095,.095);
}

export function createGraphicsEffects(random=Math.random) {
  let particles=[];
  let smokeClock=0,rainClock=0,sparkClock=0;
  const safeRandom=()=>clamp(Number(random())||0,0,.999999);
  function reset(){particles=[];smokeClock=0;rainClock=0;sparkClock=0;}
  function spawn(type,count,origin,speed=0) {
    for(let i=0;i<count;i++){
      const spread=(safeRandom()-.5);
      const rain=type==='rain',spark=type==='spark';
      particles.push({
        type,
        x:(origin?.x||0)+(rain?spread*34:spread*1.7),
        y:(origin?.y||0)+(rain?3+safeRandom()*10:spark?.08:.12+safeRandom()*.35),
        z:(origin?.z||9)+(rain?5+safeRandom()*38:spark?-.4:-2.2-safeRandom()*1.8),
        vx:rain?-.5+safeRandom():spread*(spark?5:1.2),
        vy:rain?-13-safeRandom()*7:spark?1.5+safeRandom()*4:1+safeRandom()*1.7,
        vz:rain?-2-speed/90:spark?-2-safeRandom()*3:-2-speed/150,
        age:0,
        life:rain?.55+safeRandom()*.35:spark?.16+safeRandom()*.18:.48+safeRandom()*.5,
        size:rain?.018:spark?.025+safeRandom()*.025:.12+safeRandom()*.22
      });
    }
    if(particles.length>150)particles.splice(0,particles.length-150);
  }
  function update(dt,{rain=0,speed=0,driftAngle=0,lateralVelocity=0,offRoad=false,impact=0,car={x:0,y:0,z:9}}={}) {
    const step=clamp(Number(dt)||0,0,.05);
    const wet=clamp(Number(rain)||0,0,1);
    const drifting=Math.abs(Number(driftAngle)||0)>.12&&speed>55;
    rainClock+=step;smokeClock+=step;sparkClock+=step;
    if(wet>0&&rainClock>=.035){spawn('rain',Math.min(5,Math.ceil(wet*3)),car,speed);rainClock=0;}
    if(drifting&&smokeClock>=.045){spawn('smoke',2,car,speed);smokeClock=0;}
    if((offRoad||impact>.2)&&sparkClock>=.06){spawn('spark',Math.min(5,Math.ceil((offRoad?.7:impact)*4)),car,speed);sparkClock=0;}
    for(const p of particles){p.age+=step;p.x+=p.vx*step;p.y+=p.vy*step;p.z+=p.vz*step;p.vy+=p.type==='spark'?-7:p.type==='smoke'?.18:0;}
    particles=particles.filter(p=>p.age<p.life&&p.y>-.4);
    return particles;
  }
  return {update,reset,get count(){return particles.length;}};
}
