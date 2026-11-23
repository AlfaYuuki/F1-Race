const DRIVER_DATA = [
  { id:'sato', name:'K. SATO', color:'#45a5e8', pace:246, skill:0.91, start:18, lane:-0.48 },
  { id:'tanaka', name:'M. TANAKA', color:'#f1bd4b', pace:238, skill:0.84, start:34, lane:0.48 },
  { id:'mori', name:'L. MORI', color:'#9b79df', pace:252, skill:0.94, start:52, lane:-0.12 },
  { id:'kobayashi', name:'A. KOBAYASHI', color:'#55c49a', pace:232, skill:0.78, start:70, lane:0.18 },
  { id:'nakamura', name:'R. NAKAMURA', color:'#e58b55', pace:242, skill:0.87, start:88, lane:0.62 }
];

export function createOpponents() {
  const drivers = DRIVER_DATA.map((driver, index) => ({
    ...driver,
    distance: driver.start,
    speed: driver.pace * (0.94 + index * 0.008),
    lane: driver.lane
  }));

  function update(dt, playerDistance, curveAt) {
    for (const driver of drivers) {
      const progress = (driver.distance % 1350) / 1350;
      const cornerLoad = Math.abs(curveAt(progress));
      const rhythm = Math.sin(driver.distance * 0.003 + driver.skill * 8) * 5;
      const targetSpeed = driver.pace + rhythm - cornerLoad * (25 * (1 - driver.skill));
      driver.speed += (targetSpeed - driver.speed) * Math.min(1, dt * (1.3 + driver.skill));
      // Small, smooth lane changes make rivals look for space rather than moving randomly.
      const passingMove = Math.sin(driver.distance * 0.0018 + driver.skill * 10) * 0.17;
      driver.currentLane = Math.max(-0.68, Math.min(0.68, driver.lane + passingMove));
      driver.distance += (driver.speed / 3.6) * dt;
    }

    // Avoid visually stacking two cars in almost the same position and lane.
    const ordered = [...drivers].sort((a,b) => a.distance - b.distance);
    for (let i=1;i<ordered.length;i++) {
      const behind = ordered[i-1], ahead = ordered[i];
      if (ahead.distance - behind.distance < 13 && Math.abs((ahead.currentLane ?? ahead.lane) - (behind.currentLane ?? behind.lane)) < 0.45) {
        behind.currentLane = Math.max(-0.72, Math.min(0.72, behind.currentLane + (behind.lane <= 0 ? -0.24 : 0.24)));
      }
    }
    return getStandings(playerDistance);
  }

  function getStandings(playerDistance) {
    const standings = [
      { id:'player', name:'YOU', color:'#ed4148', distance:playerDistance, isPlayer:true },
      ...drivers.map(driver => ({...driver, isPlayer:false}))
    ];
    standings.sort((a,b) => b.distance - a.distance);
    return standings;
  }

  function reset() {
    for (const driver of drivers) {
      driver.distance = driver.start;
      driver.speed = driver.pace * 0.96;
      driver.currentLane = driver.lane;
    }
  }

  return { drivers, update, getStandings, reset };
}
