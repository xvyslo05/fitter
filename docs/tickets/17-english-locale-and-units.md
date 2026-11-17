# 17 · English dictionary, locale switch, number and unit formatting

**Goal.** The app can be used in English, picks the language automatically with a manual switch, and can show lengths in inches.

**Why it matters.** English opens the app to sewists outside the Czech Republic; many of them think in inches and yards.

## Context (verified)

- After tickets 15 and 16 all UI text and error text come from `src/i18n/cs.ts` via `t()`, `plural()`, `describe()`, and numbers via `fmt`.
- Header already has a select for the theme, stored under `fitter:theme` and applied before first paint by an inline script (`index.html:8-11`, `src/theme.ts:7-31`, `src/ui/App.tsx:139-141`).
- `index.html`: `lang="cs"`, Czech `<title>` and meta description (lines 2, 13, 14).
- All lengths are cm internally. Inputs use `NumberField` with suffix "cm" (`src/ui/fields.tsx:3-11`); marker rulers tick every 10 cm (`src/ui/Layout.tsx:20,91-97`); exports state cm.
- Data defaults in Czech: `DEFAULT_MATERIAL = 'hlavní'` (`src/pdf/pieces.ts:20`), fallback piece name "Díl N" (`pieces.ts:268`), "Střih z PDF" (`src/pdf/build.ts:90`), demo pattern names and materials (`src/model/demo.ts`). Material names are keys in saved patterns and in `workspace.fabrics` (`src/storage.ts:39-42`).
- Size sorting uses a Czech collator (`build.ts:64`).

## Scope

New `src/i18n/en.ts`; `src/i18n/index.ts` (locale state, detection, persistence); `src/ui/App.tsx` (switch); `index.html`; `src/ui/fields.tsx`, `src/ui/Layout.tsx`, other places that print or read lengths; `src/model/demo.ts` (localised demo); tests.

**Out of scope.** English vocabulary for PDF heuristics (18). README translation (separate small task once wording settles). Inch-based internal geometry.

## Approach

Recommended:
1. `en.ts` typed as `Record<keyof typeof cs, string>` so a missing key fails typecheck.
2. Locale: stored value under `fitter:locale`; otherwise first of `navigator.languages` starting with `cs` or `sk` → `cs`, anything else → `en`. Switch "Jazyk / Language" beside the theme select. Set `document.documentElement.lang` and document title on change; inline script in `index.html` sets `lang` before paint.
3. Re-render on change: locale held in a Preact context or a tiny store with a `useLocale()` hook.
4. Units: setting `unit: 'cm' | 'in'`, default `cm` for `cs`, `in` for `en-US`, `cm` for other English locales; user can switch. `fmt.length(cm)` and `parseLength(text)` convert at the edges; inch input accepts decimals and simple fractions (`5/8`, `1 1/2`). Rulers tick every 10 cm or every 5 in.
5. Fabric width presets (ticket 13) per unit: 110 / 140 / 150 cm; 44, 54, 60 in.
6. Data defaults: new patterns created while in English get "main" and "Piece N"; existing stored patterns are never rewritten. Demo pattern is produced by a function of the locale but keeps its id.
7. Head chef reviews the English wording with sewing terms: fold, grainline, seam allowance, nap, selvage, lay plan.

Rejected: translating material names of stored patterns on the fly (they are keys; would break fabric settings). Rejected: yards-only display (inches are needed for widths and allowances; show yards additionally for the length to buy).

## Acceptance criteria

CI-safe:
- Key parity and placeholder parity between `cs` and `en` (same `{params}` per key).
- Locale detection: `['cs-CZ']` → cs; `['sk']` → cs; `['en-GB', 'cs']` → en; stored value wins.
- `fmt.length(2.54, 'in')` → `1`; `parseLength('5/8', 'in')` → `1.5875` cm; `parseLength('1 1/2', 'in')` → `3.81`; round trip of 140 cm in inches stays within 0.01 cm.
- English plural for 1 and 2.
- Workspace saved in cm loads identically under either unit.
- Existing tests green.

Manual: switch to English and walk every screen and the four wizard steps; no Czech left except pattern data; switch to inches and nest the demo.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- Number format: `en` uses a decimal point, `cs` a comma; inputs must accept both.
- SVG/PNG export and print (ticket 14) must follow the active locale and unit.
- Layout widths: English strings are often shorter, some longer ("Seam allowance"); check narrow breakpoints.

## Dependencies

15, 16.

## Size, executor

M. Delegated worker; head chef reviews wording. Plan approval needed (5+ files, unit handling is a design decision).

## Definition of done

See README "Definition of done". README gains a short "Jazyk a jednotky" note. Czech strings unchanged.

## Decisions assumed

- D5 ASSUMED: cm and inch as a display setting, cm internally.
