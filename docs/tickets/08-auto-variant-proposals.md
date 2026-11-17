# 08 · Auto-proposals: nested sizes and stacked strips

**Goal.** Propose the right cell sets automatically for the two common cases: one line style shared by several sizes, and hem lines stacked at one end of a piece.

**Why it matters.** Tapping cells for nine sizes by hand is tedious. In the common cases the app can guess and the user only confirms.

## Context (verified)

- `src/pdf/trace.ts:236-247`: a style assigned to several sizes ("34, 44") is copied into each; each size then gets the same outer outline. Measured on Dandelion: sizes 34 and 44 both 4868 cm²; 42 and 48 both 5438.
- Prototype, style "34, 44" traced alone, cells ordered outward from the largest by adjacency ("onion"): back bodice cumulative areas 763 / 951 against library 766.4 / 948.0; style "42, 48": 908 / 1008 against 912.2 / 1004.3.
- The onion order fails where nested sizes and variant cut lines combine (Dandelion sleeve levels 778, 1366, 1705 against 1438.6 and 1702.1). Such pieces must fall back to manual picking.
- Stacked strips, Raglan XXL sleeve: cells 1244.6 and 1165.7 (upper and lower sleeve, split by the short-sleeve line) plus strips 83.5, 81.3, 77.4, 44.4. Strips form a chain by adjacency.
- Size order helper exists: `sortSizes` in `src/pdf/build.ts:61-70`.

## Scope

New `src/pdf/variants.ts` (or extend the helper file from ticket 07), `src/pdf/trace.ts` (`traceSizes` uses nested proposal when one style lists several sizes), `src/pdf/pieces.ts` (`suggestPieces` fills `variants` for chains), tests, local tests.

**Out of scope.** UI beyond showing the proposal in the ticket 07 picker. Combined nested-and-variant pieces.

## Approach

Recommended:
1. **Nested sizes.** When exactly one assigned style lists N ≥ 2 sizes and a traced piece has N onion levels of cells ≥ 3 cm² each (levels by breadth-first distance from the largest cell, counting only borders ≥ 2 mm long), assign cumulative unions to the listed sizes in `sortSizes` order, smallest size = innermost. Otherwise leave today's behaviour and flag the piece "velikosti se nepodařilo rozlišit" for manual picking.
2. **One-size pieces** drawn in a shared style (exactly one level) get the same outline in every listed size.
3. **Stacked strips.** For a piece (single size style plus shared lines) whose cell adjacency graph is a path, propose variants as prefixes of the path starting from the end with the largest cell. Name them "možnost 1…n"; the user renames.
4. Any other graph shape: no proposal.

Rejected: ranking whole outlines by area without cells (the outlines do not exist as separate rings in the raster). Rejected: guessing variant names from nearby text now (unreliable; revisit later).

## Acceptance criteria

CI-safe:
- Three nested rectangles sharing the left edge, one style assigned "S, M, L" → three sizes with areas matching the three rectangles within 1 %, S smallest.
- Same input with only two levels found → no proposal, flag set.
- Path graph A(400)–B(60)–C(40) → variants [A], [A, B], [A, B, C].
- Star graph (A adjacent to B and C) → no stacked proposal.

Local:
- Dandelion with "34, 44" and "42, 48": back bodice within 1 % of library in each of the four sizes; areas of 34 and 44 differ.
- Dandelion one-size pieces (library areas 387.5, 207.1, 79.8) present in every size of the result.
- Raglan sleeve: proposal exists and contains a variant within 1.5 % of `aermel-kurz-buendchen` and one within 1.5 % of `aermel-lang-saum-190`.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- Graded outlines that cross each other break the onion order locally; the level-count check catches most cases, a visual confirmation in step 3 catches the rest.
- Shared fold edge: all sizes touch the outside along it; use distance from the largest cell, not from the outside.
- Dandelion front bodice differs from the library by 3–4 % because the library uses two bodice length groups; do not assert it.

## Dependencies

04, 06. Best reviewed together with 07.

## Size, executor

M. Head chef (heuristic thresholds need judgement). Plan approval needed.

## Definition of done

See README "Definition of done". README step "Velikosti" explains what happens when one style lists several sizes.

## Decisions assumed

- D1 ASSUMED: assisted import; proposals are always shown for confirmation.
