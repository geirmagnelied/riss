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
- Lokal statisk dev-server for testing: `preview_start` med namn
  `riss-static` (definert i `LiedLab/.claude/launch.json`, sidan
  Claude Code-sesjonen sitt arbeidsrotpunkt er `LiedLab`, ikkje `Riss` —
  peikar på `../Riss` og køyrer `npx http-server` på port 5588).

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
