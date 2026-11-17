# 07 · Variant picker UI (tap cells)

**Goal.** In wizard step 3 the user creates variants of a piece by tapping the parts of its picture that belong to each variant.

**Why it matters.** "Krátký rukáv" is something a sewist can point at on the pattern. "Skupina variant" and "Varianta" as two empty text boxes are not.

## Context (verified)

- `src/ui/PdfPieces.tsx:23-54`: `Thumbnail` draws the reference outline, other sizes, clickable straight edges for the fold, and the grain arrow, in sheet coordinates.
- `src/ui/PdfPieces.tsx:105-106`: two free-text inputs "Skupina variant" and "Varianta".
- After tickets 04 and 06: `candidate.cells[size]` holds cells with rings and neighbours; `PieceDraft.variants: { label, cells: Record<size, number[]> }[]`.
- Cell ids are per size. Cells of different sizes correspond when they overlap most (same rule as `groupPieces`, `src/pdf/group.ts:21-33`).
- Hover is not available on touch devices; the existing fold picker already uses click with a 16 px tolerance (`PdfPieces.tsx:36-43`).

## Scope

`src/ui/PdfPieces.tsx`, `src/styles.css`, a small pure helper module (e.g. `src/pdf/variants.ts`) for cross-size cell mapping, tests for the helper.

**Out of scope.** Auto-proposals (ticket 08), changes to tracing or build.

## Approach

Recommended interaction (head chef approves wording and layout first):
1. A piece with more than one cell (≥ 3 cm²) shows "Tento díl má více částí" and a button "Rozdělit na možnosti".
2. In that mode the thumbnail shows cells with thin separators. A list of variants sits beside it; each has a name field (placeholder "např. krátký rukáv") and a colour dot. The first variant starts with all cells selected.
3. Tapping a cell toggles it for the active variant. Selected cells are filled; others hatched grey.
4. The selection is made on the reference size and mapped to other sizes by the helper: for each selected reference cell, the cell of the other size with the largest shared area.
5. A disconnected selection shows "Vybrané části na sebe nenavazují" and blocks "Další".
6. The group name defaults to the piece name; it is editable under "Upřesnit".
7. Remove the two free-text inputs from the default view; keep them under "Upřesnit" for hand-grouping separate candidates.

Rejected: drawing a cut line by hand (needed only for patterns without printed lines; ticket 09 note). Rejected: a table of cells with checkboxes (not visual).

## Acceptance criteria

CI-safe:
- Helper `mapCells(refCells, otherCells, ids)` unit tests: three stacked cells in two sizes scaled 10 % apart map 1:1; a cell missing in the other size maps to nothing.
- Helper `isConnected(cells, ids)` true for [A, B], false for [A, C] in a 3-stack.
- `draftProblems` (`PdfPieces.tsx:12-20`) reports an empty variant name and a disconnected selection.

Manual (owner, on the deployed build, Raglan):
- Sleeve: create "krátký" and "dlouhý", save, both appear under one "Varianta" select in the order editor and nest with different lengths.
- Pocket: "malá" and "velká".
- Works with touch on a tablet.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- Many tiny cells: show only cells ≥ 3 cm²; smaller ones follow their largest neighbour.
- Up to 9 sizes: mapping errors are possible where sizes differ a lot; show the other sizes' result outline faintly so the user sees a wrong mapping.
- Keyboard access: cells need focusable buttons or a list alternative.

## Dependencies

06 (and 04 through it).

## Size, executor

M. Head chef (interaction design, needs owner feedback on screenshots). Plan approval needed (design decision).

## Definition of done

See README "Definition of done". New UI strings in Czech. README "Díly" section updated.

## Decisions assumed

- D1 ASSUMED: assisted import.
- D7 ASSUMED: import targets tablet and desktop, not phones.
- D8 ASSUMED: "Skupina variant" is renamed "Možnosti dílu" (ticket 23).
