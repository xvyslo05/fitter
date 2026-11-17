# 11 · Wizard step 1 collapsed to a confirmation

**Goal.** Step 1 shows the assembled sheet and asks "Je střih složený správně?"; the block and tile-step editors appear only on request.

**Why it matters.** Detection is automatic for all six test PDFs, yet every user is shown page ranges, "Dlaždic v jednotlivých řádcích" and a tile step in points. That is the first screen of the import and it scares people off.

## Context (verified)

- `src/ui/PdfImport.tsx:478-501`: step 1 always renders the block editor (lines 481-491), unused pages (492-495), "Krok dlaždic · překryv" in pt with "1 mm = 2,835 pt" (496-498), then the preview.
- `PdfImport.tsx:479`: "Detekce: {detected.source}. Rozložení vždy zkontrolujte v náhledu." where `source` is a technical string built in `src/pdf/layout.ts:304-330` (e.g. "shodné cesty + návaznost hran").
- `src/pdf/layout.ts:329`: source contains "bloky je třeba zadat" when no multi-page block was found.
- Preview draws seams green when content matches and grey when unverified (`PdfImport.tsx:167-178`); `placePages` returns `seams: { a, b, matched }[]` (`src/pdf/place.ts:21-44`).
- Local acceptance: all six PDFs are detected completely (`tests/local/pdf-acceptance.test.ts`).
- `PdfImport.tsx:480`: warning for PDFs without vector paths (scans).

## Scope

`src/ui/PdfImport.tsx`, `src/styles.css`, `src/pdf/layout.ts` only if a structured confidence value is added, `tests/pdf-layout.test.ts` for that value.

**Out of scope.** Changing detection. Step 2 (ticket 12). Scale question (ticket 27).

## Approach

Recommended:
1. `detectLayout` additionally returns `confident: boolean`: true when every block has more than one page and no source says blocks must be entered. Keep `source` for the details view.
2. Default view: preview, the line "Složili jsme {n} stránek do jednoho archu. Vypadá to správně?", buttons "Ano, pokračovat" (same as "Další") and "Ne, upravit ručně".
3. Under the preview, one plain legend: green seam "navazuje", grey seam "nejisté – zkontrolujte". If any seam is unverified, say how many.
4. "Ne, upravit ručně" reveals the existing editors unchanged. When `confident` is false or the layout is invalid, reveal them automatically with a one-line explanation.
5. Move "Detekce: …" into the revealed section.

Rejected: removing the editors (needed for PDFs detection gets wrong). Rejected: drag-and-drop page arrangement (large; revisit if manual fixes prove common).

## Acceptance criteria

CI-safe:
- `tests/pdf-layout.test.ts`: `confident` is true for the existing complete-detection fixtures and false for the fixture where blocks must be entered.
- Existing layout tests unchanged.

Local:
- `tests/local/pdf-acceptance.test.ts` green; all six report `confident: true`.

Manual: opening any of the six PDFs shows no numeric field in step 1; one click reaches step 2; "Ne, upravit ručně" shows the editors with the detected values.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- Unused pages (instruction pages) are normal; list them only in the revealed section, but mention the count in the summary line.
- Keep keyboard focus sensible when the section expands.

## Dependencies

None.

## Size, executor

S. Delegated worker. No plan approval.

## Definition of done

See README "Definition of done". README "Import PDF" first paragraph describes the confirmation view. Strings in Czech.

## Decisions assumed

- D1 ASSUMED: assisted import with visual confirmation.
