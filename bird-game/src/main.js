import { createScene, ChaseCamera } from "./game/scene.js";
import { Canyon, CANYON, distanceOf, centerX, floorY } from "./game/canyon.js";
import { Rings } from "./game/rings.js";
import { Bird } from "./game/bird.js";
import { BirdFlight, FLIGHT } from "./game/flight.js";
import { Hud } from "./game/hud.js";
import { PoseTracker } from "./pose/tracker.js";
import { GestureReader } from "./pose/gestures.js";
import { KeyboardGestures } from "./pose/keyboard.js";
import { drawOverlay } from "./pose/overlay.js";
import { paintPoseArt } from "./ui/art.js";
import * as THREE from "three";

const $ = (id) => document.getElementById(id);
const CALIBRATION_SECONDS = 2.5;
const RING_POINTS = 100;
const MAX_MULTIPLIER = 8;

const el = {
  screen: $("screen"),
  card: $("screen-card"),
  status: $("status"),
  button: $("primary-btn"),
  cam: $("cam"),
  video: $("cam-video"),
  overlay: $("cam-overlay"),
  canvas: $("scene"),
};

const gfx = createScene(el.canvas);
const chase = new ChaseCamera(gfx.camera);
const canyon = new Canyon(gfx.scene);
const rings = new Rings(gfx.scene);
const bird = new Bird(gfx.scene);
const flight = new BirdFlight();
const hud = new Hud();

const tracker = new PoseTracker(el.video);
const poseReader = new GestureReader();
const keyboard = new KeyboardGestures();

let reader = poseReader;
let mode = "boot"; // boot | title | calibrating | playing | paused | dying | dead
// The reader already rides out brief dropouts, so this only has to cover the
// gap between "really gone" and "flying blind into a wall".
const LOST_PAUSE = 0.25; // s after the reader gives up before the run pauses
const RESUME_DELAY = 1.5; // s of countdown once the player is back in frame
let lostTimer = 0;
let resumeTimer = 0;
let calibration = 0;
let crashTimer = 0;
let lastResult = null;
let cameraReady = false; // permission granted and the stream is live
let lastStatus = ""; // avoids rewriting the title status text every frame
const prevPos = new THREE.Vector3();

// screens replace the card's contents, so keep the original to come back to
const titleCardHTML = el.card.innerHTML;

function restoreTitleCard() {
  if (el.status.isConnected) return;
  el.card.innerHTML = titleCardHTML;
  el.status = $("status");
  el.button = $("primary-btn");
  paintPoseArt(el.card);
}

const session = {
  score: 0,
  ringScore: 0,
  distance: 0,
  best: 0,
  combo: 0,
  cause: "",
  altitude: 0,
  ceiling: CANYON.wallHeight * CANYON.ceilingFraction,
};

/* ------------------------------------------------------------------ *
 * screens
 * ------------------------------------------------------------------ */

function setScreen(visible) {
  if (visible) {
    el.screen.hidden = false;
    el.screen.classList.remove("leaving");
  } else {
    el.screen.classList.add("leaving");
    setTimeout(() => (el.screen.hidden = true), 350);
  }
}

function showCalibration() {
  mode = "calibrating";
  calibration = 0;
  poseReader.beginCalibration();
  el.cam.hidden = false;
  el.card.innerHTML = `
    <div class="calibrate">
      <h1 class="title" style="font-size:44px">Stand like a bird</h1>
      <p class="subtitle" style="margin-bottom:0">Arms straight out to the sides. Hold still.</p>
      <div class="calibrate-ring" id="cal-ring"><span id="cal-count">3</span></div>
      <p class="status" id="cal-hint">Looking for you…</p>
      <select class="picker" id="cam-picker" hidden></select>
      <p class="footnote">Stand back until your hips and both hands are in the box, top right.</p>
    </div>`;
  setScreen(true);
  buildCameraPicker();
}

function finishCalibration() {
  if (!poseReader.finishCalibration()) {
    $("cal-hint").textContent = "Didn't get a clean read — try again, arms level.";
    poseReader.beginCalibration();
    calibration = 0;
    return;
  }
  startRun();
}

function startRun() {
  mode = "playing";
  session.score = 0;
  session.ringScore = 0;
  session.distance = 0;
  session.combo = 0;
  session.cause = "";
  flight.reset();
  // the canyon centreline does not start at x=0, so spawn on it rather than beside it
  flight.pos.set(centerX(0), floorY(0) + 78, 0);
  canyon.reset();
  rings.reset();
  bird.reset();
  chase.reset(flight);
  prevPos.copy(flight.pos);
  accumulator = 0;
  lostTimer = 0;
  hud.reset();
  hud.show(true);
  setScreen(false);
}

/**
 * Walking out of frame should not cost you a run. The flight freezes until the
 * player is back, then hands control over with a countdown rather than dropping
 * them straight back into a dive.
 */
function pauseRun() {
  mode = "paused";
  resumeTimer = RESUME_DELAY;
  el.card.innerHTML = `
    <h1 class="title" style="font-size:38px">Paused</h1>
    <p class="status" id="pause-hint">Step back into view of the camera.</p>
    <p class="footnote">The run is waiting for you — nothing is lost.</p>`;
  setScreen(true);
}

function resumeRun() {
  mode = "playing";
  accumulator = 0;
  lostTimer = 0;
  prevPos.copy(flight.pos);
  setScreen(false);
}

function showGameOver() {
  mode = "dead";
  session.best = Math.max(session.best, session.score);
  const cause = {
    wall: "Clipped the canyon wall",
    ground: "Hit the deck",
    rock: "Met a rock spire",
  }[session.cause] ?? "Down";

  el.card.innerHTML = `
    <p class="subtitle" style="margin-bottom:6px">${cause}</p>
    <div class="score-final">${session.score.toLocaleString()}</div>
    <div class="score-rows">
      <div><b>${Math.round(session.distance)}m</b>distance</div>
      <div><b>${rings.hits}</b>rings</div>
      <div><b>${rings.bestCombo}×</b>best chain</div>
      <div><b>${session.best.toLocaleString()}</b>best run</div>
    </div>
    <button class="btn" id="again-btn">Fly again</button>
    <p class="footnote">Chain rings without missing to multiply the score. Glide to get your wind back.</p>`;
  $("again-btn").addEventListener("click", startRun);
  setScreen(true);
}

/* ------------------------------------------------------------------ *
 * boot
 * ------------------------------------------------------------------ */

/** Turns a getUserMedia failure into something a person can act on. */
function cameraProblem(err) {
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return `Camera access was blocked. Two places can block it:
        the <b>camera icon in your browser's address bar</b>, and on Windows,
        <b>Settings → Privacy &amp; security → Camera</b>, where both
        "Camera access" and "Let desktop apps access your camera" must be on.`;
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera found. Plug one in or pick a different one below, then try again.";
    case "NotReadableError":
    case "AbortError":
      return `The camera could not be opened. Usually another app is holding it
        (Teams, Zoom, the Camera app) — close that and try again. On Windows it can
        also be blocked under <b>Settings → Privacy &amp; security → Camera</b>.`;
    default:
      return `Couldn't start the camera (${err?.name ?? err?.message ?? "unknown error"}). Try again.`;
  }
}

/** "granted" | "prompt" | "denied" — Firefox and Safari don't expose this. */
async function permissionState() {
  try {
    const status = await navigator.permissions.query({ name: "camera" });
    // if they flip the switch in the address bar, pick it up without a reload
    status.onchange = () => {
      if (status.state === "granted" && !cameraReady) grantCamera();
    };
    return status.state;
  } catch {
    return "prompt";
  }
}

async function boot() {
  paintPoseArt();
  if (new URLSearchParams(location.search).has("keys")) {
    useKeyboard();
    return;
  }

  // getUserMedia simply does not exist outside a secure origin, which is the
  // usual reason the camera "does nothing" when the page is opened over a LAN IP
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    showBlocker(
      "Not a secure page",
      `Browsers only allow camera access over <b>https://</b> or <b>localhost</b>.
       This page is on <b>${location.origin}</b>. Open it as
       <b>http://localhost:${location.port || 80}</b> instead.`,
    );
    return;
  }

  try {
    await tracker.loadModel();
  } catch (err) {
    console.error(err);
    showBlocker("Pose model failed to load", "Reload the page to try again.");
    return;
  }

  // Permission is its own first step: ask for it here, on the title screen,
  // so the camera is proven working before anyone commits to a run.
  const state = await permissionState();
  if (state === "granted") grantCamera();
  else if (state === "denied") showCameraError({ name: "NotAllowedError" });
  else askForCamera();
}

function askForCamera() {
  mode = "title";
  el.status.className = "status";
  el.status.innerHTML = "This game is played with your body, so it needs your camera.";
  el.button.textContent = "Allow camera";
  el.button.disabled = false;
  el.button.onclick = grantCamera;
}

/** Acquire the camera and leave it running, with the preview visible. */
async function grantCamera(deviceId) {
  el.button.disabled = true;
  el.status.className = "status";
  el.status.textContent = "Waiting for camera permission…";
  try {
    await tracker.startCamera(deviceId);
    cameraReady = true;
    restoreTitleCard();
    el.cam.hidden = false;
    lastStatus = "";
    mode = "title";
    setScreen(true);
    el.button.textContent = "Start";
    el.button.disabled = false;
    el.button.onclick = showCalibration;
    buildCameraPicker();
  } catch (err) {
    console.error("camera failed:", err);
    cameraReady = false;
    showCameraError(err);
  }
}

function useKeyboard() {
  reader = keyboard;
  tracker.stopCamera();
  cameraReady = false;
  restoreTitleCard();
  el.cam.hidden = true;
  el.status.className = "status warn";
  el.status.innerHTML =
    "Keyboard mode — <b>space</b> to flap, <b>shift</b> to dive, <b>A</b>/<b>D</b> to steer.";
  el.button.textContent = "Play with keys";
  el.button.disabled = false;
  el.button.onclick = startRun;
  mode = "title";
}

/** Only shown when there is an actual choice to make. */
async function buildCameraPicker() {
  const cams = await tracker.listCameras();
  const picker = $("cam-picker");
  if (!picker) return;
  if (cams.length < 2) {
    picker.hidden = true;
    return;
  }
  picker.hidden = false;
  picker.innerHTML = cams
    .map(
      (c, i) =>
        `<option value="${c.deviceId}"${c.deviceId === tracker.deviceId ? " selected" : ""}>${
          c.label || `Camera ${i + 1}`
        }</option>`,
    )
    .join("");
  picker.onchange = () => grantCamera(picker.value);
}

function showCameraError(err) {
  mode = "title";
  cameraReady = false;
  el.cam.hidden = true;
  el.card.innerHTML = `
    <h1 class="title" style="font-size:40px">Camera needed</h1>
    <p class="status error" style="max-width:540px;margin:14px auto 26px">${cameraProblem(err)}</p>
    <button class="btn" id="retry-btn">Try again</button>
    <select class="picker" id="cam-picker" hidden></select>
    <p class="footnote">
      This game is played with your body — the camera is the controller.
      <button class="linkish" id="keys-btn">Use the keyboard instead</button>
    </p>`;
  $("retry-btn").onclick = () => grantCamera();
  $("keys-btn").onclick = () => {
    useKeyboard();
    startRun();
  };
  buildCameraPicker();
  setScreen(true);
}

/** A dead end the player cannot retry out of — wrong origin, or no model. */
function showBlocker(title, html) {
  mode = "title";
  el.card.innerHTML = `
    <h1 class="title" style="font-size:40px">${title}</h1>
    <p class="status error" style="max-width:540px;margin:14px auto 26px">${html}</p>
    <button class="btn" id="keys-btn">Play with the keyboard</button>`;
  $("keys-btn").onclick = () => {
    useKeyboard();
    startRun();
  };
  setScreen(true);
}

addEventListener("keydown", (e) => {
  if (e.code === "KeyR" && (mode === "playing" || mode === "paused" || mode === "dead")) startRun();
});

/* ------------------------------------------------------------------ *
 * loop
 * ------------------------------------------------------------------ */

let last = performance.now();
const PHYSICS_STEP = 1 / 120;
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const time = now / 1000;

  if (reader === poseReader && tracker.ready) {
    lastResult = tracker.poll(now);
  }

  let gesture = { tracked: false, flapActivity: 0, steer: 0, tuck: 0, glide: 0, hint: "" };

  if (mode === "calibrating") {
    const quality = poseReader.sampleCalibration(lastResult);
    calibration = Math.max(0, calibration + (quality > 0.35 ? dt : -dt * 1.5));
    const ring = $("cal-ring");
    if (ring) {
      const pct = Math.min(calibration / CALIBRATION_SECONDS, 1) * 100;
      ring.style.background = `conic-gradient(var(--flap) ${pct}%, rgba(247,239,228,0.12) 0)`;
      $("cal-count").textContent = Math.max(1, Math.ceil(CALIBRATION_SECONDS - calibration));
      $("cal-hint").textContent = !lastResult
        ? "I can't see anyone yet — step into view of the camera."
        : quality > 0.35
          ? "Got you. Hold it…"
          : "Arms straight out to the sides, level with your shoulders.";
    }
    if (calibration >= CALIBRATION_SECONDS) finishCalibration();
  } else if (mode === "playing" || mode === "dying" || mode === "paused") {
    gesture = reader.update(lastResult, dt);
  } else if (mode === "title" && cameraReady && el.status.isConnected) {
    // prove the camera works before anyone commits to a run
    const text = lastResult
      ? "Camera is live and I can see you. Ready when you are."
      : "Camera is live — step back until your whole upper body is in the box.";
    if (text !== lastStatus) {
      lastStatus = text;
      el.status.className = lastResult ? "status" : "status warn";
      el.status.textContent = text;
    }
  }

  // losing the player mid-run pauses instead of letting the bird fly on blind
  if (mode === "playing" && reader === poseReader) {
    lostTimer = gesture.tracked ? 0 : lostTimer + dt;
    if (lostTimer > LOST_PAUSE) pauseRun();
  }

  if (mode === "paused") {
    const hint = $("pause-hint");
    if (gesture.tracked) {
      resumeTimer -= dt;
      if (hint) hint.textContent = `Got you. Resuming in ${Math.ceil(resumeTimer)}…`;
      if (resumeTimer <= 0) resumeRun();
    } else {
      resumeTimer = RESUME_DELAY;
      if (hint) hint.textContent = "Step back into view of the camera.";
    }
  }

  if (mode === "playing") {
    prevPos.copy(flight.pos);

    // Physics runs on a fixed step so the flight model feels identical at 30, 60
    // or 144fps, and so a fast dive is collision-checked several times per frame
    // instead of teleporting past a spire.
    accumulator = Math.min(accumulator + dt, 0.2);
    let step = gesture;
    let hit = null;
    while (accumulator >= PHYSICS_STEP && !hit) {
      flight.update(PHYSICS_STEP, step, canyon);
      flight.vel.y -= canyon.ceilingPush(flight.pos) * PHYSICS_STEP;
      accumulator -= PHYSICS_STEP;
      // the flap is an impulse, so it must land exactly once however many steps run
      if (step.flap) step = { ...step, flap: null };
      hit = canyon.collide(flight.pos);
    }

    const d = distanceOf(flight.pos.z);
    canyon.ensure(d);
    session.distance = Math.max(session.distance, d);
    session.altitude = flight.pos.y - floorY(d);

    const event = rings.update(dt, prevPos, flight.pos, time);
    if (event?.hit) {
      session.ringScore += RING_POINTS * Math.min(event.combo, MAX_MULTIPLIER);
    }
    session.combo = rings.combo;
    session.score = Math.floor(session.distance) + session.ringScore;

    if (hit) {
      session.cause = hit;
      flight.alive = false;
      mode = "dying";
      crashTimer = 0;
      gfx.renderer.toneMappingExposure = 2.1;
    }
  } else if (mode === "dying") {
    crashTimer += dt;
    flight.vel.y -= 26 * dt;
    flight.vel.multiplyScalar(1 - dt * 1.2);
    flight.pos.addScaledVector(flight.vel, dt);
    flight.bank += dt * 4;
    gfx.renderer.toneMappingExposure += (1.05 - gfx.renderer.toneMappingExposure) * (1 - Math.exp(-dt * 5));
    if (crashTimer > 1.1) {
      hud.show(false);
      showGameOver();
    }
  }

  if (mode === "playing" || mode === "paused" || mode === "dying" || mode === "dead") {
    const speedNorm = (flight.speed - FLIGHT.minSpeed) / (FLIGHT.maxSpeed - FLIGHT.minSpeed);
    bird.update(dt, flight, gesture);
    chase.update(dt, flight, Math.max(0, speedNorm));
    gfx.dust.update(flight.pos, gfx.camera, gfx.renderer);
    gfx.clouds.update(flight.pos);
    if (mode === "playing") hud.update(dt, flight, gesture, session);
  } else {
    // slow drift down the canyon behind the menu
    flight.pos.z -= 26 * dt;
    const d = distanceOf(flight.pos.z);
    canyon.ensure(d);
    flight.pos.x = centerX(d) + Math.sin(time * 0.25) * 14;
    flight.pos.y = floorY(d) + 62 + Math.sin(time * 0.4) * 7;
    flight.vel.set(Math.sin(time * 0.3) * 4, Math.sin(time * 0.4) * 2, -26);
    flight.bank = Math.sin(time * 0.25) * 0.22;
    rings.preview(flight.pos, time);
    bird.update(dt, flight, gesture);
    chase.update(dt, flight, 0.15);
    gfx.dust.update(flight.pos, gfx.camera, gfx.renderer);
    gfx.clouds.update(flight.pos);
  }

  gfx.follow.position.copy(gfx.camera.position);

  if (reader === poseReader && tracker.ready) {
    drawOverlay(el.overlay, lastResult, gesture);
  }

  gfx.renderer.render(gfx.scene, gfx.camera);
}

boot();
requestAnimationFrame(frame);
