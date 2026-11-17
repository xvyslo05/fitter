# 15 · i18n stage 1: UI strings into a Czech dictionary

**Goal.** Every user-visible string in `src/ui/` comes from a typed dictionary through `t()`, with no change in what is rendered.

**Why it matters.** An English version needs one place where all text lives. Doing the extraction as a behaviour-neutral step keeps the risk low.

## Context (verified)

- Czech text is inline in JSX. Lines containing Czech diacritics: `App.tsx` 63, `PdfImport.tsx` 59, `PdfPieces.tsx` 30, `Layout.tsx` 19, `PdfSave.tsx` 14, `OrderEditor.tsx` 13, `Library.tsx` 7, `fields.tsx` 3, `export.ts` 3 (about 210; strings without diacritics come on top).
- Strings with interpolation and plurals exist, e.g. `App.tsx:75` "Importováno střihů: {count}…", `Layout.tsx:12-15` `orientationText`, `PdfPieces.tsx:46` aria-label with three values.
- Locale is hard-coded as `'cs'`: `App.tsx:171`, `Layout.tsx:19,163`, `PdfPieces.tsx:90`, `PdfSave.tsx:5`.
- `index.html`: `lang="cs"`, `<title>`, meta description.
- No i18n code exists. Stack: Preact, no backend. Theme choice shows the storage pattern to copy (`src/theme.ts:7-19`, key `fitter:theme`).
- Tests that assert UI strings: `tests/layout.test.ts` (4 lines), `tests/pdf-preview.test.ts`.

## Scope

New `src/i18n/index.ts`, `src/i18n/cs.ts`; all files in `src/ui/`; `tests/i18n.test.ts`.

**Out of scope.** Error strings thrown from `src/model`, `src/pdf`, `src/nest`, `src/geom` (ticket 16). English text and locale switch (17). `index.html` (17). Rewording anything.

## Approach

Recommended (no library):
1. `cs.ts` exports a flat object `{ 'library.title': 'Knihovna střihů', … } as const`. Keys are `area.name`.
2. `index.ts`: `type Key = keyof typeof cs`; `t(key: Key, params?: Record<string, string | number>): string` replacing `{name}`; `plural(key, n, params)` choosing `key.one / .few / .other` with `Intl.PluralRules(locale)`; `fmt.number(n, digits)` wrapping `Intl.NumberFormat(locale)`. Locale is a module-level value fixed to `'cs'` in this ticket.
3. Replace literals file by file, smallest first (`fields.tsx`, `Library.tsx`, …, `PdfImport.tsx` last). One commit per file keeps review possible.
4. Replace `'cs'` literals with `fmt`.
5. JSX fragments with markup inside a sentence: split into separate keys rather than embedding HTML.

Rejected: an i18n library (unneeded weight for two languages). Rejected: nested dictionary objects (harder to type-check and grep).

## Acceptance criteria

CI-safe:
- `tests/i18n.test.ts`: (a) every key used in `src/ui` exists (enforced by TypeScript; test only checks no key maps to an empty string); (b) every `{param}` in a value is a simple identifier; (c) a scan of `src/ui/*.tsx` and `src/ui/*.ts` finds no string literal or JSX text containing a Czech diacritic (regex `[áčďéěíňóřšťúůýž]`, case-insensitive), comments excluded.
- `t('x', { n: 2 })` interpolation and `plural` for 1, 3, 5 (Czech one/few/other) unit tests.
- `tests/layout.test.ts` and `tests/pdf-preview.test.ts` pass with unchanged expected strings.

Manual: side-by-side check of each screen before and after shows identical text.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- Strings used as data must not be translated here: material names, pattern names, `DEFAULT_MATERIAL` (`src/pdf/pieces.ts:20`).
- `aria-label`s and SVG `<desc>` text count as UI strings.
- Messages arriving from thrown errors still appear in Czech from their source; that is expected until ticket 16.
- Merge conflicts: schedule after tickets 23 and 13 so the wording is final.

## Dependencies

23, and preferably 13.

## Size, executor

M. Delegated worker (mechanical, with the grep test as the gate). Plan approval needed (far more than 5 files); the approach above is the plan.

## Definition of done

See README "Definition of done". No README change (no behaviour change).

## Decisions assumed

- D8 ASSUMED: nouns are already renamed by ticket 23.
