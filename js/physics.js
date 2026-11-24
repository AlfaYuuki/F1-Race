const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
// Calibrated against the sampled Fuji layout: a full tank supports one 12.5-lap stint.\nconst FUEL_BURN_BASE = 0.06;\nconst FUEL_BURN_SPEED = 0.06;\nconst COMPOUNDS = {
  SOFT: { grip: 1.08, wear: 0.18 },
  MEDIUM: { grip: 1, wear: 0.115 },
  HARD: { grip: 0.94, wear: 0.07 },
  INTER: { grip: 0.86, wear: 0.13 }
};
export function createPhysics() {
  return {
    speed: 0, playerX: 0, distance: 0, offRoad: false, lateralVelocity: 0, rpm: 850, gear: 1,
    fuel: 100, tireWear: 0, compound: 'MEDIUM', damage: 0, pitStops: 0,
    update(dt, input, curve, steerAxis = 0, options = {}) {
      const accelerating = input.has('accelerate'), braking = input.has('brake');
      const maxSpeed = options.pitLimiter ? 80 : (this.fuel <= 0 ? 95 : 330);
      const speedFactor = 1 - this.speed / (maxSpeed + 30);
      const throttle = accelerating ? (this.fuel > 0 ? 118 : 24) * Math.max(.18, speedFactor) : 0;
      const drag = 7 + this.speed * .105;
      const brakeForce = braking ? 245 : 0;
      this.speed = clamp(this.speed + (throttle - drag - brakeForce) * dt, 0, maxSpeed);
      if (this.fuel > 0 && this.speed > 2) {
        this.fuel = Math.max(0, this.fuel - (FUEL_BURN_BASE + this.speed / 330 * FUEL_BURN_SPEED) * dt);
      }
      if (this.speed > 35) this.tireWear = Math.min(100, this.tireWear + COMPOUNDS[this.compound].wear * dt * (this.offRoad ? 1.8 : 1));
      const digital = (input.has('right') ? 1 : 0) - (input.has('left') ? 1 : 0);
      const steer = clamp(digital + (Number.isFinite(steerAxis) ? steerAxis : 0), -1, 1);
      const velocityRatio = this.speed / 330;
      const tyreGrip = COMPOUNDS[this.compound].grip * (1 - this.tireWear / 100 * .62);
      const damageGrip = 1 - this.damage / 100 * .42;
      const grip = (this.offRoad ? .42 : 1) * tyreGrip * damageGrip;
      const steeringResponse = (1.15 + velocityRatio * 1.5) * grip;
      this.lateralVelocity += steer * steeringResponse * dt;
      this.lateralVelocity *= Math.max(0, 1 - dt * (3.2 + velocityRatio * 1.2));
      this.lateralVelocity -= curve * velocityRatio * .28 * dt;
      this.playerX += this.lateralVelocity * dt * (1.4 + velocityRatio * 1.2);
      this.offRoad = Math.abs(this.playerX) > .88;
      if (this.offRoad) {
        this.speed = Math.max(0, this.speed - (48 + this.speed * .38) * dt);
        this.lateralVelocity *= .94;
      }
      this.playerX = clamp(this.playerX, -1.35, 1.35);
      this.distance += this.speed / 3.6 * dt;
      this.gear = this.speed < 8 ? 1 : Math.min(8, Math.max(1, Math.floor(this.speed / 42) + 1));
      const gearProgress = (this.speed - (this.gear - 1) * 42) / 42;
      this.rpm = Math.round(Math.max(850, Math.min(12000, 900 + gearProgress * 9300 + (accelerating ? 650 : 0))));
    },
    impact(direction = 1) {
      this.speed = Math.max(35, this.speed - 48);
      this.lateralVelocity += direction * .7;
      this.playerX = clamp(this.playerX + direction * .09, -1.25, 1.25);
      this.damage = Math.min(100, this.damage + 8);
      this.rpm = Math.max(900, this.rpm - 1800);
    },
    applyPitService(compound, fuelTarget, repair = true) {
      const selected = Object.prototype.hasOwnProperty.call(COMPOUNDS, compound) ? compound : 'MEDIUM';
      this.compound = selected;
      this.tireWear = 0;
      this.fuel = clamp(Number(fuelTarget) || this.fuel, this.fuel, 100);
      if (repair) this.damage = 0;
      this.pitStops += 1;
    },
    reset() {
      this.speed = 0; this.playerX = 0; this.distance = 0; this.offRoad = false;
      this.lateralVelocity = 0; this.rpm = 850; this.gear = 1;
      this.fuel = 100; this.tireWear = 0; this.compound = 'MEDIUM'; this.damage = 0; this.pitStops = 0;
    }
  };
}
