# 25 · Better nester: design spike

**Goal.** Find and prove, on the ticket 24 benchmark, a nesting improvement worth at least +3 percentage points of utilisation at equal time, and write the implementation plan for it.

**Why it matters.** At 63–74 % utilisation roughly a third of the planned fabric is waste. Each point gained is about 2 cm of fabric on a 1.5 m plan.

## Context (verified)

- Algorithm today: conservative raster of each piece inflated by gap / 2 (`src/nest/raster.ts:28-56`); one greedy pass places pieces in a given order at the first free position scanning rows from the top, columns from the left (`src/nest/nest.ts:39-82`); the search swaps two pieces in the order and re-rolls one orientation per iteration, with a full shuffle every 20th iteration (`nest.ts:116-140`); score = unplaced count, unplaced area, used length (`nest.ts:110`).
- Measured (ticket 24 table): 20 s gives the same result as 5 s in 7 of 8 cases at 0.5 cm, so the search stalls early. A 0.25 cm raster is better in 4 of 8 cases, equal in 1 and worse in 3, because passes drop 5–10×.
- Each pass rebuilds the whole board; nothing is reused between passes.
- Orders are small: 5–20 pieces per material.
- Constraints to keep: fold-edge pieces at x = 0 on folded fabric (`nest.ts:52-53`), rotation rules per piece, mirrored pairs prepared upstream, minimum distance = gap (tested in `tests/nest.test.ts`), deterministic for a seed.
- Reference ceiling from a TUL thesis (industrial, not directly comparable): 82–88 %.

## Scope

A design document `docs/nesting-spike.md` (new) and throwaway prototype code kept out of `src/` (scratch folder or a branch). No production change in this ticket.

**Out of scope.** Shipping the new nester (follow-up ticket written from the spike). Grain tolerance (21). Manual adjustment (26).

## Approach

Evaluate these candidates in this order, each as a prototype measured on the benchmark at a fixed pass or time budget:
1. **Compaction pass** after greedy placement: slide each piece up, then left, by raster collision tests until blocked; repeat until no move. Cheap, keeps the raster model.
2. **Insert move** in the order search (remove one piece, insert elsewhere) and **block shift** (move a run of pieces), with simulated-annealing acceptance instead of strict improvement.
3. **Better placement rule**: choose the position minimising the resulting used length, then waste beside the piece, instead of first-fit top-left; try bottom-left with hole filling for small pieces placed last.
4. **Two-phase raster**: search at 1 cm, refine the best order at 0.25 cm.
5. **No-fit polygon** placement with Clipper Minkowski sums: exact contact positions, no raster rounding. Largest effort; evaluate only if 1–4 miss the target.

For each: utilisation delta per benchmark case, runtime, lines of code, risk to the gap guarantee.

Deliverable document: results table, chosen approach with rationale, rejected ones in one line each, file-level implementation plan, test plan (which existing `tests/nest.test.ts` safety checks must keep passing, which new ones are needed), and a size estimate.

## Acceptance criteria

- `docs/nesting-spike.md` exists with the results table covering all 9 benchmark cases for each prototype tried.
- At least one candidate reaches **mean utilisation +3.0 percentage points** over the ticket 24 baseline at equal time (5 s, 0.5 cm) with **no case worse by more than 0.5 point**, and with zero unplaced pieces; or the document states that the target was not reached, with the best result and a recommendation (stop, or go to NFP).
- Prototype placements pass the same safety check as `tests/nest.test.ts:7-21` (inside fabric, pairwise distance ≥ gap).
- `src/` is unchanged; `npm run typecheck && npm run lint && npm test` still green.

## Edge cases and risks

- Improvements on these four patterns may not generalise; include the multi-garment case and the demo pattern.
- Compaction must respect fold-edge pieces (fixed at x = 0) and the fold margin for other pieces.
- Annealing needs a seeded random source to stay reproducible (`seededRandom`, `nest.ts:92-101`).
- NFP with Clipper: the bundled `clipper2-js` 1.2.4 has a known offset bug worked around in `src/geom/offset.ts`; check Minkowski functions before relying on them.

## Dependencies

24 (benchmark must exist first).

## Size, executor

M (time-boxed spike, suggest two working days). Head chef. Plan approval: not for the spike itself (no production code); the resulting implementation ticket will need it.

## Definition of done

Design document written; benchmark numbers reproducible with a stated command; no production code changed.

## Decisions assumed

- D9 ASSUMED: this work is scheduled after import and UX tickets.
