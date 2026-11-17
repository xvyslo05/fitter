# 09 · Same outline for all sizes; rectangle pieces by dimensions

**Goal.** In wizard step 3 the user can mark a piece as identical in every size, and can add a rectangular piece by typing its width and height.

**Why it matters.** Pockets and plackets are often printed once for all sizes, and cuffs, waistbands and bindings are often given only as measurements in the instructions. Without these two tools such patterns import incomplete and the fabric plan is too small.

## Context (verified)

- Dandelion: three one-size pieces (library areas 387.5, 207.1, 79.8 cm²) are drawn in the style of sizes 42/48 and so appear only in those sizes after tracing.
- Offline-built library patterns contain rectangle pieces that the browser import cannot create: Alexia cuff and sleeve placket; 7 of 21 Raglan pieces (rib bands, collar) are 4-point rectangles with per-size dimensions.
- `src/pdf/pieces.ts:5-14` `PieceDraft`; `src/pdf/build.ts:23-49` builds pieces only from `result.candidates`; sizes come from `candidate.sizes` keys (`build.ts:31`).
- `src/ui/PdfPieces.tsx:112-123` renders one card per draft.
- Pattern format: outline in cm, grain along +y, bbox and area required (`src/model/pattern.ts:5-10`).

## Scope

`src/pdf/pieces.ts`, `src/pdf/build.ts`, `src/ui/PdfPieces.tsx`, `src/ui/PdfImport.tsx` (state for added rectangles), `src/styles.css`, `tests/pdf-build.test.ts`.

**Out of scope.** Editing pieces of patterns already in the library. Free-form drawing. "Shorten a piece at a measured length" (note it as a follow-up; Dandelion skirt lengths need it).

## Approach

Recommended:
1. `PieceDraft.allSizes: boolean` (default false). `buildPattern` copies the reference outline to every size in `meta.sizes` when set. Suggest `true` when a candidate exists in fewer sizes than the pattern has and its outlines are identical within 1 mm.
2. Card checkbox: "Stejný pro všechny velikosti".
3. Rectangle drafts: a separate list `rectangles: { name; cut; sizes: Record<size, { width; height }>; optional; variantGroup; variant }[]`. `buildPattern` appends pieces with outline `[[0,0],[0,h],[w,h],[w,0]]` (matches the offline builder's orientation), bbox `[w, h]`, area `w × h`.
4. UI: button "+ Přidat obdélníkový díl (podle rozměrů)" under the grid; a card with name, counts, width and height in cm, "Délka je po směru vlákna" hint, and a toggle "Rozměry se liší podle velikosti" that expands a small table.
5. Validation: width and height > 0 and ≤ 1000 cm; name required.

Rejected: making the user draw the rectangle on the sheet (measurements are in the instructions, not on the sheet). Rejected: a separate "edit pattern" screen (larger scope).

## Acceptance criteria

CI-safe, `tests/pdf-build.test.ts`:
- Candidate present only in size "42" with `allSizes: true`, pattern sizes 34–50 → piece has all sizes with identical outlines; passes `parsePatternFile`.
- Rectangle 7 × 44 cm, cut 2 × "hlavní", one dimension for all sizes → piece in every size, area 308, bbox [7, 44].
- Rectangle with per-size table (S: 6 × 17, M: 6 × 17.5) → areas 102 and 105.
- Zero or negative dimension → `draftProblems`-style message, save blocked.
- Existing build tests unchanged.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- Duplicate ids: rectangle names go through the same `uniqueId` path (`build.ts:40`).
- A pattern consisting only of rectangles is valid; step 3 "at least one piece" check must count them.
- Decimal comma input ("17,5") must parse (see `number()` in `PdfImport.tsx:26`).

## Dependencies

None. (Becomes richer with 06, but does not need it.)

## Size, executor

S. Delegated worker. Plan approval needed only because it touches 5 files; the design above is the plan to approve.

## Definition of done

See README "Definition of done". README "Díly" section documents both controls.

## Decisions assumed

- D1 ASSUMED: assisted import.
