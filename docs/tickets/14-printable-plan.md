# 14 · Printable one-page plan

**Goal.** The browser's Print produces one clean page per material with the layout drawing, key dimensions and the fabric length to buy.

**Why it matters.** A sewist takes the plan to the cutting table or the fabric shop. Today she can only download an SVG or PNG and must work out how to print it.

## Context (verified)

- No print stylesheet: `grep "@media print" src/styles.css` finds nothing.
- `src/ui/Layout.tsx:76-172`: one `<article class="result-card">` per material with heading, stats (`79-81`), SVG (`84-151`, sized in real cm via `width`/`height` attributes at line 85), hover tooltip, unplaced list (164), export buttons (165-170).
- `src/ui/export.ts:11-18`: exports are always rendered with light-theme colours through `exportMarkup`.
- Piece labels are truncated to fit (`Layout.tsx:102-105`); full label and mirrored state are in hover text and `<desc>` only.
- Dark theme exists (`src/theme.ts`); print must be light.
- Notes for cutting are rendered in `src/ui/App.tsx:204-205`.

## Scope

`src/styles.css` (print rules), `src/ui/Layout.tsx` (a print button and a print-only piece list), `src/ui/App.tsx` (print-only header), a pure helper for the piece list with a test, README.

**Out of scope.** True-scale tiled output of the marker (decision D4). PDF file generation.

## Approach

Recommended:
1. `@media print`: hide header, controls column, footer, notices, export buttons, tooltips; force light tokens; each `.result-card` on its own page (`break-before: page` except the first); SVG scaled to page width with `max-height` so one material fits one page, portrait for long layouts.
2. Print-only block under each drawing: fabric width, folded or not, length to buy (reuse the ticket 13 helper if merged, otherwise a local sentence), and a table of pieces: name, size, count, mirrored yes/no, position from left and from top in cm. Built by a pure helper `pieceTable(pieces, result, mirroredKeys)`.
3. Print-only header: pattern names and sizes from the order, date, and the cutting notes.
4. A "Vytisknout plán" button beside the exports calling `window.print()`.
5. Scale note printed under the drawing: "Nákres je zmenšený, řiďte se kótami."

Rejected: generating a PDF in the browser (adds a dependency and size for no gain over the print dialog). Rejected: tiled 1:1 marker now (D4).

## Acceptance criteria

CI-safe:
- `pieceTable` test: two placements, one mirrored, one rotated 180° → two rows with correct left/top distances (1 decimal) and "zrcadlově" on the mirrored one; unplaced pieces listed separately.
- A test that `src/styles.css` contains an `@media print` block hiding `.controls`, `.site-header`, `.site-footer` and `.export-actions` (string check).
- Existing tests green.

Manual (owner): print preview in Chrome and Safari for a two-material order shows two pages, light colours in dark mode, nothing cut off for a 140 × 250 cm layout.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- Very long rolls (10 m) will be tiny on one page; allow the drawing to span pages only above a set aspect ratio and say so.
- Hatch pattern ids (`Layout.tsx:65`) must survive printing; test in Safari.
- Colours: use the light token set as `exportMarkup` does, so prints do not waste ink on dark backgrounds.

## Dependencies

None. Reuses the summary helper from 13 if available.

## Size, executor

S–M. Delegated worker. No plan approval (4 files).

## Definition of done

See README "Definition of done". README "Použití" step 6 mentions printing. Strings in Czech.

## Decisions assumed

- D4 ASSUMED: one-page printable plan first; no 1:1 tiled marker yet.
