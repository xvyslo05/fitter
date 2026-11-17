# 02 · Guarantee simple outline rings

**Goal.** Every ring leaving `traceOutlines` is a simple polygon, whatever the input.

**Why it matters.** A non-simple outline is rejected only at the very last wizard step (`parsePatternFile`), after the user has named every piece. The tracer should never hand over a ring that cannot be saved.

## Context (verified)

- `src/model/pattern.ts:73-74` rejects outlines failing `isSimple` (`src/geom/polygon.ts:122-132`).
- `src/pdf/trace.ts:143-173`: 8-connected component fill, then a pixel-centre boundary walk, then Douglas–Peucker (`simplify`, `trace.ts:34-47`, tolerance 0.3 mm). A component joined through a 1-px neck or a diagonal contact makes the walk visit a pixel twice.
- After the ticket 01 fix was simulated, Raglan with `gapMm: 4` still produced one non-simple body ring (252 points). So ticket 01 alone is not a guarantee.
- `union(ring, ring)` from `src/geom/polygon.ts:58-60` does not repair a self-touching ring (measured).

## Scope

`src/pdf/trace.ts` (or a new small `src/pdf/ring.ts`), `tests/pdf-trace.test.ts`, `tests/local/pdf-trace.test.ts`.

**Out of scope.** Changing how pieces are detected; UI messages (ticket 03).

## Approach

Recommended, in this order inside `traceOutlines` before a ring is pushed:
1. Remove 1-px necks from `solid` with a 3 × 3 opening before labelling (cheap, removes most pinches).
2. After the boundary walk, split the raw ring at repeated vertices and keep the loop with the largest area.
3. Run `simplify`, then check `isSimple`. If it fails (simplification can create a crossing), retry `simplify` with half the tolerance up to three times; if still failing, drop the ring and count it.
4. Return dropped-ring counts so the UI can report them later (extend the return type only if cheap; otherwise leave a TODO-free note in the test).

Rejected: Clipper union as the only repair (measured not to work). Rejected: switching to pixel-edge (crack) contours now; larger change, same pinch issue at lattice corners.

## Acceptance criteria

CI-safe:
- Unit test for the loop-splitting helper: a figure-8 ring whose lobes have areas 100 and 30 returns the 100 lobe, `isSimple` true.
- Synthetic trace: two rectangles joined by a 0.5 mm wide bridge yields rings that all pass `isSimple`.
- Property-style test: 50 seeded random blobs (union of random rectangles drawn as strokes) → all returned rings simple.

Local:
- Raglan with `gapMm` 1, 2, 4 and 6: every ring simple in every size.
- Gyda, Fiona, Celia area assertions unchanged (the 3 × 3 opening must not move areas by more than 0.1 %).

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- The 3 × 3 opening can delete legitimately thin pieces (a 1 mm strap). Minimum piece area is 15 cm², so a strap thinner than 1.5 mm is not a real case, but assert Fiona's 3.5 × 26 cm strap still appears.
- `isSimple` is O(n²); rings have up to about 800 points, fine.

## Dependencies

01 (do first; this ticket assumes the slits are gone).

## Size, executor

S. Delegated worker. No plan approval.

## Definition of done

See README "Definition of done".

## Decisions assumed

- D3 ASSUMED: raster tracer stays.
