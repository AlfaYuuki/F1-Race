import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaceControl } from '../js/race-control.js';
import { createOpponents } from '../js/opponents.js';
import { LAP_DISTANCE } from '../js/track.js';

test('race-control flags expose distinct speed limits and restart cleanly',()=>{
  const rc=createRaceControl();rc.start();
  assert.equal(rc.getState().flag,'GREEN');
  rc.deploy(rc.FLAGS.DOUBLE_YELLOW,'Hazard in sector two');
  assert.equal(rc.getState().speedLimit,80);
  rc.deploy(rc.FLAGS.VSC,'Debris removal');
  assert.equal(rc.getState().speedLimit,140);
  rc.deploy(rc.FLAGS.SAFETY_CAR,'Recovery vehicle');
  assert.equal(rc.getState().speedLimit,110);
  rc.requestGreen();
  assert.equal(rc.getState().flag,'GREEN');
});

test('red flag freezes the race-control state until an authorised restart',()=>{
  const rc=createRaceControl();rc.start();rc.deploy(rc.FLAGS.RED,'Track blocked',5);
  rc.update(1);
  assert.equal(rc.getState().flag,'RED');
  assert.equal(rc.getState().speedLimit,0);
  rc.requestGreen();
  assert.equal(rc.getState().flag,'GREEN');
});

test('track-limit penalties escalate after repeated violations',()=>{
  const rc=createRaceControl();rc.start();
  assert.equal(rc.reportTrackLimit({now:1,offTrack:true}).warning,true);
  assert.equal(rc.reportTrackLimit({now:3,offTrack:true}).warning,true);
  const result=rc.reportTrackLimit({now:5,offTrack:true});
  assert.equal(result.penalty.type,'TIME');
  assert.equal(rc.getState().penaltySeconds,5);
});

test('drive-through penalties are only served on pit-lane entry',()=>{
  const rc=createRaceControl();rc.start();rc.addPenalty('DRIVE THROUGH',0,'Unsafe release');
  assert.equal(rc.serveDriveThrough(false),false);
  assert.equal(rc.getState().driveThroughPending,true);
  assert.equal(rc.serveDriveThrough(true),true);
  assert.equal(rc.getState().driveThroughPending,false);
  assert.equal(rc.getState().driveThroughServed,true);
});

test('DNF retirement is latched and recorded once',()=>{
  const rc=createRaceControl();rc.start();
  assert.equal(rc.retire('Power unit failure'),true);
  assert.equal(rc.retire('Second failure'),false);
  assert.equal(rc.getState().retired,true);
  assert.equal(rc.getState().retirementReason,'Power unit failure');
});

test('AI race-control obedience applies neutralisation limits and red-flag stop',()=>{
  const ai=createOpponents(LAP_DISTANCE);ai.reset(20);
  const driver=ai.drivers[0];driver.launchTimer=0;driver.speed=0;driver.pace=285;
  ai.update(.1,0,()=>0,{doubleYellow:true});
  assert.ok(driver.speed<=80);
  driver.speed=150;const before=driver.distance;
  ai.update(.1,0,()=>0,{redFlag:true});
  assert.equal(driver.speed,0);
  assert.equal(driver.distance,before);
});
