# Camera Tracker (lichaamsgewrichten)

> **Het spel staat in [`bird-game/`](bird-game/README.md)** — "Thermal", een 3D
> vogelspel waarin je armen de vleugels zijn. Dat draait volledig in de browser
> (three.js + MediaPipe voor JavaScript) en gebruikt dit Python-script niet;
> het doet zijn eigen tracking met hetzelfde modelbestand uit `models/`.
> Start het met `cd bird-game && npm install && npm run dev`.

## Spelen zonder iets te installeren

**[douwewelling.github.io/Thermal-Bird-Game](https://douwewelling.github.io/Thermal-Bird-Game/)**

Draait op `https`, dus de camera werkt gewoon. Je hebt een webcam en wat ruimte
nodig om je armen te spreiden.

## Zelf draaien

```bash
git clone https://github.com/douwewelling/Thermal-Bird-Game.git
cd Thermal-Bird-Game/bird-game
npm install
npm run dev
```

Open daarna de **localhost**-URL die Vite print (niet je netwerk-IP: browsers
geven alleen camera-toegang op `https://` of `localhost`). `npm install` haalt
de MediaPipe-runtime en het pose-model binnen, dus daarna draait het spel
volledig offline — er gaat geen enkel camerabeeld het netwerk op.

Zonder webcam spelen kan met `?keys` achter de URL: spatie = klappen,
shift = duiken, A/D = sturen.

Real-time tracking van armen en torso (polsen, ellebogen, schouders, heupen)
via een webcam, met [MediaPipe PoseLandmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker).
Ontworpen als bouwsteen voor een motion-tracking spel.

## Installatie

**Optie A — automatisch (aanbevolen):**

```bash
.\setup.ps1
```

Dit script zoekt een werkende Python-installatie, maakt een eigen virtuele
omgeving (`.venv`) aan zodat dependencies nooit botsen met andere projecten,
installeert de packages, controleert/downloadt het model, en test meteen
of de camera werkt. Start daarna de demo met `.\.venv\Scripts\python.exe demo.py`.

**Optie B — handmatig:**

```bash
pip install -r requirements.txt
```

Het model (`models/pose_landmarker_lite.task`) zit niet in de repo — het is
5,5 MB en wordt automatisch opgehaald door `setup.ps1` (Python) en door
`npm install` in `bird-game/`. Handmatig downloaden kan ook:

```bash
curl -o models/pose_landmarker_lite.task https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task
```

## Meenemen naar een ander project

Deze map is volledig zelfstandig — kopieer 'm in zijn geheel (inclusief de
`models`-map) naar een ander project of een andere machine. Zorg dat je
meeneemt:

- `body_tracker.py`, `demo.py`, `requirements.txt`, `setup.ps1`
- `models/pose_landmarker_lite.task` (5,5 MB — of laat `setup.ps1` 'm downloaden)

Op de nieuwe plek volstaat `.\setup.ps1` om alles werkend te krijgen, ook
als Python daar nog niet (goed) geinstalleerd is. Dat voorkomt het
PATH-gedoe van vandaag: het script zoekt zelf een echte Python-installatie
(niet de Microsoft Store-alias) en gebruikt een eigen `.venv`, zodat een
nieuwe Claude-sessie er ook zonder handmatig PATH-gefriemel mee uit de voeten kan.

## Demo draaien

```bash
python demo.py
```

Toont je webcambeeld met het skelet erover heen, een FPS-teller, en een
voorbeeld-trigger die telt hoe vaak je beide handen boven je schouders tilt.
`q` = stoppen, `r` = teller resetten.

## API voor je eigen spel

```python
from body_tracker import BodyTracker, draw_skeleton

tracker = BodyTracker(camera_index=0)
tracker.start()

while True:
    frame, joints = tracker.read()   # joints: dict[str, Joint] of None
    if frame is None:
        break

    if joints:
        pols_links = joints["LEFT_WRIST"]
        print(pols_links.x, pols_links.y, pols_links.visibility)

    draw_skeleton(frame, joints)     # optioneel, voor visuele feedback
    # ... hier komt jouw spellogica: botsingsdetectie, score, besturing ...

tracker.stop()
```

Elk gewricht (`Joint`) heeft:
- `x`, `y`, `z` — genormaliseerde positie (0..1), `z` is relatieve diepte
- `px` — pixelcoordinaten `(x, y)` in het huidige frame, handig om direct
  op het scherm te tekenen of botsingen mee te berekenen
- `visibility` — 0..1, hoe zeker het model is dat het gewricht in beeld is
  (gebruik een drempel zoals `> 0.5` om ruis te filteren)

Beschikbare gewrichtsnamen (`TRACKED_JOINTS` in `body_tracker.py`):
`LEFT_SHOULDER`, `RIGHT_SHOULDER`, `LEFT_ELBOW`, `RIGHT_ELBOW`,
`LEFT_WRIST`, `RIGHT_WRIST`, `LEFT_HIP`, `RIGHT_HIP`.

## Performance-opties

- `model_complexity`/model-bestand: `pose_landmarker_lite.task` is het
  snelste model. Voor meer nauwkeurigheid (ten koste van FPS) kun je
  `pose_landmarker_full.task` of `pose_landmarker_heavy.task` downloaden
  van dezelfde Google-storage-URL (vervang `_lite` door `_full`/`_heavy`)
  en het pad doorgeven aan `BodyTracker(model_path=...)`.
- `frame_width`/`frame_height`: lager zetten (bv. 640x480) geeft meer FPS
  op een zwakkere laptop.
- `min_detection_confidence`/`min_tracking_confidence`: verlagen maakt de
  tracker gevoeliger maar instabieler; verhogen maakt hem stabieler maar
  mist soms snelle bewegingen.

## Licentie

[MIT](LICENSE) — vrij te gebruiken, aan te passen en te verspreiden, mits de
copyrightvermelding meegaat.
