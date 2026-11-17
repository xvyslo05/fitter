# 27 · Scale step as a yes/no question

**Goal.** Replace the numeric scale fields in wizard step 2 with one question: "Má tento čtverec na vašem výtisku N cm?" Yes / No.

**Why it matters.** A wrong scale makes every piece the wrong size and the fabric plan useless. The user can check a printed square with a ruler; she cannot judge "0,035278 cm/pt · 100,00 %".

## Context (verified)

- Detection: `detectScale(doc)` in `src/pdf/scale.ts:46-49` returns `{ cmPerPt, source: 'square' | 'default', squareCm?, measuredPt?, page? }`. It looks for an axis-aligned square of 60–320 pt on any page, prefers one with a nearby label like "5 cm" or "5 x 5 cm" or a "kontroll/test" word, and snaps to 2.54, 3, 4, 5 or 10 cm within 3 % (`scale.ts:5-45`).
- Fallback: `CM_PER_PT = 2.54 / 72` (100 %) when no square is found (`scale.ts:4, 48`).
- Override: `overrideScale(scale, squareCm)` (`scale.ts:61-64`) recomputes from a typed side length; it throws without a measured square.
- UI today, `src/ui/PdfImport.tsx:354-358`: a sentence with page, measured pt and cm; "Aktuálně {cmPerPt to 6 decimals} cm/pt · {percent} %"; a text field "Skutečná strana čtverce (cm)" shown only when a square was found. State: `squareCm` string (`PdfImport.tsx:288`), used in `settings` (`311-319`).
- Measured on the six test PDFs: five have a detected square (5, 10, 5, 5, 3 cm; error under 1 % against the offline configs, Alexia 0.7 % because the stroke centre is measured). Raglan has no vector square and uses 100 %, which is correct for it.
- The square's page and geometry are known (`page`, `measuredPt`), so it can be drawn.
- `tests/pdf-scale.test.ts` covers detection (31 lines).

## Scope

`src/ui/PdfImport.tsx` (the scale block; a small `ScaleQuestion` component), `src/pdf/scale.ts` only if the square's position must be returned for the picture, `src/styles.css`, `tests/pdf-scale.test.ts`, README scale paragraph.

**Out of scope.** Detection changes. Inch squares (ticket 18). Measuring arbitrary lines on the sheet.

## Approach

Recommended:
1. **Square found.** Show a small picture of the page region with the square highlighted and the question "Má tento čtverec na vašem výtisku {squareCm} cm?" Buttons "Ano" (default, pre-selected) and "Ne / nevím".
   - "Ano" → use the detected scale. Nothing else shown.
   - "Ne / nevím" → "Kolik cm jste naměřila?" with one number field (accepts comma), then `overrideScale`. Explain: "Změřte stranu čtverce pravítkem na vytištěné stránce."
2. **No square found.** Text: "Kontrolní čtverec jsme nenašli. Počítáme s tiskem ve skutečné velikosti (100 %)." plus an optional check: "Pro kontrolu: díl „{largest piece}“ by měl měřit asi {w} × {h} cm. Souhlasí to?" shown after tracing; "Ne" opens a field "Střih je zvětšený / zmenšený na ___ %".
3. Move the cm/pt and percent line under "Pokročilé".
4. Return the square's bounding box from `detectScale` (`squarePt: [x, y, w, h]`, page-space) for the picture.
5. Keep the answer in wizard state so going back and forth does not ask again.

Rejected: keeping the numeric field visible "just in case" (it is the thing that confuses). Rejected: asking the user to measure on screen (screen size is unknown).

## Acceptance criteria

CI-safe:
- `detectScale` returns the square's box; for the existing 5 cm fixture the box side equals `measuredPt` within 0.01 pt.
- Pure helper `resolveScale(detected, answer)`: `{ ok: true }` → detected `cmPerPt`; `{ ok: false, measuredCm: 4.8 }` with a 5 cm square → `cmPerPt` × 0.96; `{ percent: 97 }` with no square → `CM_PER_PT × 0.97`; invalid or non-positive input → error result, no throw.
- Comma input "4,8" parses to 4.8.
- Existing scale tests green.

Local: `tests/local/pdf-trace.test.ts` scale assertions unchanged (under 1 % for all six).

Manual: Celia shows the 10 cm square picture and question; "Ano" proceeds with no numbers visible; Raglan shows the no-square text.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- Detected value can be wrong when a pattern piece is itself a square near a "5 cm" label; the picture lets the user see which square is meant, and "Ne / nevím" recovers.
- "Vynechat kontrolní čtverce" (`PdfImport.tsx:363`) depends on the detected square; keep it working and move it under "Pokročilé".
- If ticket 12 lands later it reuses this component; keep it self-contained.

## Dependencies

None. Ticket 12 depends on this.

## Size, executor

S. Delegated worker. No plan approval (4 files plus README).

## Definition of done

See README "Definition of done". README "Měřítko" paragraph rewritten. Strings in Czech.

## Decisions assumed

- D1 ASSUMED: assisted import with visual confirmation instead of numeric fields.
