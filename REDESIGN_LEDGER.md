# Learnora Redesign Ledger

Last updated: 2026-08-02 — Phase 2 complete (all 15 batches AUDITED via two parallel sessions:
source-only for 12 batches, live-Playwright-rendered with screenshots for the flagship 3 —
dashboard/notes/exams). Phase 3 synthesized and awaiting sign-off.

This is the master index for the Learnora visual/UX redesign. It is kept deliberately small —
findings live in `redesign/audit/<batch>.md`, not here. A cold session (no memory of prior
conversations) should be able to resume this project using only this file plus the codebase.

## How to resume (read this first)

1. Read this file fully (it's short by design).
2. Read `redesign/DESIGN_MOVES.md` for the agreed direction — do not invent new design moves;
   only ones recorded there with a "Status: APPROVED" line and date are real.
3. Find the next row below with a status that isn't done, open its `redesign/audit/<batch>.md`.
4. Do NOT re-audit a batch marked AUDITED. Do NOT re-apply a batch marked APPLIED/VERIFIED
   without first checking whether DESIGN_MOVES.md changed since.
5. Full plan/rationale: see the plan this ledger was created from (context recap in this file's
   companion doc `redesign/PRIMITIVES.md` and `redesign/DESIGN_MOVES.md` — those two plus this
   file are the complete resumable state).

## Ground rules (carried from the approved plan — do not violate these)

- This is a visual/UX pass, not a rewrite. Preserve all business logic and the 927+ existing
  tests (run scoped `npm test` after every redesign change, before moving to the next batch).
- `webapp/src/styles/tokens.css` and `themes.css` are a finished, AA-contrast-audited API —
  consume them, don't redesign them.
- Preserve, do not erase: the AI chat's distinct glass/purple styling (`components/chat/`),
  the 13 accent presets + Custom Theme Studio, exam-difficulty color coding, the flashcard
  flip interaction.
- Never touch `components/chat/*` or `components/create/*` internals during rollout unless an
  audit specifically flags card-shell duplication inside them.
- Tests query by role/text/testid, which is what makes class-name swaps safe — EXCEPT where a
  test uses `.closest("div")` or similar DOM-depth-sensitive queries (confirmed present in
  `DashboardView.test.tsx`). Check each batch's test file for this before assuming a primitive
  swap is safe.
  **Phase 2 did this check across every test file in the app — do not repeat it.** There are
  eight distinct constraints, not one, and `DashboardView.test.tsx` is not the worst of them:
  `AppShell.test.tsx` matches a literal class-name substring, and four tests depend on state
  modifiers producing *distinct* class strings. The full table is in `redesign/PRIMITIVES.md`
  under "Test-safety constraints". There are no snapshot tests.

## Phase status

- [x] Phase 0 — Plan approved
- [x] Phase 1 — Ledger scaffold created
- [x] Phase 2 — Full audit (all 15 batch rows AUDITED) — code audit done 2026-08-02;
      **screenshots not captured**, see "Screenshot gap" below
- [ ] Phase 3 — Design moves synthesized + user sign-off (see `redesign/DESIGN_MOVES.md`)
      — synthesis **done**; sign-off **PENDING** (owner's call). One decision blocks move #2.
- [ ] Phase 4 — Card/PageHeader primitives built + proven on Dashboard (tests green)
- [ ] Phase 5 — Flagship 3-screen sign-off (Dashboard, Notes, Exams) — user must approve before Phase 6
- [ ] Phase 6 — Full rollout (remaining 12 batches)
- [ ] Phase 7 — Final consistency pass + full test suite + lint green

## Batch table

| Batch | Files | Audit | Screenshots | Redesign | Tests | Notes file |
|---|---|---|---|---|---|---|
| dashboard | 9 | AUDITED | done (live) | TODO | — | redesign/audit/dashboard.md |
| notes | 3 | AUDITED | done (live) | TODO | — | redesign/audit/notes.md |
| exams | 3 | AUDITED | done (live) | TODO | — | redesign/audit/exams.md |
| library | 6 | AUDITED | — | TODO | — | redesign/audit/library.md |
| plan | 1 | AUDITED | — | TODO | — | redesign/audit/plan.md |
| quiz | 3 | AUDITED | — | TODO | — | redesign/audit/quiz.md |
| review | 1 | AUDITED | — | TODO | — | redesign/audit/review.md |
| settings | 8 | AUDITED | — | TODO | — | redesign/audit/settings.md |
| tasks | 3 | AUDITED | — | TODO | — | redesign/audit/tasks.md |
| terms | 1 | AUDITED | — | TODO | — | redesign/audit/terms.md |
| timer | 2 | AUDITED | — | TODO | — | redesign/audit/timer.md |
| auth | 6 | AUDITED | — | TODO | — | redesign/audit/auth.md |
| shell (AppShell/Sidebar/Header) | 3 | AUDITED | — | TODO | — | redesign/audit/shell.md |
| components (shared, 29 files) | 29 | AUDITED | — | TODO | — | redesign/audit/components.md |
| chat (preserve, audit-only) | 3 | AUDITED | — | N/A | — | redesign/audit/chat.md |

**Status vocab — Audit:** TODO / SCREENSHOTTED / AUDITED
**Status vocab — Redesign:** TODO / IN_PROGRESS / APPLIED / VERIFIED / SIGNED_OFF / N/A
**Status vocab — Tests:** — / PASS / FAIL (link failure detail in the batch's own file, not here)

### Screenshot gap — partially closed

Two independent Phase 2 passes ran in parallel: one source-only (12 batches — library, plan,
quiz, review, settings, tasks, terms, timer, auth, shell, components, chat), one with a working
live-render setup (3 flagship batches — dashboard, notes, exams). The live pass solved the
auth problem the source-only pass hit (every view but `terms`/`auth` sits behind Supabase auth)
by seeding a fake session into `localStorage` (matching what `supabase-js`'s `persistSession`
reads) and intercepting REST/auth/functions calls via Playwright route mocking with fixtures
shaped from each batch's own MSW test handlers — see the "Rendering" section at the top of
`dashboard.md`/`notes.md`/`exams.md` for the exact technique, including two gotchas worth
carrying into Phase 4: appearance localStorage values must be `JSON.stringify`'d (bare strings
silently fall back to defaults), and Playwright's `fill()`/`click()` auto-scroll can clip a
sticky element if the view scrolls its own container rather than the window.

**For dashboard/notes/exams specifically, this resolves the PENDING VISUAL question for moves
#4 (accent restraint) and #6 (empty/loading/error polish)** — captured live across light/dark/a
non-default accent preset plus empty/loading/error states for all three. Verdict for these
three: accent usage reads as tasteful in both themes and the loud `cyberpunk` preset; empty/
loading/error states are calm and consistent. The remaining 12 batches are still source-only and
still PENDING VISUAL for #4/#6 — **still recommend folding that visual capture into Phase 4**
rather than reopening Phase 2 for the rest, since the primitive swap needs a before/after diff
of those views anyway.

### Phase 2 headline findings

Full detail in `redesign/DESIGN_MOVES.md`. The three that change the plan:

1. **Two card recipes, and the plan assumed the wrong default.** `--r-lg`/`--shadow-sm`
   ("panel") appears 23 times across 10 modules; `--r-xl`/`--shadow-md` ("elevated") appears 6.
   `PRIMITIVES.md`'s variant API has been revised accordingly.
2. **The PageHeader move is blocked on a design decision.** The shell's `Header` already renders
   the section label, and five views render an `<h1>` with the same string right below it —
   identical in every locale. Building the primitive as specified would systematise a visible
   double heading. See DESIGN_MOVES #2 for the decision and the audit's recommendation.
3. **Two new moves and one correctness fix surfaced** that were not among the six seeded
   hypotheses: a 42px glass icon button declared 4× (#7), five uncoordinated breakpoints (#8),
   and nested `<main>` landmarks on every signed-in route (#9).

Also: one **HIGH-severity accessibility defect** found in passing — the dashboard AI command bar
input has no focus indicator at all (`commandBar.module.css:52,56-58`). Recorded in
`redesign/audit/dashboard.md`; it is a standalone bug fix, not gated on any of this.

### Batch-coverage gap

`webapp/src/lib/markdown.module.css` (14 hardcoded px) is not owned by any of the 15 batch rows.
It styles AI-generated markdown and is therefore user-visible on every AI surface. Either add a
16th row for `lib/` or fold it into the `components` batch before Phase 6.

### Corrections to this ledger's own prose (from the audit)

- The chat preserve rule below says "glass/**purple** styling". The purple was deliberately
  removed — `chat.module.css:120-125` records replacing a fixed indigo `#6b7ee8` with the user's
  accent so the bubble follows their preset. Preserving "purple" literally would undo that.
  Read the rule as "the AI chat's distinct glass styling".
- The `library` batch stub described a "split-pane view using a toolbar". Library is a tabbed
  single-column view with a header-plus-actions; `notes` is the only genuine toolbar case.
- The `quiz` batch stub carried the "preserve the flashcard flip" note. The flip lives in
  `review` (`review.module.css:60-100`).

## Flagship screens (Phase 5 sign-off gate)

Dashboard, Notes, Exams — chosen for varied UI shapes (stat cards, rich-text/list content,
forms+calendar). Full rollout to the remaining 12 batches (Phase 6) may not begin until the
user has explicitly signed off on these three, recorded in this file's Phase status above.
