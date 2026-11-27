import test from 'node:test';
import assert from 'node:assert/strict';
import { createCareer } from '../js/career.js';

function memoryStorage(){const values=new Map();return{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};}
const order=Array.from({length:20},(_,i)=>({id:i===2?'player':i===0?'sato':'driver-'+i,name:i===2?'YOU':i===0?'K. SATO':'DRIVER '+i}));

test('career starts with a ten-round championship and team identity',()=>{
 const career=createCareer(memoryStorage());const state=career.start('FUJI RACING','ALFA');
 assert.equal(state.active,true);assert.equal(state.team,'FUJI RACING');assert.equal(state.driverName,'ALFA');assert.equal(state.round,0);
});
test('career awards points, tracks records, objectives and achievements',()=>{
 const career=createCareer(memoryStorage());career.start();
 const result=career.recordRace(order,91234);
 assert.equal(result.ok,true);assert.equal(result.state.round,1);assert.equal(result.state.stats.starts,1);
 assert.equal(result.state.stats.points,15);assert.equal(result.state.stats.bestFinish,3);
 assert.equal(result.state.objectives.find(o=>o.id==='finish-top-10').done,true);
 assert.ok(result.state.achievements.includes('podium'));
 assert.ok(result.rewardCredits>=250);
});
test('career rival standings and season completion are persistent',()=>{
 const storage=memoryStorage();const career=createCareer(storage);career.start();
 for(let i=0;i<10;i++) career.recordRace(order,90000+i);
 const state=createCareer(storage).getState();
 assert.equal(state.completed,true);assert.equal(state.round,10);assert.equal(state.stats.starts,10);
 assert.equal(state.stats.bestLapMs,90000);
});
test('career rejects results without the player and ignores corrupt saves',()=>{
 const storage=memoryStorage();const career=createCareer(storage);career.start();
 assert.equal(career.recordRace([{id:'sato',name:'K. SATO'}]).ok,false);
 storage.setItem('the-f1-race-career-v1',JSON.stringify({active:true,round:8,completed:false,results:[],standings:[]}));
 assert.equal(createCareer(storage).getState().active,false);
});
