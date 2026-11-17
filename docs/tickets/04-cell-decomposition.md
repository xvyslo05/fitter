# 04 · Cell decomposition in the tracer

**Goal.** Besides the outer outline, the tracer returns the enclosed regions ("cells") inside each piece and which cells touch, so variants and nested sizes can be built as unions of cells.

**Why it matters.** Real patterns draw a short and a long sleeve, or two body lengths, as extra lines inside one outline. Today the import keeps only the largest shape, so the user cannot plan fabric for the version she is actually sewing.

## Context (verified)

- `src/pdf/trace.ts:120-139` already computes `interior` (enclosed, non-barrier pixels). It then merges everything back to one envelope, so inner lines never split a piece.
- `src/pdf/types.ts:25`: `PieceCandidate.sizes: Record<string, Pt[]>` allows one ring per size.
- `src/pdf/group.ts:12-39` matches one ring per size to a reference candidate by shared area.
- Prototype measured on Raglan XXL (purple + black fills, defaults): label 4-connected components of `interior`, grow them through barrier pixels inside `solid` (multi-source BFS), count shared border pixels for adjacency.
  - Pocket: cells 330.3, 120.4, 82.5 cm². Large pocket = all (533.4 vs library 543.2); small = 330.3 + 82.5 (413.0 vs 420).
  - Sleeve: 1244.6, 1165.7, 83.5, 81.3, 77.4, 44.4. Six library variants match unions within 0.4–1.0 %.
  - Body: 2007.2, 143.6, 103.7.
  - Many cells under 0.3 cm² exist (text, marks); see ticket 05.
- Cost in the prototype: one extra labelling pass and one BFS over the raster; Raglan XXL trace stayed near 0.7 s.

## Scope

`src/pdf/types.ts`, `src/pdf/trace.ts`, `src/pdf/group.ts`, `tests/pdf-trace.test.ts`, `tests/local/pdf-trace.test.ts`. Callers that read `candidate.sizes[size]` (`src/pdf/pieces.ts`, `src/pdf/build.ts`, `src/ui/PdfImport.tsx`, `src/ui/PdfPieces.tsx`) must keep compiling.

**Out of scope.** Using cells in drafts or UI (tickets 06, 07), proposals (08), notch filtering (05).

## Approach

Recommended data shape (head chef confirms before coding):
```ts
interface Cell { id: number; ring: Pt[]; areaPt2: number; neighbours: { id: number; sharedPt: number }[]; touchesOutside: boolean }
interface PieceCandidate { id: number; refSize: string; sizes: Record<string, Pt[]>; cells?: Record<string, Cell[]>; labels: string[] }
```
`sizes` keeps the outer ring, so existing callers are unaffected; `cells` is additive.

Steps:
1. In `traceOutlines`, return per outline its cells: label `interior` (4-connected) within each solid component, grow through barrier, trace each grown cell's ring with the same walker and the ticket 02 sanitiser, record adjacency and area.
2. Merge cells smaller than 0.3 cm² into the neighbour with the longest shared border (keeps counts stable; ticket 05 refines).
3. `groupPieces` carries cells along with the ring it assigns.
4. Keep a fast path: a piece with one cell returns `cells` of length 1 without ring tracing.

Rejected: vector planar graph (inputs are bands with gaps; large and risky). Rejected: tracing each inner line style separately and intersecting polygons (cannot handle lines of the same style).

## Acceptance criteria

CI-safe:
- Rectangle 20 × 30 cm with two inner horizontal lines → 1 outline, 3 cells, areas summing to the outline area within 0.5 %, middle cell has 2 neighbours, outer cells 1.
- Two nested rectangles sharing one edge (like graded sizes on a fold) → 2 cells; inner cell area within 1 % of the inner rectangle.
- Existing `tests/pdf-trace.test.ts`, `tests/pdf-pieces.test.ts`, `tests/pdf-build.test.ts` green without edits to their expectations.

Local:
- Raglan XXL: cells ≥ 3 cm² number exactly 3 (pocket), 6 (sleeve), 3 (body).
- For each of `aermel-*` (6 variants), `tasche-gross`, `tasche-klein` in XXL some union of cells is within 1.5 % of library area.
- Celia trace time per size stays under 2 s (existing assertion).

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- Worker message size: cell rings travel through `postMessage`; simplify rings and skip tiny cells.
- A dashed inner line does not close at 1 mm gap, so it creates no cell. Acceptable for now; note it in README.
- Body cell-to-variant mapping for Raglan is only area-matched; do not assert body variants.

## Dependencies

01, 02.

## Size, executor

M. Head chef fixes the types; delegated worker implements. Plan approval needed (architectural: data model, 5+ files compile against it).

## Definition of done

See README "Definition of done". README tracing section describes cells.

## Decisions assumed

- D1 ASSUMED: assisted import (cells feed a user-confirmed picker).
- D3 ASSUMED: no vector tracer.
