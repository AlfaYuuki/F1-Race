const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
// Calibrated against the sampled Fuji layout: a full tank supports one 12.5-lap stint.
const FUEL_BURN_BASE = 0.06;
const FUEL_BURN_SPEED = 0.06;
const COMPOUNDS = {
  SOFT: { grip: 1.08, wear: 0.18 },
  MEDIUM: { grip: 1, wear: 0.115 },
  HARD: { grip: 0.94, wear: 0.07 },
  INTER: { grip: 0.86, wear: 0.13 }
};
// Tyre operating windows (°C): grip peaks inside the window, falls off when
// cold, and overheating also accelerates wear.
const TYRE_WINDOW = {
  SOFT: { low: 88, high: 108 },
  MEDIUM: { low: 80, high: 102 },
  HARD: { low: 74, high: 98 },
  INTER: { low: 55, high: 85 }
};
const AMBIENT_TEMP = 30;
const START_TYRE_TEMP = 62;
const START_BRAKE_TEMP = 180;
// Pure helper so the thermal grip model can be tested in isolation.
export function tyreTempEffects(compound, temp) {
  const w = TYRE_WINDOW[compound] || TYRE_WINDOW.MEDIUM;
  if (temp < w.low) {
    const cold = clamp((w.low - temp) / 45, 0, 1);
    return { grip: 1 - cold * .11, wear: 1 + cold * .08 };
  }
  if (temp > w.high) {
    const hot = clamp((temp - w.high) / 40, 0, 1);
    return { grip: 1 - hot * .14, wear: 1 + hot * .45 };
  }
  return { grip: 1, wear: 1 };
}
export function brakeFade(temp) {
  if (temp < 250) return .9 + temp / 250 * .1;      // cold brakes bite less
  if (temp > 700) return 1 - clamp((temp - 700) / 300, 0, 1) * .3; // fade
  return 1;
}
export function createPhysics() {
  return {
    speed: 0, playerX: 0, distance: 0, offRoad: false, lateralVelocity: 0, rpm: 850, gear: 1,
    fuel: 100, tireWear: 0, compound: 'MEDIUM', damage: 0, pitStops: 0,
    tyreTemp: START_TYRE_TEMP, brakeTemp: START_BRAKE_TEMP, downforce: 0, draft: 0, wheelspin: 0,
    telemetry: { throttle:0, brake:0, steering:0, lateralG:0, longitudinalG:0, grip:100, fuelFlow:0 },
    carConfig: { stats: { power:1, grip:1, braking:1, durability:1 }, setup: { aero:50, suspension:50, brakeBias:56, differential:50 } },
    setCarConfig(config) { if (config?.stats) this.carConfig = config; },
    update(dt, input, curve, steerAxis = 0, options = {}) {
      const previousSpeed = this.speed;
      const previousFuel = this.fuel;
      const accelerating = input.has('accelerate'), braking = input.has('brake');
      const stats = this.carConfig.stats;
      const weatherGrip = clamp(Number(options.weatherGrip) || 1, .5, 1.05);
      const trackGrip = clamp(Number(options.trackGrip) || 1, .5, 1.08);
      const weatherWear = clamp(Number(options.weatherWear) || 1, .8, 1.5);
      const maxSpeed = options.pitLimiter ? 80 : options.safetyCar ? 125 : options.yellowFlag ? 170 : (this.fuel <= 0 ? 95 : 330 * stats.power);
      const speedFactor = 1 - this.speed / (maxSpeed + 30);
      const aeroSetup = this.carConfig.setup?.aero ?? 50;
      const draft = clamp(Number(options.draft) || 0, 0, 1);
      this.draft = draft;
      // A lighter car (fuel burnt off) accelerates and stops harder; 1.0 at a full tank.
      const lightness = 1 + (100 - this.fuel) / 100 * .05;
      // Traction: at low speed a car on cold/worn tyres or grass cannot put all its power down.
      const tractionGrip = clamp(this.lastGrip ?? 1, 0, 1.2);
      const tractionLimit = clamp(tractionGrip / .95, .55, 1);
      const launchZone = clamp(1 - this.speed / 150, 0, 1);
      this.wheelspin = accelerating ? (1 - tractionLimit) * launchZone : 0;
      const throttle = accelerating ? (this.fuel > 0 ? 118 * stats.power : 24) * Math.max(.18, speedFactor) * lightness * (1 - this.wheelspin) : 0;
      // Higher wing settings add drag, slipstream removes up to 18% of it.
      const aeroDrag = 1 + (aeroSetup - 50) / 50 * .12;
      const drag = (7 + this.speed * .105) * aeroDrag * (1 - .18 * draft);
      const brakeForce = braking ? 245 * stats.braking * brakeFade(this.brakeTemp) * lightness : 0;
      this.speed = clamp(this.speed + (throttle - drag - brakeForce) * dt, 0, maxSpeed);
      const airflow = clamp(this.speed / 330, 0, 1);
      const brakeHeat = braking ? clamp(previousSpeed / 330, 0, 1) * 800 : 0;
      this.brakeTemp = clamp(this.brakeTemp + (brakeHeat - (this.brakeTemp - AMBIENT_TEMP) * (.25 + airflow * .6)) * dt, AMBIENT_TEMP, 1100);
      if (this.fuel > 0 && this.speed > 2) {
        this.fuel = Math.max(0, this.fuel - (FUEL_BURN_BASE + this.speed / 330 * FUEL_BURN_SPEED) * dt);
      }
      const thermal = tyreTempEffects(this.compound, this.tyreTemp);
      if (this.speed > 35) this.tireWear = Math.min(100, this.tireWear + COMPOUNDS[this.compound].wear * dt * weatherWear * thermal.wear * (this.offRoad ? 1.8 : 1));
      const digital = (input.has('right') ? 1 : 0) - (input.has('left') ? 1 : 0);
      const steer = clamp(digital + (Number.isFinite(steerAxis) ? steerAxis : 0), -1, 1);
      const velocityRatio = this.speed / 330;
      const setupGrip = .92 + (this.carConfig.setup?.aero ?? 50) / 625;
      const suspensionGrip = .94 + (this.carConfig.setup?.suspension ?? 50) / 800;
      // Downforce rises with the square of speed (scaled by wing setup) and is lost in dirty air.
      this.downforce = clamp((aeroSetup / 50) * airflow * airflow * (1 - .6 * draft), 0, 1.6);
      const downforceGrip = 1 + this.downforce * .10;
      const tyreGrip = thermal.grip * downforceGrip * COMPOUNDS[this.compound].grip * (1 - this.tireWear / 100 * .62) * stats.grip * setupGrip * suspensionGrip * weatherGrip * trackGrip;
      const damageGrip = 1 - this.damage / 100 * .42;
      const grip = (this.offRoad ? .42 : 1) * tyreGrip * damageGrip;
      this.lastGrip = grip;
      // Heavy braking while turning loads the front axle and unloads the rear: less bite on turn-in.
      const turnInPenalty = braking ? 1 - .15 * Math.abs(steer) : 1;
      const steeringResponse = (1.15 + velocityRatio * 1.5) * grip * turnInPenalty;
      this.lateralVelocity += steer * steeringResponse * dt;
      const diffStability = .9 + (this.carConfig.setup?.differential ?? 50) / 500;
      this.lateralVelocity *= Math.max(0, 1 - dt * (3.2 + velocityRatio * 1.2) * diffStability);
      this.lateralVelocity -= curve * velocityRatio * .28 * dt;
      this.playerX += this.lateralVelocity * dt * (1.4 + velocityRatio * 1.2);
      this.offRoad = Math.abs(this.playerX) > .88;
      if (this.offRoad) {
        this.speed = Math.max(0, this.speed - (48 + this.speed * .38) * dt);
        this.lateralVelocity *= .94;
      }
      this.playerX = clamp(this.playerX, -1.35, 1.35);
      // Tyre temperature: heated by speed, cornering load, braking and sliding; cooled by airflow.
      const lateralLoad = Math.min(1, Math.abs(this.lateralVelocity) * 1.2 + Math.abs(steer) * velocityRatio * .6);
      const tyreTarget = AMBIENT_TEMP + velocityRatio * 68 + lateralLoad * 46 + (braking ? 22 * velocityRatio : 0) + (this.offRoad ? 18 : 0) + (accelerating && this.wheelspin > 0 ? 14 : 0);
      this.tyreTemp += (tyreTarget - this.tyreTemp) / 7 * Math.min(dt, .1) * (this.speed > 2 ? 1 : .15);
      const longitudinalG = dt > 0 ? ((this.speed - previousSpeed) / 3.6) / dt / 9.81 : 0;
      const lateralG = clamp((steer * .85 - curve * .7 + this.lateralVelocity * .45) * velocityRatio, -3.5, 3.5);
      this.telemetry = {
        throttle: accelerating ? 100 : 0,
        brake: braking ? 100 : 0,
        steering: Math.round(steer * 100),
        lateralG,
        longitudinalG,
        grip: clamp(grip * 100, 0, 100),
        fuelFlow: dt > 0 ? Math.max(0, (previousFuel - this.fuel) / dt * 60) : 0
      };
      this.distance += this.speed / 3.6 * dt;
      this.gear = this.speed < 8 ? 1 : Math.min(8, Math.max(1, Math.floor(this.speed / 42) + 1));
      const gearProgress = (this.speed - (this.gear - 1) * 42) / 42;
      this.rpm = Math.round(Math.max(850, Math.min(12000, 900 + gearProgress * 9300 + (accelerating ? 650 : 0))));
    },
    getTelemetry() { return { ...this.telemetry }; },
    getDynamics() {
      return { tyreTemp: this.tyreTemp, brakeTemp: this.brakeTemp, downforce: this.downforce, draft: this.draft, wheelspin: this.wheelspin };
    },
    impact(direction = 1, severity = 1) {
      const force = clamp(Number.isFinite(severity) ? severity : 1, .15, 1);
      this.speed = Math.max(35, this.speed - 48 * force);
      this.lateralVelocity += direction * .7 * force;
      this.playerX = clamp(this.playerX + direction * .09 * force, -1.25, 1.25);
      this.damage = Math.min(100, this.damage + 8 * force / Math.max(.5, this.carConfig.stats.durability));
      this.rpm = Math.max(900, this.rpm - 1800 * force);
    },
    applyPitService(compound, fuelTarget, repair = true) {
      const selected = Object.prototype.hasOwnProperty.call(COMPOUNDS, compound) ? compound : 'MEDIUM';
      this.compound = selected;
      this.tireWear = 0;
      this.tyreTemp = START_TYRE_TEMP + 8; // fresh tyres leave the box pre-warmed
      this.brakeTemp = Math.min(this.brakeTemp, 260); // brakes cool during the stop
      this.fuel = clamp(Number(fuelTarget) || this.fuel, this.fuel, 100);
      if (repair) this.damage = 0;
      this.pitStops += 1;
    },
    reset() {
      this.speed = 0; this.playerX = 0; this.distance = 0; this.offRoad = false;
      this.lateralVelocity = 0; this.rpm = 850; this.gear = 1;
      this.fuel = 100; this.tireWear = 0; this.compound = 'MEDIUM'; this.damage = 0; this.pitStops = 0;
      this.tyreTemp = START_TYRE_TEMP; this.brakeTemp = START_BRAKE_TEMP; this.downforce = 0; this.draft = 0; this.wheelspin = 0; this.lastGrip = 1;
      this.telemetry = { throttle:0, brake:0, steering:0, lateralG:0, longitudinalG:0, grip:100, fuelFlow:0 };
    }
  };
}
