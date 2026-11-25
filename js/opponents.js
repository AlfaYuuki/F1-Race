import { getDriverPersonality, calculatePersonalityPace, calculateTyreWearMultiplier, shouldAttemptOvertake, getDefensiveLaneOffset } from './ai-personalities.js';

const DRIVER_DATA = [
  { id:'sato', name:'K. SATO', color:'#45a5e8', pace:246, skill:0.94, aggression:0.82, start:18, lane:-0.48 },
  { id:'tanaka', name:'M. TANAKA', color:'#f1bd4b', pace:238, skill:0.87, aggression:0.68, start:36, lane:0.48 },
  { id:'mori', name:'L. MORI', color:'#9b79df', pace:252, skill:0.97, aggression:0.76, start:54, lane:-0.12 },
  { id:'kobayashi', name:'A. KOBAYASHI', color:'#55c49a', pace:232, skill:0.81, aggression:0.91, start:72, lane:0.18 },
  { id:'nakamura', name:'R. NAKAMURA', color:'#e58b55', pace:242, skill:0.9, aggression:0.72, start:90, lane:0.62 },
  { id:'rossi', name:'G. ROSSI', color:'#e85d75', pace:249, skill:0.93, aggression:0.78, start:108, lane:-0.62 },
  { id:'muller', name:'F. MULLER', color:'#77b7a4', pace:235, skill:0.85, aggression:0.65, start:126, lane:0.32 },
  { id:'silva', name:'D. SILVA', color:'#d6a45b', pace:244, skill:0.91, aggression:0.88, start:144, lane:-0.3 },
  { id:'petrov', name:'I. PETROV', color:'#8d9be8', pace:229, skill:0.79, aggression:0.93, start:162, lane:0.7 },
  { id:'martin', name:'J. MARTIN', color:'#d879c7', pace:247, skill:0.92, aggression:0.71, start:180, lane:-0.7 },
  { id:'kim', name:'H. KIM', color:'#65c6df', pace:239, skill:0.88, aggression:0.83, start:198, lane:0.08 },
  { id:'dubois', name:'P. DUBOIS', color:'#c2a0ed', pace:251, skill:0.96, aggression:0.74, start:216, lane:0.55 },
  { id:'brown', name:'T. BROWN', color:'#a5bd54', pace:234, skill:0.84, aggression:0.89, start:234, lane:-0.42 },
  { id:'garcia', name:'E. GARCIA', color:'#e9a16e', pace:243, skill:0.9, aggression:0.77, start:252, lane:0.42 },
  { id:'smith', name:'N. SMITH', color:'#7295c9', pace:237, skill:0.86, aggression:0.86, start:270, lane:-0.18 },
  { id:'alvarez', name:'C. ALVAREZ', color:'#c77c65', pace:250, skill:0.95, aggression:0.8, start:288, lane:0.22 },
  { id:'andersson', name:'O. ANDERSSON', color:'#8bb8a1', pace:231, skill:0.82, aggression:0.7, start:306, lane:-0.55 },
  { id:'fernandez', name:'M. FERNANDEZ', color:'#d7bb65', pace:245, skill:0.91, aggression:0.92, start:324, lane:0.65 },
  { id:'williams', name:'A. WILLIAMS', color:'#9b9da8', pace:240, skill:0.89, aggression:0.75, start:342, lane:-0.05 }
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createOpponents(lapDistance = 4563) {
  const drivers = DRIVER_DATA.map(driver => ({
    ...driver,
    personality: getDriverPersonality(driver.id),
    distance: 0,
    speed: 0,
    currentLane: driver.lane,
    targetLane: driver.lane,
    gridPosition: 0,
    launchTimer: 0,
    overtakes: 0, fuel:100, tireWear:0, compound:'MEDIUM', pitTimer:0, pitStops:0
  }));

  function update(dt, playerDistance, curveAt, weather = {}) {
    const traffic = [
      { id: 'player', distance: playerDistance, currentLane: 0 },
      ...drivers
    ];

    for (const driver of drivers) {
      if (driver.launchTimer > 0) {
        driver.launchTimer = Math.max(0, driver.launchTimer - dt);
        driver.speed = Math.min(driver.pace * .72, driver.speed + dt * 95);
        driver.distance += driver.speed / 3.6 * dt;
        continue;
      }
      if (driver.pitTimer > 0) {
        driver.pitTimer = Math.max(0, driver.pitTimer - dt);
        driver.speed += (0 - driver.speed) * Math.min(1, dt * 2.8);
        if (driver.pitTimer === 0) { driver.fuel = 100; driver.tireWear = 0; driver.pitStops++; driver.compound = weather.rain > .3 ? 'INTER' : 'MEDIUM'; }
        driver.distance += driver.speed / 3.6 * dt;
        continue;
      }
      driver.fuel = Math.max(0, driver.fuel - dt * (.055 + driver.speed / 330 * .045));
      driver.tireWear = Math.min(100, driver.tireWear + dt * (driver.compound === 'SOFT' ? .16 : .1) * (weather.wear || 1) * calculateTyreWearMultiplier(driver.personality));
      const wetMismatch = weather.rain > .55 && driver.compound !== 'INTER';
      const dryMismatch = weather.rain < .12 && driver.compound === 'INTER';
      if (driver.fuel < 18 || driver.tireWear > 82 || (wetMismatch && driver.pitStops < 2) || (dryMismatch && driver.pitStops < 2)) {
        driver.pitTimer = 5.8 + (1-driver.skill)*2.2;
        driver.speed = Math.max(0, driver.speed * .55);
      }
      const progress = (driver.distance % lapDistance) / lapDistance;
      const cornerLoad = Math.abs(curveAt(progress));
      const rhythm = calculatePersonalityPace(driver.personality, { phase:driver.distance * .001 + driver.skill * 8, rain:weather.rain || 0, cornerLoad:Math.abs(curveAt((driver.distance % lapDistance) / lapDistance)) });
      const trafficAhead = traffic
        .filter(car => car.id !== driver.id)
        .map(car => ({ ...car, gap: car.distance - driver.distance }))
        .filter(car => car.gap > 0 && car.gap < 42)
        .sort((a, b) => a.gap - b.gap)[0];

      const targetLaneBase = driver.lane + getDefensiveLaneOffset(driver.personality) + Math.sin(driver.distance * .0018 + driver.skill * 10) * .09;
      let targetLane = targetLaneBase;
      let draftBonus = 0;

      if (trafficAhead) {
        const laneGap = Math.abs((trafficAhead.currentLane ?? 0) - driver.currentLane);
        if (laneGap < .46 && shouldAttemptOvertake(driver.personality, trafficAhead.gap)) {
          const leftFree = traffic.every(car => car.id === driver.id ||
            Math.abs(car.distance - driver.distance) > 18 ||
            Math.abs((car.currentLane ?? 0) - (driver.currentLane - .42)) > .38);
          const rightFree = traffic.every(car => car.id === driver.id ||
            Math.abs(car.distance - driver.distance) > 18 ||
            Math.abs((car.currentLane ?? 0) - (driver.currentLane + .42)) > .38);
          if (leftFree || rightFree) {
            const direction = leftFree && rightFree
              ? (driver.lane <= trafficAhead.currentLane ? -1 : 1)
              : leftFree ? -1 : 1;
            targetLane = trafficAhead.currentLane + direction * (.38 + driver.aggression * .12);
            driver.overtakes += dt * .025;
          } else {
            draftBonus = Math.max(0, 5 * (1 - trafficAhead.gap / 42));
          }
        }
      }

      driver.targetLane = clamp(targetLane, -.76, .76);
      driver.currentLane += (driver.targetLane - driver.currentLane) * Math.min(1, dt * (1.5 + driver.aggression * 2.2));

      const cornerPenalty = cornerLoad * (15 + (1 - driver.skill) * 27) * (1.08 - driver.personality.consistency * .12);
      const consistencyLoss = Math.abs(Math.sin(driver.distance * .00063 + driver.skill * 4)) * (1 - driver.skill) * 5;
      const weatherPenalty = (weather.rain || 0) * (driver.compound === 'INTER' ? 5 : 32 * (1 - driver.personality.wetSkill * .35));
      const wearPenalty = driver.tireWear * .13;
      const safePace = weather.safetyCar ? 145 : weather.yellowFlag ? 170 : 285;
      const targetSpeed = clamp(driver.pace + rhythm + draftBonus - cornerPenalty - consistencyLoss - weatherPenalty - wearPenalty, 125, safePace);
      driver.speed += (targetSpeed - driver.speed) * Math.min(1, dt * (1.1 + driver.skill * 1.5));
      driver.distance += driver.speed / 3.6 * dt;
    }

    return getStandings(playerDistance);
  }

  function getStandings(playerDistance) {
    return [{ id:'player', name:'YOU', color:'#ed4148', distance:playerDistance, isPlayer:true },
      ...drivers.map(driver => ({ ...driver, isPlayer:false }))]
      .sort((a, b) => b.distance - a.distance);
  }

  function reset(playerGridPosition = 10) {
    const playerSlot = clamp(Math.round(Number(playerGridPosition) || 10), 1, 20);
    // Simulated qualifying: pace and driver skill set the AI order, while the
    // player can choose any of the twenty grid slots before a quick race.
    const qualifyingOrder = [...drivers].sort((a, b) =>
      (b.pace * .72 + b.skill * 42 + b.aggression * 3) -
      (a.pace * .72 + a.skill * 42 + a.aggression * 3)
    );
    let aiIndex = 0;
    for (let slot = 1; slot <= 20; slot++) {
      if (slot === playerSlot) continue;
      const driver = qualifyingOrder[aiIndex++];
      driver.gridPosition = slot;
      driver.distance = (playerSlot - slot) * 8;
      driver.speed = 0;
      driver.currentLane = slot % 2 ? -.42 : .42;
      driver.targetLane = driver.currentLane;
      driver.launchTimer = .16 + (1 - driver.skill) * .62;
      driver.overtakes = 0; driver.fuel = 100; driver.tireWear = 0;
      driver.compound = 'MEDIUM'; driver.pitTimer = 0; driver.pitStops = 0;
    }
    return { playerGridPosition: playerSlot, grid: getStandings(0) };
  }

  return { drivers, update, getStandings, reset };
}
