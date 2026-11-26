const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Detects actual car-to-car overlap in track coordinates.
 * Proximity is deliberately not contact: longitudinal and lateral footprints
 * must both overlap. A contact stays latched until the cars clearly separate.
 */
export function createCollisionDetector(options = {}) {
  const longitudinalRadius = clamp(Number(options.longitudinalRadius) || 3.9, 1, 8);
  const lateralRadius = clamp(Number(options.lateralRadius) || 0.4, 0.1, 1);
  const releaseLongitudinal = Math.max(longitudinalRadius + 1, Number(options.releaseLongitudinal) || 6.5);
  const releaseLateral = Math.max(lateralRadius + 0.1, Number(options.releaseLateral) || 0.58);
  const activeContacts = new Set();

  function update(playerDistance, playerLane, drivers = []) {
    const distance = Number(playerDistance);
    const lane = Number(playerLane);
    if (!Number.isFinite(distance) || !Number.isFinite(lane) || !Array.isArray(drivers)) {
      activeContacts.clear();
      return null;
    }

    const seen = new Set();
    const candidates = [];
    for (const driver of drivers) {
      if (!driver || driver.id == null) continue;
      const id = String(driver.id);
      seen.add(id);

      // Ghosts and explicitly non-collidable cars are never physical contacts.
      if (driver.ghost === true || driver.isGhost === true || driver.collisionEnabled === false) {
        activeContacts.delete(id);
        continue;
      }

      const rivalDistance = Number(driver.distance);
      const rivalLane = Number(driver.currentLane ?? driver.lane);
      if (!Number.isFinite(rivalDistance) || !Number.isFinite(rivalLane)) {
        activeContacts.delete(id);
        continue;
      }

      const longitudinalGap = Math.abs(rivalDistance - distance);
      const lateralGap = Math.abs(rivalLane - lane);
      if (activeContacts.has(id)) {
        if (longitudinalGap > releaseLongitudinal || lateralGap > releaseLateral) {
          activeContacts.delete(id);
        }
        continue;
      }

      if (longitudinalGap <= longitudinalRadius && lateralGap <= lateralRadius) {
        activeContacts.add(id);
        candidates.push({ driver, longitudinalGap, lateralGap });
      }
    }

    for (const id of activeContacts) {
      if (!seen.has(id)) activeContacts.delete(id);
    }

    candidates.sort((a, b) => a.longitudinalGap - b.longitudinalGap || a.lateralGap - b.lateralGap);
    return candidates[0]?.driver ?? null;
  }

  function reset() {
    activeContacts.clear();
  }

  return { update, reset };
}
