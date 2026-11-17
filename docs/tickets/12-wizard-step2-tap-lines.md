# 12 · Wizard step 2: tap a line to assign a size, hide raster knobs

**Goal.** The user assigns sizes by tapping lines on the sheet and choosing a size from chips; raster, gap and area settings are hidden and adjusted automatically.

**Why it matters.** Step 2 is where non-technical users stop. It currently asks them to read a table of line styles with path counts and lengths and to type tokens like `S, M, L` or `uni`.

## Context (verified)

- `src/ui/PdfImport.tsx:278-376` `Sizes` component. Style table with columns "Styl", "Cesty / délka", "Velikost" (lines 346-353); free-text input per style (353); help paragraph explaining `uni` / `vše` (345).
- Trace settings always visible: "Zacelit mezery (mm)", "Krok rastru (mm)", "Min. plocha (cm²)" (359-362), "Vynechat kontrolní čtverce" (363), cm/pt to six decimals (357).
- Assignment semantics: `assignedSizes`, `sizeRole` in `src/pdf/trace.ts:179-191`; comma or semicolon separates sizes; `uni` / `vše` / `*` means shared by all named sizes.
- Preview canvas already highlights one style and its shared companions (`PdfImport.tsx:131-141`) and has pan/zoom; it has no hit-testing of lines.
- Paths are grouped per style for drawing (`PdfImport.tsx:87-94`); furniture-free paths come from `contentPages`.
- Default guess `suggestAssignments` (`trace.ts:252-262`) works for one-size patterns (Gyda, Fiona) and returns nothing for multi-size ones.
- `PdfImport.tsx` is a 512-line file holding preview, step 2 and the wizard shell.
- Tracing nine sizes of Dandelion took 8 s.

## Scope

Split `src/ui/PdfImport.tsx` into `PdfPreview.tsx`, `PdfSizes.tsx` and the shell; new pure helpers (hit-testing, size detection from texts) in `src/pdf/`; `src/styles.css`; tests for helpers; README.

**Out of scope.** Tracing algorithm changes. Scale question (ticket 27, reused here). Variant picking (07).

## Approach

Head chef produces a short design note with two or three screen sketches and gets it approved before any code. Recommended direction:
1. **Size chips.** Read candidate sizes from sheet texts (tokens matching `SIZE_TOKEN`, `src/pdf/pieces.ts:28`, appearing in a legend-like cluster); show them as chips, with "+ přidat velikost".
2. **Tap a line.** Hit-test the tap against path segments (nearest within 12 screen px, using a coarse grid index). The whole style lights up. A small panel asks "Která velikost je tato čára?" with the chips, plus "Společná pro všechny velikosti" and "Není to střihová čára".
3. **Legend as a result, not an input.** Show assigned styles as swatches with their size; the table view stays under "Pokročilé".
4. **Automatic settings.** Start at the defaults (0.5 mm, 1 mm, 15 cm²). If a size yields no closed piece, retry with gap 2, 4, 6 mm and keep the first that closes; show "Některé čáry na sebe nenavazovaly, zacelili jsme mezery do N mm." Raster and min area only under "Pokročilé".
5. **Progress.** Show per-size progress while tracing.
6. Keep the existing data flow (`assignments` record → worker), so pipeline tests are unaffected.

Rejected: guessing sizes fully automatically from colours and nesting (wrong guesses are costly; keep the user in control). Rejected: keeping the table and only rewording it.

## Acceptance criteria

CI-safe:
- Hit-test helper: returns the correct path for points within tolerance of a diagonal segment, and nothing 13 px away; 10 000 segments answered in under 5 ms after indexing.
- Size-chip helper: texts "S M L XL XXL" → five chips in that order; "34 36 38" → three; a title containing "A4" is not a size.
- Auto-gap helper: given a fake tracer that closes only at 4 mm, returns 4 and the note flag.
- No visible input labelled in mm, pt or cm/pt outside the "Pokročilé" section (a render-free check on the component's default props or a grep-style test on the strings used in the default branch).
- All existing tests green after the file split (`tests/pdf-preview.test.ts` imports updated).

Manual (owner): Celia (3 sizes) and Raglan (5 colours + black) imported without opening "Pokročilé" and without typing into a table.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- PDFs without a text layer (Celia) give no chips: start with an empty chip row and "+ přidat velikost".
- Styles differing only by dash or width look alike on screen; highlight the whole tapped style strongly and dim the rest.
- Touch: tap must not conflict with pan; use tap = no movement beyond 6 px.
- Large refactor of a central file: do the split as a first, behaviour-neutral commit.

## Dependencies

11, 27. Benefits from 04–08 being merged first so the step-3 hand-off is stable.

## Size, executor

L. Head chef. Plan approval needed (design decision and 5+ files).

## Definition of done

See README "Definition of done". README "Velikosti" section rewritten. Strings in Czech.

## Decisions assumed

- D1 ASSUMED: assisted import.
- D7 ASSUMED: import on tablet or desktop only; phone layout not required.
