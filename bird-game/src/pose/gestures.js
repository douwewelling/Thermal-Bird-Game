import { LM } from "./tracker.js";

/* ------------------------------------------------------------------ *
 * tuning — every feel-related constant lives here
 * ------------------------------------------------------------------ */
export const TUNE = {
  // A flap is a downstroke measured against wherever the player's own arms
  // peaked, not against the horizon — plenty of people beat entirely below
  // shoulder height, and absolute thresholds would never fire for them.
  flapMinSweep: 0.5, // rad the arms must fall from their peak
  flapMinSpeed: 1.8, // rad/s, so slowly lowering the arms is not a flap
  flapPeakDecay: 0.9, // rad/s the remembered peak sags toward the current angle
  // reference stroke: a committed ~100° beat at a brisk cadence scores 1.0, so a
  // half-hearted flutter reads weak and a full-arm heave reads strong
  flapRefSweep: 1.7, // rad of travel
  flapRefSpeed: 9, // rad/s downstroke speed
  flapMinExtension: 0.5, // arms must be at least this straight to count
  flapCooldown: 0.16, // s
  flapDecay: 0.85, // s, how fast the "recently flapping" signal fades

  spreadGlide: 0.62, // lateral reach/arm-length where gliding begins
  spreadTuck: 0.26, // ...and where a full tuck is reached
  spreadOutLo: 0.58,
  spreadOutHi: 0.82,
  glideLevelBand: 0.55, // rad from horizontal still considered "held out"

  steerBankGain: 1.45, // shoulder-drop contribution
  steerLeanGain: 1.1, // torso-lean contribution
  steerDeadzone: 0.07,

  visibilityFloor: 0.45,

  // The camera delivers ~30 poses/s while the game renders at 60+. Controls are
  // therefore eased toward the latest reading every frame, which removes the
  // staircase without adding meaningful lag.
  easeTau: 0.05, // s, for tuck/glide/wing
  steerTau: 0.075, // s, steering wants to feel a touch heavier
  lostTau: 0.3, // s, drifting back to neutral when the body is lost
  lostGrace: 0.35, // s a dropout is ignored before neutral is targeted
};

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
const smoothstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);
const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const norm = (a) => {
  const l = len(a) || 1e-6;
  return scale(a, 1 / l);
};
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** One-euro filter: smooths jitter when still without adding lag when moving fast. */
class OneEuro {
  constructor(minCutoff = 1.2, beta = 0.35, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = null;
    this.dx = 0;
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(value, dt) {
    if (this.x === null) {
      this.x = value;
      return value;
    }
    const dxRaw = (value - this.x) / dt;
    this.dx = OneEuro.alpha(this.dCutoff, dt) * dxRaw + (1 - OneEuro.alpha(this.dCutoff, dt)) * this.dx;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = OneEuro.alpha(cutoff, dt);
    this.x = a * value + (1 - a) * this.x;
    return this.x;
  }
  get velocity() {
    return this.dx;
  }
}

/* ------------------------------------------------------------------ *
 * raw body measurements, in a frame anchored to the player's torso
 * ------------------------------------------------------------------ */
function measure(world, landmarks, armRef = null) {
  const w = world;
  const ls = w[LM.LEFT_SHOULDER];
  const rs = w[LM.RIGHT_SHOULDER];
  const lh = w[LM.LEFT_HIP];
  const rh = w[LM.RIGHT_HIP];
  const lw = w[LM.LEFT_WRIST];
  const rw = w[LM.RIGHT_WRIST];
  const le = w[LM.LEFT_ELBOW];
  const re = w[LM.RIGHT_ELBOW];
  if (!ls || !rs || !lh || !rh || !lw || !rw) return null;

  const shoulderMid = mid(ls, rs);
  const hipMid = mid(lh, rh);
  const shoulderWidth = Math.max(len(sub(rs, ls)), 1e-3);

  // torso-local axes: `up` runs hips→shoulders, `right` points to the player's right
  const up = norm(sub(shoulderMid, hipMid));
  const rightRaw = sub(rs, ls);
  const right = norm(sub(rightRaw, scale(up, dot(rightRaw, up))));

  const armLenL = Math.max(len(sub(le, ls)) + len(sub(lw, le)), 1e-3);
  const armLenR = Math.max(len(sub(re, rs)) + len(sub(rw, re)), 1e-3);

  const vL = sub(lw, ls);
  const vR = sub(rw, rs);

  // lateral = reach away from the torso; vertical = reach along the torso's up axis
  const latL = -dot(vL, right);
  const latR = dot(vR, right);
  const vertL = dot(vL, up);
  const vertR = dot(vR, up);

  // a calibrated arm length is steadier than the live one, which jitters with the elbow
  const refL = armRef ?? armLenL;
  const refR = armRef ?? armLenR;

  const vis = (i) => landmarks[i]?.visibility ?? 1;

  return {
    shoulderWidth,
    armLen: (armLenL + armLenR) / 2,
    // atan2 against a floored lateral term keeps a fully tucked arm from reading as "overhead"
    wingAngleL: Math.atan2(vertL, Math.max(latL, 0.03)),
    wingAngleR: Math.atan2(vertR, Math.max(latR, 0.03)),
    spreadL: latL / refL,
    spreadR: latR / refR,
    extensionL: len(vL) / refL,
    extensionR: len(vR) / refR,
    // roll and lean need a gravity reference, so these use world axes, not torso axes
    bankRight: (rs.y - ls.y) / shoulderWidth,
    leanRight: -(shoulderMid.x - hipMid.x) / shoulderWidth,
    visibility: Math.min(
      vis(LM.LEFT_SHOULDER),
      vis(LM.RIGHT_SHOULDER),
      vis(LM.LEFT_HIP),
      vis(LM.RIGHT_HIP),
      vis(LM.LEFT_WRIST),
      vis(LM.RIGHT_WRIST),
    ),
    hipScreenY: (landmarks[LM.LEFT_HIP].y + landmarks[LM.RIGHT_HIP].y) / 2,
  };
}

/**
 * What the bird is told to do when nobody is being tracked: wings held out in a
 * steady glide, no steering. Losing the player should never slam the controls.
 */
const NEUTRAL = () => ({ wingAngle: 0, spread: 0.9, extension: 0.9, tuck: 0, glide: 0.6, steer: 0 });

/* ------------------------------------------------------------------ *
 * GestureReader — turns pose frames into flight intent
 * ------------------------------------------------------------------ */
export class GestureReader {
  constructor() {
    this.cal = { bankOffset: 0, leanOffset: 0, armLen: null, ready: false };
    this.samples = null;

    this.fWing = new OneEuro(1.6, 0.8);
    this.fSpread = new OneEuro(1.1, 0.3);
    this.fExtension = new OneEuro(1.1, 0.3);
    this.fSteer = new OneEuro(0.9, 0.25);

    this.flapPeak = 0;
    this.stroking = false;
    this.strokeTop = 0;
    this.strokeLow = 0;
    this.strokeVel = 0;
    this.flapCooldown = 0;
    this.flapActivity = 0;

    this.lastResult = null;
    this.sinceSample = 0;
    this.lostFor = 0;
    // what the latest pose asked for, and what the bird is actually being given
    this.target = NEUTRAL();
    this.smooth = NEUTRAL();
    this.measured = null;
    this.out = this.#blank();
  }

  #blank() {
    return {
      tracked: false,
      visible: false,
      wingAngle: 0,
      wingAngleL: 0,
      wingAngleR: 0,
      spread: 0,
      extension: 0,
      tuck: 0,
      glide: 0,
      flapActivity: 0,
      flap: null,
      steer: 0,
      hint: "no body detected",
    };
  }

  /* ---- calibration: player stands in a T-pose for a couple of seconds ---- */
  beginCalibration() {
    this.samples = { bank: [], lean: [], arm: [], spread: [], last: null, quality: 0 };
  }

  /** Feed a pose frame during calibration. Returns 0..1 quality of the current pose. */
  sampleCalibration(result) {
    if (!result || !this.samples) return 0;
    // called every render frame, but only every other one carries a new pose
    if (result === this.samples.last) return this.samples.quality;
    this.samples.last = result;

    const m = measure(result.world, result.landmarks);
    if (!m || m.visibility < TUNE.visibilityFloor) return (this.samples.quality = 0);

    const spread = (m.spreadL + m.spreadR) / 2;
    const levelness = 1 - clamp((Math.abs(m.wingAngleL) + Math.abs(m.wingAngleR)) / 2 / 0.6, 0, 1);
    const quality = smoothstep(0.55, 0.85, spread) * levelness;
    if (quality > 0.35) {
      this.samples.bank.push(m.bankRight);
      this.samples.lean.push(m.leanRight);
      this.samples.arm.push(m.armLen);
      this.samples.spread.push(spread);
    }
    return (this.samples.quality = quality);
  }

  finishCalibration() {
    if (!this.samples || this.samples.bank.length < 5) return false;
    this.cal = {
      bankOffset: median(this.samples.bank),
      leanOffset: median(this.samples.lean),
      armLen: median(this.samples.arm),
      ready: true,
    };
    this.samples = null;
    return true;
  }

  /* ---- per-frame read ---- */
  update(result, dt) {
    dt = clamp(dt, 1 / 240, 1 / 15);
    this.flapCooldown = Math.max(0, this.flapCooldown - dt);
    this.flapActivity *= Math.exp(-dt / TUNE.flapDecay);

    // Inference only runs when the webcam produces a new frame, so the tracker
    // hands back the very same object on most render frames. Re-filtering it
    // would feed the velocity estimator duplicates and sap the speed a flap is
    // scored on, so identity is the freshness test.
    const fresh = !!result && result !== this.lastResult;
    this.sinceSample += dt;
    let flap = null;

    if (fresh) {
      this.lastResult = result;
      flap = this.#analyse(result, clamp(this.sinceSample, 1 / 240, 1 / 10));
      this.sinceSample = 0;
    }

    // a blink of lost tracking keeps the last intent; a real loss drifts to neutral
    this.lostFor = result ? 0 : this.lostFor + dt;
    if (this.lostFor > TUNE.lostGrace) this.target = NEUTRAL();

    const ease = (key, tau) => {
      const k = 1 - Math.exp(-dt / tau);
      this.smooth[key] += (this.target[key] - this.smooth[key]) * k;
    };
    const slow = this.lostFor > TUNE.lostGrace;
    ease("wingAngle", slow ? TUNE.lostTau : TUNE.easeTau);
    ease("spread", slow ? TUNE.lostTau : TUNE.easeTau);
    ease("extension", slow ? TUNE.lostTau : TUNE.easeTau);
    ease("tuck", slow ? TUNE.lostTau : TUNE.easeTau);
    ease("glide", slow ? TUNE.lostTau : TUNE.easeTau);
    ease("steer", slow ? TUNE.lostTau : TUNE.steerTau);

    const m = this.measured;
    const lost = this.lostFor > TUNE.lostGrace;
    this.out = {
      tracked: !!m && !lost,
      visible: !!m && !lost && m.visibility >= TUNE.visibilityFloor,
      wingAngle: this.smooth.wingAngle,
      wingAngleL: m?.wingAngleL ?? 0,
      wingAngleR: m?.wingAngleR ?? 0,
      spread: this.smooth.spread,
      extension: this.smooth.extension,
      tuck: this.smooth.tuck,
      glide: this.smooth.glide,
      flapActivity: clamp(this.flapActivity, 0, 1),
      flap,
      steer: clamp(this.smooth.steer, -1, 1),
      hint: lost ? "no body detected" : (this.hint ?? ""),
    };
    return this.out;
  }

  /** Runs once per camera frame. Sets `this.target`; returns a flap event or null. */
  #analyse(result, dt) {
    const m = measure(result.world, result.landmarks, this.cal.armLen);
    this.measured = m;
    if (!m) {
      this.hint = "no body detected";
      return null;
    }

    const visible = m.visibility >= TUNE.visibilityFloor;
    const wingAngle = this.fWing.filter((m.wingAngleL + m.wingAngleR) / 2, dt);
    const wingVel = this.fWing.velocity; // rad/s, negative on a downstroke
    const spread = this.fSpread.filter((m.spreadL + m.spreadR) / 2, dt);
    const extension = this.fExtension.filter((m.extensionL + m.extensionR) / 2, dt);

    /* --- flap: a downstroke away from the player's own peak, scored by
           how far and how fast it swept --- */
    let flap = null;
    if (extension < TUNE.flapMinExtension) {
      // arms folded: whatever they are doing, it is not a wingbeat
      this.stroking = false;
      this.flapPeak = wingAngle;
    } else if (!this.stroking) {
      // watching for a downstroke to begin
      if (wingAngle >= this.flapPeak) this.flapPeak = wingAngle;
      // let the peak sag, so a stroke started from a lower arc still counts
      else this.flapPeak = Math.max(this.flapPeak - TUNE.flapPeakDecay * dt, wingAngle);

      if (wingVel <= -TUNE.flapMinSpeed) {
        this.stroking = true;
        this.strokeTop = this.flapPeak;
        this.strokeLow = wingAngle;
        this.strokeVel = -wingVel;
      }
    } else {
      this.strokeLow = Math.min(this.strokeLow, wingAngle);
      this.strokeVel = Math.max(this.strokeVel, -wingVel);

      // the beat lands when the arms stop going down, and is scored on the whole
      // stroke — firing partway through would make every flap feel identical
      if (wingVel > -TUNE.flapMinSpeed * 0.35) {
        const sweep = this.strokeTop - this.strokeLow;
        if (sweep >= TUNE.flapMinSweep && this.flapCooldown === 0) {
          const power =
            clamp(sweep / TUNE.flapRefSweep, 0.25, 1.3) *
            clamp(this.strokeVel / TUNE.flapRefSpeed, 0.3, 1.25);
          flap = { power: clamp(power, 0.15, 1.35), sweep };
          this.flapActivity = Math.max(this.flapActivity, clamp(power, 0, 1));
          this.flapCooldown = TUNE.flapCooldown;
        }
        this.stroking = false;
        this.flapPeak = wingAngle;
      }
    }

    /* --- tuck / glide, as continuous blends rather than exclusive states --- */
    const tuck = invLerp(TUNE.spreadGlide, TUNE.spreadTuck, spread);
    const armsOut = smoothstep(TUNE.spreadOutLo, TUNE.spreadOutHi, spread);
    const level = 1 - clamp(Math.abs(wingAngle) / TUNE.glideLevelBand, 0, 1);
    const glide = armsOut * level * (1 - clamp(this.flapActivity, 0, 1));

    /* --- steer: shoulder roll plus torso lean, both relative to calibration --- */
    const bank = m.bankRight - this.cal.bankOffset;
    const lean = m.leanRight - this.cal.leanOffset;
    let steerRaw = bank * TUNE.steerBankGain + lean * TUNE.steerLeanGain;
    const sign = Math.sign(steerRaw);
    const mag = invLerp(TUNE.steerDeadzone, 1, Math.abs(steerRaw));
    const steer = this.fSteer.filter(sign * mag * mag * 0.55 + sign * mag * 0.45, dt);

    this.hint = !visible
      ? "step back — full torso not visible"
      : m.hipScreenY > 0.97
        ? "step back — hips out of frame"
        : "";

    this.target = { wingAngle, spread, extension, tuck, glide, steer: clamp(steer, -1, 1) };
    return flap;
  }
}
