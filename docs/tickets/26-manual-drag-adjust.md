# 26 · Manual drag adjustment of a finished marker

**Goal.** After a polohový plán is computed, the user can drag a piece to a new position; the app prevents overlaps and updates used length and utilisation.

**Why it matters.** A sewist often sees a better spot for one piece, or wants to keep a flaw in the fabric free. Being able to nudge the plan matters more to her than a few percent from a better algorithm.

## Context (verified)

- Result data: `NestResult { placements: { key, x, y, angle, flipY, polygon }[], unplaced, usedLength, utilization, iterations }` (`src/nest/types.ts:14-28`); `polygon` is already translated to its position.
- State: `results: Record<material, NestResult>` in `src/ui/App.tsx:26`; a `snapshot` of jobs and a `stale` flag when inputs change (`App.tsx:27, 48, 55, 203`).
- Drawing: `src/ui/Layout.tsx:99-122` one `<g>` per placement; pointer tracking for the hover read-out converts screen to cm via `getScreenCTM` (`Layout.tsx:70-75`).
- Geometry available: `polygonDistance(a, b)` (`src/geom/polygon.ts:133-141`, exact, O(n·m) per pair), `intersectionArea`, `translate`, `bbox`.
- Rules the nester enforces: pieces inside `0…width` (half width when folded) and within the fixed length if set; pairwise distance ≥ `gap`; fold-edge pieces sit at x = 0 (`src/nest/nest.ts:52-53`); on folded fabric other pieces keep gap / 2 from the fold.
- Utilisation = placed area / (usable width × (fixed length or used length)) (`nest.ts:81`).
- Outline sizes: library pieces have up to about 470 points; an order has 5–20 pieces per material.
- Exports read the live SVG (`src/ui/export.ts`), so moved pieces export correctly without extra work.

## Scope

`src/ui/Layout.tsx`, `src/ui/App.tsx` (state update callback), a new pure module `src/nest/adjust.ts` (move validation and recompute), `src/styles.css`, tests for the module, README.

**Out of scope.** Rotating or flipping by hand (follow-up). Re-running the optimiser around a pinned piece. Persisting adjusted plans across reloads (results are not persisted today).

## Approach

Head chef agrees the interaction with the owner first. Recommended:
1. `adjust.ts`: `tryMove(result, pieces, fabric, gap, key, dx, dy): { result, ok, blockedBy?: string[] }`. It translates the piece, snaps to 1 mm, checks bounds and `polygonDistance ≥ gap − 1e-6` against every other placement (bbox pre-check first), and recomputes `usedLength` and `utilization`.
2. Dragging: pointer capture on the piece; while dragging, draw the piece at the pointer position, red outline when the position is invalid; on release, commit if valid, otherwise return to the last valid position.
3. Fold-edge pieces move only along the fold (dy only).
4. Placing an "unplaced" piece: drag it from the "Nevešlo se" list onto the fabric (stretch goal; cut if time runs out).
5. A badge "Upraveno ručně" on the card and a "Vrátit výpočet" button restoring the computed result. Re-running the computation discards manual moves after a confirmation.
6. Keyboard: arrow keys move the focused piece by 1 cm, Shift + arrow by 1 mm.
7. Touch: same pointer events; requires the piece to be selected by a tap first so that page scrolling still works.

Rejected: free overlap with a warning (a plan with overlapping pieces is wrong, not merely risky). Rejected: raster-based collision check for dragging (rounding would block positions the exact check allows).

## Acceptance criteria

CI-safe, tests for `adjust.ts`:
- Two 10 × 10 squares at x = 0 and x = 20, gap 0.5, fabric 100 wide: moving the second by −9 → ok, new x = 11; by −9.6 → not ok (distance 0.4 < 0.5), `blockedBy` names the first.
- Move beyond the right edge or above y = 0 → not ok.
- Fold-edge piece: `dx ≠ 0` → not ok; `dy` moves allowed.
- Folded fabric: an ordinary piece cannot get closer than gap / 2 to x = 0.
- After moving the lowest piece up, `usedLength` decreases and `utilization` equals placed area / (width × usedLength) within 1e-9.
- Performance: validating one move among 20 pieces of 470 points each takes under 30 ms on the test machine.

Manual: drag works with mouse and on a tablet; invalid drop springs back; SVG export shows the adjusted plan; "Vrátit výpočet" restores.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- Hover read-out and dragging share pointer handlers; keep the read-out working while not dragging.
- The `stale` warning logic compares inputs only; a manual edit must not mark results stale.
- Concave pieces nested inside each other are valid if the distance holds; the exact check handles this.
- Phone screens: dragging small pieces is fiddly; acceptable per D7.

## Dependencies

None. If ticket 21 lands first, moved pieces keep their tilt.

## Size, executor

M–L. Head chef (interaction design plus state changes). Plan approval needed (5+ files, new module).

## Definition of done

See README "Definition of done". README "Použití" describes manual adjustment. Strings in Czech.

## Decisions assumed

- D7 ASSUMED: must work on tablet and desktop; phone is best effort.
- D9 ASSUMED: scheduled after import and UX tickets; may be prioritised ahead of ticket 25 if users ask for it.
