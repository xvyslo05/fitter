# 23 · Rename to "polohový plán" and plain nouns

**Goal.** Use the trade term "polohový plán" for the nesting result and replace workshop jargon with words a home sewist uses.

**Why it matters.** "Zakázka", "Kandidát" and "Skupina variant" tell a hobby sewist nothing. "Polohový plán" is the term taught in Czech clothing schools for the layout of pattern pieces on fabric.

## Context (verified at commit 8045a1a)

Renames requested by the product owner:
- "rozložení" (nesting result) → "polohový plán"
- "Zakázka" → "Co šiju"
- "Kandidát" → "Díl"
- "Skupina variant" → "Možnosti dílu"

Occurrences:
- "rozložení" meaning the nesting result: `src/ui/App.tsx:104, 112, 116, 133, 188, 197, 200, 201`; `src/ui/Layout.tsx:84, 87, 165, 184`; `src/ui/PdfSave.tsx:32`. README: 7 lines contain the word. `index.html:13-14` (description "Rozložte střihy na látku…", title "fitter · Střihy na svém místě").
- **Do not rename** "rozložení stránek" in `src/ui/PdfImport.tsx:369, 479`: there it means the arrangement of PDF pages.
- "Zakázka / zakázka": `src/ui/App.tsx:51, 92, 97, 121, 144, 152, 157, 203`; `src/ui/Library.tsx:25`; `src/ui/Layout.tsx:184`; `src/model/prepare.ts:83, 122` (messages).
- "Kandidát / kandidát": `src/ui/PdfImport.tsx:267, 367, 369`; `src/ui/PdfPieces.tsx:46, 69, 70, 75, 93`; `src/pdf/build.ts:27`.
- "Skupina variant" / "Varianta": `src/ui/PdfPieces.tsx:105, 106`; `src/ui/OrderEditor.tsx:36`.
- No file in `tests/` asserts any of these words (checked with grep), but `tests/prepare.test.ts` asserts other message fragments; re-run after editing `prepare.ts`.
- Code identifiers (`OrderLine`, `variantGroup`, `PieceCandidate`) and the file format field names stay as they are.

## Scope

`src/ui/App.tsx`, `src/ui/Layout.tsx`, `src/ui/Library.tsx`, `src/ui/OrderEditor.tsx`, `src/ui/PdfImport.tsx`, `src/ui/PdfPieces.tsx`, `src/ui/PdfSave.tsx`, `src/model/prepare.ts`, `src/pdf/build.ts`, `index.html`, `README.md`.

**Out of scope.** Layout changes (13). Identifier or file-format renames. Any other rewording.

## Approach

1. Head chef writes a replacement table with the grammatical forms, and the owner approves it before edits. Proposed:
   - "Spočítat rozložení" → "Vytvořit polohový plán"; "Vaše rozložení" → "Váš polohový plán"; "Rozložení je připravené." → "Polohový plán je připravený."; "Hledám úspornější rozložení" → "Hledám úspornější polohový plán"; "Stáhnout rozložení" → "Stáhnout polohový plán"; aria-label "Rozložení dílů na materiálu X" → "Polohový plán pro materiál X".
   - Panel heading "Zakázka" → "Co šiju"; "+ Přidat řádek zakázky" → "+ Přidat další střih"; messages: "Zakázka je příliš velká…" → "Je toho moc najednou. Rozdělte šití na části do 500 dílů."; "Střih ze zakázky není v knihovně" → "Vybraný střih není v knihovně"; "odstraněno z knihovny i zakázky" → "odstraněno z knihovny i z plánu".
   - "Kandidát N" → "Díl N"; "Kandidáti dílů" → "Nalezené díly"; "Nalezeno kandidátů: N" → "Nalezeno dílů: N"; `build.ts:27` "už mezi kandidáty není" → "už mezi nalezenými díly není".
   - "Skupina variant" → "Možnosti dílu"; "Varianta" → "Možnost"; order editor "Varianta · {group}" → "{group}" with the select options as they are.
   - On first use in the result heading, add a short gloss: "Polohový plán – rozmístění dílů střihu na látce."
2. Worker applies the table exactly; no opportunistic rewording.
3. README: same replacements, and one sentence defining "polohový plán" near the top.
4. `index.html`: description "Vytvořte polohový plán střihu na látku. Soukromě, přímo v prohlížeči."; title unchanged unless the owner says otherwise.

Rejected: introducing the i18n dictionary first (the rename is smaller and makes extraction cleaner). Rejected: renaming identifiers (no user benefit, large diff).

## Acceptance criteria

CI-safe:
- `grep -rn "Zakázk\|zakázk\|Kandidát\|kandidát\|Skupina variant" src index.html` returns nothing.
- `grep -rn -i "rozložení" src index.html` returns only the two "rozložení stránek" lines in `src/ui/PdfImport.tsx` (or zero if those are reworded to "uspořádání stránek" by owner choice).
- `grep -c -i "polohový plán" README.md` ≥ 5.
- `npm run typecheck && npm run lint && npm test` green.

Manual: owner reads every screen once on the deployed build.

## Edge cases and risks

- Czech declension: "polohového plánu", "polohovém plánu" in sentences; do not leave half-declined text. This is why the table is approved first.
- Button width: "Vytvořit polohový plán" is longer than "Spočítat rozložení"; check the 560 px breakpoint.
- `aria-label`s and SVG `<desc>` texts are included in the rename.

## Dependencies

None. Must land before 13 and 15.

## Size, executor

S–M. Head chef for the wording table; delegated worker for edits. Plan approval needed (11 files); the approved wording table is the plan.

## Definition of done

See README "Definition of done". README updated in the same change. All strings Czech.

## Decisions assumed

- D8 ASSUMED: rename nouns as listed (the four renames themselves are the product owner's instruction; the derived phrases in the table are proposals).
