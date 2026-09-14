/**
 * Keyboard stand-in for the pose reader, used when the camera is unavailable
 * or denied. Emits exactly the same shape as GestureReader.update().
 */
export class KeyboardGestures {
  constructor() {
    this.keys = new Set();
    this.steer = 0;
    this.flapActivity = 0;
    this.pendingFlap = false;

    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "Space") {
        this.pendingFlap = true;
        e.preventDefault();
      }
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
  }

  update(_result, dt) {
    const held = (...codes) => codes.some((c) => this.keys.has(c));
    const tuck = held("ShiftLeft", "ShiftRight", "KeyS", "ArrowDown") ? 1 : 0;

    const dir = (held("KeyD", "ArrowRight") ? 1 : 0) - (held("KeyA", "ArrowLeft") ? 1 : 0);
    this.steer += (dir - this.steer) * (1 - Math.exp(-dt * 6));

    const flap = this.pendingFlap ? { power: 1, sweep: 1 } : null;
    this.pendingFlap = false;
    this.flapActivity = flap ? 1 : this.flapActivity * Math.exp(-dt / 0.55);

    const wingAngle = flap ? 1.1 : -0.05 + this.flapActivity * 0.9;

    return {
      tracked: true,
      visible: true,
      wingAngle,
      spread: tuck ? 0.2 : 0.9,
      extension: tuck ? 0.4 : 0.95,
      tuck,
      glide: tuck ? 0 : 1 - this.flapActivity,
      flapActivity: this.flapActivity,
      flap,
      steer: this.steer,
      hint: "",
    };
  }
}
