# 20 · PDF layers as size hints

**Goal.** Read the PDF's layers (optional content groups) so that lines can be assigned to sizes by layer name, and non-pattern layers can be ignored.

**Why it matters.** Many newer patterns let the buyer switch sizes on and off as layers in a PDF viewer. When such layers exist, the import can know which line belongs to which size without asking.

## Context

Verified:
- `src/pdf/readPdf.ts:47-96` handles save/restore, transforms, form XObjects, groups, line width, dash, colours, clip and `constructPath`. It ignores `beginMarkedContentProps` / `endMarkedContent`, so layer membership is lost.
- `PdfPath` (`src/pdf/types.ts:3-9`) has no layer field. Style key = kind, colour, width, dash (`src/pdf/styles.ts:24-27`).
- pdf.js exposes `pdf.getOptionalContentConfig()` with `getOrder()` and `getGroup(id).name`; operator lists carry `OPS.beginMarkedContentProps` with args `['OC', { id }]`-style references.
- Measured on the test PDFs: Fiona and Gyda have layers named "POPIS", "okraje", "střih vel.1", "vodoznak", "značky" (36 and 37 marked-content operators). Celia has one layer per page ("Page 1" … "Page 22"), which carries no size information. Alexia, Dandelion and Raglan have none.
- None of the six PDFs has one layer per size.

Not verified: how common per-size layers are among patterns the target users buy. This is general knowledge about indie pattern PDFs, not measured here.

## Scope

`src/pdf/readPdf.ts`, `src/pdf/types.ts`, `src/pdf/styles.ts`, `src/ui/PdfImport.tsx` (legend shows layer names; pre-fill), `tests/pdf-read.test.ts`, `tests/pdf-writer.ts` (synthetic PDFs with layers), `tests/local/pdf-trace.test.ts`.

**Out of scope.** Respecting layer visibility defaults for rendering. Nested layer hierarchies beyond reading the leaf name.

## Approach

Head chef first confirms the value with the owner by checking two or three layered patterns she or testers own. If none can be found, park the ticket.

Recommended if it goes ahead:
1. `readPdf`: keep a stack of active layer ids while walking operators; store `layer?: string` (the group name) on each `PdfPath`. Read names once per document.
2. Style key gains the layer name only when the document has at least two distinct layer names that are not page-like (`/^(page|seite|strana)\s*\d+$/i`).
3. Suggest assignments from names: a layer name that is, or ends with, a size token (`SIZE_TOKEN` in `src/pdf/pieces.ts:28`, e.g. "Size 38", "Gr. 42", "XL") pre-fills that size.
4. Suggest exclusions: layers named like margins, watermark, description (`okraje`, `vodoznak`, `popis`, `watermark`, `instructions`, `info`, `margins`) are left unassigned and dimmed.
5. Legend rows show the layer name.

Rejected: using layers as the only assignment mechanism (most test PDFs have none). Rejected: OCR or text-proximity guessing of sizes (separate, riskier idea).

## Acceptance criteria

CI-safe:
- Synthetic PDF with two layers "Size 36" and "Size 38", each holding one closed outline in the same stroke style → two legend entries carrying those names; default assignments `36` and `38`; tracing yields one outline per size.
- Synthetic PDF with one layer per page named "Page N" → style keys identical to today's (no layer in the key).
- Synthetic PDF without layers → output identical to today's (`tests/pdf-read.test.ts` unchanged cases).

Local:
- Fiona and Gyda: paths in "vodoznak" and "okraje" are not offered as cutting-line styles by default; existing trace and pieces assertions green.
- Celia: results unchanged.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- Marked content can nest and can appear inside form XObjects; the stack must follow save/restore-independent begin/end pairs.
- Splitting styles by layer changes legend length for Fiona and Gyda; check that `suggestAssignments` still proposes `uni` for the cutting style (existing local assertion).
- `tests/pdf-writer.ts` must learn to write OCG dictionaries; keep it minimal.

## Dependencies

None. If ticket 12 is merged, the chips view shows layer-based suggestions.

## Size, executor

M. Head chef decides whether to proceed; delegated worker implements. Plan approval needed (5+ files and a types change).

## Definition of done

See README "Definition of done". README "Velikosti" paragraph explains layer-based suggestions.

## Decisions assumed

- D1 ASSUMED: assisted import; layer names are suggestions the user confirms.
