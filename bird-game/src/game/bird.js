import * as THREE from "three";
import { TOON } from "./scene.js";

// Cool blues against a warm canyon: the bird stays readable against every
// background in the level, and toon shading needs bright base colours to
// survive being multiplied down into its darkest band.
const C = {
  back: new THREE.Color(0x3d9fd6), // top of the body
  belly: new THREE.Color(0xfff0c8),
  wingTop: new THREE.Color(0x49c6d8),
  wingBand: new THREE.Color(0xfff2d0), // stripe across the wing
  wingTip: new THREE.Color(0x2a6fa8),
  wingUnder: new THREE.Color(0x8fe3ea),
  edge: new THREE.Color(0x16304a), // the drawn-in outline colour
  beak: new THREE.Color(0xffa62b),
  eye: new THREE.Color(0xfffaf0),
  pupil: new THREE.Color(0x16304a),
};

/** Collects flat-shaded triangles with per-vertex colour. */
class Tris {
  constructor() {
    this.pos = [];
    this.col = [];
  }
  push(...verts) {
    for (const { v, c } of verts) {
      this.pos.push(v.x, v.y, v.z);
      this.col.push(c.r, c.g, c.b);
    }
  }
  tri(a, b, c) {
    this.push(a, b, c);
  }
  quad(a, b, c, d) {
    this.push(a, b, c, a, c, d);
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
 * Inked outline: the same mesh again, back faces only, pushed out along its
 * normals. Cheap, and it survives the wings being rotated and scaled.
 */
function outlineMaterial(thickness) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uThickness: { value: thickness }, uColor: { value: C.edge } },
    vertexShader: /* glsl */ `
      uniform float uThickness;
      void main() {
        vec3 p = position + normalize(normal) * uThickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }`,
  });
}

/**
 * Mirrored copy for the other wing. Scaling by -1 would invert the winding and
 * turn the back-face outline inside out, so the geometry is flipped instead.
 */
function mirroredX(geo) {
  const g = geo.clone();
  const attrs = [g.attributes.position, g.attributes.color];
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
  for (let i = 0; i < p.count; i += 3) {
    for (const a of attrs) {
      const x = a.getX(i + 1), y = a.getY(i + 1), z = a.getZ(i + 1);
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
      a.setXYZ(i + 2, x, y, z);
    }
  }
  g.computeVertexNormals();
  return g;
}

function inked(geometry, material, thickness) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, outlineMaterial(thickness)));
  group.add(new THREE.Mesh(geometry, material));
  return group;
}

/** Rounded low-poly body: fat in the chest, tapering to the tail. */
function buildBody() {
  // [z along the body, radius, vertical squash, belly blend]
  const profile = [
    [2.5, 0.12, 1.0, 0.3],
    [1.8, 0.62, 0.95, 0.5],
    [0.8, 1.02, 0.9, 0.7],
    [-0.3, 1.1, 0.86, 0.75],
    [-1.5, 0.82, 0.9, 0.55],
    [-2.6, 0.42, 0.95, 0.3],
    [-3.4, 0.14, 1.0, 0.15],
  ];
  const sides = 9;
  const t = new Tris();
  const at = (i, k) => {
    const [z, r, squash, mix] = profile[i];
    const a = (k / sides) * Math.PI * 2;
    const underside = Math.max(0, -Math.sin(a));
    return {
      v: new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * squash - 0.08, -z),
      c: C.back.clone().lerp(C.belly, mix * underside),
    };
  };
  for (let i = 0; i < profile.length - 1; i++)
    for (let k = 0; k < sides; k++) t.quad(at(i, k), at(i, k + 1), at(i + 1, k + 1), at(i + 1, k));
  return t.build();
}

/**
 * A wing with real thickness, so it reads as a solid shape from any angle and
 * the outline has something to wrap. Rooted at the origin, extending along +X.
 */
function buildWing() {
  // planform traced root → leading edge → tip → trailing edge
  const outline = [
    [0.0, 0.0],
    [1.5, 1.0],
    [3.5, 1.25],
    [5.7, 0.9],
    [7.5, -0.15],
    [5.5, -0.85],
    [3.0, -1.1],
    [1.2, -0.9],
  ];
  const thickness = 0.18;
  const t = new Tris();

  const span = (x) => x / 7.5;
  const camber = (x) => Math.sin(span(x) * Math.PI) * 0.26 + x * 0.05;
  const topColour = (x) => {
    const s = span(x);
    if (s > 0.72) return C.wingTip.clone();
    // one bold stripe partway out, the way a cartoon wing is drawn
    if (s > 0.44 && s < 0.6) return C.wingBand.clone();
    return C.wingTop.clone().lerp(C.wingTip, s * 0.5);
  };

  const face = (i, up) => {
    const [x, z] = outline[i];
    return {
      v: new THREE.Vector3(x, camber(x) + (up ? thickness : -thickness), -z),
      c: up ? topColour(x) : C.wingUnder.clone(),
    };
  };

  // the outline is traced clockwise seen from above, so the top fan is wound
  // backwards to put its normals up and the bottom fan forwards to put them down
  for (let i = 1; i < outline.length - 1; i++) {
    t.tri(face(0, true), face(i + 1, true), face(i, true));
    t.tri(face(0, false), face(i, false), face(i + 1, false));
  }
  // dark rim all the way round — this is what draws the wing's edge
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length;
    const a = face(i, true), b = face(j, true), c = face(j, false), d = face(i, false);
    for (const p of [a, b, c, d]) p.c = C.wingTip.clone();
    t.quad(a, b, c, d);
  }
  return t.build();
}

function buildTail() {
  const outline = [
    [0, 0],
    [-1.3, -2.6],
    [0, -3.2],
    [1.3, -2.6],
  ];
  const thickness = 0.14;
  const t = new Tris();
  const face = (i, up) => ({
    v: new THREE.Vector3(outline[i][0], up ? thickness : -thickness, -outline[i][1]),
    c: up ? C.wingTop.clone() : C.wingUnder.clone(),
  });
  for (let i = 1; i < outline.length - 1; i++) {
    t.tri(face(0, true), face(i + 1, true), face(i, true));
    t.tri(face(0, false), face(i, false), face(i + 1, false));
  }
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length;
    const a = face(i, true), b = face(j, true), c = face(j, false), d = face(i, false);
    for (const p of [a, b, c, d]) p.c = C.wingTip.clone();
    t.quad(a, b, c, d);
  }
  return t.build();
}

const flat = (color) => new THREE.MeshBasicMaterial({ color });

export class Bird {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);

    const toon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: TOON });

    this.root.add(inked(buildBody(), toon, 0.1));

    /* ---- head ---- */
    const head = new THREE.Group();
    head.position.set(0, 0.34, -2.55);
    this.root.add(head);

    const skull = new THREE.IcosahedronGeometry(0.78, 1);
    head.add(
      inked(skull, new THREE.MeshToonMaterial({ color: C.back, gradientMap: TOON }), 0.08),
    );

    const beak = new THREE.ConeGeometry(0.3, 1.1, 6).toNonIndexed();
    beak.computeVertexNormals();
    const beakGroup = inked(beak, new THREE.MeshToonMaterial({ color: C.beak, gradientMap: TOON }), 0.06);
    beakGroup.rotation.x = -Math.PI / 2;
    beakGroup.position.set(0, -0.06, -0.82);
    head.add(beakGroup);

    // eyes — barely visible from the chase camera, but they sell every turn
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), flat(C.eye));
      eye.position.set(side * 0.44, 0.2, -0.46);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), flat(C.pupil));
      pupil.position.set(side * 0.5, 0.2, -0.62);
      head.add(eye, pupil);
    }

    /* ---- tail ---- */
    const tail = inked(buildTail(), toon, 0.07);
    tail.position.set(0, 0.05, 2.2);
    this.root.add(tail);

    /* ---- wings ---- */
    const wingGeo = buildWing();
    this.wingR = new THREE.Group();
    this.wingL = new THREE.Group();
    this.wingR.add(inked(wingGeo, toon, 0.08));
    this.wingL.add(inked(mirroredX(wingGeo), toon, 0.08));
    this.wingR.position.set(0.62, 0.26, -0.3);
    this.wingL.position.set(-0.62, 0.26, -0.3);
    this.root.add(this.wingR, this.wingL);

    this.trail = new Trail(scene);
    this.idlePhase = 0;
  }

  reset() {
    this.trail.reset();
  }

  update(dt, flight, gesture) {
    this.root.position.copy(flight.pos);
    this.root.rotation.set(0, 0, 0);
    this.root.rotateY(flight.heading);
    this.root.rotateX(flight.pitch);
    this.root.rotateZ(-flight.bank);

    /* wings mirror the player's arms directly — that is the whole point */
    const tracked = gesture.tracked;
    this.idlePhase += dt * (2.2 + flight.speed * 0.02);
    const idle = Math.sin(this.idlePhase) * 0.16 - 0.05;
    const armAngle = tracked ? gesture.wingAngle : idle;
    const target = THREE.MathUtils.clamp(armAngle, -1.25, 1.45);

    // folding pulls the wing in and sweeps it back, like a stooping falcon
    const tuck = tracked ? gesture.tuck : 0;
    const fold = THREE.MathUtils.lerp(1, 0.32, tuck);
    const sweep = tuck * 0.85;

    for (const [wing, sign] of [
      [this.wingR, 1],
      [this.wingL, -1],
    ]) {
      wing.rotation.z = sign * target;
      wing.rotation.y = -sign * sweep;
      wing.scale.setScalar(fold);
    }

    this.trail.update(dt, flight);
  }
}

/** Ribbon behind the bird; width and brightness track airspeed. */
class Trail {
  constructor(scene, segments = 48) {
    this.segments = segments;
    this.points = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(segments * 2 * 3), 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(segments * 2 * 3), 3));
    const index = [];
    for (let i = 0; i < segments - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(index);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.accum = 0;
  }

  reset() {
    this.points.length = 0;
    this.mesh.visible = false;
  }

  update(dt, flight) {
    this.accum += dt;
    if (this.accum < 0.016) return;
    this.accum = 0;

    this.points.unshift({ p: flight.pos.clone(), up: flight.liftAxis.clone(), v: flight.speed });
    if (this.points.length > this.segments) this.points.length = this.segments;
    if (this.points.length < 4) return;

    const pos = this.mesh.geometry.attributes.position;
    const col = this.mesh.geometry.attributes.color;
    const fwd = new THREE.Vector3();
    const side = new THREE.Vector3();

    for (let i = 0; i < this.segments; i++) {
      const p = this.points[Math.min(i, this.points.length - 1)];
      const q = this.points[Math.min(i + 1, this.points.length - 1)];
      fwd.subVectors(p.p, q.p);
      if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, -1);
      side.crossVectors(fwd.normalize(), p.up).normalize();

      const fade = 1 - i / this.segments;
      const w = 0.5 + (p.v / 90) * 2.6 * fade;
      const a = i * 2;
      pos.setXYZ(a, p.p.x - side.x * w, p.p.y - side.y * w, p.p.z - side.z * w);
      pos.setXYZ(a + 1, p.p.x + side.x * w, p.p.y + side.y * w, p.p.z + side.z * w);
      const g = fade * fade * (0.25 + (p.v / 90) * 0.75);
      col.setXYZ(a, g, g * 0.72, g * 0.55);
      col.setXYZ(a + 1, g, g * 0.72, g * 0.55);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.mesh.visible = true;
  }
}
