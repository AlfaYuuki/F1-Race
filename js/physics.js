const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function createPhysics() {
  return {
    speed: 0, playerX: 0, distance: 0, offRoad: false,
    update(dt, input, curve) {
      const accelerating = input.has('accelerate');
      const braking = input.has('brake');
      const maxSpeed = 285;
      if (accelerating) this.speed += 105 * dt;
      else this.speed -= 24 * dt;
      if (braking) this.speed -= 185 * dt;
      this.speed = clamp(this.speed, 0, maxSpeed);
      const steer = (input.has('right') ? 1 : 0) - (input.has('left') ? 1 : 0);
      const steeringPower = (0.35 + this.speed / maxSpeed) * 1.45;
      this.playerX += steer * steeringPower * dt;
      this.playerX -= curve * (this.speed / maxSpeed) * dt * 0.23;
      this.offRoad = Math.abs(this.playerX) > 0.92;
      this.playerX = clamp(this.playerX, -1.35, 1.35);
      if (this.offRoad) this.speed = Math.max(0, this.speed - 100 * dt);
      this.distance += (this.speed / 3.6) * dt;
    }
  };
}
