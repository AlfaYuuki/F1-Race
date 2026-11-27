const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const FLAGS=Object.freeze({GREEN:'GREEN',YELLOW:'YELLOW',DOUBLE_YELLOW:'DOUBLE YELLOW',VSC:'VSC',SAFETY_CAR:'SAFETY CAR',RED:'RED'});
export function createRaceControl(options={}) {
  const maxTrackWarnings=Math.max(1,Number(options.maxTrackWarnings)||3);
  const penaltySeconds=Math.max(3,Number(options.penaltySeconds)||5);
  let flag=FLAGS.GREEN,reason='',elapsed=0,neutralisationTimer=0,redResumeTimer=0;
  let warnings=0,penalties=[],events=[],retired=false,retirementReason='',formation=false,restart=false;
  let lastViolationAt=-Infinity,trackLimitCount=0,driveThroughPending=false,driveThroughServed=false;
  const emit=(type,message,extra={})=>{const event={type,message,at:elapsed,...extra};events.push(event);return event;};
  function setFlag(next,why='') {
    if(!Object.values(FLAGS).includes(next))return false;
    if(flag===next)return false;
    flag=next;reason=why;
    emit('flag',next==='GREEN'?'GREEN FLAG — RACING RESUMES':next+' — '+(why||'FOLLOW RACE CONTROL INSTRUCTIONS'),{flag:next,reason:why});
    return true;
  }
  function start() {
    flag=FLAGS.GREEN;reason='';elapsed=0;neutralisationTimer=0;redResumeTimer=0;
    warnings=0;penalties=[];events=[];retired=false;retirementReason='';
    formation=true;restart=false;lastViolationAt=-Infinity;trackLimitCount=0;
    driveThroughPending=false;driveThroughServed=false;
    emit('formation','FORMATION LAP — HOLD YOUR GRID SLOT');
    return getState();
  }
  function finishFormation() {
    if(!formation)return false;
    formation=false;emit('start','GRID SET — START PROCEDURE');
    return true;
  }
  function deploy(next,why='Race-control intervention',duration=12) {
    if(next===FLAGS.RED){setFlag(next,why);redResumeTimer=Math.max(3,duration);return true;}
    if([FLAGS.YELLOW,FLAGS.DOUBLE_YELLOW,FLAGS.VSC,FLAGS.SAFETY_CAR].includes(next)){
      setFlag(next,why);neutralisationTimer=Math.max(3,duration);return true;
    }
    return false;
  }
  function requestGreen() {
    if(flag===FLAGS.RED||flag===FLAGS.SAFETY_CAR||flag===FLAGS.VSC||flag===FLAGS.YELLOW||flag===FLAGS.DOUBLE_YELLOW){
      restart=true;setFlag(FLAGS.GREEN,'Restart authorised');emit('restart','RESTART — RACING RESUMES');return true;
    }
    return false;
  }
  function reportTrackLimit({now=elapsed,corner='TRACK LIMITS',offTrack=false}={}) {
    if(!offTrack||retired||now-lastViolationAt<1.25)return null;
    lastViolationAt=now;trackLimitCount++;warnings++;
    if(warnings>=maxTrackWarnings){
      const penalty=addPenalty('TIME',penaltySeconds,'Repeated track-limit violations');
      emit('track-limit','TRACK LIMITS — '+penaltySeconds+' SECOND PENALTY',{count:trackLimitCount,penalty});
      return {warning:false,penalty};
    }
    emit('track-limit','TRACK LIMITS WARNING '+warnings+'/'+maxTrackWarnings,{count:trackLimitCount,corner});
    return {warning:true,count:warnings};
  }
  function addPenalty(type='TIME',seconds=penaltySeconds,why='Race infringement') {
    const item={id:penalties.length+1,type,seconds:Math.max(0,Number(seconds)||0),reason:why,served:false};
    penalties.push(item);
    if(type==='DRIVE THROUGH')driveThroughPending=true;
    emit('penalty',type==='DRIVE THROUGH'?'DRIVE-THROUGH PENALTY — SERVE WITHIN THE REQUIRED WINDOW':item.seconds+' SECOND TIME PENALTY — '+why,{penalty:item});
    return item;
  }
  function serveDriveThrough(inPitLane=false) {
    if(!driveThroughPending||!inPitLane)return false;
    driveThroughPending=false;driveThroughServed=true;
    const item=penalties.find(p=>p.type==='DRIVE THROUGH'&&!p.served);
    if(item)item.served=true;
    emit('penalty-served','DRIVE-THROUGH PENALTY SERVED');
    return true;
  }
  function retire(why='Mechanical failure') {
    if(retired)return false;
    retired=true;retirementReason=why;
    emit('dnf','DNF — '+why,{reason:why});
    return true;
  }
  function update(dt) {
    const step=clamp(Number(dt)||0,0,.1);elapsed+=step;
    if(flag===FLAGS.RED){redResumeTimer-=step;if(redResumeTimer<=0){emit('restart-ready','RED FLAG PERIOD COMPLETE — WAIT FOR RESTART');redResumeTimer=Infinity;}}
    else if(flag!==FLAGS.GREEN){neutralisationTimer-=step;if(neutralisationTimer<=0)requestGreen();}
    return getState();
  }
  function getState() {
    const penaltySecondsTotal=penalties.filter(p=>p.type==='TIME'&&!p.served).reduce((sum,p)=>sum+p.seconds,0);
    return {flag,reason,elapsed,formation,restart,retired,retirementReason,trackLimitWarnings:warnings,trackLimitCount,
      penalties:penalties.map(p=>({...p})),penaltySeconds:penaltySecondsTotal,driveThroughPending,driveThroughServed,
      speedLimit:flag===FLAGS.DOUBLE_YELLOW?80:flag===FLAGS.YELLOW?170:flag===FLAGS.VSC?140:flag===FLAGS.SAFETY_CAR?110:flag===FLAGS.RED?0:null,
      canOvertake:flag===FLAGS.GREEN,events:events.splice(0)};
  }
  return {start,finishFormation,deploy,requestGreen,reportTrackLimit,addPenalty,serveDriveThrough,retire,update,getState,FLAGS};
}
