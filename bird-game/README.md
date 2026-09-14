# Thermal — a camera-tracked bird flight game

Your arms are the wings. A webcam tracks your body with MediaPipe PoseLandmarker,
and three.js renders an endless canyon you fly through.

## Run it

```bash
npm install
npm run dev
```

Then open the printed URL and allow camera access. `npm install` copies the
MediaPipe WASM runtime and the pose model into `public/`, so the game runs fully
offline — nothing is uploaded and no frame ever leaves the browser.

**The camera is the controller**, so granting it is the first step, not something
bundled into pressing Start:

1. The title screen asks for camera permission on its own — **Allow camera**.
2. Once granted, the preview appears top right and the page tells you whether it
   can actually see you, live, before you commit to a run.
3. Only then does the button become **Start**, which takes you into calibration.

A previously granted permission is picked up on load via the Permissions API, so
returning players go straight to step 3. If permission is flipped in the address
bar while the page is open, it notices without a reload.

When the camera can't start, the game says why and offers a retry rather than
quietly dropping you into a fallback: blocked permission (in the browser *or* in
Windows' own privacy settings), no device, or the camera already being held by
Teams or Zoom each get their own message. Opening the page over a LAN IP instead
of `localhost` is called out specifically — browsers only expose `getUserMedia`
on a secure origin, and that is the most common reason the camera silently does
nothing. If more than one camera is attached, a picker appears.

The keyboard is a deliberate escape hatch only: add `?keys` to the URL, or click
the link on the error screen (space = flap, shift = dive, A/D = steer). It is
mostly useful for working on the flight model without standing up.

## The controls

| You do | The bird does |
| --- | --- |
| Beat your arms up and down | Flaps and climbs. Costs stamina. |
| Hold your arms straight out | Glides — low sink, recovers stamina, catches thermals. |
| Tuck your arms to your sides | Folds its wings and dives, building speed fast. |
| Drop a shoulder and lean | Banks and turns that way. |

Stroke strength matters: a big, fast beat lifts far more than a shallow flutter.

The game opens with a short T-pose calibration. That captures your arm length and
your natural resting tilt, so the steering is centred on *your* posture rather
than assuming you stand perfectly square to the camera.

Stand back far enough that your hips and both hands stay in frame — the HUD warns
you when they don't.

## How it fits together

```
webcam ─► PoseLandmarker ─► GestureReader ─► BirdFlight ─► three.js scene
          (pose/tracker)    (pose/gestures)  (game/flight)  (game/*)
```

- **`src/pose/gestures.js`** turns landmarks into flight intent. All the geometry
  runs in a torso-local frame (built from the shoulder and hip landmarks), so it
  is invariant to where you stand and how big you are. Roll and lean are the
  exception — those need a gravity reference, so they use world axes. Signals are
  one-euro filtered: smooth when you hold still, no lag when you move fast.
  Every feel-related constant is in the `TUNE` block at the top.

- **`src/game/flight.js`** is a force model, not a state machine. The wing trims
  itself toward level flight with an authority ceiling that scales with airspeed
  squared. That one rule produces all the behaviour: wings-out is a stable glide,
  folding them kills lift so you drop, and a fast dive gives the wing enough
  authority to swoop back out. Constants live in `FLIGHT`.

- **`src/game/canyon.js`** streams the world in chunks around you. The canyon is
  defined by plain functions of distance (`centerX`, `floorY`, `gapAt`), which
  both the mesh builder and the collision check call — so what you see is what
  you hit. It narrows as you get further out; that is the difficulty curve.

## Why it feels smooth

Three things were making the game jitter, and all three were framerate bugs
rather than missing filters:

- **The camera samples slower than the screen draws.** Inference only runs when
  the webcam produces a new frame, so the tracker hands back the *same* result
  object in between. Re-filtering it fed the one-euro velocity estimator
  duplicates, which changed how hard a flap registered: the identical arm
  movement scored 0.64 at 30fps and 1.07 at 120fps, and above 100fps it
  produced phantom extra flaps. `GestureReader` now treats object identity as
  the freshness test and measures only on real samples, then eases its outputs
  toward that reading every frame — which also removes the 30Hz staircase from
  steering without adding noticeable lag.
- **Physics ran on the render delta.** A steady glide ended up anywhere between
  8.7m and 13.4m of altitude over twelve seconds depending on framerate. It now
  runs on a fixed 1/120s step with an accumulator, which also collision-checks a
  fast dive several times per frame instead of letting it skip past a spire.
- **The camera aimed straight down the velocity vector**, so every flap impulse
  jolted the whole view. It follows a lagged copy of the flight direction now.

Roll is a critically damped spring rather than a linear rate limit, so turns
ease in and settle instead of ramping and stopping dead.

## Losing the player

Walking out of frame pauses the run instead of flying the bird blind into a
wall. The reader rides out brief dropouts (a hard flap can hide your wrists for
a frame or two) by drifting toward a neutral glide; only a real absence pauses,
and coming back gives you a short countdown rather than dropping you straight
into whatever dive you left behind.

## The cartoon look

Nothing here is textured or post-processed. The style comes from four choices:

- **Toon shading.** `toonGradient()` in `scene.js` builds a three-step ramp that
  every lit material samples, so light lands in hard bands instead of a smooth
  falloff. All geometry is non-indexed, which means `computeVertexNormals()`
  gives flat facets for free.
- **Quantised strata.** `wallColor()` snaps its height input to a handful of
  steps before picking a colour, so the canyon walls read as drawn layers.
- **Inked outlines.** `inked()` in `bird.js` draws each mesh twice: once with a
  back-face shader that pushes vertices out along their normals in a flat dark
  colour, then normally on top. That is why the bird has a drawn edge, and why
  its wings are solid slabs rather than flat sheets — an outline needs a volume
  to wrap around.
- **Flat, complementary colour.** Tone mapping is `LinearToneMapping`, not ACES,
  which would desaturate the highlights into grey. The bird is cool blue against
  a warm canyon so it stays readable everywhere in the level.

Toon shading multiplies base colours down into its darkest band, so anything
that starts dark ends up black. Pick bright base colours and let the ramp do the
shading.

## Tuning it

The physics has no dependency on the browser, so you can simulate it headlessly:

```bash
node -e "import('./src/game/flight.js').then(({BirdFlight})=>{const f=new BirdFlight();f.reset();for(let i=0;i<600;i++)f.update(1/60,{tracked:true,tuck:0,glide:1,steer:0,flapActivity:0,flap:null},{updraftAt:()=>0});console.log(f.pos.y.toFixed(1),f.speed.toFixed(1))})"
```

Same for `GestureReader` — feed it synthetic landmark arrays and check what comes
out, without needing a camera in the loop.

## The Python tracker in the parent folder

`../body_tracker.py` is the original OpenCV + MediaPipe prototype this grew out
of. It is not used by the game — the browser does its own tracking with the same
model file (`../models/pose_landmarker_lite.task`, copied into `public/` at
install). Keep it if you want a Python-side experiment; the game does not need it.
