import * as THREE from "three";
import { centerX, floorY, halfWidth } from "./canyon.js";

const SPACING = 95;
const RADIUS = 9.5;
const POOL = 10;
const BURSTS = 4;
const FIRST_D = 180;

/** Ring gates snake along the canyon so chaining them reads as a line to follow. */
export function ringAt(index) {
  const d = index * SPACING + FIRST_D;
  const w = halfWidth(d);
  const lateral = Math.sin(d * 0.0182) * w * 0.52 + Math.sin(d * 0.0071 + 2.4) * w * 0.24;
  return {
    index,
    d,
    x: centerX(d) + lateral,
    // kept clear of the floor: the lowest gate still leaves room to fly through
    y: floorY(d) + 44 + 22 * Math.sin(d * 0.0163 + 1.3),
    z: -d,
    radius: RADIUS,
  };
}

const TORUS = new THREE.TorusGeometry(RADIUS, 1.0, 6, 20);
const OUTLINE = new THREE.TorusGeometry(RADIUS, 1.32, 6, 20);
const DISC = new THREE.CircleGeometry(RADIUS - 1.0, 26);

function makeGate() {
  const holder = new THREE.Group();
  // chunky, unlit and ringed in ink so the gate reads as a drawn object
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc53d, transparent: true });
  const inkMat = new THREE.MeshBasicMaterial({
    color: 0x3d1638,
    transparent: true,
    side: THREE.BackSide,
  });
  const discMat = new THREE.MeshBasicMaterial({
    color: 0xfff0b8,
    transparent: true,
    opacity: 0.07,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  holder.add(
    new THREE.Mesh(OUTLINE, inkMat),
    new THREE.Mesh(TORUS, ringMat),
    new THREE.Mesh(DISC, discMat),
  );
  holder.visible = false;
  return { holder, ringMat, inkMat, discMat };
}

export class Rings {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this.gates = Array.from({ length: POOL }, () => makeGate());
    this.bursts = Array.from({ length: BURSTS }, () => ({ ...makeGate(), life: 0 }));
    [...this.gates, ...this.bursts].forEach((g) => this.group.add(g.holder));

    this.reset();
  }

  reset() {
    this.nextIndex = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.hits = 0;
    this.misses = 0;
    this.bursts.forEach((b) => {
      b.life = 0;
      b.holder.visible = false;
    });
  }

  /** @returns the gate resolved this frame as `{ hit, ring, combo }`, or null. */
  update(dt, prevPos, pos, time) {
    let event = null;

    // the bird only ever travels toward -Z, so gates resolve strictly in order
    while (pos.z <= ringAt(this.nextIndex).z) {
      const ring = ringAt(this.nextIndex);
      const span = prevPos.z - pos.z;
      const t = span > 1e-5 ? (prevPos.z - ring.z) / span : 0;
      const cx = prevPos.x + (pos.x - prevPos.x) * t;
      const cy = prevPos.y + (pos.y - prevPos.y) * t;
      const hit = Math.hypot(cx - ring.x, cy - ring.y) < ring.radius;

      if (hit) {
        this.hits++;
        this.combo++;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        this.#spawnBurst(ring);
      } else {
        this.misses++;
        this.combo = 0;
      }
      event = { hit, ring, combo: this.combo };
      this.nextIndex++;
    }

    this.#layout(time);

    for (const b of this.bursts) {
      if (b.life <= 0) continue;
      b.life = Math.max(0, b.life - dt / 0.45);
      b.holder.scale.setScalar(1 + (1 - b.life) * 0.7);
      b.ringMat.opacity = b.life;
      b.inkMat.opacity = b.life;
      b.discMat.opacity = 0.45 * b.life;
      if (b.life === 0) b.holder.visible = false;
    }

    return event;
  }

  /** Position the gates without scoring them — used for the menu flythrough. */
  preview(pos, time) {
    while (pos.z <= ringAt(this.nextIndex).z) this.nextIndex++;
    this.#layout(time);
  }

  #layout(time) {
    for (let i = 0; i < POOL; i++) {
      const gate = this.gates[i];
      const ring = ringAt(this.nextIndex + i);
      gate.holder.visible = true;
      gate.holder.position.set(ring.x, ring.y, ring.z);
      gate.holder.rotation.z = time * 0.25 + ring.index;
      // the nearest gate glows brightest, so the line to follow is unmistakable
      const prominence = 1 - i / POOL;
      gate.ringMat.opacity = 0.3 + 0.7 * prominence;
      gate.inkMat.opacity = 0.3 + 0.7 * prominence;
      gate.ringMat.color.setHex(i === 0 ? 0xffe0b0 : 0xffb04d);
      gate.discMat.opacity = 0.04 + 0.07 * prominence;
    }
  }

  #spawnBurst(ring) {
    const b = this.bursts.reduce((a, c) => (c.life < a.life ? c : a));
    b.life = 1;
    b.holder.visible = true;
    b.holder.position.set(ring.x, ring.y, ring.z);
    b.holder.scale.setScalar(1);
    b.ringMat.color.setHex(0xfff0d0);
  }
}
