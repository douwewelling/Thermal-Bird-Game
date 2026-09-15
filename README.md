# Thermal

Browserspel waarin je armen de vleugels zijn: een webcam volgt je lichaam en je
vliegt een eindeloze canyon door.

**Spelen: [douwewelling.github.io/Thermal-Bird-Game](https://douwewelling.github.io/Thermal-Bird-Game/)**

Je hebt een webcam nodig en genoeg ruimte om je armen te spreiden. Het beeld
blijft in je browser — er gaat geen enkel camerabeeld het netwerk op.

## Besturing

| Wat je doet | Wat de vogel doet |
|---|---|
| Armen op en neer slaan | Klappen en klimmen. Kost conditie. |
| Armen recht opzij houden | Zweven. Conditie loopt terug en je pakt thermiek. |
| Armen tegen je lichaam | Duiken: je valt en wint snelheid. |
| Schouder laten zakken, overhellen | Bochten maken. |

Hoe voller je slag, hoe meer lift: een trage, grote slag tilt je verder dan
snel wapperen. Vlieg door de ringen om je score te vermenigvuldigen.

Geen webcam? Zet `?keys` achter de URL: spatie = klappen, shift = duiken,
A/D = sturen.

## Zelf draaien

Eén bestand, geen buildstap. Je kunt het niet met een dubbelklik openen — de
browser geeft alleen camera-toegang op `https://` of `localhost` — dus serveer
het lokaal:

```bash
npx serve
```

Open daarna de `localhost`-URL die er verschijnt.

## Hoe het werkt

Alles zit in [`index.html`](index.html). Drie bibliotheken worden van een CDN
geladen: three.js voor de 3D, MediaPipe PoseLandmarker voor de tracking, en het
pose-model zelf.

**Van lichaam naar besturing.** MediaPipe levert 3D-punten voor schouders,
ellebogen, polsen en heupen. Die worden omgerekend naar een assenstelsel dat aan
je romp vastzit, zodat draaien of scheef staan de metingen niet verpest. Een
klap is een neerwaartse slag gemeten vanaf je eigen hoogste punt, niet vanaf de
horizon — veel mensen klappen volledig onder schouderhoogte en zouden met een
vaste drempel nooit van de grond komen.

**Framerate doet er niet toe.** De camera levert trager dan het scherm tekent,
dus de tracker geeft tussendoor hetzelfde resultaat terug. Dat opnieuw filteren
liet dezelfde armbeweging als 0,64 tellen bij 30 fps en als 1,07 bij 120 fps.
Nu wordt er alleen op nieuwe beelden gemeten en schuift de uitvoer elk frame
soepel mee. De physics loopt op een vaste stap van 1/120 s, zodat een duik
overal hetzelfde voelt en niet door een rotspunt heen schiet.

**Uit beeld lopen pauzeert.** Korte haperingen worden opgevangen door naar een
neutrale glijvlucht te zakken; pas echte afwezigheid zet het spel stil, en bij
terugkomst krijg je een aftelling.

**De cartoonstijl** komt zonder textures of post-processing: toon-shading in
drie harde stappen, rotslagen die naar vaste kleurbanden worden afgerond, en
contouren die ontstaan door elke vorm twee keer te tekenen — één keer opgeblazen
langs zijn normalen in een donkere kleur.

## Licentie

[MIT](LICENSE)
