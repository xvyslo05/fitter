# 06 · Variant model in drafts and build

**Goal.** A piece draft can define several variants, each a set of cells, and `buildPattern` writes one pattern piece per variant with `variantGroup` and `variant` filled in.

**Why it matters.** The order editor already lets the user choose "Varianta · rukáv: krátký / dlouhý" for library patterns made offline. Patterns imported in the browser never get that choice, so a short-sleeve project is planned with long-sleeve fabric.

## Context (verified)

- `src/pdf/pieces.ts:5-14`: `PieceDraft` has `variantGroup: string; variant: string` as free text, one outline per candidate. `suggestPieces` always sets both to `''` (`pieces.ts:268`).
- `src/pdf/build.ts:23-49`: one `Piece` per included draft; outline taken from `candidate.sizes[size]`; all sizes rotated about the reference outline's centroid by `90 − grainAngle` (`build.ts:28-29`).
- Model side is ready: `src/model/prepare.ts:28-50` selects pieces by `variantGroup` / `variant`; pieces sharing a variant label in one group are chosen together.
- Ticket 04 adds `candidate.cells[size]: Cell[]` with ring, area, neighbours.
- Library example (offline-built Raglan): group "rukáv" with six variants; group "kapsa" with two.

## Scope

`src/pdf/pieces.ts`, `src/pdf/build.ts`, `src/pdf/types.ts` if a helper type is needed, `tests/pdf-build.test.ts`, `tests/pdf-pieces.test.ts`. Minimal compile fixes in `src/ui/PdfPieces.tsx`.

**Out of scope.** The picker UI (ticket 07), automatic proposals (08).

## Approach

Recommended draft shape:
```ts
interface VariantDraft { label: string; cells: Record<string, number[]> }  // size → cell ids
interface PieceDraft { …existing…; variantGroup: string; variants: VariantDraft[] }  // empty = whole outline, as today
```
1. Add a geometry helper `unionCells(cells: Cell[], ids: number[]): Pt[]` using Clipper union (`src/geom/polygon.ts` has `union` for two rings; add an n-ary form there or locally). Result must be one simple ring; throw a clear error if the selection is disconnected.
2. `buildPattern`: for a draft with variants, emit one `Piece` per variant: id `slug(name)-slug(label)`, name `"<name> – <label>"`, `variantGroup` = draft group or the piece name, `variant` = label, outline = union of that variant's cells per size. Rotation origin stays the reference outline centroid so variants and sizes stay aligned.
3. Fold: snap the chosen fold edge to each variant's own outline with existing `snapFold`; a variant that loses the fold edge is saved without fold and reported.
4. Keep `variant` free-text compatibility: a draft with `variants: []` and a typed `variantGroup` / `variant` behaves exactly as today (two separate candidates can still be grouped by hand).
5. A size missing from a variant's `cells` map is omitted for that variant.

Rejected: storing variants as separate candidates in the trace result (loses the shared piece identity, name and grain). Rejected: storing cut lines and clipping at nest time (changes the file format).

## Acceptance criteria

CI-safe, `tests/pdf-build.test.ts`:
- Synthetic candidate: 20 × 30 cm rectangle with cells of 20 × 20, 20 × 6, 20 × 4 cm stacked. Variants "krátký" = [A], "střední" = [A, B], "dlouhý" = [A, B, C] → three pieces, areas 400, 520, 600 cm² within 1 %, same `variantGroup`, labels as given, all pass `parsePatternFile`.
- Disconnected selection [A, C] → build error naming piece and variant.
- Draft without variants → output identical to today's (snapshot of an existing test case unchanged).
- Fold on the 30 cm edge: each variant's fold length equals its own height within 0.1 cm.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- Union of adjacent grown cells must not leave a sliver along the shared line: cells from ticket 04 are grown to meet, so their union should be gap-free; assert no holes.
- Cell ids differ per size; the UI (07) must map selections across sizes. This ticket only stores per-size ids.
- `JSON.stringify(traced)` is used as a cache key (`PdfImport.tsx:425`); drafts must stay serialisable.

## Dependencies

04.

## Size, executor

M. Head chef (data-model decision). Plan approval needed.

## Definition of done

See README "Definition of done". README "Díly" section documents variants.

## Decisions assumed

- D1 ASSUMED: assisted import; the user confirms which cells form which variant.
