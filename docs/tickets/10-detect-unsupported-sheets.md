# 10 · Detect unsupported sheets

**Goal.** When a pattern sheet draws overlapping pieces of all sizes in one line style, say so clearly instead of showing meaningless blobs.

**Why it matters.** The user should learn in ten seconds that this pattern cannot be imported, not after an hour of trying settings she does not understand.

## Context (verified)

- Alexia ("košilové šaty makerist.pdf"): after furniture removal the sheet has 2 styles; one black 1 pt stroke style holds 578 paths, about 133 m of line, for all ten sizes. Pieces overlap each other on the sheet (library piece areas for one size sum to more than the sheet area).
- Assigning that style to `uni` gives 3 candidates: 3950 and 2649 cm² (both non-simple) and 27 cm².
- Cell prototype on the same input: 163 cells of at least 3 cm² in the first blob and 90 in the second (387 and 175 counting cells down to 0.3 cm²); 41 and 19 adjacency levels.
- For comparison, per-size traces of supported patterns: Raglan sleeve 6 cells ≥ 3 cm², Dandelion pieces 3–11.
- Caution: assigning every style of a multi-size pattern to one size also gives many cells (Dandelion all strokes at once: 456 in one blob; Celia: up to 23 per piece). That is a user mistake, not an unsupported sheet; the message in step 3 below should cover both ("nebo jste jedné velikosti přiřadili čáry více velikostí").
- `suggestAssignments` (`src/pdf/trace.ts:252-262`) returns nothing for Alexia, so the user faces an empty style table.
- The offline tool handles Alexia only with a hand-written script (`tools/pattern-extract/special/alexia-kleid_build.py`).

## Scope

`src/pdf/trace.ts` (a detection helper using trace output), `src/ui/PdfImport.tsx` (message in step 2), `tests/pdf-trace.test.ts`, `tests/local/pdf-trace.test.ts`.

**Out of scope.** Supporting such sheets (vector strand tracing).

## Approach

Recommended:
1. `sheetProblem(result): 'overlapping' | null`. Report `'overlapping'` when any candidate has more than 60 cells of at least 3 cm², or when at least half of the total traced area belongs to candidates with more than 30 such cells. Thresholds as named constants.
2. Also run it on the `suggestAssignments` path: if no style wins and the longest style holds over 80 % of all line length, trace that style once at 1 mm and test.
3. Step 2 shows: "Na tomto archu jsou díly všech velikostí nakreslené přes sebe stejnou čarou. Takový střih zatím neumíme načíst." plus what she can do: use a layered or per-size version of the pattern if the seller offers one. "Další" stays available (she may still pick a single piece) but the message stays visible.

Rejected: blocking the wizard entirely (false positives would lock out valid patterns). Rejected: detecting by counting line crossings in vector space (needs an intersection pass; cells are already there).

## Acceptance criteria

CI-safe:
- Synthetic sheet: 12 rectangles of varying size overlapping at random offsets in one stroke style → `'overlapping'`.
- Synthetic: 3 separate pieces, each with 3 nested sizes and 2 hem lines → `null`.

Local:
- Alexia → `'overlapping'`.
- Gyda, Fiona, Celia, Dandelion (with config assignments), Raglan → `null`.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- A legitimately complex piece (quilting grid, pleat lines) may have many cells; the 60 threshold and the area share rule limit false positives. Local test guards the five supported PDFs.
- Size tables and grids are small in area and excluded by ticket 05.

## Dependencies

04.

## Size, executor

S. Delegated worker. No plan approval.

## Definition of done

See README "Definition of done". README "Import PDF" limits paragraph lists this case.

## Decisions assumed

- D2 ASSUMED: overlapping single-style sheets are out of scope; detect and explain.
- D3 ASSUMED: no vector tracer.
