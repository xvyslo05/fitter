# fitter ticket briefs

Twenty-nine work items from the November 2026 analysis. Each `NN-slug.md` is written for a worker who has not seen the analysis. Shared background lives here once; tickets refer to it.

## Shared background

**Product.** fitter is a static in-browser app (Vite, TypeScript strict, Preact, Clipper2, pdfjs-dist, IndexedDB), deployed to GitHub Pages. It lays irregular sewing-pattern pieces onto fabric and has a four-step PDF import wizard that turns tiled A4 pattern PDFs into `fitter-pattern@1` JSON. UI is Czech only today.

**Target user.** Non-technical women who sew at home. They own PDF patterns, not JSON files. They do not know what a raster step, a pt, or a variant group is.

**Module map.**
- `src/model/` pattern validation (`pattern.ts`), order preparation (`prepare.ts`), demo pattern.
- `src/geom/` polygon helpers and Clipper wrappers, cm units, y down.
- `src/nest/` raster nester and worker.
- `src/pdf/` import pipeline: `readPdf` → `match` (page furniture) → `layout` / `place` (tiles) → `styles` → `scale` → `trace` (raster flood fill) → `group` → `pieces` (names, counts, fold, grain) → `build`.
- `src/ui/` Preact components. Wizard: `PdfImport.tsx` (steps 1–2 and shell), `PdfPieces.tsx` (step 3), `PdfSave.tsx` (step 4).
- `tests/` synthetic, CI-safe. `tests/local/` needs the private folders `patterns/`, `library/`, `tools/pattern-extract/configs/`; these are git-ignored and the tests skip themselves when the folders are missing.

**Commands.** `npm run typecheck`, `npm run lint`, `npm test` (19 files, 189 tests green at commit 8045a1a, including `tests/local` on the owner's machine).

**Private data rule.** Never copy pattern geometry, texts or file contents from `patterns/` or `library/` into source, tests, docs or commits. Local tests print numbers and piece ids only.

**Key measured facts** (commit 8045a1a, defaults: raster 0.5 mm, gap 1 mm, min area 15 cm²):
- `src/pdf/trace.ts:60` measures line width for stroked paths only. Patterns whose lines are filled bands (Raglan ALEX, band width about 1 mm) get too little regrow at `trace.ts:138`, leaving 1-px slits along inner lines. Result: self-touching sleeve outline in all five sizes (save fails in step 4), body traced at 2251.9 cm² instead of 2374.4, and about 1 % area deficit elsewhere.
- Forcing the correct width in a scratch copy gave: sleeve simple, 2712.7 (library 2724.2); body 2362.4 (2374.4); hood 1167.6 (1175.8); large pocket 537.9 (543.2).
- Labelling the enclosed regions ("cells") the tracer already computes reproduces Raglan XXL variants as unions of cells: pocket cells 330 + 120 + 83; sleeve cells 1245, 1166, 84, 81, 77, 44; body cells 2007, 144, 104. All six sleeve variants and both pockets match the library within 1.8 %.
- Dandelion: a style assigned to two sizes gives both sizes the outer outline (34 = 44 = 4868 cm²). Ordering cells outward from the largest gives back bodice 763 / 951 against library 766.4 / 948.0.
- Alexia ("košilové šaty"): one line style carries all ten sizes and the pieces overlap on the sheet; tracing yields three blobs. Treated as unsupported.
- Nesting on 140 cm fabric: utilisation 63–74 % on four library cases; 20 s of search gave the same result as 5 s in 7 of 8 cases at 0.5 cm raster.

**Definition of done for every code ticket.** `npm run typecheck`, `npm run lint` and `npm test` are green; README updated where behaviour changes; Czech UI strings stay Czech (until ticket 17 adds English); no unrelated edits; nothing from private folders committed.

**Plan approval.** Per the owner's rules, a change touching 5 or more files, or an architectural decision, needs an approved plan before coding. Each ticket says whether this applies.

## Assumed product decisions

These are the analyst's recommendations, not confirmed by the product owner. Every ticket lists the ones it relies on, marked ASSUMED.

| Id | Question | Assumed answer | Status |
|---|---|---|---|
| D1 | Fully automatic import, or assisted import that always ends in a usable pattern? | Assisted | ASSUMED |
| D2 | Support sheets where pieces overlap in one line style (Alexia)? | No; detect and explain | ASSUMED |
| D3 | Build a vector planar-graph tracer? | No; keep raster, add cells | ASSUMED |
| D4 | 1:1 tiled marker print? | Not yet; one-page printable plan first | ASSUMED |
| D5 | Units in the English version | cm and inch as a display setting, cm internally | ASSUMED |
| D6 | JSON import/export prominence | Move to Advanced; add whole-library backup | ASSUMED |
| D7 | Phone support | View and nest only; import on tablet or desktop | ASSUMED |
| D8 | Rename core nouns | Yes (ticket 23), before i18n extraction | ASSUMED |
| D9 | Invest in nesting quality now? | After import and UX work | ASSUMED |
| D10 | Licence and hosting notice | Open; no ticket depends on it | OPEN |
| D11 | Grain tolerance value (ticket 21) | 3° | CONFIRMED (TUL-ZEL/11) |
| D12 | Default gap between pieces (ticket 22) | 0.5 cm unchanged | CONFIRMED (TUL-ZEL/12) |
| D13 | How fitter earns money (ticket 29) | none; candidates in the ticket | OPEN |

## Index

Executor: HC = head chef (design or needs conversation context), W = delegated worker.

| # | Title | Size | Depends on | Executor | Open decisions |
|---|---|---|---|---|---|
| [01](01-trace-fill-band-regrow.md) | Tracer fills the whole barrier (fill-band lines) | S | – | W | D3 assumed |
| [02](02-guarantee-simple-rings.md) | Guarantee simple outline rings | S | 01 | W | D3 assumed |
| [03](03-friendly-build-failure.md) | Friendly failure in wizard step 4 | S | – | W | D1 assumed |
| [04](04-cell-decomposition.md) | Cell decomposition in the tracer | M | 01, 02 | HC types, W code | D1, D3 assumed |
| [05](05-drop-notch-cells.md) | Drop notch cells and tiny junk | S | 04 | W | D3 assumed |
| [06](06-variant-model.md) | Variant model in drafts and build | M | 04 | HC | D1 assumed |
| [07](07-variant-picker-ui.md) | Variant picker UI (tap cells) | M | 06 | HC | D1, D7, D8 assumed |
| [08](08-auto-variant-proposals.md) | Auto-proposals: nested sizes, stacked strips | M | 04, 06 | HC | D1 assumed |
| [09](09-shared-outline-and-rectangles.md) | Same outline for all sizes; rectangle pieces | S | – | W | D1 assumed |
| [10](10-detect-unsupported-sheets.md) | Detect unsupported sheets | S | 04 | W | D2 assumed |
| [11](11-wizard-step1-confirm.md) | Wizard step 1 collapsed to a confirmation | S | – | W | D1 assumed |
| [12](12-wizard-step2-tap-lines.md) | Wizard step 2: tap a line, hide raster knobs | L | 11, 27 | HC | D1, D7 assumed |
| [13](13-main-screen-simplification.md) | Main screen simplification | M | 23 | HC wording, W code | D6, D8 assumed |
| [14](14-printable-plan.md) | Printable one-page plan | S–M | – | W | D4 assumed |
| [15](15-i18n-extract-ui-strings.md) | i18n stage 1: UI strings to a dictionary | M | 23, 13 | W | D8 assumed |
| [16](16-i18n-error-codes.md) | i18n stage 2: error codes | M | 15 | W | – |
| [17](17-english-locale-and-units.md) | English dictionary, locale switch, units | M | 15, 16 | W, HC reviews wording | D5 assumed |
| [18](18-english-import-vocabulary.md) | English vocabulary in import heuristics | S–M | – | W | D5 assumed |
| [19](19-library-backup-restore.md) | Library and project backup/restore | S | – | W | D6 assumed |
| [20](20-pdf-layers.md) | PDF layers as size hints | M | – | HC decides, W code | D1 assumed |
| [21](21-grain-tolerance.md) | Free grain-direction tolerance | M | 28 for the value | HC | D11 confirmed |
| [22](22-gap-default.md) | Gap default as one pinned constant, help text | S | 28 for the value | W | D12 confirmed |
| [23](23-terminology-rename.md) | Rename to "polohový plán" and plain nouns | S–M | – | HC wording, W code | D8 assumed |
| [24](24-nesting-benchmark.md) | Nesting benchmark script | S | – | W | D9 assumed |
| [25](25-better-nester-spike.md) | Better nester: design spike | M (spike) | 24 | HC | D9 assumed |
| [26](26-manual-drag-adjust.md) | Manual drag adjustment of a marker | M–L | – | HC | D7, D9 assumed |
| [27](27-scale-yes-no.md) | Scale step as a yes/no question | S | – | W | D1 assumed |
| [28](28-marker-rules-spec.md) | Marker rules from the TUL notes (no code) | S | – | HC | D11, D12 confirmed |
| [29](29-monetization.md) | Monetization: choose a model and test it | S | – | HC + owner | D13 open |

Marker rules from the TUL lecture: [marker-rules.md](../marker-rules.md); full comparison and follow-up tickets: [plan-tul-polohovani.md](../plan-tul-polohovani.md).

## Recommended order

1. **Unblock Raglan save:** 01, 02, 03.
2. **Cheap wins, independent:** 09, 11, 27, 22, 24, 28.
3. **Shared lines and variants:** 04, 05, 06, 07, 08, 10.
4. **Wording, then main screen and print:** 23, 13, 14, 19.
5. **English:** 15, 16, 17, 18.
6. **Wizard step 2 redesign:** 12 (largest UI item; benefits from 04–08 being stable).
7. **Marker rules and nesting quality:** 21 (after 28 confirms the value), 25 (after 24), 26.
8. **Optional:** 20.

Tickets 21 and 22 can be built before the values are confirmed, because both isolate the value in one constant pinned by a test.
