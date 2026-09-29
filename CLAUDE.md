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

## 3D-modul (lagt til 30. sept. 2026)

Tredje modul-rail-knapp **3D** (kube-ikon). Ein knapp **"Generer 3D-
modell"** dukkar opp i kart-sidebaren under "Vel utsnitt" med det same
`mapModule.siteExtent` er sett — akkurat den utløysemekanismen som vart
bedt om. Klikk på han (`generate3DModel()`) byter til 3D-modulen og
byggjer terrenget.

**Kva 3D-modellen er i v1 — og bevisst IKKJE er:**
- **Terreng**: ekte høgdedata, ikkje syntetisk. Hentar eit 20×20-rutenett
  (400 punkt) frå Kartverket sitt opne, tokenfrie punkthøgde-API
  (`ws.geonorge.no/hoydedata/v1/punkt`, `koordsys=4258` lat/lon, batcha
  50 punkt per kall via `punkter`-parameteren — stadfesta i praksis at
  tenesta støttar CORS frå nettlesar-`fetch()`, ikkje berre frå
  server-til-server). Terrengflata sin breidd/djupn er rekna i verkelege
  meter (haversine-formel), høgd relativt til lågaste punkt i utsnittet.
  Fargelagt etter høgd (grønn→gul→brun→kvit).
- **INGEN bygningsvolum enno.** Research synte ingen stabil, produksjons-
  klar kjelde for ekte bygningsFOTAVTRYKK (polygon, ikkje berre punkt)
  med stadfesta CORS innanfor rimeleg tidsbruk — `wms.matrikkel` har
  ikkje bygningslag, og den einaste OGC API Features-kandidaten for
  bygningsdata var uttrykkeleg ein "test"-server
  (`ogcapitest.kartverket.no`). Heller enn å byggje på eit usikkert
  fundament vart bygningsvolum utsett.
- **INGEN ekte kartteksur draped på terrenget enno** (t.d. det fargerike
  topografiske grunnkartet du ser i Kart-modulen, projisert ned på
  3D-flata) — ville krevd stadfesta bilete-CORS frå Kartverket sin
  WMTS-flisserver, som IKKJE er verifisert (høgdedata-API-et sin CORS
  seier ingenting om flisserveren sin CORS). Realistisk neste steg, ikkje
  eit urealistisk løfte.
- Navigasjon: `THREE.OrbitControls` (dra=roter, scroll=zoom,
  høgreklikk-dra=panorer) — CDN, Three.js r128 (siste versjon med
  UMD-bygg av OrbitControls som global, kompatibelt med Riss sin
  vanlege `<script>`-utan-modular-arkitektur; nyare Three.js-versjonar
  krev ES-modular som ville brote alle `onclick="…"`-attributta i heile
  fila).
- Kameraet sin standard startvinkel kan i somme tilfelle verte for flat/
  kantvend (avhengig av utsnittet si form/høgdeforskjell) — brukar må då
  dra litt for å få eit betre oversyn. Ikkje forfølgt vidare, kosmetisk.

**Testa** 30. sept. gjennom heile den ekte UI-flyten (ikkje berre JS-kall):
"Vel utsnitt" → rektangel dregen over Oslo sentrum → "Generer 3D-modell"
dukka opp → klikka → terreng generert og navigerbart, stadfesta med
skjermbilete og ein direkte `fetch()`-test av høgdedata-API-et sin CORS
frå nettlesarkonsollen. Ingen konsollfeil.

**Naturlege neste steg** (ikkje uttrykt som prioriterte enno): ekte
bygningsvolum (krev å finne/stadfeste ein brukbar vektor-bygningskjelde),
kartteksur på terrenget (krev å stadfeste flis-CORS, evt. via ein
eigen liten proxy dersom Kartverket ikkje tillèt direkte canvas-bruk),
og å lagre generert 3D-terreng saman med prosjektet i Supabase.

## Mappestruktur / filer

```
Riss/
├── index.html      ← heile appen: HTML + CSS + JS i éin fil (~145 kB)
├── manifest.json    ← PWA-manifest (standalone, landscape, ikon 192/512)
├── vercel.json      ← statisk deploy, rute alt til index.html, tryggleiksheadere
├── icon-192.png
├── icon-512.png
└── deploy.bat        ← git add -A && commit (spør om melding) && push
```

Ingen build-steg, ingen `package.json`, ingen `node_modules`. Alt køyrer
direkte i nettlesaren frå éi fil.

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
