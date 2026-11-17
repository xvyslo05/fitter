# 29 · Monetization: decide how fitter earns money

**Goal.** Choose one monetization model for fitter, define the smallest experiment that tests it with real users, and write down the decisions it needs. No code until the model is chosen.

**Why it matters.** fitter is free today and has no backend, no accounts and no payments. Every monetization option changes what the product may promise (privacy, "everything stays in your browser"), so the model must be chosen before more features are built around it.

## Context (verified in the repo)

- Static app on GitHub Pages; no server, no accounts, no analytics. All data (library, workspace, settings) lives in IndexedDB / localStorage in the user's browser. Backup/restore exists (`fitter-backup@1`).
- Privacy is a selling point in the UI: "Everything stays on your device" (`app.localBadge`), "Your patterns stay in this browser" (`app.footerPrivacy`).
- Target user: non-technical home sewists who own PDF patterns (README "Target user"). Languages: Czech and English (tickets 15–18). Units: cm and inch.
- Core value for the user: how much fabric to buy (buy box), a printable one-page marker, PDF pattern import that produces a reusable library.
- Pattern PDFs are other people's copyrighted work. The app reads them locally and stores the traced outlines locally; nothing is uploaded. Any paid feature that copies, shares or sells pattern data would need a legal check first.
- Domain and hosting are still open (D10; the owner's own domain is WordPress; suggestion was a subdomain with GitHub Pages).
- Nesting quality is limited: 63–74 % utilisation on tests against 82–88 % for industrial markers (see `tul-marker-sources` notes). A "better nester" (ticket 25) is a possible paid differentiator but is unproven.

## Scope

A decision document and an experiment plan: `docs/monetization.md` (new), plus an update of `docs/tickets/README.md` index and "Assumed product decisions" (new D13). No application code in this ticket.

**Out of scope.** Building any payment, account or analytics code (follow-up tickets after the decision). Legal advice (the document lists questions for a lawyer).

## Candidate models to evaluate

Each is a hypothesis to test, not a recommendation yet. The worker (or head chef) fills in the table with evidence, not guesses.

| # | Model | What is sold | Fits the no-backend design? | Main risk |
|---|---|---|---|---|
| A | Free app, voluntary support (Ko-fi / Buy Me a Coffee / GitHub Sponsors) | Nothing; donation button | Yes, a link only | Small income; needs an audience |
| B | One-off licence for "Pro" features, checked offline (licence key in the browser) | Unlock: unlimited library, PDF import beyond N patterns, print marker, better nester | Mostly; needs a payment provider and a key check | Keys are shareable; weak DRM is accepted |
| C | Subscription with accounts and cloud sync of the library | Sync across devices, backup | No; needs backend, auth, GDPR | Breaks the "stays in your browser" promise; operating cost |
| D | Pay per pattern import (credits) | Each PDF import beyond a free quota | Needs payment and a counter | Annoying at the exact moment of value |
| E | Affiliate links (fabric shops, pattern shops) | Referral commission from the buy box ("where to buy") | Yes, links only | Needs partner programmes; trust and disclosure rules |
| F | B2B / education licence (sewing schools, TUL-like departments, small ateliers) | Classroom or atelier licence, marker rules from school curricula | Yes with licence keys | Long sales cycle; small market in Czechia |
| G | Sponsorship or partnership with a pattern designer or shop (their patterns pre-imported as a catalogue) | Placement, co-branded catalogue | Yes | Needs designers' consent and licence terms |

## Questions to answer

1. Who pays: the home sewist, the pattern designer, the shop, or the school? Which of them has an existing budget line for this?
2. Which feature is valuable enough that someone would pay for it, and which must stay free so that people use the app at all (suggested free core: demo pattern, nesting, buy box)?
3. Is the privacy promise ("nothing leaves your browser") worth more than cloud features? If yes, models A, B, E, F, G stay compatible; C does not.
4. Which payment provider works for a one-person seller in the Czech Republic with EU VAT (OSS) handled automatically? Candidates to compare: Stripe, Paddle or Lemon Squeezy (merchant of record), Gumroad. Compare fees and who files VAT.
5. What is the legal position of storing traced outlines of purchased PDF patterns locally, and of any feature that shares them? Questions for a lawyer, not answers.
6. Which market sizes and prices are real? Use only sourced numbers (pattern shop pricing, sewing-app pricing); mark everything else as an assumption.
7. What does the owner want: pocket money, covering hosting and domain, or a business? This decides how much effort is worth spending.

## Approach

1. Interview or survey 5–10 target users (the owner's contacts; the TUL student friend if she agrees) with three questions: what would you pay for, how much, per what.
2. Fill the table above with sourced evidence; add competitors (marker-making and pattern-layout tools for home sewists) with their price models, each with a URL.
3. Pick the smallest experiment that needs almost no code: for example a donation link plus an "interested in Pro?" email field (static form, no tracking) for 4 weeks, or a pre-sale page for model B. Define the success number before running it.
4. Write the decision in `docs/monetization.md` and set D13 in the README table (replace ASSUMED with the chosen model).
5. Create follow-up tickets only for the chosen model (for example "licence key check", "payment page", "Pro gating").

## Acceptance criteria

- `docs/monetization.md` exists with: the filled comparison table (every number has a source URL or is labelled "assumption"), the chosen model, the free/paid feature split, the experiment with a numeric success threshold, and the lawyer questions.
- README of tickets lists this ticket and D13.
- The privacy statements in the UI stay true under the chosen model, or the document lists exactly which texts must change (keys in `src/i18n/cs.ts` and `en.ts`).
- No analytics, payment or account code is added by this ticket.

## Edge cases and risks

- Adding analytics to measure the experiment contradicts the privacy promise; prefer counting through the payment provider or a plain email list.
- A paywall inside the PDF import wizard hurts the moment of highest value; a limit on the saved library or on printing is gentler.
- Free-to-paid change for existing users: promise in advance what stays free.
- Brand and domain are undecided (D10); a payment page needs a stable name and a legal seller identity (the owner as a sole trader, or a company).

## Dependencies

None for the decision. Domain and hosting (D10) and a legal check should be settled before taking money.

## Size, executor

S (research and writing). Head chef plus the owner; the owner decides. Plan approval is not needed (no code).

## Definition of done

See README "Definition of done" (documentation only: nothing to typecheck beyond keeping the repo green).

## Decisions assumed

- D13 OPEN: monetization model (this ticket). No assumption made; the table above lists the candidates.
