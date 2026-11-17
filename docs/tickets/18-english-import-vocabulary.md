# 18 · English vocabulary in the import heuristics

**Goal.** Names, cut counts, materials, fold, grain, seam allowance and the test square are recognised on English-language patterns as well as they are on Czech and German ones.

**Why it matters.** With an English UI, users will import English patterns. If the wizard pre-fills nothing, every piece must be typed by hand.

## Context (verified by reading the regexes)

In `src/pdf/pieces.ts`:
- `FOLD` (line 23) knows `fold`, `folded`, German and Czech words. Missing: "place on fold" is covered by `fold`, but "CF"/"CB" (centre front/back, often on the fold) are not.
- `GRAIN` (24) knows `grain`, `fl`, German, Czech, French. Missing: `grainline` (one word fails the letter-boundary lookahead), "straight of grain", "selvage"/"selvedge", "lengthwise".
- `COUNT` (26) handles "2x", "x 2", "cut 2", "2 mal". Missing: "cut 1 pair" (= 2), "cut two" (number words), "cut 2 on fold".
- `MEASURE` (27) knows cm, mm, inch, zoll, scale. Missing: `"`, `in.`, "test square", "1 inch".
- `SIZE_TOKEN` (28): numbers, XS–XXL, `uni`. Missing: `2T`, `1X`–`5X`, `0`–`24` are numbers and fine, ranges like "XS-5X".
- `STOP` (29) has some English words (cut, the, and, from, each, pairs, mirror, times).
- `MATERIALS` (31-32) normalises Czech only. English words (self, main, shell, lining, interfacing, contrast, rib, facing) stay as printed, lower-cased, which is acceptable but untested; "fabric" after a count ("cut 2 fabric") becomes a material named "fabric".
- `nameLike` (65-69) limits names to 40 characters and 5 words.

In `src/pdf/build.ts`:
- Seam allowance `NONE` / `INCLUDED` (53-54) already cover "seam allowance(s) included", "without / no seam allowance", "add seam allowance". Missing: "includes a 3/8\" seam allowance", "5/8 inch seam allowances are included", "SA included".
- `NOISE` (81) covers A0–A4, letter, pattern, print, copyshop. Missing: "projector", "copy shop" (two words), "print at home".

In `src/pdf/scale.ts`:
- `standards` (line 5) are 2.54, 3, 4, 5, 10 cm. Missing: 2 in (5.08), 4 in (10.16).
- Label regex (30) reads only `N cm` or `N x N cm`. Missing: `1"`, `1 inch`, `1 in`, `2" x 2"`.

Existing tests: `tests/pdf-pieces.test.ts`, `tests/pdf-build.test.ts`, `tests/pdf-scale.test.ts` (all synthetic, CI-safe).

No English pattern PDF is available in `patterns/`; everything here is tested on synthetic labels.

## Scope

`src/pdf/pieces.ts`, `src/pdf/build.ts`, `src/pdf/scale.ts`, and the three test files above.

**Out of scope.** UI language (17). Detecting the PDF's language. Translating piece names.

## Approach

Recommended: extend the existing regexes and tables; add cases to tests first.
1. Grain: add `grainline`, `grain line`, `straight (of )?grain`, `selvedge|selvage`, `lengthwise`.
2. Fold: add `cf|cb` only when followed by "on fold" or next to a fold word; plain "CF" must not switch the fold on.
3. Count: "pair(s)" doubles the count; number words one–six; "on fold" stays a fold hint, not a material.
4. Materials: table for English (`self|main|shell|fashion fabric` → "main", `lining`, `interfacing`, `contrast`, `rib|ribbing`, `facing`), applied when the label is English-looking (contains `cut`); skip filler words "fabric", "of", "in".
5. Measure and scale: inch labels; standards 5.08 and 10.16 cm; label value in inches converted to cm.
6. Seam allowance: optional measurement between "includes" and "seam allowance"; "SA".
7. Noise words for names.

Rejected: a language detector choosing one vocabulary (mixed-language patterns exist; union of vocabularies is simpler). Rejected: fuzzy matching.

## Acceptance criteria

CI-safe, new cases (all existing cases unchanged):
- `parseCutLabels(['FRONT', 'Cut 2 on fold'])` → name "FRONT", cut main × 2, fold true.
- `['Sleeve', 'Cut 1 pair lining']` → lining × 2.
- `['Pocket', 'Cut two main, cut 2 interfacing']` → main × 2, interfacing × 2.
- `['Back', 'Place on fold']` → fold true; `['Back', 'CF']` → fold false.
- Grain line labelled "GRAINLINE" within 2 cm is preferred by `detectGrain` (mirror the existing "Fadenlauf" test).
- `suggestSeamAllowance`: "Pattern includes a 3/8\" seam allowance" → included; "Add seam allowance" → none; "5/8 inch seam allowances are included" → included.
- `detectScale`: a 144 pt square labelled `2" x 2"` → 5.08 cm, `cmPerPt` within 0.1 % of 2.54/72; a 72 pt square labelled "1 inch test square" → 2.54 cm.
- `patternName(undefined, 'Tee_Dress_Projector.pdf')` → "Tee Dress".

Local: `tests/local/*` unchanged and green (guards Czech and German behaviour).

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- `in` is a common English word; only treat it as inches after a number.
- "fl" already matches as grain; "fold line" must stay a fold hint.
- "Cut 1" followed by a size ("Cut 1 XL") must not read XL as material (existing lookahead for sizes covers `2 XL`; add a test).

## Dependencies

None. Most useful once 17 ships.

## Size, executor

S–M. Delegated worker. No plan approval (6 files but three are tests; no design decision). If the worker prefers, treat the cases list as the approved plan.

## Definition of done

See README "Definition of done". README bullets on **Počty**, **Lom**, **Směr vlákna**, scale and seam allowance list the new English forms.

## Decisions assumed

- D5 ASSUMED: inch-based patterns are in scope for import.
