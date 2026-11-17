# 24 · Nesting benchmark script (local, not CI)

**Goal.** A repeatable local benchmark that prints fitter's fabric utilisation and used length for a fixed set of orders, so nesting changes can be compared with numbers.

**Why it matters.** Every centimetre saved is fabric the user does not have to buy. Without a fixed benchmark nobody can tell whether a nesting change helped.

## Context

Verified (commit 8045a1a, desktop, fabric 140 cm, default settings: gap 0.5 cm, seam 1 cm where the pattern has none, mirrored pairs on, seed 42; material "hlavní"):

| Pattern, size | Folded | 5 s @ 0.5 cm | 20 s @ 0.5 cm | 5 s @ 0.25 cm |
|---|---|---|---|---|
| alexia-kleid 34 | no | 196.2 cm, 68.0 % | 196.2, 68.0 % | 195.5, 68.3 % |
| alexia-kleid 34 | yes | 210.7, 63.3 % | 210.7, 63.3 % | 203.9, 65.4 % |
| alexia-kleid 52 | no | 274.9, 66.2 % | 268.9, 67.7 % | 264.0, 69.0 % |
| alexia-kleid 52 | yes | 261.6, 69.6 % | 261.6, 69.6 % | 286.0, 63.7 % |
| celia 44 | no | 120.0, 69.7 % | 120.0, 69.7 % | 121.7, 68.7 % |
| celia 44 | yes | 147.2, 64.0 % | 147.2, 64.0 % | 147.2, 64.0 % |
| raglan-hoodie-alex L | no | 141.3, 73.4 % | 141.3, 73.4 % | 144.0, 72.1 % |
| raglan-hoodie-alex L | yes | 142.0, 73.1 % | 142.0, 73.1 % | 139.8, 74.3 % |

Observations: utilisation 63–74 %; 20 s equals 5 s in 7 of 8 rows; the finer raster is better in 4 rows, equal in 1 and worse in 3 (passes drop 5–10×), so it is not a reliable gain.

Reference figures supplied by the product owner from a TUL thesis (industrial markers): overall yields 82–88 %. Manual: Investronica 86.0 %, AccuMark 87.3 %, NestMakerXQ 82.23 %. Automatic: 85.3 %, 88.3 %, 69.78 % (same order). These are **not directly comparable**: industrial markers combine many garments and sizes on wide fabric, with different gap, grain and seam rules; home orders are one garment with few large pieces. Use them as a ceiling for orientation only.

Code facts:
- `nest(pieces, fabric, options, onProgress)` in `src/nest/nest.ts:102-142`; time is wall-clock, so results depend on machine speed; a seed makes the candidate sequence repeatable (`nest.ts:92-101`).
- `prepare()` and `makeOrder()` in `src/model/prepare.ts`; `parsePatternFile` in `src/model/pattern.ts`.
- Utilisation definition: placed cut area / (usable width × used length) (`nest.ts:81`).
- `tests/local/*` tests skip when private folders are missing (`describe.skipIf(!present)` pattern, see `tests/local/pdf-trace.test.ts:14-15,46`).

## Scope

New `tests/local/nest-benchmark.test.ts`; README "Vývoj" gets two lines on how to run it.

**Out of scope.** Changing the nester. CI integration. Publishing results.

## Approach

Recommended:
1. Fixed case list as in the table (4 pattern/size pairs × folded yes/no), plus one multi-garment case: celia 44 × 2 and raglan L × 1 in one order per material.
2. To remove machine dependence, add a pass-count budget for the benchmark: call `nestOnce`-style passes through a small local loop, or pass `shouldStop` to `nest` that stops after N passes (`nest.ts:102` accepts `shouldStop`). Report both "N = 300 passes" and "5 s wall clock".
3. Print one line per case: pieces, unplaced, used length (1 decimal), utilisation (1 decimal), passes, milliseconds. Numbers and ids only.
4. Print the reference block with the thesis figures and the "not comparable" sentence.
5. Assertions are loose guards only: no unplaced pieces; utilisation ≥ baseline − 1.0 percentage point per case at the fixed pass budget (baseline values stored in the test file from the first run on the fixed-pass mode).
6. Run with `npx vitest run tests/local/nest-benchmark.test.ts`. Mark the file so the default `npm test` does not spend minutes on it: guard behind `process.env.FITTER_BENCH === '1'` in addition to the private-folder check.

Rejected: wall-clock-only benchmark (not repeatable across machines). Rejected: putting it in CI (private patterns, long runtime).

## Acceptance criteria

- `npm test` runtime does not grow by more than 1 s (benchmark skipped without the env variable); 189 existing tests still pass.
- `FITTER_BENCH=1 npx vitest run tests/local/nest-benchmark.test.ts` prints 9 case lines and the reference block and finishes in under 3 minutes.
- Two consecutive runs in fixed-pass mode print identical used length and utilisation for every case.
- In wall-clock mode on the owner's machine, the eight single-garment cases land within ±1.0 percentage point of the table above at 5 s, 0.5 cm.
- Without `patterns/`-style private folders (`library/` missing) the file reports skipped, not failed.
- `npm run typecheck && npm run lint` green.

## Edge cases and risks

- Only `library/` is needed (not `patterns/`); adjust the presence check accordingly.
- The table values come from one machine; record the new machine's own baseline on first run rather than hard-coding the table.
- Piece counts differ by folded mode (20 vs 13 for Alexia) because fold pieces stay halves; print the count.

## Dependencies

None.

## Size, executor

S. Delegated worker. No plan approval.

## Definition of done

`typecheck`, `lint`, `npm test` green; README "Vývoj" documents the command; nothing from `library/` is printed beyond ids and numbers.

## Decisions assumed

- D9 ASSUMED: nesting quality work is scheduled after import and UX; this benchmark only prepares for it.
