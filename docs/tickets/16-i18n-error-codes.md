# 16 · i18n stage 2: error codes in non-UI code

**Goal.** Model, geometry, nesting and PDF modules report problems as codes with parameters; the UI turns them into text through the dictionary.

**Why it matters.** Otherwise an English user still sees Czech sentences whenever something goes wrong, which is exactly when she most needs to understand the screen.

## Context (verified)

- Messages are Czech literals inside `throw new Error(...)` or `fail(path, message)`: `src/model/pattern.ts` (19 sites, lines 34-123; path prefixes like "Díl 3 / XL"), `src/model/prepare.ts` (4 throws, plus notes at lines 83-137 and the plural helper at 65, plus `checkInputs` at 53-64 returning strings), `src/nest/nest.ts` (8), `src/geom/polygon.ts` (4), `src/geom/offset.ts` (1), `src/pdf/place.ts` (5), `src/pdf/trace.ts` (3), `src/pdf/scale.ts` (1), `src/pdf/flatten.ts` (1), `src/pdf/build.ts` (1), `src/pdf/layout.ts` (source labels at 304-330), workers (`src/nest/worker.ts:14`, `src/pdf/trace.worker.ts:8`), `src/storage.ts:15`.
- Errors cross worker boundaries as plain strings (`src/nest/types.ts:31-34`, `src/pdf/types.ts:32`).
- The UI prints `e.message` directly, e.g. `src/ui/App.tsx:51,73,115`, `src/ui/PdfImport.tsx:403,420`.
- Tests assert message text: `tests/prepare.test.ts` (44 lines with Czech), `tests/pattern.test.ts`, `tests/pdf-layout.test.ts`, `tests/pdf-build.test.ts`, `tests/geometry.test.ts`.
- Heuristic vocabularies (`src/pdf/pieces.ts:23-32`, `src/pdf/build.ts:53-54,81`) and data defaults (`DEFAULT_MATERIAL`, "Díl N", "Střih z PDF", demo pattern) are not error text.

## Scope

New `src/errors.ts`; the modules listed above; worker message types; UI call sites that display errors; `src/i18n/cs.ts` (new keys); affected tests.

**Out of scope.** English text (17). Translating data defaults and demo pattern (17 decides). Heuristic regexes (18).

## Approach

Recommended:
1. `class AppError extends Error { constructor(public code: ErrorCode, public params: Record<string, string | number> = {}) }` with `ErrorCode` a string-literal union. `message` is set to the code for logs.
2. Notes from `prepare()` become `{ code, params }[]` instead of strings; `checkInputs` returns the same shape or `null`.
3. Workers post `{ type: 'error', code, params }`; unknown exceptions map to a generic code.
4. `describe(error | note): string` in `src/i18n` looks up `error.<code>` and interpolates; UI uses it everywhere `e.message` was shown.
5. Pattern validation paths: pass piece index and size as params (`{ piece: 3, size: 'XL' }`) and compose the prefix in the dictionary.
6. Layout source labels become an array of codes rendered by the UI.
7. Tests assert `code` (and params where meaningful); keep three or four tests that render Czech text through `describe` to guard the dictionary.

Rejected: translating thrown strings by lookup table of the Czech text (brittle). Rejected: importing the dictionary into model code (workers and pure modules should not depend on UI text).

## Acceptance criteria

CI-safe:
- A scan test: no string literal with Czech diacritics in `src/model`, `src/nest`, `src/geom`, `src/pdf`, `src/storage.ts`, except an allow-list: `src/pdf/pieces.ts` and `src/pdf/build.ts` vocab regexes and defaults, `src/model/demo.ts`.
- Every `ErrorCode` has a `cs` dictionary entry (type-level via `Record<\`error.${ErrorCode}\`, string>` plus a runtime test).
- `tests/worker.test.ts`: an invalid job yields `{ type: 'error', code: … }`.
- All existing tests green after being moved from message regexes to codes.

Manual: trigger three errors (fabric width 0, invalid JSON import, wizard layout with a wrong page range) and confirm the Czech text shown is the same as before.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- Stored workspace and patterns are unaffected (no messages are persisted).
- `storage.ts:15` pushes a message string into state; convert to a code.
- pdf.js exceptions (`PdfImport.tsx:459-462`) keep their technical name in a "details" param.

## Dependencies

15.

## Size, executor

M. Delegated worker. Plan approval needed (many files, cross-module type change).

## Definition of done

See README "Definition of done". README unchanged unless message wording changes.

## Decisions assumed

None beyond the staging itself.
