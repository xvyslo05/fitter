# 13 · Main screen simplification

**Goal.** The main screen leads with "add a pattern from PDF", uses three plain steps, hides expert settings, and protects against accidental deletion.

**Why it matters.** The first thing a new user sees today is a dropzone for `.json` files she does not have, followed by settings such as "Krok rastru" and "Náhodné semínko".

## Context (verified)

- `src/ui/Library.tsx:11-22`: JSON dropzone is the primary element ("Přetáhněte soubory .json…"); "Importovat PDF…" is a secondary button (line 22).
- `src/ui/App.tsx:152-158` order panel; `159-176` fabrics (width default 140 cm from `src/model/prepare.ts:23`, no presets); `177-190` settings: seam allowance, gap, default rotation, mirrored pairs visible; raster step, time, seed inside `<details>` "Přesnost a délka hledání" (183-189).
- `App.tsx:87-94` `removePattern`: deletes from IndexedDB and removes order lines immediately, no confirmation, no undo.
- `App.tsx:163`: "{n} umístění" per material.
- `src/ui/Layout.tsx:79-81`: stats per material (dimensions, used length, utilisation); no combined "how much fabric to buy" sentence. `Layout.tsx:163`: "{n} průchodů".
- `src/ui/OrderEditor.tsx:28-61`: "Díly a otáčení" details with per-piece rotation selects.
- Empty state: `Layout.tsx:175-186`.
- Breakpoints exist at 1100, 850, 560 px in `src/styles.css`.

## Scope

`src/ui/App.tsx`, `src/ui/Library.tsx`, `src/ui/OrderEditor.tsx`, `src/ui/Layout.tsx` (summary line only), `src/styles.css`, a small pure helper for the summary sentence with a test, README "Použití".

**Out of scope.** Wizard changes (11, 12, 27). Printing (14). Backup feature itself (19; this ticket only places its entry point). Renames already done by ticket 23.

## Approach

Head chef settles wording and order with the owner; worker implements. Recommended:
1. Library: primary button "Přidat střih z PDF"; pattern list below; JSON import and per-pattern JSON download move into a collapsed "Pokročilé" block.
2. Delete: `confirm`-style inline step ("Opravdu smazat střih „X“? Zmizí i z plánu.") with "Smazat" / "Ponechat".
3. Fabric: preset buttons 110 / 140 / 150 cm that fill the width field; field stays editable.
4. Settings: keep seam allowance and gap visible with one-line explanations; move default rotation, mirrored pairs, raster step, time and seed under one "Pokročilé nastavení".
5. Per-piece rotation selects in the order editor move under a nested "Otáčení dílů (pokročilé)".
6. Result header: one sentence per material, e.g. "Hlavní látka: potřebujete 1,45 m při šíři 140 cm." built by a pure helper `fabricSummary(material, fabric, result)`; rounded up to the next 5 cm, with the exact value beside it.
7. Remove "{n} průchodů" and "{n} umístění" from the default view (keep in a tooltip or advanced block).

Rejected: a multi-page stepper (the single page works well on desktop and avoids state loss). Rejected: removing JSON import (D6 keeps it under Advanced).

## Acceptance criteria

CI-safe:
- `fabricSummary` tests: roll, used length 141.3 cm, width 140 → text contains "1,45 m" and "140 cm"; fixed piece that fits → "vejde se"; unplaced pieces → sentence says how many did not fit.
- A test asserting that the strings "Krok rastru", "Náhodné semínko" appear only inside the advanced component (e.g. the advanced block is its own exported component and the default `App` markup helper does not include them).
- Existing tests green.

Manual: first load shows "Přidat střih z PDF" as the only primary button in the library; deleting asks first; presets set the width.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- Workspace stored in `localStorage` (`src/storage.ts:27-53`) must keep loading; no schema change needed.
- Folded fabric: the summary states the unfolded width and the length.
- Several materials: one sentence each, in material order.

## Dependencies

23 (renames first, to avoid editing the same strings twice). Entry point for 19.

## Size, executor

M. Head chef for wording and layout; delegated worker for code. Plan approval needed (5+ files).

## Definition of done

See README "Definition of done". README "Použití" rewritten to match. Strings in Czech.

## Decisions assumed

- D6 ASSUMED: JSON import/export moves to Advanced.
- D8 ASSUMED: plain nouns per ticket 23.
