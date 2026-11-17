# 03 · Friendly failure in wizard step 4

**Goal.** When a piece cannot be built, tell the user which piece and size in plain Czech and let her continue without it.

**Why it matters.** Today one bad outline blocks the whole pattern and shows a validator sentence meant for developers. The user loses all her work in steps 1–3.

## Context (verified)

- `src/ui/PdfImport.tsx:413-421`: `built` calls `buildPattern` then `parsePatternFile`; any thrown message is shown as `error`.
- `src/ui/PdfSave.tsx:39`: the error is printed as-is, e.g. "Díl 1 / XXL: obrys musí být jednoduchý polygon s alespoň třemi body a nenulovou plochou (první bod neopakujte)."
- `src/model/pattern.ts:70-93`: `size()` validates one piece size; the error path is `Díl N / <size>`. `N` is the index among built pieces, not the name the user typed.
- `src/pdf/build.ts:23-49`: `buildPattern` builds all included drafts.
- Buttons "Stáhnout .json" and "Uložit do knihovny" are disabled when `built.pattern` is null (`PdfImport.tsx:509-510`).

## Scope

`src/pdf/build.ts` (add a checking helper), `src/ui/PdfImport.tsx`, `src/ui/PdfSave.tsx`, `tests/pdf-build.test.ts`.

**Out of scope.** Fixing why outlines are bad (tickets 01, 02). Changing `parsePatternFile`.

## Approach

Recommended:
1. Add `checkPieces(pattern): { pieceId, pieceName, size, problem: 'outline' | 'fold' | 'other' }[]` in `build.ts`. It validates each piece size separately by calling `parsePatternFile` on a one-piece, one-size copy, and maps the failure to a problem kind by which check failed.
2. In step 4, if problems exist, list them: "Díl „Rukáv“, velikost XXL: obrys se nepodařilo obkreslit čistě." with two buttons per row: "Vynechat tuto velikost" and "Vynechat celý díl".
3. "Vynechat" removes that size (or piece) from the built pattern only; drafts stay untouched so "Zpět" still works. Rebuild and re-validate.
4. For `fold` problems offer "Uložit bez lomu" for that size.
5. Keep the raw message behind a `<details>` "Technické podrobnosti".

Rejected: auto-dropping silently (user would not notice a missing size). Rejected: translating validator strings in place (ticket 16 handles error codes).

## Acceptance criteria

CI-safe, in `tests/pdf-build.test.ts`:
- A trace result with two candidates, one having a bow-tie ring in size "M": `checkPieces` returns exactly one entry `{ size: 'M', problem: 'outline' }` with the draft's name.
- Removing that size yields a pattern that passes `parsePatternFile` and still contains the piece's other sizes.
- A piece whose only size is bad is removed entirely; if no piece remains, saving stays disabled.

Manual: with ticket 01 not yet merged, importing Raglan reaches step 4, lists the sleeve problem per size, and can save after "Vynechat celý díl".

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- A size that no remaining piece has must leave `pattern.sizes` (already handled at `build.ts:48`).
- Piece ids are slugs of names; two unnamed pieces are "dil-N". Report by name plus candidate number to stay unambiguous.

## Dependencies

None. Still valuable after 01 and 02 as a safety net.

## Size, executor

S. Delegated worker. No plan approval (4 files).

## Definition of done

See README "Definition of done". README "Uložit" paragraph mentions the per-piece choice.

## Decisions assumed

- D1 ASSUMED: assisted import that always ends in a usable pattern.
