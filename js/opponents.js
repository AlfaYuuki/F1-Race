const DRIVER_DATA = [
  { id:'sato', name:'K. SATO', color:'#45a5e8', pace:246, skill:.91, start:18, lane:-.48 },
  { id:'tanaka', name:'M. TANAKA', color:'#f1bd4b', pace:238, skill:.84, start:34, lane:.48 },
  { id:'mori', name:'L. MORI', color:'#9b79df', pace:252, skill:.94, start:52, lane:-.12 },
  { id:'kobayashi', name:'A. KOBAYASHI', color:'#55c49a', pace:232, skill:.78, start:70, lane:.18 },
  { id:'nakamura', name:'R. NAKAMURA', color:'#e58b55', pace:242, skill:.87, start:88, lane:.62 }
];
export function createOpponents(lapDistance = 4563) {
  const drivers = DRIVER_DATA.map((driver, index) => ({ ...driver, distance: driver.start, speed: driver.pace * (.94 + index * .008), currentLane: driver.lane }));
  function update(dt, playerDistance, curveAt) {
    for (const driver of drivers) {
      const progress = (driver.distance % lapDistance) / lapDistance;
      const cornerLoad = Math.abs(curveAt(progress));
      const rhythm = Math.sin(driver.distance * .001 + driver.skill * 8) * 5;
      const targetSpeed = driver.pace + rhythm - cornerLoad * (25 * (1 - driver.skill));
      driver.speed += (targetSpeed - driver.speed) * Math.min(1, dt * (1.3 + driver.skill));
      const passingMove = Math.sin(driver.distance * .0018 + driver.skill * 10) * .17;
      driver.currentLane = Math.max(-.7, Math.min(.7, driver.lane + passingMove));
      driver.distance += driver.speed / 3.6 * dt;
    }
    const ordered = [...drivers].sort((a,b) => a.distance - b.distance);
    for (let i=1;i<ordered.length;i++) {
      const behind = ordered[i-1], ahead = ordered[i];
      if (ahead.distance - behind.distance < 13 && Math.abs(ahead.currentLane - behind.currentLane) < .45) {
        behind.currentLane = Math.max(-.72, Math.min(.72, behind.currentLane + (behind.lane <= 0 ? -.24 : .24)));
      }
    }
    return getStandings(playerDistance);
  }
  function getStandings(playerDistance) {
    return [{ id:'player', name:'YOU', color:'#ed4148', distance:playerDistance, isPlayer:true },
      ...drivers.map(driver => ({ ...driver, isPlayer:false }))].sort((a,b) => b.distance - a.distance);
  }
  function reset() {
    for (const driver of drivers) { driver.distance = driver.start; driver.speed = driver.pace * .96; driver.currentLane = driver.lane; }
  }
  return { drivers, update, getStandings, reset };
}
