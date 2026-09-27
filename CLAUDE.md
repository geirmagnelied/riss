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

## Start-side (lagt til 28. sept. 2026 — **mellombels, svart-kvitt design**)

`index.html` opnar no på ei enkel start-side (`#startScreen`, styrt av
`body.pre-start`-klassen) før sjølve skisseverktøyet vert synleg:

- **"Bruk utan innlogging"** → `enterApp()`: fjernar `pre-start`, skjuler
  `#startScreen`, køyrer `resizeCanvases()`+`render()` på nytt (canvasen er
  `display:none` og difor 0×0 px medan start-sida vises — VIKTIG at
  storleiken vert rekna på nytt når han blir synleg, elles vert
  `CW`/`CH` verande 0 og heile koordinatsystemet brotne). Gir i dag
  nøyaktig same (gjeste-)åtferd som appen alltid har hatt.
- **"Logg inn"** → viser berre eit `startNote`-varsel ("kjem i neste
  steg") — det finst enno ingen ekte autentisering eller backend.
- Geir Magne har sagt han kjem tilbake med eigne tankar om det visuelle
  designet — noverande utsjånad (svart/kvit/grå, ingen aksentfarge) er
  eit **minimalt, mellombels** utgangspunkt, ikkje eit endeleg design.
- **Neste store steg** (uttrykt som viktig av Geir Magne, ikkje bygd
  enno): ekte prosjektomgrep — brukar skal kunne opprette/opne prosjekt og
  lagre teikningar/modellar for seinare redigering. Krev ein backend
  (Supabase er nærliggande, sidan det alt er i bruk i LiedLab-prosjektet)
  — ingen slik integrasjon finst i Riss enno.

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
