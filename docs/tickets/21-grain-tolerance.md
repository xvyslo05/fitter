# 21 · Free grain-direction tolerance

**Goal.** Allow the nester to tilt a piece by a small angle off the grain line (proposed ±3°) when that saves fabric, as a setting that is off for directional fabric.

**Why it matters.** Industrial marker rules allow a small deviation from the warp direction; a few degrees can let pieces interlock and shorten the fabric length the user must buy, without visibly affecting the garment.

## Context (verified)

- `src/nest/types.ts:3`: `Rotation = 'none' | '180' | '90'`. `Placement.angle: 0 | 90 | 180 | 270` (`types.ts:18`), `flipY` for fold pieces.
- `src/nest/raster.ts:57-67` `orientations()`: builds one raster per allowed angle; fold-edge pieces get only 0° and a flip along the fold.
- `src/nest/nest.ts:39-82` `placePass` tries each orientation raster; `nest.ts:125` picks a random orientation index per move.
- `src/model/prepare.ts:130`: directional fabric forces `rotation: 'none'`. Settings type and defaults: `prepare.ts:13-22`; validation `checkInputs` `prepare.ts:53-64`; persistence `src/storage.ts:43-51`.
- Drawing: grain arrow rotated by `placement.angle` (`src/ui/Layout.tsx:115`); orientation text `Layout.tsx:9-15`.
- Conservative rasterisation cost is per orientation (`raster.ts:28-56`); more orientations mean fewer search passes in the same time. Measured: at 0.25 cm raster, passes drop 5–10× versus 0.5 cm and results were worse in 3 of 8 cases (better in 4), so search budget matters.
- The ±3° figure comes from a TUL student's school notes and is **not confirmed**. Ticket 28 collects the exact rule (per piece or per marker, both directions, any fabric-type exceptions).

## Scope

`src/nest/types.ts`, `src/nest/raster.ts`, `src/nest/nest.ts`, `src/model/prepare.ts`, `src/storage.ts`, `src/ui/App.tsx` (setting), `src/ui/Layout.tsx` (arrow and hover text), tests, README.

**Out of scope.** Continuous-angle optimisation. Changing the 0/90/180 options. Per-piece tolerance overrides.

## Approach

Recommended:
1. One constant `DEFAULT_GRAIN_TOLERANCE_DEG = 3` in `src/model/prepare.ts`, commented "confirm value (ticket 28)". Setting `grainTolerance: number` in `Settings`, range 0–5, default **0 (off)** until the value is confirmed; the UI offers a checkbox "Povolit mírné natočení dílů (do 3°)" that sets it to the constant.
2. `NestPiece.tilt?: number` (max degrees). `prepare()` sets it to 0 when the fabric is directional or the piece is a fold-edge piece kept on the fold.
3. `orientations()`: for each base angle add tilted copies at −tilt and +tilt (three rasters per base angle). `Placement` gains `tilt: number` (signed degrees).
4. Search: prefer tilt 0; evaluate tilted variants only for a piece chosen by the random move, so the pass count does not collapse.
5. Layout: arrow rotated by `angle + tilt`; hover text adds "natočeno o 2° od vlákna"; a legend line when any piece is tilted.
6. Scoring unchanged (unplaced count, unplaced area, used length).

Rejected: allowing any angle within the tolerance (search space too large for the raster nester). Rejected: applying the tilt to directional fabric (nap and one-way prints must stay aligned). Rejected: enabling by default before the value is confirmed.

## Acceptance criteria

CI-safe:
- A test pins the constant: `expect(DEFAULT_GRAIN_TOLERANCE_DEG).toBe(3)`, and the default setting is 0.
- `orientations()` with `rotation: '180'`, tilt 3 → 6 rasters with angles 0 and 180 and tilts −3, 0, +3; with `foldEdge: true` → tilt ignored; with tilt 0 → identical to today.
- `prepare()` with a directional fabric gives every piece tilt 0 even when the setting is 3.
- Safety test (as `tests/nest.test.ts` does): with tilt 3 and gap 0.5 on mixed concave pieces, all placements stay inside the fabric and at least 0.5 cm apart (`polygonDistance`).
- Constructed case: two long right-triangle-like pieces that fit a 30 cm width only when one is tilted ≤ 3° → placed with tilt on, unplaced or longer with tilt off.
- Workspace without the new field loads with the default.

Local: with ticket 24's benchmark, record utilisation with tolerance 0 and 3 at 5 s; no pass/fail threshold, numbers only.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- A tilted piece is wider; the bounding-box fit check (`nest.ts:49`) must use the tilted raster.
- SVG/PNG export and print must show the tilt.
- Benefit may be small with a greedy placer; the benchmark numbers decide whether to keep the feature visible.
- Stripes and checks: tilt must be off; there is no pattern-matching setting yet (see ticket 28), so the help text must warn.

## Dependencies

28 for the confirmed value (not blocking: the value is one constant). 24 for measuring benefit.

## Size, executor

M. Head chef (touches nesting core, model, storage and UI). Plan approval needed (7+ files).

## Definition of done

See README "Definition of done". README "Výpočet a jeho meze" and "Použití" describe the option. Strings in Czech.

## Decisions assumed

- D11 CONFIRM VALUE: tolerance 3°, from school notes, unconfirmed. ASSUMED default: off, opt-in at 3°.
- D9 ASSUMED: nesting-quality work comes after import and UX.
