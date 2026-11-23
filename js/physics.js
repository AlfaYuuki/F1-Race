const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const approach = (value, target, amount) => value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);
export function createPhysics() {
  return {
    speed: 0, playerX: 0, distance: 0, offRoad: false, lateralVelocity: 0,
    update(dt, input, curve) {
      const accelerating = input.has('accelerate'), braking = input.has('brake');
      const maxSpeed = 330;
      const speedFactor = 1 - this.speed / (maxSpeed + 30);
      const throttle = accelerating ? 118 * Math.max(.18, speedFactor) : 0;
      const drag = 7 + this.speed * .105;
      const brakeForce = braking ? 245 : 0;
      this.speed = clamp(this.speed + (throttle - drag - brakeForce) * dt, 0, maxSpeed);

      const steer = (input.has('right') ? 1 : 0) - (input.has('left') ? 1 : 0);
      const velocityRatio = this.speed / maxSpeed;
      const grip = this.offRoad ? .42 : 1;
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
    },
    impact(direction = 1) {
      this.speed = Math.max(35, this.speed - 48);
      this.lateralVelocity += direction * .7;
      this.playerX = clamp(this.playerX + direction * .09, -1.25, 1.25);
    },
    reset() { this.speed = 0; this.playerX = 0; this.distance = 0; this.offRoad = false; this.lateralVelocity = 0; }
  };
}
