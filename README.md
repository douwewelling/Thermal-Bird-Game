# Thermal

Browserspel waarin je armen de vleugels zijn: een webcam volgt je lichaam en je
vliegt rond een eiland, dwars door een eindeloze keten ringen.

**Spelen: [douwewelling.github.io/Thermal-Bird-Game](https://douwewelling.github.io/Thermal-Bird-Game/)**

Je hebt een webcam nodig en genoeg ruimte om je armen te spreiden. Het beeld
blijft in je browser — er gaat geen enkel camerabeeld het netwerk op.

## Besturing

| Wat je doet | Wat de vogel doet |
|---|---|
| Armen op en neer slaan | Klappen en klimmen. Kost conditie. |
| Armen recht opzij houden | Zweven. Conditie loopt terug en je pakt thermiek. |
| Armen iets hoger of lager houden | Trimmen: hoger rekt de glijvlucht, lager zet je de neus omlaag. |
| Armen tegen je lichaam | Stoten: de neus kantelt omlaag en je snelheid loopt hard op. |
| Schouder laten zakken, overhellen | Bochten maken. |

Hoe voller je slag, hoe meer lift: een trage, grote slag tilt je verder dan
snel wapperen. Vlieg door de ringen om je score te vermenigvuldigen.

De stoot is een keuze, geen noodrem: met je armen ingetrokken kantelt de neus
binnen anderhalve seconde naar recht omlaag en haal je bijna viermaal je
kruissnelheid. Uittrekken kost daarna zo'n 190 meter hoogte, dus begin er alleen
aan als je die hebt. Het beeld opent mee naarmate je sneller gaat.

Geen webcam? Zet `?keys` achter de URL: spatie = klappen, shift = duiken,
A/D = sturen, W/S = neus omhoog of omlaag trimmen.

## Vogels

Je kiest waarmee je vliegt, en dat verandert echt iets — niet alleen de kleur.

| Vogel | Waar hij goed in is | Vrij na |
|---|---|---|
| **Swift** | Overal even goed. De maatstaf waaraan de rest gemeten is. | meteen |
| **Stoop** | Duikt het hardst: tot 178 m/s, en genoeg vleugel om er weer uit te komen. Zwaar in de klim. | 15 ringen |
| **Drift** | Raakt niet moe. Klappen kost bijna niets en de glijvlucht houdt aan. Traag in de bocht. | 45 ringen |
| **Dart** | Draait op een dubbeltje: 90 graden in 0,88 seconde. Weinig topsnelheid. | 100 ringen |
| **Gale** | Haalt ruim twee keer zoveel uit een thermiek, maar klimt op eigen kracht het slechtst. | 200 ringen |

Ringen tellen door over al je runs heen, dus ook een slechte vlucht brengt de
volgende vogel dichterbij. Je keuze en je voortgang blijven in je browser staan.

## Speelwijzen

Een modus is geen apart spel, maar een paar getallen: hoeveel tijd je hebt, of
het eiland je kan doden, en hoe de ringenbaan loopt.

| Modus | Wat er anders is |
|---|---|
| **Run** | Eén leven, geen klok. |
| **Time attack** | 90 seconden. De klok knippert de laatste tien tellen. |
| **Slalom** | Ringen op 45 meter in plaats van 76, en lager over het bos. |
| **Roam** | Geen faalstaat: klappen kost geen conditie, en raak je grond, boom of water, dan wordt de vogel opgevangen en vliegt hij vlak verder. |

Elke modus houdt zijn eigen record bij. Eén gedeeld record zou een open run een
tijdrace van anderhalve minuut laten begraven, en dan speel je die laatste nooit.

## Geluid

Alles is gesynthetiseerd — er wordt geen enkel geluidsbestand geladen. De wind
volgt je snelheid, elke ring is een bel die per schakel in je ketting een toon
hoger klimt, en er is het suizen van een vleugelslag, een doffe klap bij een
crash en een reeks tonen als je een vogel vrijspeelt. De knop linksboven zet het
uit en onthoudt dat.

## Zelf draaien

Eén bestand, geen buildstap. Je kunt het niet met een dubbelklik openen — de
browser geeft alleen camera-toegang op `https://` of `localhost` — dus serveer
het lokaal:

```bash
npx serve
```

Open daarna de `localhost`-URL die er verschijnt.

## Hoe het werkt

Alles zit in [`index.html`](index.html). Alles wat het laadt komt van een CDN:
three.js voor de 3D, MediaPipe PoseLandmarker voor de tracking, en het pose-model
zelf. Een importmap bovenin regelt de namen, omdat de three-hulpmodules elkaar op
naam importeren en de browser anders niet weet waar `three` staat.

**De wereld is één functie.** `groundAt(x, z)` geeft de hoogte van het eiland op
elk punt: een afgeronde berg in het midden, glooiend land eromheen en een
zeebodem die voorbij de kustlijn doorzakt. Het terreinnet, de begroeiing, de
hoogte van de ringen en de botsingen lezen allemaal diezelfde functie, dus wat je
ziet en waar je tegenaan vliegt kunnen niet uit elkaar lopen.

**Het eiland is vol, maar niet in rijen.** Zo'n veertienhonderd dingen staan
erop: ronde bomen, dennen en struiken in drie formaten, en rotsblokken van
kiezel tot huisgroot. Het eiland is in vakjes van 24 meter verdeeld en elk vakje
krijgt één plek, willekeurig ergens erin — daardoor zijn de afstanden onregelmatig
maar blijven er geen gaten over. Wat er groeit hangt af van de hoogte: rotsen en
struiken op het strand, een gemengd bos op de vlakte, dennen en keien die
uitdunnen op de flank, kale rots bovenaan. Onder het parcours groeit niets hoger
dan 64 meter, zodat geen boom ooit een ring blokkeert.

**Het parcours is een rondje.** De ringen liggen op een spiraal om de berg die
naar binnen en buiten slingert, dus het parcours houdt nooit op. Omdat je in een
rondje vliegt kun je de lijn ook kwijtraken: verdwijnt de volgende ring uit
beeld, dan wijst een pijl aan de schermrand terug.

**Van lichaam naar besturing.** MediaPipe levert 3D-punten voor schouders,
ellebogen, polsen en heupen. Die worden omgerekend naar een assenstelsel dat aan
je romp vastzit, zodat draaien of scheef staan de metingen niet verpest. Een
klap is een neerwaartse slag gemeten vanaf je eigen hoogste punt, niet vanaf de
horizon — veel mensen klappen volledig onder schouderhoogte en zouden met een
vaste drempel nooit van de grond komen.

Een volle slag eindigt met je handen langs je heupen, en dat is precies de houding
voor duiken. Zonder correctie las het spel elke krachtige klap dus óók als
intrekken, en duwde het de neus omlaag op het moment dat je omhoog wilde: hoe
harder je klapte, hoe minder het deed. Zolang je armen snel bewegen, en nog even
daarna, telt intrekken daarom niet mee.

**Wachten kost meer dan je denkt.** De klap werd pas geteld als je armen helemaal
stilstonden — 0,18 seconde nadat de beweging al voorbij was, bovenop de slag zelf.
Nu valt hij zodra de kracht eruit is, op 62% van de piek, en wordt meegerekend wat
je armen nog gaan afleggen. Dat scheelt meer dan de helft. Sturen ging dezelfde
kant op: de vleugel alleen heeft een halve seconde overhelling nodig voor de neus
ergens is, dus heeft de staart er een directe bijdrage bij gekregen. Een bocht van
90 graden duurde twee seconden en duurt er nu iets meer dan één.

**Leunen moest ook echt iets vragen.** De stuuruitslag was zo zuinig afgesteld dat
een flinke schouderdaling van 35 graden om nog geen driekwart bocht vroeg, en een
gewone van vijftien om een vijfde. Je leunde met je hele lijf en de vogel helde
een kwart over — dat is waar "stug" vandaan kwam. Nu geeft twintig graden ruim de
helft en dertig graden alles, en het filter dat de meting glad hield is zo
afgesteld dat het volgen 0,15 in plaats van 0,39 seconde kost.

**Framerate doet er niet toe.** De camera levert trager dan het scherm tekent,
dus de tracker geeft tussendoor hetzelfde resultaat terug. Dat opnieuw filteren
liet dezelfde armbeweging als 0,64 tellen bij 30 fps en als 1,07 bij 120 fps.
Nu wordt er alleen op nieuwe beelden gemeten en schuift de uitvoer elk frame
soepel mee. De physics loopt op een vaste stap van 1/120 s, zodat een duik
overal hetzelfde voelt en niet dwars door een boomtop heen schiet.

**Het past zich aan je laptop aan.** Het spel draait naast een pose-model dat de
videokaart ook wil hebben. Het meet hoe lang het werk per beeld duurt en tekent op
lagere resolutie zodra dat structureel te lang wordt — gemeten aan het werk, niet
aan de tijd tússen beelden, want op een 30 Hz-scherm zit er ook zonder enige
zwaarte 33 ms tussen. Gaat het daarna lang genoeg goed, dan schakelt het weer op;
na de tweede keer terugschakelen blijft het laag, zodat het niet blijft heen en
weer springen.

**Uit beeld lopen pauzeert.** Korte haperingen worden opgevangen door naar een
neutrale glijvlucht te zakken; pas echte afwezigheid zet het spel stil, en bij
terugkomst krijg je een aftelling.

**De tekenfilmstijl** leent de look van een Amerikaanse sitcom-cartoon: een
strakke blauwe lucht met bolle witte wolken, verzadigd gras, geel strand en
lila-grijze rotsen, alles in twee tonen — licht en schaduw, met een paarsige
schaduwkant in plaats van grijs. De grondkleur volgt alleen uit de hoogte, in
vlakke vlakken met een smalle overgang, en langs de waterlijn loopt een witte
branding.

De inktlijn is één stap voor het hele beeld. Het spel tekent eerst alles in een
buffer en zet daarna een lijn waar de diepte van het ene oppervlak naar het
andere springt. Omdat de diepte wordt vergeleken als 1/afstand, die over elk plat
vlak lineair loopt, tekent een helling die naar de horizon wegloopt niets en de
rand van een boom voor de berg wel. De lijn is dikker op wat dichtbij is en loopt
weg in de nevel. De wolken worden daarna apart getekend, zonder lijn, zoals in
een geschilderde lucht. Zonder textures: alle kleur zit in de hoekpunten.

## Licentie

[MIT](LICENSE)
