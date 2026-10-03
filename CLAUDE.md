# Riss — prosjektunderlag for Claude Code

Dette dokumentet er underlaget Claude bør lese før arbeid i dette repoet.

## Kva appen er

Riss er eit vektorbasert skisseverktøy for arkitektar og ingeniørar — ei
enkelt, standalone HTML-fil utan avhengigheiter. Målestokk-medvite
(mm-koordinatsystem), meint for raske håndskisser/underlag i eit
arkitektkontor.

- Repo: `https://github.com/geirmagnelied/riss` (branch `main`)
- Live nettside: `https://riss.liedarkitektur.no` (Vercel, alias for
  `riss-nu.vercel.app`, auto-deploy ved push til `main`)
- Lokal mappe: `C:\Users\gemli\Jottacloud\Lied Lab\Web\Riss`
- Lokal statisk dev-server for testing: **ikkje** via `preview_start`
  med namn (Claude Code-sesjonen sitt arbeidsrotpunkt er `LiedLab`, og
  eit forsøk på å leggje ein `riss-static`-config i `LiedLab/.claude/
  launch.json` vart reversert — feil stad å blande inn eit anna
  repo sin dev-server-config). Start i staden manuelt via Bash:
  `cd "…/Web/Riss" && npx --yes http-server -p 5588 -c-1` (bakgrunn),
  opne so `http://localhost:5588/index.html` med `navigate`/`preview_start
  {url:…}`. Hugs å stoppe prosessen på port 5588 att etter testing.

## Start-side, innlogging og prosjekt (lagt til 28. sept. 2026)

`index.html` opnar på ei start-side (`#startScreen`, styrt av
`body.pre-start`-klassen) før sjølve skisseverktøyet vert synleg. Tre
del-visingar (`#startView-landing/auth/projects`, vist/skjult via
`showStartView(name)`):

1. **Landing**: "Bruk utan innlogging" → `enterApp()` (reint gjeste-modus,
   ingen prosjekt/lagring — nøyaktig same åtferd som appen alltid har
   hatt), eller "Logg inn" → auth-visinga.
2. **Auth**: e-post/passord, med `toggleAuthMode()` mellom innlogging og
   registrering (`sb.auth.signInWithPassword`/`signUp`). NB: denne
   Supabase-instansen krev **ikkje** e-poststadfesting for at signUp skal
   gje ei aktiv økt med det same (uventa i lys av notatappen sin
   "sjekk e-posten din"-tekst i `Auth.jsx` — koden i Riss handterer likevel
   begge tilfelle, i tilfelle innstillinga vert endra seinare).
3. **Prosjekt**: liste over brukaren sine prosjekt (`loadProjectList()`),
   "+ Nytt prosjekt" (`createProjectPrompt()`), og "Logg ut". Klikk på ei
   rad → `openProject(id,name)`.

**Delt backend med notatappen (LiedLab)** — eksplisitt vedteke etter
samtale 27.–28. sept. 2026, IKKJE ein eigen Supabase-instans for Riss:

- Same Supabase-prosjekt ("Lied Lab", `hcdtagtkyewhrbrvrbqh`), same
  `public.projects`-tabell, same brukarkontoar (Supabase Auth). Ein brukar
  som loggar inn i Riss ser difor **automatisk** same prosjektliste som i
  notatappen — ikkje ein import mellom to system, same rad i same tabell.
  Riss kan òg **opprette** nye prosjekt-rader (synlege att i notatappen).
- **VIKTIG, lett å gløyme**: `public.projects.id` er `bigint NOT NULL`
  **utan** databasedefault/identity — han vert generert klientsidig
  (`id: Date.now()`, akkurat som notatappen sin `useStore.js`, sjå
  `nextCaseNumber()`-mønsteret i hovud-CLAUDE.md). Eit `insert` utan
  eksplisitt `id` feilar med `23502 null value in column "id"` — fanga
  opp under eigen test 28. sept., før commit.
- Riss sine eigne teikningar/modellar ligg i ein ny tabell
  `public.riss_drawings` (same mønster som `ks_teikningar`/
  `dtm_dokumenter`: `id bigint identity`, `user_id uuid not null`,
  `project_id bigint references projects(id)`, domenefelt, RLS på
  `auth.uid()=user_id`). Kolonnen `data jsonb` held heile tilstanden:
  `{elements, geoRef, view:{panX,panY,zoom}, scaleRatio}` — nok til å
  rekonstruere skisse + koordinatregistrering (`geoRef`, sjå eigen
  seksjon) + vising fullstendig. `saveDrawing()` gjer upsert (insert
  fyrste gong, elles `update` på `currentDrawingId`).
- Klienten brukar `@supabase/supabase-js` frå CDN
  (`cdn.jsdelivr.net/npm/@supabase/supabase-js@2`) — einaste eksterne
  skript utover Google Fonts. Bryt strengt tatt "ingen avhengigheiter",
  men ikkje "ingen build-steg" (framleis rein CDN-`<script>`, ingen npm).
- Testa 28. sept. med ein eigenlaga, mellombels testkonto direkte mot den
  DELTE produksjonsdatabasen (einaste ekte brukar der frå før var
  `geirmagnelied@gmail.com` sjølv) — heile registrering→prosjekt→
  lagring→sideoppfrisking→opning-syklusen stadfesta fungerande via ekte
  Supabase-kall, ikkje mocka. Testkonto + testdata sletta att etterpå
  (sjå `DELETE`-spørjinga i chat-historikken viss du treng malen).
- **Kjende avgrensingar**: gjeste-modus har ingen veg til å logge inn midt
  i økta (må laste sida på nytt og velje "Logg inn" på start-sida). Inga
  fleirbrukar-/kontordeling av Riss-teikningar enno, sjølv om
  `offices`/`office_members` alt finst i databasen for notatappen —
  `riss_drawings`-RLS er i dag strengt eigar-only (`auth.uid()=user_id`),
  same nivå som `projects` sjølv har i dag.
- Eitt uforklart, truleg godarta 400-svar dukka opp éin gong i
  konsollen under testing (ingen synleg funksjonsfeil, reproduserte seg
  ikkje ved gjentaking) — truleg intern SDK-oppførsel ved fyrste
  sesjonssjekk utan lagra økt. Ikkje forfølgt vidare; hald auge med det.

## Kart-modul for stadbundne byggeprosjekt (lagt til 30. sept. 2026)

Ny modul-rail heilt til venstre (`#moduleRail`, gjenbruker `.tool`-stilen
frå verktøyraila) med to knappar: **Skisse** (dagens teiknemodus, standard
aktiv) og **Kart** (ny). `setModule('skisse'|'kart')` styrer alt — viser/
skjuler `#toolrail`+`#canvas-host`+`#statusbar` vs. `#mapArea`+
`#mapBottomBar`. Kartmotoren er **Leaflet** (CDN,
`cdn.jsdelivr.net/npm/leaflet@1.9.4`) — nytt eksternt skript i tillegg til
supabase-js, framleis ingen build-steg.

Klikk på **Kart**-knappen opnar:
- Sjølve kartet (`#mapHost`, `initMap()`), sentrert på brukaren sin
  posisjon via `navigator.geolocation` (spør om løyve; fell tilbake til
  Noreg-oversikt `[64.5,11]` zoom 5 viss avslått/utilgjengeleg).
- Ein eigen venstre-sidebar (`#mapSidebar`, 200px, til høgre for
  modul-raila) med **"Vel utsnitt"** (`startExtentSelect()` —
  klikk-og-dra teiknar ein rute på kartet, lagrar `mapModule.siteExtent`
  som ein Leaflet-bounds og viser senterkoordinat i sidebaren) og
  **"Importer eige kartgrunnlag"** (`handleMapImportFile()` — legg eit
  rastebilete inn som `L.imageOverlay` over *gjeldande synsfelt*; **ingen
  drag/endre-storleik-handtak enno** — brukar må zoome/panorere til rett
  utsnitt FØR import, same enkle v1-tilnærming som Riss sitt eksisterande
  rasterunderlag i skissemodus).

### Kjelder (verifisert direkte mot kvar teneste sitt GetCapabilities
30. sept. 2026 — sjå chat-historikk for full research-logg)

Alle gratis/opne, ingen API-nøkkel, alle Kartverket-heimla:

| Lag | Type | URL / lagnamn | Merknad |
|---|---|---|---|
| Topografisk (farge) | WMTS | `cache.kartverket.no/v1/wmts/1.0.0/topo/...` | Standard grunnkart |
| Gråtone | WMTS | same, lag `topograatone` | Alternativ grunnkart |
| Bygningar | WMS | `wms.geonorge.no/skwms1/wms.inspire_bu`, lag `BU.Building` | INSPIRE-bygningsdata, matrikkelen |
| Eigedomsgrenser | WMS | `wms.geonorge.no/skwms1/wms.matrikkel`, lag `eiendomsgrense` | NB: same teneste har IKKJE bygningslag |
| Terrengskygge | WMS | `wms.geonorge.no/skwms1/wms.terrengmodell`, lag `relieff` | Kan verke flatt/einsfarga heilt nære zoom-nivå over tett by — normalt, ikkje feil |

**VIKTIG, lett å gjere feil**: Kartverket sin WMTS-cache brukar
**nullpolstra tosifra** TileMatrix-identifikatorar (`"00".."18"`), ikkje
rein zoom-heiltal — stadfesta direkte i WMTSCapabilities.xml. Difor
`PaddedWMTS` (`L.TileLayer.extend`) i staden for vanleg `L.tileLayer`
med `{z}`.

**Bevisst UTELATE i v1**: "Norge i bilder" (flyfoto/ortofoto) — tenesta
krev eit tidsavgrensa token (genererast manuelt på
`services.norgeibilder.no/token`, varer maks 1 veke) — uforeinleg med
statisk fil utan backend-proxy eller manuell token-oppdatering. Kan
leggjast til som eit eige, token-gata lag (brukar limer inn eigen token,
lagra i `localStorage`) om ønskeleg seinare.

**Botnrad** (`#mapBottomBar`, gjenbruker `.snap-chip`-stilen frå
skissemodus sin statuslinje): grunnkart-val (`setMapBase()`, éin om
gongen) og lag-av/på (`toggleMapOverlay()`, uavhengige). Leaflet sin
innebygde attribusjonskontroll viser "© Kartverket"/"© Geonorge" per lag
automatisk (NLOD-krav, handtert utan eigen kode).

**Testa** 30. sept. direkte mot dei ekte tenestene (ikkje mocka) med
skjermbilete: grunnkart-byte, alle tre overlegg (bygningsomriss synlege
over Oslo sentrum — stadfesta visuelt), utsnitt-verktøyet (rektangel
teikna presist, koordinat vist), eige-kartgrunnlag-import (simulert med
eit generert testbilete), og retur til Skisse-modus utan regresjon.
Ingen konsollfeil gjennom heile testen.

**Ikkje bygd enno** (naturlege neste steg, ikkje uttrykt som prioritert
av Geir Magne enno): lagring av `mapModule.siteExtent`/kartgrunnlag til
Supabase (kopla til `currentProject`, same mønster som `riss_drawings`),
drag/endre-storleik på importert kartgrunnlag, flyfoto-lag med
brukar-token, og evt. å la "Vel utsnitt" faktisk styre kva som vert
lasta/vist (i dag er det berre eit valt punkt/område, ikkje kopla til
noko anna enno).

## 3D-modul — bygd, så fjerna att (30. sept. 2026)

> **Oppdatering 3. okt. 2026**: ei ny, enklare 3D-vising er bygd inn att i
> same vindauge (`js/view3d.js`, sjå «Strukturelle endringar for vegmodul»).
> Teksten under er historikk om den fjerna terreng/OSM-versjonen.

Ein 3D-modul (terreng frå Kartverket sitt høgdedata-API + bygningsvolum
frå OSM/Overpass, Three.js/OrbitControls-navigasjon) vart bygd og
verifisert fungerande same dag, men **fjerna att på eksplisitt ønske**
frå Geir Magne same dag, til fordel for import-/eksportmodular i staden.
All kode (Three.js/OrbitControls-CDN, `#threeDArea`, `ensureThreeDScene`,
`build3DTerrain`, `fetchOsmBuildings` m.fl.) er fjerna frå `index.html`.
Teknikkane som vart stadfesta undervegs (batcha punkthøgde-API, Overpass
`out geom;`, AbortController-timeout mot trege offentlege API-ar) kan
vere nyttige å hente fram att om 3D-visualisering vert aktuelt seinare —
sjå git-historikk (commits kring 30. sept. 2026) for full kode og
grunngjeving, ikkje attskrive her sidan koden ikkje lenger finst i fila.

## Dra-og-slepp-import: DXF, SOSI og IFC (lagt til 1. okt. 2026)

Brukar kan no dra ei `.dxf`-, `.sos`/`.sosi`- eller `.ifc`-fil rett inn i
heile appvindauget (ikkje berre inni ein bestemt knapp/sone) — eit
halvgjennomsiktig overlegg (`#dropOverlay`) viser seg medan ein dreg.
Droppar ein fila medan appen er i Kart-modus, byter han automatisk til
Skisse-modus fyrst (einaste modulen som har noko å importere til).
DXF/SOSI bruker dei same parsarane/`placeImportedGeometry()`-pipelinen
som filveljaren i "Importer underlag"-modalen (som òg no tek alle tre
filtypane, ikkje berre DXF/SOSI) — same kode, berre to utløysarar.

**IFC** er heilt nytt og fortener eiga forklaring:

- Brukar **web-ifc** (ThatOpen/`engine_web-ifc`, WASM, CDN
  `cdn.jsdelivr.net/npm/web-ifc@0.0.68/web-ifc-api-iife.js`) — IIFE-bygget,
  som gir ein global `WebIFC.IfcAPI`, kompatibelt med Riss sin vanlege
  `<script>`-utan-modular-arkitektur (same grunngjeving som kvifor
  Three.js r128 vart valt tidlegare for OrbitControls).
- **Lasta lat** (`loadScriptOnce()`), ikkje statisk i `<head>` — biblioteket
  (~5 MB) prøver å auto-initialisere WASM med feil default-sti med det
  same scriptet køyrer, som ga 400-feil i konsollen på KVAR sideinnlasting
  uavhengig av om IFC vart brukt (stadfesta direkte). Lat lasting løyser
  dette heilt (stadfesta: null konsollfeil ved vanleg sideinnlasting i ei
  heilt fersk fane), og sparer 5 MB for dei aller fleste økter som aldri
  rører IFC.
- **`SetWasmPath(url, true)`** — merk det **andre** argumentet (`absolute`).
  Utan det vert `url` tolka som RELATIV til scriptet, ikkje absolutt, og
  WASM-lastinga feilar stille med "both async and sync fetching of the
  wasm failed". Lett å gløyme, stadfesta direkte under eiga testing.
- **VIKTIG, ikkje-openbert geometri-funn**: web-ifc returnerer
  vertex-geometri i **Y-OPP-konvensjon** (vanleg i webgrafikk/glTF), IKKJE
  IFC sin eigen native Z-opp. Stadfesta empirisk: ein testvegg sin
  tjukkleik (0,2 m) dukka fyrst opp i Y-komponenten saman med heile
  veggen sin HØGD (2,4 m) blanda inn, ikkje i det eg venta. Grunnplanet
  for 2D-fotavtrykk er difor **(X, Z)** frå den transformerte
  vertex-arrayen, ikkje (X, Y). Sjå `parseIFC()` sin kommentar for detaljar.
- **Kva vert importert**: for kvar `IFCWALLSTANDARDCASE`/`IFCWALL`/
  `IFCSLAB`/`IFCCOLUMN`/`IFCBEAM`/`IFCROOF` (inntil 500 element per fil,
  yting) hentar `GetFlatMesh`+`GetGeometry` den triangulerte 3D-geometrien
  (med `flatTransformation` alt bruka), projiserer alle hjørnepunkt ned på
  det horisontale planet, og reknar ut **konveks skrog** (Andrew's
  monotone chain, `convexHull2D()`) som eit 2D-fotavtrykk-polygon.
  **Medviten forenkling**: perfekt for rette, rektangulære veggar (det
  vanlegaste), men "rettar ut" L-forma eller krumma element til næraste
  konvekse omriss — ikkje full BIM-geometritrufastheit. Berre `way`-type
  geometri vert handtert implisitt via mesh-ekstraksjonen (ingen eksplisitt
  `relation`-spesialhandtering, men dette gjeld færre element).
- **Lengdeeining**: antekken meter (vanlegast for IFC frå dei fleste
  autoringverktøy) — `placeImportedGeometry(els, 1, null, 'IFC')`. Bruk
  "Kalibrer" i etterkant viss målestokk er feil, same mønster som DXF.
- **Testa** 1. okt. med ei handlaga, minimal gyldig IFC4-testfil (éin
  `IFCWALLSTANDARDCASE`, 5×0,2×2,4 m) — stadfesta nøyaktig fotavtrykk
  (1,0 m² i Riss, akkurat rett) via både direkte `parseIFC()`-kall og
  heile dra-og-slepp-vegen i ei fersk fane, ingen konsollfeil. Ikkje testa
  med ei verkeleg, kompleks IFC-fil frå ArchiCAD/Revit enno — handlaga
  testfil dekkjer berre det enklaste tilfellet.

## SOSI-import: kategorisert grafikk + "Målsetting eksisterande koter" (lagt til 1. okt., utvida same dag)

Ved SOSI-import vert objekt kategoriserte etter type (kote/bygning/veg)
og fargelagde/stilsette deretter, og høgdekurver får i tillegg automatisk
kotehøgde-tekst. Konkret:

**Attributt-utvinning i `parseSOSI()`** — i tillegg til `ENHET`/`KOORDSYS`
frå før, plukkar han no opp per objekt:
- **`KOTEHØYDE`** → `el.kotehoyde` (tal, meter). Fråvær = vanleg
  kurve/grense/linje, upåverka av alt under.
- **`OBJTYPE`** → `el.objtype` (rå tekststreng, t.d. "Bygning",
  "VegSenterlinje", "Høydekurve") — brukt til kategorisering.

**Kategorisering** (`importSosiFile()`, FØR `placeImportedGeometry` —
viktig, sidan styling kan endre `type` frå `'poly'`→`'fill'`, og det må
skje medan elementa framleis er rå/u-transformerte):
- **Koter**: `el.kotehoyde!=null`.
- **Bygningar**: `el.objtype` matchar `/bygning/i` (fangar "Bygning",
  "Bygningsomriss" m.fl. — ikkje ei uttømmande liste av FKB-typekodar).
- **Veg/gangveg**: `el.objtype` matchar `/veg/i` OG har IKKJE kotehøyde
  (unngår dobbelklassifisering i det sjeldne tilfellet eit vegobjekt òg
  skulle ha høgdeattributt).

**Grafikkval-modal** (`openSosiStyleModal()`, `#sosiStyleModal`) — dukkar
berre opp viss minst éin kategori er funnen i fila (ingen unødig dialog
for reine geometri-filer), viser kor mange av kvar ("3 koter, 1 bygning,
2 veg/gangveg"), og lèt brukar justere FØR import, med Riss sine
standardverdiar (etter eksplisitt ønske frå Geir Magne, stadfesta via
AskUserQuestion at tjukkleik-tildelinga nedanfor er korrekt veg, ikkje
reversert) ferdig utfylte. Knappen **"Importer utan styling"** hoppar
over all kategorisering (framleis vanleg `IMPORT_COLOR` blå for alt),
men kotehøgde-TEKSTEN vert likevel generert om fila har koter — sjølve
tekstgeneratoren er ikkje kopla til stylingvalet, berre fargen/tjukkleiken
på kotelinja er det (teksten brukar då `IMPORT_COLOR` som fallback-farge):
- **Koter**: mørk brun (`#5c3a21`), standard **0,18 mm**, kvar 5. **0,9 mm**.
  "Kvar 5." vert avgjort ved å finne MINSTE avstand mellom dei ulike
  `kotehoyde`-verdiane i fila (vanlegaste kote-intervallet, t.d. 1 m),
  og rekne steg frå lågaste verdi — `steg%5===0` ⇒ hovudkote. Krev eit
  **jamt/regulært** intervall i dataen for å stemme (stadfesta korrekt
  med jamt fordelte testverdiar 40–46; ei ujamn/uregelmessig testmengd
  gjev feil klassifisering — forventa åtferd av algoritmen, ikkje feil).
- **Bygningar**: oransje fyll (`#d4720c`, vanleg i norske kart), 0,35 mm.
  Lukka bygningsobjekt (`el.closed`) vert gjort om frå `'poly'` til
  `'fill'` (same element-type/eigenskapar som flaumfyll-verktøyet:
  `bgColor`/`hatchColor`/`hatch:'solid'`/`opacity:70`) — ekte, redigerbare
  fyll-element, ikkje spesialteikna.
- **Veg/gangveg**: lys grå (`#c4c0b8`). Lukka vegareal vert "fylt" på
  same måte som bygningar (`hatch:'solid'`); opne senterlinjer kan ikkje
  "hatch"-fyllast (ikkje eit areal) og får berre fargen som strek.

**Kotehøgde-tekst** (uendra logikk frå tidlegare, men no med to viktige
visuelle rettingar etter tilbakemelding):
- `generateKoteLabels()` plasserer éin tekst ca. kvar **50 m** (standard,
  overstyrbar via feltet i grafikkval-modalen — ikkje lenger ein separat
  `prompt()`), rotert etter kotelinja sin lokale tangent i innsetjings-
  punktet, normalisert til ±90° (`uprightAngle()`) så teksten ALDRI vert
  lesen opp-ned.
- **Midtstilt PÅ streken** (retta 1. okt.): `drawElement()` sitt
  tekst-tilfelle set no `textAlign='center'`/`textBaseline='middle'` for
  rotert tekst (før: ingen alignment sett → teksten vart teikna frå
  innsetjingspunktet og UTOVER mot høgre, ikkje sentrert — difor
  tilbakemeldinga "ikkje heilt midtstilt"). Den vesle 1 mm perpendikulære
  lyftinga vekk frå streken er fjerna; teksten sit no direkte sentrert på
  sjølve kotelinja, med ein bakgrunn (sjå under) som "bryt" streken —
  standard kartografisk konvensjon for kotetekst.
- **Bakgrunnsfyll bak teksten** (nytt 1. okt.): ny valfri eigenskap
  `el.bgFill` (fargestreng) på `text`-element — når sett, teiknar
  `drawElement()` ein fylt rektangel (målt med `c.measureText()`, litt
  padding) BAK glyfane, FØR sjølve teksten. Kotehøgde-tekst brukar
  `bgFill:'#fbfaf7'` (papirfargen) slik at linja bak vert maskert for
  lesbarheit. Generisk eigenskap — kan brukast av andre tekst-typar
  seinare om ønskeleg, ikkje kote-spesifikk i koden.
  Format `+<kotehøgde>`, storleik `sizeMm:1.8`, tagga med
  `layer:'Målsetting eksisterande koter'` — uendra frå før.
- **`layer`-eigenskapen er framleis berre ein merkelapp** — ingen eigen
  lag-panel/synlegheitsstyring i Riss enno. Sjå tidlegare merknad.
- Gjeld **berre SOSI**, ikkje DXF.

**Testa** 1. okt.: grafikkval-modalen (riktig oppsummering/felt vist/
skjult etter kva som faktisk finst i fila), kote-tjukkleik-kategorisering
med både uregelmessig (avslørte den forventa avgrensinga) og regulær
(40–46, kvar 5. korrekt tjukk) testdata, bygnings- og veg-fyll (visuelt
stadfesta: oransje/lysgrå areal med `2 valt`-eigenskapspanel synleg,
provar at det er ekte, redigerbare fyll-element), og tekst-sentrering/
bakgrunn (visuelt stadfesta: "+40" sentrert og lesbart midt på ei tjukk
brun linje). Ingen konsollfeil gjennom heile testen.

## Markering, kartzoom til prosjektadresse og utsnittsmeny (4. okt. 2026)

**Markering**: valde element har ingen stipla ramme lenger — `drawElement()`
teiknar ein kopi av elementet med `color:SEL_COLOR` (`#2563eb`, blå). Fyll/
skravur beheld eigen farge (bg/hatch vert fiksert til opphavleg farge før
kopien vert farga). Handtak (`js/grips.js`) er uendra. `drawSelBox()` er fjerna.

**Min. zoom** i hovudvisinga er senka frå 0,02 til 0,0005 px/mm — eit
situasjonskart på 200 m har ikkje plass ved 0,02, og hjulzoom hoppa då «innover».

### `js/kartutsnitt.js`
- **Zoom til prosjektadresse**: `openProject()` hentar `projects.details`
  (jsonb frå notatappen, `currentProject.details`; `detailsLoaded` er eit
  promise). `mapGotoProject()` geokodar `propertyAddress`+`propertyPostnr`
  (ellers kommunenr., ellers gnr/bnr) via Geonorge adresse-API
  (`ws.geonorge.no/adresser/v1/sok`, `representasjonspunkt`), zoom 18 + markør.
  Finn han ikkje adressa → melding + posisjon frå nettlesaren som før.
  Kartet zoomar på nytt når prosjektet byter (`mapModule.projectId`).
  Zoomkontrollen i Leaflet er flytta til øvre høgre hjørne.
- **Utsnittsmeny**: etter «Vel utsnitt»-drag dukkar `#extentPanel` opp oppe til
  venstre i kartet: nedtrekk «Handling» (*Bruk som tegningsunderlag* /
  *Eksporter PDF*), «Målestokk» (auto = minste standardmålestokk som får
  utsnittet på A3, eller 1:100–1:10000) og «Papirstorleik» (A3/A4, berre PDF).
- **UTM**: eigen Krüger-implementasjon (`utmFraLatLon`/`latLonFraUtm`, verifisert
  mot kjent punkt 60°N 9°Ø → N 6 651 411). Sone vert styrt av `geoRef.koordsys`
  (22/23/25 → UTM 32/33/35) viss teikninga alt er registrert, elles av lengdegrad.
  WMS vert spurt direkte i `EPSG:258xx`, så biletet er metrisk korrekt.
- **Underlag**: kartbilete (aktiv basis + påslåtte overlegg, Geonorge WMS, CORS-opent)
  vert lagt som `underlay` i verkelege mm (1 m = 1000 mm) mot `geoRef`; i tillegg
  **vektor frå OSM** (bygningar → `fill` oransje, vegar → `polyline`) i laga
  «Kart – bygningar»/«Kart – veg», via `placeImportedGeometry()`. `scaleRatio`
  vert sett til vald målestokk. OSM-bygg har `noArea:true` (ingen m²-tekst).
  **Overpass er ustabil**: `overpass-api.de` ga 504 under testing, medan
  `overpass.openstreetmap.fr` svarte på 0,5 s — alle vert spurde samtidig,
  første gyldige svar vinn; bygg og veg er eigne spørjingar så éin feil ikkje
  tek med seg den andre; feil gir berre kartbilete + melding.
  **Kartverket sin WFS (eigedomsgrenser) har ikkje CORS** og kan ikkje brukast frå
  nettlesaren; FKB er «norway digital restricted». Eigedomsgrenser kjem difor
  berre som raster (overlegget «Eigedomsgrenser»).
- **PDF**: papirflata × målestokk, sentrert på utsnittet, WMS i 200 dpi, ramme,
  nordpil, målestokklinje og infofelt; skriven som minimal PDF (JPEG i DCTDecode,
  `kartPdfBytes()`, ingen bibliotek). Filnamn: `Situasjonskart <ÅÅÅÅ-MM-DD> 1-<målestokk> <kartdatabase>.pdf`.
  PDF-en er **raster** (ikkje vektor).
  Lagring: `window.resultatdokumentAPI.rissLagreInn(oppdragsSti, filnamn, bytes)`
  (ny IPC `riss:lagre-inn` i notatappen sin `electron/main.js`+`preload.js`)
  → `<oppdragsSti>\2 Informasjonsflyt\Inn` (aldri overskriving: « (2)» ved same namn).
  Krev at prosjektet er låst til ei oppdragsmappe (`details.oppdragsStiLast`).
  Utan bru/låst mappe vert fila lasta ned i nettlesaren. **Merk**: Riss er ei eiga
  nettside — brua finst berre viss Riss vert opna i notatapp-vindauget
  (preload gjeld kvar side som vert lasta i same Electron-vindauge), og
  Electron-appen må byggjast på nytt (`npm run dist`) for å få det nye endepunktet.
- **Avgrensingar**: underlaget (rasteret) vert ikkje lagra i `riss_drawings` (berre
  vektorelementa) — det forsvinn ved sideoppfrisking; ingen knapp for å fjerne det.

## Strukturelle endringar for vegmodul (3.–4. okt. 2026)

Mål: ein **vegtegnings-modul** for norske vegklassar (brukar definerer
startpunkt, retning og høgder på ei senterlinje; programmet hjelper med
restriksjonar for kurvatur, stigning, fall). Fyrst vart fundamentet bygd:
modulsplitting, undo, lag, senterlinje med ekte bogar, handtak og 3D.
**Opent spørsmål til Geir Magne**: skal klassane vere **N100/N101-normalen**
(riks-/fylkesveg) eller **kommunale vegnormalar** (typisk for tomteutvikling)?
Ikkje avklart — spør før klassetabellar vert bygde.

### Modulstruktur
`index.html` har framleis hovudskriptet inline (~3500 linjer), men nye
delar ligg som **klassiske `<script src="js/…">`-filer lasta FØR det inline
skriptet** (delte globale variablar, ingen ES-modular, ingen build). Funksjonar
i `js/` kallar hovudskriptet sine globalar (`elements`, `view`, `render`,
`w2s`, `selection` …) ved køyretid, så lastrekkjefølgja er uproblematisk.

| Fil | Innhald |
|---|---|
| `js/history.js` | Angre/gjer om (Ctrl+Z / Ctrl+Y, knappar i topplinja). Snapshot-basert: `JSON.stringify` av `{e:elements,l:layers,c:curLayer}`, utan `selSeg` og nøklar som startar med `_`. Debounce + undertrykt medan peikaren er nede, så eit dra = eitt steg. `histOnRender()` vert kalla frå `render()`. |
| `js/layers.js` | Lag etter namn (`el.layer`, standard `'Standard'`). Skjult lag: ikkje teikna/snappa/treft/eksportert. Låst lag: synleg og snappbart, men ikkje valbart. Lagpanel (`#layerPanel`) og knapp i topplinja. |
| `js/alignment.js` | **Senterlinje** (`type:'alignment'`): PI-punkt + radius per indre PI → eksakt tangent-bogegeometri, stasjonering ("0+120"), eksakte parallellkurver for vegbreidd, klemming av tangentlengder (proportionalt mot ønskt lengd), eigen tegnemodus (Enter/Esc avsluttar). |
| `js/grips.js` | Handtak for eitt valt element: kvadrat = punkt, sirkel = bogestyring, rombe = radius på senterlinjebogar (R = E·cos(Δ/2)/(1−cos(Δ/2)), klemt 1 m–5000 km). |
| `js/view3d.js` | **3D-vising i same vindauge** (sjå under). |

`index.html` kallar inn i modulane via faste kroker: `render()` (stampLayers,
`histOnRender`, `v3OnRender`), `setTool`, `updateProps`, `setModule`,
tastatur (Ctrl+Z/Y, `c`=senterlinje), lagring/opning (lag og `curLayer` ligg i
`riss_drawings.data`; `layersReset()` + `histInit()` ved opning).

### Papir-mm for linjetjukkleik og tekst
`el.weightMm` (linje) og `el.sizeMm` (tekst) er **papireiningar** knytt til
målestokken (`scaleRatio`): 0,18 mm-linje ser lik ut på papir uansett 1:100/
1:500. Bruk `penPx(el)`/`textPx(el)` — ikkje rå mm-verdiar — ved teikning.
(Tidlegare vart 1,8 mm tekst rekna som verkeleg mm og vart usynleg.)

### 3D-vising (`js/view3d.js`)
- **Same vindauge**: 2D|3D-brytar i topplinja (`#viewToggle`). Overgangen er
  animert (kamera tiltar frå rett ovanfrå med same utsnitt som 2D og tilbake),
  så 3D startar nøyaktig der 2D-visinga var. Verktøyraila er deaktivert i 3D
  (`#toolrail.v3-disabled`); markering og eigenskapspanel verkar framleis,
  og angre/gjer om fungerer i 3D (scena vert bygd om via `v3OnRender`).
- **Three.js r128 (UMD) + OrbitControls**, lasta lat ved fyrste 3D-bruk
  (`v3LoadLibs()`), ikkje i `<head>`.
- **Aksar**: Riss-world mm → scene i meter. x→X, plan-y→Z, høgd→Y (Y opp).
  Scena er sentrert på innhaldet (`V3.center`). Handtert via `V3.group`;
  «Høgde ×»-valet (1/2/5/10) skalerer `group.scale.y` (høgdeoverdriving).
- **Datamodell**: `el.z` = underkant/kote (mm), `el.height` = ekstrudering
  (mm). Vegg utan `height` = 2,5 m. Fyll/poly/rektangel/ellipse ekstruderast
  berre om `height>0`. Linjer med `z` (t.d. kotekurver frå SOSI, som får
  `z=kotehøgd`) vert teikna i den høgda. Senterlinja vert eit flatt
  vegband (`v3Ribbon`, konstant z inntil lengdeprofil finst). IFC-import
  fyller `z/height/ifcType`. Eigenskapspanelet har «Underkant/kote z» og
  «Høgd» (`heightUpdateProps()`), vegg-verktøyet har eit «Høgd»-felt.
- **Kamera**: `v3Pose()`/`v3SetCam()` (φ=høgdevinkel, θ=asimut, avstand);
  presets *Plan*, *Perspektiv*, *Tilpass* (`v3Preset`). Kameraet sin up-vektor
  vert sett til (0,1,0) etter kvar animasjon, så OrbitControls fungerer.
- **Fallgruve**: dokumentet har `overflow:hidden`, men kan likevel scrollast
  programmatisk (fokus på ein knapp når topplinja er breiare enn vindauget) —
  då gled heile appen sidevegs. `view3d.js` nullstiller scroll på sjølve
  dokumentet. Topplinje-element (`#viewToggle`, `#undoRedoWrap`, `#layerBtn`)
  har `flex-shrink:0` — utan det vart 2D|3D-brytaren 2 px brei ved smale vindauge.
- **Ikkje bygd enno**: 3D-markering/plukking, terrengflate frå koter (TIN),
  lengdeprofil langs senterlinja (høgd langs vegen), DXF-eksport.

### vercel.json
Berre `headers` (X-Frame-Options, nosniff). Dei gamle `builds`/`routes` vart
fjerna — dei sende ALLE stiar til `index.html`, så `manifest.json` og `js/*.js`
vart aldri servert. Utan `builds` er det null-konfig statisk hosting.

### Neste steg (vegmodul)
Lengdeprofil/høgd langs senterlinje, terrengflate frå koter, deretter sjølve
vegklasse-modulen (klassetabell, åtvaringar for radius/stigning/fall,
tverrprofil) — avhengig av svar på N100-vs-kommunal-spørsmålet over.

## Mappestruktur / filer

```
Riss/
├── index.html      ← appen: HTML + CSS + hovudskript (inline, ~3500 linjer)
├── js/              ← history.js, layers.js, alignment.js, grips.js, view3d.js
├── manifest.json    ← PWA-manifest (standalone, landscape, ikon 192/512)
├── vercel.json      ← statisk deploy med tryggleiksheadere (ingen ruting)
├── icon-192.png
├── icon-512.png
└── deploy.bat        ← git add -A && commit (spør om melding) && push
```

Ingen build-steg, ingen `package.json`, ingen `node_modules`. Alt køyrer
direkte i nettlesaren frå statiske filer.

## Teknisk oppbygging (i `index.html`)

- Dual-canvas rendering: `#canvas` (innhald) + `#overlay`
  (pekar/hjelpelinjer, `pointer-events:none`), lagt oppå kvarandre i
  `#canvas-host`.
- Alt koordinatsystem er i mm, med målestokk-val i topbaren (t.d. 1:100)
  som styrer skjerm-til-mm-konvertering.
- Snap-system: Endepunkt, Midtpunkt, Perpendikulær, Skjering, Rute — vises
  som av/på-brytarar nedst i vindauget, saman med Shift-vinkellås (standard
  30°) for låst vinkel ved teikning.
- Fargeveljar: HSV-hjul, med Photoshop-aktig forgrunn/bakgrunn-swatch-stabel
  i verktøyraila (klikk for å byte).
- Verktøy i venstre rail (kortkommandoar i parentes): peikar (V), linje/pen
  eller spline (L), rektangel (R), polygon (P), vegg med miter-join (W),
  tekst (T), etikett/leader med 3-klikks-plassering (K), fyll/flood-fill
  (F), målsetjing.
- Interaksjonsmønster: klikk for startpunkt, flytt, klikk for sluttpunkt;
  skriv tal rett etter fyrste klikk for eksakt mål; Shift låser vinkel;
  Esc avsluttar gjeldande teikning.
- `#numeric-chip` gir direkte tal-inntasting for eksakte mål/vinklar under
  teikning.
- Topbar: målestokk-val, "Importer underlag", "Skjermbilde", "Kalibrer",
  "Eksporter", "Del".

## DXF/SOSI-vektorimport (lagt til 27. sept. 2026)

"Importer underlag"-modalen tek no òg `.dxf` og `.sos`/`.sosi`, ikkje berre
bilete. Vektorimport vert konvertert til vanlege, redigerbare Riss-element
(`line`/`polyline`/`poly`) i eigen farge `#2f6690` (skil dei frå eigne
skisser), sentrert i synsfeltet og automatisk valde etter import (Delete
fjernar heile importen om plassering/målestokk er feil — ingen eigen
lag-/låse-mekanisme enno).

- **DXF**: les `HEADER`/`$INSUNITS` for einingskonvertering (mm/cm/m/tommar
  → mm), støttar `LINE`, `LWPOLYLINE` (med bulge→boge-tessellering),
  gamalstil `POLYLINE`/`VERTEX`/`SEQEND`, `CIRCLE`, `ARC`, og `INSERT`
  (blokkreferansar løyst rekursivt inntil 6 nivå via `BLOCKS`-seksjonen).
  **Ikkje støtta enno**: `TEXT`/`MTEXT`, `HATCH`, `DIMENSION`, `SPLINE`,
  `ELLIPSE`, lagfarge/lagsynlegheit frå `TABLES`-seksjonen — vert stillfarne
  ignorerte (ingen feil, berre uteletne).
- **SOSI**: les `..ENHET` frå `.HODE` for koordinatskala og `..TEGNSETT` for
  teiknkoding (UTF-8/ISO8859-1/ANSI/DOSN8). Plukkar opp *alle* objekttypar
  (`.KURVE`, `.LINJE`, `.GRENSE` m.fl.) som har ein inline `..NØ`-
  koordinatblokk. **Ikkje støtta enno**: `.FLATE`/topologiske objekt som
  refererer andre kurver via `.REF` i staden for å liste koordinatar sjølv
  (typisk i matrikkel-/eigedomsdata) — desse manglar geometri og vert
  hoppa over.
- Begge format brukar Y-opp (nord/verkeleg koordinatsystem), medan Riss sitt
  interne world-koordinatsystem er Y-ned (som skjerm-px) — difor vert Y
  snudd ved import (`placeImportedGeometry()` i `index.html`), elles hadde
  importen kome opp-ned.
- **Koordinatsystem på tvers av fleire importar** (lagt til 27. sept. 2026,
  same dag): den globale `geoRef`-variabelen held eit felles verkeleg-verd
  referansepunkt (KOORDSYS-kode + eit meter-punkt i det systemet + kvar det
  hamnar i Riss-world-mm), sett av den *fyrste* geo-eigna importen i økta —
  anten ei SOSI-fil (som alltid har KOORDSYS frå `.HODE`), eller ein DXF med
  usannsynleg store koordinatar (>50 000 m frå 0, heuristikk for "truleg
  alt UTM-absolutte koordinatar"). Alle seinare geo-eigna importar i same
  økt vert plasserte *relativt til `geoRef`*, ikkje sentrerte uavhengig —
  slik hamnar t.d. ei tomtegrense-SOSI og ei bygnings-SOSI frå same
  eigedom rett i høve til kvarandre, ikkje kvar for seg midt i synsfeltet.
  Ein liten "REF"-indikator nedst i statuslinja (`#geoRefStatus`) syner
  aktiv KOORDSYS-kode og lokalt nullpunkt (hover for full presisjon).
  Ulik KOORDSYS-kode mellom importar gir eit tydeleg åtvaringstoast i
  staden for å feilplassere stille. **NB**: `geoRef` er berre i minnet for
  økta (appen har ikkje noka lagre/last-funksjon for prosjekt enno, so alt
  forsvinn ved sideoppdatering), og manuell "Kalibrer" i etterkant vil
  gjere `geoRef`-registreringa ugyldig (kalibrering skalerer/flyttar
  elementa fritt, utanom geoRef sin rekneskap).
- Målestokk er sjeldan 100 % sikker (DXF utan `$INSUNITS`, eller SOSI med
  uvanleg `ENHET`) — appen sin eksisterande "Kalibrer"-funksjon verkar
  uendra som manuell rettar-mekanisme etterpå, akkurat som for
  rasterunderlag.
- **Neste steg** (ikkje gjort): DXF-eksport (for bruk attende i ArchiCAD/
  AutoCAD), lag-/synlegheitsstyring for importert geometri, og — som eige,
  større steg — ein 3D-visingsmodus (sjå historikk i chat/commit for
  bakgrunn: tanken er 3D som ekstrudering av same vegg/element-datamodell,
  ikkje eit separat 3D-datasett).

## Arbeidsflyt for endringar

Når Geir Magne ber om ei endring:

1. Les `index.html` (heile fila — alt er samla der).
2. Gjer endringa direkte i fila.
3. Syntaksjekk. `node --check` verkar ikkje direkte på `.html` (feilar med
   `ERR_UNKNOWN_FILE_EXTENSION`) — trekk ut `<script>`-innhaldet til ei
   mellombels `.js`-fil og køyr `node --check` på den, eller last appen i
   nettlesarpanelet og sjekk konsollen for feil (føretrekt — testar faktisk
   åtferd, ikkje berre syntaks).
4. Publiser:
   ```bash
   cd "C:\Users\gemli\Jottacloud\Lied Lab\Web\Riss"
   git add -A
   git commit -m "Kort skildring av endringa"
   git push
   ```
   (`deploy.bat` gjer det same interaktivt, med spørsmål om commit-melding.)
   Vercel deployer automatisk til `riss.liedarkitektur.no` innan ca. 30 sek.

## Verifisert 27. sept. 2026

Appen vart opna og testa i nettlesarpanelet (`https://riss.liedarkitektur.no`):
lastar utan konsollfeil, full UI synleg (verktøyrail, målestokk, snap,
fargeveljar), og linjeteikning med mm/vinkel-readout vart stadfesta
fungerande.
