const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function createPhysics(){
 return {
  speed:0,playerX:0,distance:0,offRoad:false,lateralVelocity:0,rpm:850,gear:1,
  fuel:100,tireWear:0,compound:'MEDIUM',damage:0,
  update(dt,input,curve){
   const accelerating=input.has('accelerate'),braking=input.has('brake'),maxSpeed=330;
   const grip=Math.max(.72,1-this.tireWear*.0028)*Math.max(.78,1-this.damage*.003);
   const throttle=accelerating?118*Math.max(.18,1-this.speed/(maxSpeed+30))*(this.fuel>0?1:.72):0;
   this.speed=clamp(this.speed+(throttle-7-this.speed*.105-(braking?245:0))*dt,0,maxSpeed);
   const steer=(input.has('right')?1:0)-(input.has('left')?1:0),ratio=this.speed/maxSpeed;
   this.lateralVelocity+=steer*(1.15+ratio*1.5)*grip*dt;
   this.lateralVelocity*=Math.max(0,1-dt*(3.2+ratio*1.2));
   this.lateralVelocity-=curve*ratio*.28*dt;
   this.playerX+=this.lateralVelocity*dt*(1.4+ratio*1.2);
   this.offRoad=Math.abs(this.playerX)>.88;
   if(this.offRoad){this.speed=Math.max(0,this.speed-(48+this.speed*.38)*dt);this.lateralVelocity*=.94;}
   this.playerX=clamp(this.playerX,-1.35,1.35);
   const distance=this.speed/3.6*dt;this.distance+=distance;
   this.fuel=Math.max(0,this.fuel-distance*(.0019+(accelerating?.00025:0)));
   const wear=this.compound==='SOFT'?1.55:this.compound==='HARD'?.62:this.compound==='INTER'?1.12:1;
   this.tireWear=Math.min(100,this.tireWear+distance*.00115*wear*(this.offRoad?2.2:1));
   this.gear=this.speed<8?1:Math.min(8,Math.max(1,Math.floor(this.speed/42)+1));
   const gp=(this.speed-(this.gear-1)*42)/42;
   this.rpm=Math.round(Math.max(850,Math.min(12000,900+gp*9300+(accelerating?650:0))));
  },
  impact(direction=1){this.speed=Math.max(35,this.speed-48);this.lateralVelocity+=direction*.7;this.playerX=clamp(this.playerX+direction*.09,-1.25,1.25);this.rpm=Math.max(900,this.rpm-1800);this.damage=Math.min(100,this.damage+8);},
  service(compound='MEDIUM',fuel=100){this.compound=compound;this.tireWear=0;this.fuel=clamp(fuel,0,100);this.damage=0;},
  reset(){this.speed=0;this.playerX=0;this.distance=0;this.offRoad=false;this.lateralVelocity=0;this.rpm=850;this.gear=1;this.fuel=100;this.tireWear=0;this.compound='MEDIUM';this.damage=0;}
 };
}