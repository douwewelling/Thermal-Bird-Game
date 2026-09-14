import * as THREE from "three";
import { TOON } from "./scene.js";

export const CANYON = {
  chunkLength: 240,
  chunkCount: 7,
  step: 8, // z resolution of the wall mesh
  wallLevels: 7,
  wallHeight: 165,
  ceilingFraction: 0.62, // of the wall height — keeps play down inside the canyon
  clearance: 2.4, // how close the bird may get before it counts as a hit
};

/* ---------- deterministic field functions (no allocation, no state) ---------- */

const hash = (x, y) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

const noise = (x, y) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
};

/** Distance flown, in metres. The bird travels toward -Z, so this is positive. */
export const distanceOf = (z) => -z;

export const centerX = (d) =>
  36 * Math.sin(d * 0.0061) + 20 * Math.sin(d * 0.0142 + 1.7) + 8 * Math.sin(d * 0.0309 + 0.4);

export const floorY = (d) =>
  11 * Math.sin(d * 0.0087 + 2.2) + 6 * Math.sin(d * 0.0191 + 0.9) + 3 * Math.sin(d * 0.047);

/** Canyon narrows as you get further out — that is the difficulty curve. */
export const halfWidth = (d) => {
  const tighten = Math.min(d / 7000, 1);
  const base = 54 - 22 * tighten;
  return base + 9 * Math.sin(d * 0.0113 + 3.1) + 4 * Math.sin(d * 0.026 + 1.2);
};

/* ---------- spires and thermals, placed on a deterministic lattice ---------- */

const SPIRE_SPACING = 155;
const THERMAL_SPACING = 340;

function spireAt(index) {
  const d = index * SPIRE_SPACING + 60;
  if (d < 700) return null; // give the player a calm opening stretch
  const r = hash(index * 7.3, 19.1);
  if (r > 0.72) return null;
  const w = halfWidth(d);
  const lateral = (hash(index * 3.1, 5.7) * 1.7 - 0.85) * w;
  return {
    d,
    x: centerX(d) + lateral,
    z: -d,
    radius: 5 + hash(index * 11.7, 2.3) * 5,
    base: floorY(d) - 4,
    height: 42 + hash(index * 2.9, 31.4) * 70,
  };
}

function thermalAt(index) {
  const d = index * THERMAL_SPACING + 220;
  const w = halfWidth(d);
  return {
    d,
    x: centerX(d) + (hash(index * 13.7, 8.2) * 1.2 - 0.6) * w,
    y: floorY(d) + 30,
    z: -d,
    radius: 17,
    strength: 15,
  };
}

/* ---------- mesh building ---------- */

// four bold bands from shaded base to sunlit rim, rather than a smooth ramp
const COLOR = {
  shadow: new THREE.Color(0x532a6b),
  rock: new THREE.Color(0xa8414f),
  warm: new THREE.Color(0xdf6b36),
  rim: new THREE.Color(0xf2a049),
  cap: new THREE.Color(0xffc46b),
  sand: new THREE.Color(0xeda85f),
  sandDark: new THREE.Color(0xa85a36),
};

class MeshBuilder {
  constructor() {
    this.pos = [];
    this.col = [];
  }
  tri(a, b, c, ca, cb, cc) {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  }
  quad(a, b, c, d, ca, cb, cc, cd) {
    this.tri(a, b, c, ca, cb, cc);
    this.tri(a, c, d, ca, cc, cd);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}

/**
 * Quantised into flat strata. Snapping `t` to a handful of steps is what gives
 * the walls their drawn, banded look instead of an airbrushed gradient.
 */
const BANDS = 7;
const wallColor = (t, shade) => {
  const q = Math.round(t * BANDS) / BANDS;
  const c = new THREE.Color();
  if (q < 0.42) c.copy(COLOR.shadow).lerp(COLOR.rock, q / 0.42);
  else if (q < 0.72) c.copy(COLOR.rock).lerp(COLOR.warm, (q - 0.42) / 0.3);
  else if (q < 0.93) c.copy(COLOR.warm).lerp(COLOR.rim, (q - 0.72) / 0.21);
  else c.copy(COLOR.rim).lerp(COLOR.cap, (q - 0.93) / 0.07);
  return c.multiplyScalar(shade);
};

/** Wall surfaces bulge in and out. `t` is height up the wall, 0..1. */
const wallBulge = (d, t) => noise(d * 0.021, t * 3.4) * 9 - 4.5 + noise(d * 0.07, t * 8) * 3;

const heightToT = (d, y) => {
  const raw = (y - floorY(d)) / CANYON.wallHeight;
  return raw <= 0 ? 0 : Math.min(Math.pow(raw, 1 / 1.15), 1);
};

/**
 * Half-width of the gap at a given height — the same surface the mesh draws,
 * so what the player sees is what they hit.
 */
export const gapAt = (d, y) => {
  const t = heightToT(d, y);
  return halfWidth(d) + Math.pow(t, 1.6) * 16 + wallBulge(d, t) * (0.25 + t);
};

function buildChunk(startD) {
  const mb = new MeshBuilder();
  const steps = Math.round(CANYON.chunkLength / CANYON.step);
  const levels = CANYON.wallLevels;

  const wallPoint = (d, side, li) => {
    const t = li / (levels - 1);
    const y = floorY(d) + Math.pow(t, 1.15) * CANYON.wallHeight;
    return new THREE.Vector3(centerX(d) + side * gapAt(d, y), y, -d);
  };

  for (let i = 0; i < steps; i++) {
    const d0 = startD + i * CANYON.step;
    const d1 = d0 + CANYON.step;

    for (const side of [-1, 1]) {
      for (let li = 0; li < levels - 1; li++) {
        const t = li / (levels - 1);
        const shade = 0.80 + noise(d0 * 0.05, li * 2.1) * 0.24;
        const a = wallPoint(d0, side, li);
        const b = wallPoint(d1, side, li);
        const c = wallPoint(d1, side, li + 1);
        const e = wallPoint(d0, side, li + 1);
        const cl = wallColor(t, shade);
        const cu = wallColor((li + 1) / (levels - 1), shade);
        if (side < 0) mb.quad(a, b, c, e, cl, cl, cu, cu);
        else mb.quad(a, e, c, b, cl, cu, cu, cl);
      }
    }

    // canyon floor, dipped in the middle so it reads as a riverbed
    const fl = (d, u) => {
      const w = halfWidth(d);
      return new THREE.Vector3(
        centerX(d) + u * w,
        floorY(d) - (1 - u * u) * 4 + noise(d * 0.04, u * 4) * 3,
        -d,
      );
    };
    const cols = 5;
    for (let c = 0; c < cols; c++) {
      const u0 = -1 + (2 * c) / cols;
      const u1 = -1 + (2 * (c + 1)) / cols;
      const shade = 0.82 + noise(d0 * 0.06, c * 3.3) * 0.22;
      const col = COLOR.sandDark.clone().lerp(COLOR.sand, 1 - Math.abs((u0 + u1) / 2)).multiplyScalar(shade);
      mb.quad(fl(d0, u0), fl(d0, u1), fl(d1, u1), fl(d1, u0), col, col, col, col);
    }
  }

  // spires belong to whichever chunk contains them
  const spires = [];
  const i0 = Math.floor((startD - 60) / SPIRE_SPACING);
  const i1 = Math.ceil((startD + CANYON.chunkLength - 60) / SPIRE_SPACING);
  for (let i = i0; i <= i1; i++) {
    const s = spireAt(i);
    if (!s || s.d < startD || s.d >= startD + CANYON.chunkLength) continue;
    spires.push(s);
    const sides = 7;
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2;
      const a1 = ((k + 1) / sides) * Math.PI * 2;
      const rr = (a) => s.radius * (0.78 + noise(Math.cos(a) * 2 + 9, Math.sin(a) * 2) * 0.5);
      const p = (a, h, shrink) =>
        new THREE.Vector3(s.x + Math.cos(a) * rr(a) * shrink, s.base + h, s.z + Math.sin(a) * rr(a) * shrink);
      const levelsS = 4;
      for (let li = 0; li < levelsS; li++) {
        const t0 = li / levelsS;
        const t1 = (li + 1) / levelsS;
        const sh0 = 1 - t0 * 0.55;
        const sh1 = 1 - t1 * 0.55;
        const shade = 0.80 + noise(k * 4.1, li * 2.7) * 0.24;
        const c0 = wallColor(0.25 + t0 * 0.7, shade);
        const c1 = wallColor(0.25 + t1 * 0.7, shade);
        mb.quad(
          p(a0, s.height * t0, sh0),
          p(a1, s.height * t0, sh0),
          p(a1, s.height * t1, sh1),
          p(a0, s.height * t1, sh1),
          c0, c0, c1, c1,
        );
      }
    }
  }

  return { geometry: mb.build(), spires };
}

/* ---------- the streaming canyon ---------- */

export class Canyon {
  constructor(scene) {
    this.scene = scene;
    // geometry is non-indexed, so computeVertexNormals already gives flat facets
    this.material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: TOON });
    this.chunks = [];
    this.spires = [];
    this.thermals = [];

    for (let i = 0; i < CANYON.chunkCount; i++) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.chunks.push({ mesh, startD: -Infinity, spires: [] });
    }
    this.reset();
  }

  reset() {
    this.chunks.forEach((c) => (c.startD = -Infinity));
    this.coveredFrom = null;
    this.ensure(0);
  }

  /** Make sure chunks cover the stretch around the given distance. */
  ensure(d) {
    const first = Math.floor(d / CANYON.chunkLength) - 1;
    if (first === this.coveredFrom) return;
    this.coveredFrom = first;

    for (let i = 0; i < CANYON.chunkCount; i++) {
      const startD = (first + i) * CANYON.chunkLength;
      const slot = this.chunks[((first + i) % CANYON.chunkCount + CANYON.chunkCount) % CANYON.chunkCount];
      if (slot.startD === startD) continue;
      slot.mesh.geometry.dispose();
      const { geometry, spires } = buildChunk(startD);
      slot.mesh.geometry = geometry;
      slot.startD = startD;
      slot.spires = spires;
    }
    this.spires = this.chunks.flatMap((c) => c.spires);

    this.thermals = [];
    const t0 = Math.floor((d - 400) / THERMAL_SPACING);
    for (let i = t0; i <= t0 + 5; i++) if (i >= 0) this.thermals.push(thermalAt(i));
  }

  updraftAt(pos) {
    for (const t of this.thermals) {
      const dx = pos.x - t.x;
      const dz = pos.z - t.z;
      const r = Math.hypot(dx, dz);
      if (r > t.radius) continue;
      const falloff = 1 - (r / t.radius) ** 2;
      const height = 1 - Math.min(Math.abs(pos.y - t.y) / 70, 1);
      return t.strength * falloff * height;
    }
    return 0;
  }

  /** Returns null when clear, or a short reason string on impact. */
  collide(pos) {
    const d = distanceOf(pos.z);
    const lateral = pos.x - centerX(d);

    if (pos.y < floorY(d) + CANYON.clearance + 1.5) return "ground";
    if (Math.abs(lateral) > gapAt(d, pos.y) - CANYON.clearance) return "wall";

    for (const s of this.spires) {
      if (Math.abs(pos.z - s.z) > s.radius + 12) continue;
      const dist = Math.hypot(pos.x - s.x, pos.z - s.z);
      if (dist < s.radius + CANYON.clearance && pos.y < s.base + s.height) return "rock";
    }
    return null;
  }

  /**
   * Headwind above the canyon rim. Without it you can simply flap over the walls
   * and coast where nothing can hit you, which skips the whole game.
   */
  ceilingPush(pos) {
    const d = distanceOf(pos.z);
    const rim = floorY(d) + CANYON.wallHeight * CANYON.ceilingFraction;
    const over = pos.y - rim;
    return over > 0 ? Math.min(over * 0.45, 26) : 0;
  }
}
