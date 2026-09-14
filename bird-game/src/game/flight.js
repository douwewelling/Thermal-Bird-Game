import * as THREE from "three";

export const FLIGHT = {
  gravity: 17,
  cruiseSpeed: 38,
  minSpeed: 4, // numerical guard only — a slow bird is supposed to fall
  maxSpeed: 96,
  stallSpeed: 19,

  // The wing trims itself toward level flight instead of generating raw CL*v^2,
  // which is what a real bird does with its angle of attack. How much force it
  // can actually apply scales with the square of airspeed and is capped here —
  // that ceiling is what turns a fast dive into a hard swoop and leaves a slow
  // bird mushy and falling.
  maxAuthority: 3.4,
  pullOutGain: 1.7, // how hard the wing fights a descent
  climbDamp: 0.28, // ...and how gently it resists a climb, so flapping still works

  dragOpen: 0.0011, // wings spread — sets the glide ratio
  dragTuck: 0.0004, // wings folded
  dragFlap: 0.0012, // extra cost of beating your wings

  maxBank: 1.25, // rad
  bankRate: 3.4, // rad/s the bank chases the steer input
  bankLiftCompensation: 0.75,

  flapImpulse: 7, // m/s along the wing's lift axis, at full power
  flapForward: 5,
  maxClimbAngle: 0.7, // rad — flapping stops steepening the climb past this
  flapCost: 11,
  staminaRegenBase: 5,
  staminaRegenGlide: 15,
  exhaustedPower: 0.3,
};

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class BirdFlight {
  constructor() {
    this.pos = new THREE.Vector3(0, 60, 0);
    this.vel = new THREE.Vector3(0, 0, -FLIGHT.cruiseSpeed);
    this.bank = 0;
    this.stamina = 100;
    this.alive = true;

    this.liftAxis = new THREE.Vector3(0, 1, 0); // bird-relative "up", tilted by bank
    this.wingOpen = 1;
    this.flapPulse = 0; // decays after each stroke, drives the wing animation

    this._dir = new THREE.Vector3();
    this._lift = new THREE.Vector3();
  }

  reset() {
    this.pos.set(0, 60, 0);
    this.vel.set(0, 0, -FLIGHT.cruiseSpeed);
    this.bank = 0;
    this.stamina = 100;
    this.alive = true;
    this.flapPulse = 0;
  }

  get speed() {
    return this.vel.length();
  }

  get heading() {
    return Math.atan2(-this.vel.x, -this.vel.z);
  }

  get pitch() {
    const s = this.speed;
    return s < 1e-3 ? 0 : Math.asin(clamp(this.vel.y / s, -1, 1));
  }

  /**
   * @param dt       seconds
   * @param gesture  output of GestureReader.update()
   * @param world    { updraftAt(pos) -> m/s }
   */
  update(dt, gesture, world) {
    if (!this.alive) return;

    const tuck = gesture.tracked ? gesture.tuck : 0;
    const glide = gesture.tracked ? gesture.glide : 0.6;
    const steer = gesture.tracked ? gesture.steer : 0;

    // folding the wings kills lift and drag together — that is what makes a dive work
    this.wingOpen = clamp(1 - tuck * 0.92, 0.08, 1);

    /* ---- bank chases the steer input ---- */
    const targetBank = steer * FLIGHT.maxBank;
    const bankStep = FLIGHT.bankRate * dt;
    this.bank += clamp(targetBank - this.bank, -bankStep, bankStep);

    /* ---- flight axes ---- */
    let speed = this.vel.length();
    if (speed < 1e-3) {
      this.vel.set(0, 0, -FLIGHT.minSpeed);
      speed = FLIGHT.minSpeed;
    }
    const dir = this._dir.copy(this.vel).divideScalar(speed);

    // lift acts perpendicular to travel, in the vertical plane, then rolls with the bank
    const lift = this._lift.copy(UP).addScaledVector(dir, -UP.dot(dir));
    if (lift.lengthSq() < 1e-6) lift.set(0, 1, 0);
    // rolling about the flight direction tips lift sideways — positive bank is to
    // the bird's right (+X when flying down -Z), which is what turns it right
    lift.normalize().applyAxisAngle(dir, this.bank);
    this.liftAxis.copy(lift);

    /* ---- forces ---- */
    // below stall speed the wing stops working, so slow flight punishes you
    const stallFactor = clamp((speed - FLIGHT.stallSpeed * 0.55) / (FLIGHT.stallSpeed * 0.45), 0, 1);

    const speedRatio = speed / FLIGHT.cruiseSpeed;
    const authority = Math.min(speedRatio * speedRatio, FLIGHT.maxAuthority);
    const bankCos = Math.max(Math.cos(this.bank), 0.3);
    const compensation = 1 + (1 / bankCos - 1) * FLIGHT.bankLiftCompensation;

    // what the wing would need to hold this flight path, plus a term pulling it
    // back toward level — asymmetric, so descents are arrested but climbs are not
    const recovery = -this.vel.y * (this.vel.y < 0 ? FLIGHT.pullOutGain : FLIGHT.climbDamp);
    const demand = FLIGHT.gravity * compensation + recovery;
    const ceiling = FLIGHT.gravity * authority * compensation;
    const liftMag = clamp(demand, 0, ceiling) * this.wingOpen * stallFactor;

    const drag =
      FLIGHT.dragOpen * this.wingOpen +
      FLIGHT.dragTuck * (1 - this.wingOpen) +
      FLIGHT.dragFlap * (gesture.flapActivity ?? 0);

    this.vel.y -= FLIGHT.gravity * dt;
    this.vel.addScaledVector(lift, liftMag * dt);
    this.vel.addScaledVector(dir, -drag * speed * speed * dt);

    /* ---- flap ---- */
    if (gesture.flap) {
      let power = gesture.flap.power;
      const cost = FLIGHT.flapCost * power;
      if (this.stamina < cost) power *= FLIGHT.exhaustedPower;
      this.stamina = Math.max(0, this.stamina - cost);

      // taper the kick as the climb steepens, otherwise flapping pitches up until it stalls
      const headroom = clamp(1 - this.pitch / FLIGHT.maxClimbAngle, 0, 1);
      this.vel.addScaledVector(lift, FLIGHT.flapImpulse * power * headroom);
      this.vel.addScaledVector(dir, FLIGHT.flapForward * power);
      this.flapPulse = Math.min(1, this.flapPulse + power);
    }
    this.flapPulse *= Math.exp(-dt / 0.22);

    const regen = FLIGHT.staminaRegenBase + FLIGHT.staminaRegenGlide * glide;
    this.stamina = Math.min(100, this.stamina + regen * dt);

    /* ---- thermals ---- */
    const updraft = world?.updraftAt(this.pos) ?? 0;
    if (updraft > 0) this.vel.y += updraft * (0.45 + 0.9 * glide) * dt;

    /* ---- integrate ---- */
    const newSpeed = this.vel.length();
    if (newSpeed > FLIGHT.maxSpeed) this.vel.multiplyScalar(FLIGHT.maxSpeed / newSpeed);
    else if (newSpeed < FLIGHT.minSpeed) this.vel.multiplyScalar(FLIGHT.minSpeed / newSpeed);

    this.pos.addScaledVector(this.vel, dt);
  }
}
