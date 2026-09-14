import * as THREE from "three";

export const PALETTE = {
  zenith: new THREE.Color(0x4b2d7f),
  upper: new THREE.Color(0xc4508f),
  mid: new THREE.Color(0xff8a5c),
  horizon: new THREE.Color(0xffc46b),
  sun: new THREE.Color(0xfff4c9),
  glow: new THREE.Color(0xffd98a),
  haze: new THREE.Color(0xf2915e),
};

/**
 * Three hard lighting steps instead of a smooth ramp. This is what makes
 * everything read as drawn rather than rendered.
 */
export function toonGradient(steps = 3) {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) data[i] = Math.round(((i + 1) / steps) * 255);
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export const TOON = toonGradient(3);

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// banded rather than blended, and the sun is a hard disc — a painted backdrop
const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uZenith, uUpper, uMid, uHorizon, uSun, uGlow, uSunDir;
  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

    vec3 col = uHorizon;
    col = mix(col, uMid, smoothstep(0.502, 0.533, h));
    col = mix(col, uUpper, smoothstep(0.583, 0.612, h));
    col = mix(col, uZenith, smoothstep(0.705, 0.745, h));

    float d = dot(dir, normalize(uSunDir));
    col += uGlow * pow(max(d, 0.0), 5.0) * 0.30;
    col = mix(col, uGlow, smoothstep(0.9880, 0.9905, d));
    col = mix(col, uSun, smoothstep(0.9947, 0.9955, d));

    gl_FragColor = vec4(col, 1.0);
  }
`;

const SUN_DIR = new THREE.Vector3(0.34, 0.17, -1).normalize();

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // ACES desaturates the highlights into grey, which kills a flat cartoon palette
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(PALETTE.haze.getHex(), 0.0021);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 4000);

  /* ---- sky dome, parented to a group that follows the camera ---- */
  const follow = new THREE.Group();
  scene.add(follow);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2400, 32, 20),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: PALETTE.zenith },
        uUpper: { value: PALETTE.upper },
        uMid: { value: PALETTE.mid },
        uHorizon: { value: PALETTE.horizon },
        uSun: { value: PALETTE.sun },
        uGlow: { value: PALETTE.glow },
        uSunDir: { value: SUN_DIR },
      },
    }),
  );
  sky.renderOrder = -1;
  follow.add(sky);
  follow.add(buildDistantRidges());

  /* ---- light: one strong key plus flat fill, so the toon steps stay readable ---- */
  scene.add(new THREE.HemisphereLight(0xffd9ab, 0x53306b, 0.85));
  const sun = new THREE.DirectionalLight(0xfff0c4, 1.5);
  sun.position.copy(SUN_DIR).multiplyScalar(400);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x8a6ee0, 0.7);
  rim.position.set(-1, 0.55, 0.6).multiplyScalar(300);
  scene.add(rim);

  const dust = new Dust(scene);
  const clouds = new Clouds(scene);

  const resize = () => {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener("resize", resize);

  return { renderer, scene, camera, follow, dust, clouds };
}

/**
 * Flat silhouetted mesas far beyond the canyon walls; they never get closer.
 * Unlit on purpose — a cut-paper backdrop behind the lit world.
 */
function buildDistantRidges() {
  const group = new THREE.Group();
  const pos = [];
  const col = [];
  // each layer is one solid colour, like stacked paper cut-outs
  const layers = [
    { radius: 820, height: 190, color: new THREE.Color(0x8b3f6e) },
    { radius: 1180, height: 300, color: new THREE.Color(0xa8527e) },
    { radius: 1620, height: 430, color: new THREE.Color(0xc2688c) },
  ];

  layers.forEach((layer, li) => {
    const count = 30 + li * 9;
    for (let i = 0; i < count; i++) {
      const a0 = (i / count) * Math.PI * 2;
      const a1 = ((i + 1.35) / count) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      const h = layer.height * (0.4 + Math.abs(Math.sin(i * 12.9898 + li * 4.1)) * 0.95);
      const p = (a, y) =>
        new THREE.Vector3(Math.cos(a) * layer.radius, y - 150, Math.sin(a) * layer.radius);
      for (const v of [p(a0, 0), p(a1, 0), p(mid, h)]) {
        pos.push(v.x, v.y, v.z);
        col.push(layer.color.r, layer.color.g, layer.color.b);
      }
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }),
  );
  mesh.renderOrder = -1;
  group.add(mesh);
  return group;
}

/** Puffy cartoon clouds built from overlapping blobs, wrapping around the bird. */
class Clouds {
  constructor(scene, count = 16) {
    this.span = new THREE.Vector3(520, 220, 900);
    this.group = new THREE.Group();
    scene.add(this.group);

    const blob = new THREE.IcosahedronGeometry(1, 1);
    const shades = [0xfff2f6, 0xffd9e6, 0xffc0d4];
    this.puffs = [];

    for (let i = 0; i < count; i++) {
      const cloud = new THREE.Group();
      const tint = shades[i % shades.length];
      const lobes = 4 + Math.floor(Math.random() * 3);
      for (let k = 0; k < lobes; k++) {
        const m = new THREE.Mesh(
          blob,
          new THREE.MeshBasicMaterial({ color: tint, fog: true, transparent: true, opacity: 0.96 }),
        );
        const r = 7 + Math.random() * 9;
        m.scale.set(r, r * (0.62 + Math.random() * 0.25), r * 0.85);
        m.position.set((k - lobes / 2) * 9 + Math.random() * 4, Math.random() * 5, Math.random() * 6 - 3);
        cloud.add(m);
      }
      cloud.position.set(
        (Math.random() - 0.5) * this.span.x,
        (Math.random() - 0.5) * this.span.y,
        (Math.random() - 0.5) * this.span.z,
      );
      this.group.add(cloud);
      this.puffs.push(cloud);
    }
  }

  update(center) {
    const wrap = (v, c, size) => {
      let d = v - c;
      if (d > size / 2) d -= size;
      else if (d < -size / 2) d += size;
      return c + d;
    };
    // clouds sit above the bird, not in its face
    const high = center.y + 95;
    for (const c of this.puffs) {
      c.position.x = wrap(c.position.x, center.x, this.span.x);
      c.position.y = wrap(c.position.y, high, this.span.y);
      c.position.z = wrap(c.position.z, center.z, this.span.z);
    }
  }
}

const DUST_VERT = /* glsl */ `
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = max(-mv.z, 0.001);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uScale / dist, 1.0, 26.0);
    // fade out close to the lens and again in the far haze
    vAlpha = smoothstep(4.0, 18.0, dist) * (1.0 - smoothstep(95.0, 165.0, dist));
  }
`;

const DUST_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float r = dot(gl_PointCoord - 0.5, gl_PointCoord - 0.5);
    if (r > 0.25) discard;
    float falloff = 1.0 - r * 4.0;
    gl_FragColor = vec4(uColor, falloff * falloff * vAlpha * 0.6);
  }
`;

/** Motes of dust that wrap around the bird — the main sense of speed. */
class Dust {
  constructor(scene, count = 1600) {
    this.box = new THREE.Vector3(240, 170, 320);
    this.count = count;
    this.worldSize = 0.42;

    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * this.box.x;
      pos[i * 3 + 1] = (Math.random() - 0.5) * this.box.y;
      pos[i * 3 + 2] = (Math.random() - 0.5) * this.box.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));

    this.material = new THREE.ShaderMaterial({
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      uniforms: { uScale: { value: 60 }, uColor: { value: new THREE.Color(0xffdcb0) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(center, camera, renderer) {
    // point size in pixels = worldSize * viewportHeight / (2 * dist * tan(fov/2))
    const h = renderer.domElement.height;
    const fovRad = (camera.fov * Math.PI) / 180;
    this.material.uniforms.uScale.value = (this.worldSize * h) / (2 * Math.tan(fovRad / 2));

    const attr = this.points.geometry.attributes.position;
    const a = attr.array;
    const { x: bx, y: by, z: bz } = this.box;
    // particles live in world space and wrap into a box that follows the bird
    const wrap = (v, c, size) => {
      let d = v - c;
      if (d > size / 2) d -= size;
      else if (d < -size / 2) d += size;
      return c + d;
    };
    for (let i = 0; i < this.count; i++) {
      a[i * 3] = wrap(a[i * 3], center.x, bx);
      a[i * 3 + 1] = wrap(a[i * 3 + 1], center.y, by);
      a[i * 3 + 2] = wrap(a[i * 3 + 2], center.z, bz);
    }
    attr.needsUpdate = true;
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/** Chase camera: sits behind and above, rolls a little into the turn. */
export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 70, 30);
    this.look = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.fov = 62;
    this._desired = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  reset(flight) {
    this.#desiredPosition(flight, 0);
    this.pos.copy(this._desired);
    this.look.copy(flight.pos);
  }

  #desiredPosition(flight, shakeAmount) {
    const dir = this._dir.copy(flight.vel).normalize();
    const back = 17 + flight.speed * 0.16;
    const up = 4.5 + Math.max(0, -dir.y) * 5;
    this._desired
      .copy(flight.pos)
      .addScaledVector(dir, -back)
      .addScaledVector(UP, up);
    if (shakeAmount > 0) {
      this._desired.x += (Math.random() - 0.5) * shakeAmount;
      this._desired.y += (Math.random() - 0.5) * shakeAmount;
    }
  }

  update(dt, flight, speedNorm) {
    this.#desiredPosition(flight, speedNorm * 0.5);
    const k = 1 - Math.exp(-dt * 7.5);
    this.pos.lerp(this._desired, k);

    const dir = this._dir.copy(flight.vel).normalize();
    const target = this.look.copy(flight.pos).addScaledVector(dir, 22);

    // rolling the camera into the bank is most of what sells a turn
    this.up.set(0, 1, 0).applyAxisAngle(dir, flight.bank * 0.4);
    this.camera.position.copy(this.pos);
    this.camera.up.copy(this.up);
    this.camera.lookAt(target);

    const targetFov = 60 + speedNorm * 22;
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-dt * 4));
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }
}
