# 05 · Drop notch cells and tiny junk

**Goal.** Notch marks and small symbols no longer leave bumps or dents on outlines, and junk candidates are not offered as pieces.

**Why it matters.** Bumpy outlines look wrong to a sewist and waste fabric in the plan; a list of "pieces" that are really size tables makes step 3 confusing.

## Context (verified unless marked)

- A small mark touching the outline from inside leaves an inward dent (seen in a raster crop of the Raglan sleeve corner): the pixels between mark and line are barrier and were not regrown. Ticket 01 fills these.
- Outward bumps (inferred, not observed directly): a closed notch shape (triangle, double line) straddling the outline encloses a few pixels, which count as `interior` and are merged into the piece. Open spurs have no interior and cannot bump by more than about 1 px (`src/pdf/trace.ts:134-139`).
- With ticket 04, such a notch is a tiny cell with `touchesOutside: true`.
- Junk candidates: Raglan gives 5 extra candidates of 35–95 cm² per size (areas 94.9, 69.8, 46.1, 34.7, and 67.1 in S). `src/pdf/pieces.ts:267` excludes only candidates with no label and area under 25 cm², or table-like labels (`pieces.ts:233-234`).
- Several of those junk candidates consist of a grid of equal cells (prototype: 6–12 cells of 5.4–6.0 cm² each), i.e. tables.

## Scope

`src/pdf/trace.ts` (cell filtering), `src/pdf/pieces.ts` (`suggestPieces` include rule), `tests/pdf-trace.test.ts`, `tests/pdf-pieces.test.ts`, local tests.

**Out of scope.** Removing marks before rasterising; storing notches in the pattern format.

## Approach

Recommended:
1. After cells are built, delete a cell from the piece (subtract it from the outer ring) when its area is under 1 cm² and it touches the outside and its shared border with the rest of the piece is shorter than its own perimeter / 2. Re-trace the outer ring of the affected piece from the remaining cell mask.
2. Merge all other cells under 0.3 cm² into their neighbour (already in ticket 04).
3. In `suggestPieces`, default `include: false` for a candidate that has 4 or more cells whose areas are within 15 % of each other and together cover over 80 % of the candidate (a grid).
4. Keep the user able to switch any candidate back on.

Rejected: filtering short perpendicular marks before tracing (more heuristics, can delete real geometry). Rejected: a 1–2 mm opening of the whole solid (rounds corners up to 0.4 mm; keep as fallback only).

## Acceptance criteria

CI-safe:
- Rectangle 20 × 30 cm with a closed 3 mm triangular notch on one edge, apex outward: outline area within 0.1 cm² of the same rectangle without the notch.
- Rectangle with a 3 mm filled dot touching the outline from inside: area within 0.1 cm² of the plain rectangle (guards the ticket 01 behaviour).
- A 3 × 4 grid of 2 × 3 cm boxes is traced as one candidate and `suggestPieces` returns `include: false` for it.
- A real 3-strip piece (cells 500, 60, 40 cm²) keeps `include: true`.

Local:
- Raglan: at most 1 included candidate per size under 100 cm² (today 4–5).
- Gyda, Fiona, Celia: included piece counts unchanged (5, 4, 5).

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- A genuine small piece (a 2 × 3 cm tab) must survive: rule 1 applies to cells, not to whole candidates, and only under 1 cm².
- Gyda's two 55 cm² pieces must stay included.

## Dependencies

04.

## Size, executor

S. Delegated worker. No plan approval.

## Definition of done

See README "Definition of done". README "Díly" bullet on **Použít** mentions the grid rule.

## Decisions assumed

- D3 ASSUMED: raster tracer stays.
