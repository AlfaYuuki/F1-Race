const KEY = 'the-f1-race-career-v1';
const ROUNDS = 10;
const POINTS = [25, 18, 15, 12, 10, 8];
const DRIVERS = [
  { id:'player', name:'YOU' },
  { id:'sato', name:'K. SATO' },
  { id:'tanaka', name:'M. TANAKA' },
  { id:'mori', name:'L. MORI' },
  { id:'kobayashi', name:'A. KOBAYASHI' },
  { id:'nakamura', name:'R. NAKAMURA' }
];
const ACHIEVEMENTS = [
  { id:'debut', title:'DEBUT SEASON', detail:'Complete your first Grand Prix' },
  { id:'points', title:'FIRST POINTS', detail:'Score championship points' },
  { id:'podium', title:'PODIUM FINISH', detail:'Finish in the top three' },
  { id:'victory', title:'FIRST VICTORY', detail:'Win a Grand Prix' },
  { id:'rival', title:'RIVALRY WON', detail:'Finish ahead of K. Sato' },
  { id:'consistent', title:'MR. CONSISTENT', detail:'Complete five Grand Prix' },
  { id:'champion', title:'WORLD CHAMPION', detail:'Win the ten-round career championship' }
];

function storageOrNull(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage; } catch { return null; }
}

function freshCareer() {
  return {
    active:false, round:0, completed:false, team:'FALCON MOTORSPORT',
    driverName:'YOU', results:[],
    standings:DRIVERS.map(driver=>({...driver,points:0})),
    stats:{ starts:0,wins:0,podiums:0,points:0,bestFinish:null,bestLapMs:null },
    objectives:[], achievements:[]
  };
}

export function createCareer(storage = storageOrNull()) {
  let state = freshCareer();

  function save() {
    try { storage?.setItem(KEY,JSON.stringify(state)); } catch { /* Storage can be unavailable. */ }
  }

  function valid(parsed) {
    return parsed && typeof parsed.active==='boolean' &&
      Number.isInteger(parsed.round) && parsed.round>=0 && parsed.round<=ROUNDS &&
      parsed.completed===(parsed.round===ROUNDS) &&
      Array.isArray(parsed.results) && parsed.results.length===parsed.round &&
      parsed.results.every((r,i)=>r && r.round===i+1 && Number.isInteger(r.position) && r.position>=1 && r.position<=20 &&
        Array.isArray(r.order) && r.order.every(d=>d && typeof d.id==='string' && typeof d.name==='string')) &&
      Array.isArray(parsed.standings) && parsed.standings.length===DRIVERS.length &&
      parsed.standings.every(d=>d && typeof d.id==='string' && typeof d.name==='string' && Number.isFinite(d.points) && d.points>=0) &&
      new Set(parsed.standings.map(d=>d.id)).size===DRIVERS.length &&
      parsed.standings.some(d=>d.id==='player') &&
      parsed.stats && ['starts','wins','podiums','points'].every(k=>Number.isInteger(parsed.stats[k])&&parsed.stats[k]>=0) &&
      (parsed.stats.bestFinish===null || Number.isInteger(parsed.stats.bestFinish)) &&
      Array.isArray(parsed.objectives) && Array.isArray(parsed.achievements) &&
      parsed.achievements.every(id=>ACHIEVEMENTS.some(a=>a.id===id));
  }

  function load() {
    try {
      const parsed=JSON.parse(storage?.getItem(KEY)||'null');
      if(valid(parsed)) state={...freshCareer(),...parsed,
        results:parsed.results.map(r=>({...r,order:r.order.map(d=>({id:d.id,name:d.name}))})),
        standings:parsed.standings.map(d=>({...d})),
        stats:{...parsed.stats},
        objectives:parsed.objectives.map(o=>({...o})),
        achievements:[...parsed.achievements]
      };
    } catch { state=freshCareer(); }
  }

  function snapshot() {
    return {...state,results:state.results.map(r=>({...r,order:r.order.map(d=>({...d}))})),
      standings:state.standings.map(d=>({...d})),stats:{...state.stats},
      objectives:state.objectives.map(o=>({...o})),achievements:[...state.achievements]};
  }

  function start(team='FALCON MOTORSPORT',driverName='YOU') {
    state=freshCareer();
    state.active=true;
    state.team=String(team).slice(0,32).trim()||'FALCON MOTORSPORT';
    state.driverName=String(driverName).slice(0,24).trim()||'YOU';
    state.standings[0].name=state.driverName.toUpperCase();
    save();
    return snapshot();
  }

  function recordRace(order,bestLapMs=null) {
    if(!state.active||state.completed||state.round>=ROUNDS) return {ok:false,state:snapshot(),error:'Career season is not accepting another result.'};
    if(!Array.isArray(order)||!order.length||!order.some(d=>d&&(d.id==='player'||d.isPlayer))) {
      return {ok:false,state:snapshot(),error:'Race classification must include the player.'};
    }
    const clean=order.map(d=>({id:String(d.id),name:String(d.name)}));
    const position=clean.findIndex(d=>d.id==='player')+1;
    const round=state.round+1;
    const awarded=clean.slice(0,POINTS.length);
    for(let i=0;i<awarded.length;i++){
      const entry=state.standings.find(d=>d.id===awarded[i].id);
      if(entry) entry.points+=POINTS[i];
    }
    const rivalPosition=clean.findIndex(d=>d.id==='sato')+1;
    const objectiveList=[
      {id:'finish-top-10',title:'FINISH IN THE TOP 10',done:position<=10},
      {id:'beat-sato',title:'BEAT RIVAL K. SATO',done:rivalPosition>0&&position<rivalPosition},
      {id:'score-points',title:'SCORE CHAMPIONSHIP POINTS',done:position<=6}
    ];
    state.objectives=objectiveList.map(o=>({...o,round,done:o.done}));
    state.stats.starts++;
    if(position===1) state.stats.wins++;
    if(position<=3) state.stats.podiums++;
    state.stats.points=state.standings.find(d=>d.id==='player').points;
    state.stats.bestFinish=state.stats.bestFinish===null?position:Math.min(state.stats.bestFinish,position);
    if(Number.isFinite(bestLapMs)&&bestLapMs>0) state.stats.bestLapMs=state.stats.bestLapMs===null?bestLapMs:Math.min(state.stats.bestLapMs,bestLapMs);
    state.results.push({round,position,bestLapMs:Number.isFinite(bestLapMs)?bestLapMs:null,order:clean,objectives:objectiveList.map(o=>o.id).filter(id=>objectiveList.find(o=>o.id===id).done)});
    const unlock=id=>{if(!state.achievements.includes(id))state.achievements.push(id);};
    unlock('debut');
    if(position<=6) unlock('points');
    if(position<=3) unlock('podium');
    if(position===1) unlock('victory');
    if(rivalPosition>0&&position<rivalPosition) unlock('rival');
    if(state.stats.starts>=5) unlock('consistent');
    state.round=round;
    state.standings.sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name));
    state.completed=state.round===ROUNDS;
    if(state.completed&&state.standings[0].id==='player') unlock('champion');
    save();
    return {ok:true,state:snapshot(),result:state.results[state.results.length-1]};
  }

  load();
  return {start,getState:snapshot,recordRace,rounds:ROUNDS,achievements:ACHIEVEMENTS.map(a=>({...a}))};
}

export const CAREER_ROUNDS=ROUNDS;
