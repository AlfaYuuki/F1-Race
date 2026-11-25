/**
 * Individual AI racing identities. Traits are deliberately bounded so every
 * driver remains competitive without relying on random difficulty spikes.
 */
const PROFILE_DATA = {
  sato:       { style:'ATTACKER', overtaking:0.94, defense:0.62, consistency:0.78, wetSkill:0.78, tyreCare:0.68, risk:0.91 },
  tanaka:     { style:'DEFENDER', overtaking:0.58, defense:0.96, consistency:0.9, wetSkill:0.86, tyreCare:0.88, risk:0.48 },
  mori:       { style:'RAIN ACE', overtaking:0.84, defense:0.78, consistency:0.96, wetSkill:0.99, tyreCare:0.82, risk:0.72 },
  kobayashi:  { style:'LATE BRAKER', overtaking:0.96, defense:0.54, consistency:0.68, wetSkill:0.72, tyreCare:0.62, risk:0.98 },
  nakamura:   { style:'STRATEGIST', overtaking:0.72, defense:0.84, consistency:0.94, wetSkill:0.84, tyreCare:0.97, risk:0.58 },
  rossi:      { style:'QUALIFIER', overtaking:0.88, defense:0.72, consistency:0.88, wetSkill:0.82, tyreCare:0.74, risk:0.82 },
  muller:     { style:'SMOOTH', overtaking:0.64, defense:0.76, consistency:0.98, wetSkill:0.9, tyreCare:0.99, risk:0.42 },
  silva:      { style:'OPPORTUNIST', overtaking:0.92, defense:0.68, consistency:0.82, wetSkill:0.8, tyreCare:0.72, risk:0.87 },
  petrov:     { style:'HARD RACER', overtaking:0.98, defense:0.9, consistency:0.62, wetSkill:0.66, tyreCare:0.58, risk:0.99 },
  martin:     { style:'CONSISTENT', overtaking:0.76, defense:0.82, consistency:0.97, wetSkill:0.88, tyreCare:0.9, risk:0.65 },
  kim:        { style:'TECHNICAL', overtaking:0.8, defense:0.8, consistency:0.92, wetSkill:0.93, tyreCare:0.86, risk:0.7 },
  dubois:     { style:'PACE SETTER', overtaking:0.9, defense:0.74, consistency:0.94, wetSkill:0.84, tyreCare:0.78, risk:0.83 },
  brown:      { style:'AGGRESSOR', overtaking:0.97, defense:0.64, consistency:0.7, wetSkill:0.7, tyreCare:0.6, risk:0.96 },
  garcia:     { style:'TACTICIAN', overtaking:0.74, defense:0.92, consistency:0.93, wetSkill:0.86, tyreCare:0.95, risk:0.56 },
  smith:      { style:'DRAFT SPECIALIST', overtaking:0.88, defense:0.72, consistency:0.84, wetSkill:0.78, tyreCare:0.76, risk:0.8 },
  alvarez:    { style:'ALL-ROUNDER', overtaking:0.86, defense:0.86, consistency:0.93, wetSkill:0.91, tyreCare:0.88, risk:0.78 },
  andersson:  { style:'TYRE SAVER', overtaking:0.62, defense:0.88, consistency:0.96, wetSkill:0.9, tyreCare:1, risk:0.44 },
  fernandez:  { style:'WILD CARD', overtaking:0.95, defense:0.7, consistency:0.72, wetSkill:0.76, tyreCare:0.66, risk:0.94 },
  williams:   { style:'CALCULATOR', overtaking:0.7, defense:0.9, consistency:0.95, wetSkill:0.88, tyreCare:0.93, risk:0.52 }
};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const DEFAULT_PROFILE=Object.freeze({style:'BALANCED',overtaking:.75,defense:.75,consistency:.85,wetSkill:.8,tyreCare:.8,risk:.65});

export function getDriverPersonality(driverId) {
  const profile=PROFILE_DATA[driverId]||DEFAULT_PROFILE;
  return Object.freeze({...profile});
}

export function calculatePersonalityPace(profile, {phase=0,rain=0,cornerLoad=0}={}) {
  const p=profile||DEFAULT_PROFILE;
  const consistency=clamp(Number(p.consistency)||0,0,1);
  const wetSkill=clamp(Number(p.wetSkill)||0,0,1);
  const variation=Math.sin(Number(phase)||0)*(1.2+(1-consistency)*5.5);
  const wetAdjustment=clamp(Number(rain)||0,0,1)*(wetSkill-.75)*12;
  const cornerAdjustment=clamp(Number(cornerLoad)||0,0,1)*(consistency-.75)*3;
  return clamp(variation+wetAdjustment+cornerAdjustment,-8,8);
}

export function calculateTyreWearMultiplier(profile) {
  const care=clamp(Number(profile?.tyreCare)||0,0,1);
  return clamp(1.2-care*.42,.72,1.2);
}

export function shouldAttemptOvertake(profile, gap, laneBlocked=false) {
  if (laneBlocked || !Number.isFinite(gap) || gap<=0 || gap>=30) return false;
  const risk=clamp(Number(profile?.risk)||0,0,1);
  const skill=clamp(Number(profile?.overtaking)||0,0,1);
  return gap < 12 + risk*12 && skill > .55;
}

export function getDefensiveLaneOffset(profile) {
  return (clamp(Number(profile?.defense)||0,0,1)-.5)*.16;
}
