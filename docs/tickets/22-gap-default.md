# 22 · Gap between pieces: one pinned default and plain help text

**Goal.** The default gap between pieces lives in one named constant pinned by a test, and the field explains in plain Czech what the gap is for.

**Why it matters.** The gap decides how much fabric is planned. A home sewist needs to know whether to leave it alone, and the right default is still being confirmed.

## Context (verified)

- `src/model/prepare.ts:19-22`: `defaultSettings` contains `gap: 0.5` (cm) inline, next to `seamAmount: 1`, `resolution: 0.5`, `timeMs: 5000`, `seed: 42`.
- Validation: `checkInputs` allows 0–10 cm (`prepare.ts:54`); the nester validates the same range (`src/nest/nest.ts:12`); storage accepts 0–10 (`src/storage.ts:45`).
- Use: each piece is inflated by `gap / 2` before rasterising (`src/nest/raster.ts:29`), so two pieces end up at least `gap` apart. Fabric edges get no margin (README "Hrany látky nemají povinný odstup"); on folded fabric ordinary pieces keep `gap / 2` from the fold (`nest.ts:50-52`).
- UI: `src/ui/App.tsx:179` field "Mezera mezi díly" with no explanation.
- Tests: `tests/nest.test.ts:31-36` checks real distances for gaps 0, 0.5, 1.3; `tests/prepare.test.ts:63` checks the validation message. No test pins the default.
- Raster step default is 0.5 cm, so real gaps are rounded up conservatively.
- The right default is pending the TUL student's notes (ticket 28). Industrial markers on cutters often use 0; hand cutting with scissors usually wants a few millimetres. Not confirmed.

## Scope

`src/model/prepare.ts`, `src/ui/App.tsx`, `tests/prepare.test.ts`, README "Použití" step 4.

**Out of scope.** Edge margin setting (ticket 28 decides if needed). Changing the validation range. Raster behaviour.

## Approach

Recommended:
1. `export const DEFAULT_GAP_CM = 0.5;` in `src/model/prepare.ts` with a comment "pending confirmation, ticket 28"; `defaultSettings.gap = DEFAULT_GAP_CM`.
2. Help text under the field: "Mezera mezi díly: místo na stříhání mezi sousedními díly. Pro stříhání nůžkami nechte 0,5 cm; při 0 se díly mohou dotýkat."
3. If seam allowance is being added by the app, add a second sentence: "Švová záložka je už započítaná zvlášť."
4. A "Výchozí" link next to the field resets to the constant.

Rejected: changing the default now (no confirmed value). Rejected: hiding the field under Advanced (it directly changes fabric consumption and is easy to explain).

## Acceptance criteria

CI-safe, `tests/prepare.test.ts`:
- `expect(DEFAULT_GAP_CM).toBe(0.5)` and `expect(defaultSettings.gap).toBe(DEFAULT_GAP_CM)`. Changing the default later means changing exactly this constant and this test.
- A source check: the literal `gap: 0.5` no longer appears in `src/` outside tests (grep in the test, or by review).
- Existing tests green.

Manual: the help text shows under the field; "Výchozí" restores 0,5.

Commands: `npm run typecheck && npm run lint && npm test`.

## Edge cases and risks

- Saved workspaces keep their own gap value; a later default change affects only new users. State this in the README.
- If ticket 28 returns different values for different cutting methods, a follow-up may add presets ("nůžky", "řezací kolečko"); do not build that now.

## Dependencies

28 for the confirmed value (not blocking).

## Size, executor

S. Delegated worker. No plan approval.

## Definition of done

See README "Definition of done". README step 4 gains the one-line explanation. Strings in Czech.

## Decisions assumed

- Potvrzeno 2026-11-21 přednáškou TUL (Zelová, 4. přednáška, slide 11 resp. 12), viz docs/marker-rules.md.

- D12 CONFIRM VALUE: default gap 0.5 cm stays until the school notes say otherwise.
