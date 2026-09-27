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
