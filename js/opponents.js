const DRIVER_DATA = [
  { id:'sato', name:'K. SATO', color:'#45a5e8', pace:246, skill:.94, aggression:.82, start:18, lane:-.48 },
  { id:'tanaka', name:'M. TANAKA', color:'#f1bd4b', pace:238, skill:.87, aggression:.68, start:34, lane:.48 },
  { id:'mori', name:'L. MORI', color:'#9b79df', pace:252, skill:.97, aggression:.76, start:52, lane:-.12 },
  { id:'kobayashi', name:'A. KOBAYASHI', color:'#55c49a', pace:232, skill:.81, aggression:.91, start:70, lane:.18 },
  { id:'nakamura', name:'R. NAKAMURA', color:'#e58b55', pace:242, skill:.9, aggression:.72, start:88, lane:.62 }
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createOpponents(lapDistance = 4563) {
  const drivers = DRIVER_DATA.map((driver, index) => ({
    ...driver,
    distance: driver.start,
    speed: driver.pace * (.94 + index * .008),
    currentLane: driver.lane,
    targetLane: driver.lane,
    overtakes: 0, fuel:100, tireWear:0, compound:'MEDIUM', pitTimer:0, pitStops:0
  }));

  function update(dt, playerDistance, curveAt, weather = {}) {
    const traffic = [
      { id: 'player', distance: playerDistance, currentLane: 0 },
      ...drivers
    ];

    for (const driver of drivers) {
      if (driver.pitTimer > 0) {\n        driver.pitTimer = Math.max(0, driver.pitTimer - dt);\n        driver.speed += (0 - driver.speed) * Math.min(1, dt * 2.8);\n        if (driver.pitTimer === 0) { driver.fuel = 100; driver.tireWear = 0; driver.pitStops++; driver.compound = weather.rain > .3 ? 'INTER' : 'MEDIUM'; }\n        driver.distance += driver.speed / 3.6 * dt;\n        continue;\n      }\n      driver.fuel = Math.max(0, driver.fuel - dt * (.055 + driver.speed / 330 * .045));\n      driver.tireWear = Math.min(100, driver.tireWear + dt * (driver.compound === 'SOFT' ? .16 : .1) * (weather.wear || 1));\n      const wetMismatch = weather.rain > .55 && driver.compound !== 'INTER';\n      const dryMismatch = weather.rain < .12 && driver.compound === 'INTER';\n      if (driver.fuel < 18 || driver.tireWear > 82 || (wetMismatch && driver.pitStops < 2) || (dryMismatch && driver.pitStops < 2)) {\n        driver.pitTimer = 5.8 + (1-driver.skill)*2.2;\n        driver.speed = Math.max(0, driver.speed * .55);\n      }\n      const progress = (driver.distance % lapDistance) / lapDistance;
      const cornerLoad = Math.abs(curveAt(progress));
      const rhythm = Math.sin(driver.distance * .001 + driver.skill * 8) * (2.2 + (1 - driver.skill) * 5);
      const trafficAhead = traffic
        .filter(car => car.id !== driver.id)
        .map(car => ({ ...car, gap: car.distance - driver.distance }))
        .filter(car => car.gap > 0 && car.gap < 42)
        .sort((a, b) => a.gap - b.gap)[0];

      const targetLaneBase = driver.lane + Math.sin(driver.distance * .0018 + driver.skill * 10) * .09;
      let targetLane = targetLaneBase;
      let draftBonus = 0;

      if (trafficAhead) {
        const laneGap = Math.abs((trafficAhead.currentLane ?? 0) - driver.currentLane);
        if (laneGap < .46 && trafficAhead.gap < 30) {
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

      const cornerPenalty = cornerLoad * (15 + (1 - driver.skill) * 27);
      const consistencyLoss = Math.abs(Math.sin(driver.distance * .00063 + driver.skill * 4)) * (1 - driver.skill) * 5;
      const weatherPenalty = (weather.rain || 0) * (driver.compound === 'INTER' ? 5 : 32);\n      const wearPenalty = driver.tireWear * .13;\n      const targetSpeed = clamp(driver.pace + rhythm + draftBonus - cornerPenalty - consistencyLoss - weatherPenalty - wearPenalty, 125, 285);
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

  function reset() {
    for (const driver of drivers) {
      driver.distance = driver.start;
      driver.speed = driver.pace * .96;
      driver.currentLane = driver.lane;
      driver.targetLane = driver.lane;
      driver.overtakes = 0; driver.fuel = 100; driver.tireWear = 0; driver.compound = 'MEDIUM'; driver.pitTimer = 0; driver.pitStops = 0;
    }
  }

  return { drivers, update, getStandings, reset };
}
