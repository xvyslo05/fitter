# 19 · Library and project backup/restore

**Goal.** One button saves all patterns and the current plan to a single file, and one button restores them.

**Why it matters.** Patterns live only in this browser. Clearing browser data or changing computer deletes hours of import work, and the user has no obvious way to prevent it.

## Context (verified)

- Patterns: IndexedDB store `fitter-library` / `patterns`, one entry per pattern id (`src/storage.ts:8-20`). `loadLibrary` validates each with `parsePatternFile` and reports damaged ones.
- Workspace (order, fabrics, settings): `localStorage` key `fitter:workspace:v1`, validated field by field on load (`storage.ts:27-57`).
- Theme: `fitter:theme` (`src/theme.ts:7`).
- Only per-pattern JSON download exists, inside the wizard's last step (`src/ui/PdfSave.tsx:7-11`); JSON import accepts one pattern per file, 25 MB limit (`src/ui/App.tsx:59-77`).
- README states that clearing browser data removes the library.
- Library files are 13–290 KB each as JSON.
- `tests/storage.test.ts` exists (37 lines).

## Scope

`src/storage.ts` (export/import functions), `src/ui/Library.tsx` (buttons, in the Advanced block if ticket 13 is merged), `src/ui/App.tsx` (wiring, messages), `tests/storage.test.ts`, README "Soukromí a ukládání".

**Out of scope.** Cloud sync, accounts, sharing links. Automatic scheduled backups.

## Approach

Recommended:
1. File format: JSON `{ format: 'fitter-backup@1', created: ISO date, patterns: PatternFile[], workspace: Workspace }`, file name `fitter-zaloha-YYYY-MM-DD.json`.
2. `exportBackup(patterns, workspace): Blob` (demo pattern excluded).
3. `parseBackup(json): { patterns, workspace, errors }`: validate `format`; run every pattern through `parsePatternFile`, collecting failures by name without aborting; run the workspace through the same validation as `loadWorkspace` (extract that validation into a function taking the parsed object).
4. Restore UI: after choosing a file, show "Záloha obsahuje N střihů z DD.MM.YYYY. Obnovit?" with two choices: "Přidat k mým střihům" (same id replaces) and "Nahradit vše". The workspace is replaced only on "Nahradit vše".
5. The JSON file input also accepts a backup file dropped onto the existing dropzone (detect by `format`).
6. Reminder: after a pattern is saved from the wizard, the confirmation message adds "Tip: zálohujte si střihy do souboru."

Rejected: zipping (adds a dependency; sizes are small). Rejected: exporting raw IndexedDB (not portable across browsers).

## Acceptance criteria

CI-safe, `tests/storage.test.ts`:
- Round trip: two patterns plus a workspace → `exportBackup` → `parseBackup` → deep-equal patterns and workspace.
- A backup containing one invalid pattern restores the others and reports one error naming the pattern.
- Wrong `format` → rejected with a clear error.
- Backup `patterns` including the demo id → that entry is ignored.
- File over 25 MB or over the app's pattern limits → rejected (reuse existing limit).
- Existing storage tests green.

Manual: export, clear site data, import, and find library and plan as before.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- Storage unavailable (private mode): restore still fills in-memory state and shows the existing "ukládání není dostupné" note.
- Order lines referring to patterns missing from the backup are dropped on restore (same rule as `removePattern`).
- Do not include the theme; it is a device preference.

## Dependencies

None. Placement follows ticket 13 if merged.

## Size, executor

S. Delegated worker. No plan approval (4 files plus README).

## Definition of done

See README "Definition of done". README privacy section documents backup and restore. Strings in Czech.

## Decisions assumed

- D6 ASSUMED: whole-library backup is the main safety net; per-pattern JSON moves to Advanced.
