# 28 · Marker rules from the TUL notes as a test specification (no code)

**Goal.** Turn the TUL student's notes on polohový plán rules into a short, numbered list of rules, each with a value, a source and a test that fitter could run.

**Why it matters.** The app gives fabric advice to people who trust it. Its defaults (gap, grain tolerance, edge margin, one-way fabrics) should follow what is taught in the trade, not guesses.

## Context (verified in code at commit 8045a1a)

What fitter does today, per rule area:

| Area | Current behaviour | Where |
|---|---|---|
| Gap between pieces | Default 0.5 cm, range 0–10; pieces inflated by gap / 2, so real distance ≥ gap | `src/model/prepare.ts:20,54`, `src/nest/raster.ts:29` |
| Grain direction | Per piece: no rotation, 0°/180°, or 0°/90°/180°/270°; default 0°/180°; no small-angle tolerance | `src/nest/types.ts:3`, `prepare.ts:21`, `raster.ts:57-67` |
| Directional fabric | One checkbox per material "Zachovat směr (vlas, jednosměrný vzor)": no rotation, no flipping; mirrored pairs still allowed | `prepare.ts:130`, `src/ui/App.tsx:172-173` |
| Edge margin | None: pieces may touch the fabric edge and the selvage | README "Hrany látky nemají povinný odstup"; `src/nest/nest.ts:52-55` |
| Fold | Folded fabric halves the usable width, fold on the left; fold pieces sit on the fold; other pieces keep gap / 2 from it | `nest.ts:50-53`, `prepare.ts:99-113` |
| Mirrored pairs | Every second copy mirrored on single-layer fabric; on folded fabric the lower layer gives the mirror | `prepare.ts:110-131` |
| Seam allowance | Uniform offset (default 1 cm) added only to patterns marked without allowance; hem not treated separately | `prepare.ts:91-109` |
| Pattern matching (stripes, checks) | Not supported at all | – |
| Fabric flaws, shrinkage, extra length | Not supported | – |

Related tickets waiting on values: 21 (grain tolerance, proposed 3°), 22 (gap default, currently 0.5 cm).

The notes themselves are not in the repository and have not been seen by the analyst. Nothing below about their content is verified.

## Scope

One new document `docs/marker-rules.md`. No code.

**Out of scope.** Implementing any rule. Changing defaults (tickets 21, 22 do that once values are confirmed).

## Approach

1. Head chef sends the student the question list below and asks for the page or source for each answer (lecture notes, textbook, standard).
2. Write `docs/marker-rules.md` as a table: rule id, rule in one sentence, value with unit, applies when, source, confidence (taught rule / rule of thumb / her own practice), fitter today, proposed fitter behaviour, test idea.
3. For each rule add one testable statement in the form used by `tests/nest.test.ts`, e.g. "for every pair of placements, `polygonDistance ≥ gap`".
4. List follow-up tickets needed (e.g. edge margin setting, pattern-matching repeat) with a size guess. Do not open them.

Rejected: coding defaults from memory of general practice (values differ between industry and home sewing). Rejected: waiting for the notes before building 21 and 22 (both isolate the value in one constant).

### Questions to ask

Gap between pieces
1. Is there a prescribed minimum gap between pieces in a polohový plán? What value, and does it differ for hand cutting with scissors, a rotary cutter, and an automatic cutter?
2. Is the gap measured between cutting lines (seam allowance already included)?
3. Are pieces ever allowed to share a cutting line (gap 0), and when?

Grain direction
4. What deviation from the warp direction is allowed, in degrees or in mm per metre? Is ±3° the taught value, and for which fabrics?
5. Is the tolerance per piece, or must all pieces of one garment deviate the same way?
6. Are there pieces where no deviation is allowed (e.g. centre front, trouser legs), or pieces that may be cut cross-grain or on the bias freely (facings, pocket bags, bindings)?
7. When is a 180° turn allowed, and when a 90° turn?

Directional fabrics
8. Which fabrics count as directional (nap, pile, one-way print, sheen, knits)? Are all pieces then laid in one direction, including small ones?
9. Is "one direction per garment" (each size laid one way, sizes may differ) an accepted rule, and when?
10. On folded fabric with nap, are there extra restrictions?

Edge margin
11. Is there a required distance from the selvage, and how much? Does it differ by fabric?
12. Is there a required margin at the start and end of the fabric length?

Folding and layers
13. When is fabric laid folded lengthwise, crosswise, or single layer? Any rule for which pieces go on the fold?
14. For paired pieces (left/right) on single-layer fabric, is mirroring always required?

Pattern matching
15. For stripes and checks: which seams must match, and how is the extra consumption estimated (e.g. one repeat per piece)?
16. Is there a rule for placing large motifs?

Consumption and quality
17. What utilisation is considered good for a single garment at home versus an industrial marker? (The thesis figures are 82–88 % for industrial markers.)
18. Is extra length added for shrinkage or cutting errors, and how much?
19. In what order are pieces laid by hand (largest first, along the selvage first)? This may guide the nesting heuristics.

## Acceptance criteria

- `docs/marker-rules.md` exists with one row per answered question group (gap, grain tolerance, edge margin, directional fabrics, pattern matching at minimum), each row with value, source and confidence, or the explicit entry "not answered".
- Each row has a one-sentence testable statement and names the fitter file that would change.
- The document states the confirmed (or still unconfirmed) values for D11 (grain tolerance) and D12 (default gap).
- Tickets 21 and 22 are updated with the confirmed values, or annotated "still unconfirmed", in their "Decisions assumed" sections.
- No source file changed: `git status --short` shows only files under `docs/`.

## Edge cases and risks

- School notes describe industrial practice; home sewing may differ. Record both where she knows them.
- Answers may be "it depends on the fabric"; capture the dependency rather than forcing one number.
- The notes may be copyrighted teaching material: summarise in our own words, cite, do not copy pages.

## Dependencies

None. Feeds 21 and 22; informs 25.

## Size, executor

S. Head chef (needs contact with the student through the owner). No plan approval (documentation only).

## Definition of done

Document written and linked from `docs/tickets/README.md`; tickets 21 and 22 annotated; no code changed.

## Decisions assumed

- Potvrzeno 2026-11-21 přednáškou TUL (Zelová, 4. přednáška, slide 11 resp. 12), viz docs/marker-rules.md.

- D11 CONFIRM VALUE: grain tolerance 3°.
- D12 CONFIRM VALUE: default gap 0.5 cm.
