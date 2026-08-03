# Learnora Redesign Ledger

Last updated: 2026-08-03 — Phase 6 rollout: components batch VERIFIED (see footnote ¹²) —
documentation-only round that closes out every remaining open Card/PageHeader/IconButton
question in the app, including the long-deferred NotesAiSidebar surfaces (all three confirmed
not a fit, for three different reasons) and `create/MaterialPanel`'s flagged "re-declares a card
shell" trigger (on inspection, neither surface is actually card-shaped). shell batch VERIFIED the
round before (footnote ¹¹) — built the
`IconButton` primitive (move #7) and applied it to Header's three buttons; found move #7's own
evidence citation was stale (`library.iconBtn` is a different, smaller button — corrected in
DESIGN_MOVES.md). The audit's nested-`<main>` HIGH finding is re-confirmed still open, reserved
for Phase 7 per the audit's own scoping. auth batch VERIFIED the round before (footnote ¹⁰) — no
migration, re-confirmed against current source that `.card`'s one-off `--glass-bg-strong`/
36px-blur/no-own-radius recipe still doesn't match any Card variant; "most internally consistent
batch in the app" per the original audit, still true. terms batch VERIFIED the round before
(footnote ⁹) —
no migration (both `subtle`-variant candidates turned out to use `--glass-bg`, not the variant's
actual `--surface-2`), but found and fixed a stale evidence citation in `Card.module.css`'s
`subtle` comment that miscited `terms.tocBox`/`exams.overflowBadge` as matches. review batch
VERIFIED the round before (footnote ⁸) — documentation-only, corrected a PageHeader planning
error. quiz batch VERIFIED two rounds back (footnote ⁷). plan batch VERIFIED three rounds back
(footnote ⁶). library batch VERIFIED four rounds back (footnote ⁵) — the `<PageHeader>`
primitive is now built and applied. Settings batch VERIFIED five rounds back (footnote ⁴),
extending `<Card>` with a narrow `as="div" | "section"` prop. Phase 3 signed off by owner (see
`redesign/DESIGN_MOVES.md`, `Status: APPROVED 2026-08-03`), including the PageHeader decision
(drop the 5 duplicate h1s, promote the shell header's label to `<h1>`).

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
- [x] Phase 3 — Design moves synthesized + user sign-off — **APPROVED 2026-08-03**
      (see `redesign/DESIGN_MOVES.md`). Move #2 decision: drop the 5 duplicate h1s.
- [x] Phase 4 — Card primitive built + proven on Dashboard (tests green) — **DONE 2026-08-03**.
      Move #2 (duplicate h1) implemented too — see PRIMITIVES.md's "Build status" for why it
      couldn't stay Dashboard-only (Header.tsx is global). `<PageHeader>` itself deferred to
      Phase 6/Library, its first real consumer.
- [ ] Phase 5 — Flagship 3-screen sign-off (Dashboard, Notes, Exams) — **Card migration done and
      verified 2026-08-03 (933/933 tests, live-rendered screenshots in
      `redesign/screenshots/phase4-verify/` and `phase5-verify/`)**; awaiting the owner's visual
      sign-off before Phase 6 rollout begins.
- [ ] Phase 6 — Full rollout (remaining 12 batches) — IN PROGRESS, started 2026-08-03.
      tasks/timer done round 1. settings done round 2 — all 8 instances turned out to be
      `<section aria-labelledby>` (not mixed with `<div>` as first assumed), so `<Card>` gained
      a narrow `as="div" | "section"` prop rather than leaving the batch CSS-only. See footnote ⁴
      and PRIMITIVES.md's Build status. library done round 3 — `<PageHeader>` built (its
      declared first consumer) plus a Card migration on the subject-workspace sections; the
      four `.card` grid tiles stayed CSS-only (all `<li>` roots). See footnote ⁵. plan done
      round 4 — all three glass shells migrated; `.dayCard` stayed CSS-only (`<li>` root). No
      page-heading gap to fix (already resolved by Phase 4's move #2 correction). See footnote ⁶.
      quiz done round 5 — the shared `.panel` shell (5 call sites) migrated, exact match, zero
      residual. `.reviewQuestion` stayed CSS-only (`<article>` root, single instance — not
      enough evidence to extend `as` again). See footnote ⁷. review done round 6 —
      documentation-only: corrected the PageHeader plan (Review's `<h1>` isn't a duplicate, so
      it wasn't migrated) and confirmed zero Card candidates (`.card`/`.face` is the flashcard
      flip, explicitly do-not-migrate; `.header` is a plain layout wrapper). See footnote ⁸.
      terms done round 7 — no migration (`.tocBox`/`.backBtn` use `--glass-bg`, not `subtle`'s
      `--surface-2`); fixed a stale `Card.module.css` comment that miscited both as matches.
      See footnote ⁹. auth done round 8 — no migration, re-confirmed `.card`'s one-off recipe
      (`--glass-bg-strong`, radius owned by the parent `.layout`) against current source.
      See footnote ¹⁰. shell done round 9 — built `IconButton` (move #7), applied to Header;
      corrected move #7's stale `library.iconBtn` citation. Nested-`<main>` HIGH finding
      re-confirmed open, deferred to Phase 7 per the audit's own scoping. See footnote ¹¹.
      components done round 10 — no migration; closed the NotesAiSidebar and MaterialPanel
      threads for good, the last two open Card/PageHeader/IconButton questions in the app.
      See footnote ¹². **Every batch is now VERIFIED or N/A except `chat` (permanently N/A).**
- [ ] Phase 7 — Final consistency pass + full test suite + lint green

## Batch table

| Batch | Files | Audit | Screenshots | Redesign | Tests | Notes file |
|---|---|---|---|---|---|---|
| dashboard | 9 | AUDITED | done (live) | VERIFIED | PASS | redesign/audit/dashboard.md |
| notes | 3 | AUDITED | done (live) | VERIFIED² | PASS | redesign/audit/notes.md |
| exams | 3 | AUDITED | done (live) | VERIFIED | PASS | redesign/audit/exams.md |
| library | 6 | AUDITED | done (live) | VERIFIED⁵ | PASS | redesign/audit/library.md |
| plan | 1 | AUDITED | done (live) | VERIFIED⁶ | PASS | redesign/audit/plan.md |
| quiz | 3 | AUDITED | done (live) | VERIFIED⁷ | PASS | redesign/audit/quiz.md |
| review | 1 | AUDITED | — | VERIFIED⁸ | PASS | redesign/audit/review.md |
| settings | 8 | AUDITED | done (live) | VERIFIED⁴ | PASS | redesign/audit/settings.md |
| tasks | 3 | AUDITED | — | VERIFIED³ | PASS | redesign/audit/tasks.md |
| terms | 1 | AUDITED | — | VERIFIED⁹ | — | redesign/audit/terms.md |
| timer | 2 | AUDITED | — | VERIFIED | PASS | redesign/audit/timer.md |
| auth | 6 | AUDITED | — | VERIFIED¹⁰ | PASS | redesign/audit/auth.md |
| shell (AppShell/Sidebar/Header) | 3 | AUDITED | done (live) | VERIFIED¹¹ | PASS | redesign/audit/shell.md |
| components (shared, 29 files) | 29 | AUDITED | — | VERIFIED¹² | — | redesign/audit/components.md |
| chat (preserve, audit-only) | 3 | AUDITED | — | N/A | — | redesign/audit/chat.md |

**Status vocab — Audit:** TODO / SCREENSHOTTED / AUDITED
**Status vocab — Redesign:** TODO / IN_PROGRESS / APPLIED / VERIFIED / SIGNED_OFF / N/A / h1 only¹

¹ **h1 only**: the duplicate per-view `<h1>` was dropped (move #2, see PRIMITIVES.md's Build
status for why this couldn't stay Dashboard-only) — the batch is *not* otherwise redesigned;
its Card-shell migration is still Phase 6 work.

² **notes VERIFIED is partial by design**: only `.editorPane` (the clearest, best-evidenced
instance) was migrated to `<Card>`. `NotesAiSidebar`'s three surfaces (`.card`, `.chat`,
`.dock`) were deliberately left alone — `.card` is a real `<button>` (Card is div-only by
design), and `.chat`/`.dock` don't cleanly match the current variant contract (different
background token, non-standard radius) without ad hoc per-instance overrides. **Resolved
permanently in the components round (footnote ¹²)**: revisited with the full app's evidence in
hand and confirmed none of the three clears the bar for extending the contract — this is a
closed decision, not still-pending. See PRIMITIVES.md's Build status.

³ **tasks VERIFIED is partial by design**: `.inputCard` → `<Card variant="panel">` (residual
padding override, since `var(--s-5)`'s flat 20px doesn't match any of Card's padding options).
`.item` (the audit's `tasks.taskItem` — matches the "row" recipe exactly) was **not** migrated:
it's a `<li role="checkbox">` inside a `<ul>`, and Card is div-only by design — swapping would
break list semantics. `.empty`/`.dashTask` left CSS-only, same reasoning as Notes' AI sidebar
(non-matching radius/background without ad hoc overrides).

⁴ **settings VERIFIED, all 6 files/8 instances migrated** (Account ×2, Danger ×1, Notifications
×1, Preferences ×2, Appearance ×1, Security ×2). All 8 turned out to be `<section
aria-labelledby="...">` landmarks, not a div/section mix as first assumed from the audit —
`<Card>` was div-only, so rather than leave a real, well-evidenced, 6-file pattern CSS-only,
`Card` gained a narrow `as?: "div" | "section"` prop (default `"div"`, unchanged for every
existing call site). This is explicitly **not** general polymorphism: still no `button`/`li`
targets, ever (NotesAiSidebar's `.card` button and Tasks' `.item`/`<li>` remain permanently
excluded, same reasoning as footnotes ² and ³). `settings.card`'s one-off hybrid shadow
(`--glass-inner`+`--glass-inner-bottom`+`--shadow-sm`) kept as a doubled-selector residual
override, same technique as Notes' `.editorPane`. See PRIMITIVES.md's Build status for the full
verification record.

⁵ **library VERIFIED**: `<PageHeader>` (title/sub/actions) built and applied to `LibraryView`,
replacing the hand-rolled `.header`/`.title`/`.headerSub` — Library was the primitive's declared
first consumer (see PRIMITIVES.md's PageHeader section). Its `title` renders as a `<p>`, not an
`<h1>`, correcting the original PageHeader spec written before move #2 (the shell already
supplies the page's one heading). `SubjectDetailPage`'s `Section` wrapper (`.workspaceSection`)
also migrated to `<Card as="section" variant="elevated" padding="md">`, an exact match with zero
residual override. The four grid-tile `.card` instances (Folders/Materials/Flashcards/Quizzes
panels) are all `<li>` roots and stayed CSS-only, same list-semantics exclusion as Tasks' `.item`
(footnote ³); `.iconBtn` awaits move #7 (glass icon button, not yet built); `.newCard`/
`.newCardBtn`/`.dueBanner`/`.backLink`/`.tabs` don't match any variant recipe cleanly. See
PRIMITIVES.md's Build status for the full list.

⁶ **plan VERIFIED**: `.summaryCard`, `.summary` (AI week summary), and `.emptyState` all migrated
to `<Card variant="panel" padding="none">` with a residual doubled-selector padding override
each (all three used a two-value padding that doesn't match a single-value Card preset).
`.dayCard` stayed CSS-only — it's an `<li>` root, same exclusion as Tasks'/Library's row cards;
its hardcoded `blur(16px)` drift (a pre-existing audit finding, third instance app-wide) is
unrelated to this round and untouched. The audit's "no page heading" finding was already fixed
as a side effect of Phase 4 (Plan was one of the two extra routes found to duplicate the shell's
`<h1>`), so no `<PageHeader>` was needed here.

⁷ **quiz VERIFIED**: the shared `.panel` shell used across all 5 QuizRunner/QuizReview states
(no-usable-questions, finished, in-progress, no-attempt-yet, review) migrated to
`<Card variant="panel" padding="lg">` — an exact match on recipe, radius, and padding, so no
residual override was needed at all. `.reviewQuestion` (the per-question card inside the review
list) stayed CSS-only: it's an `<article>` root and Card only supports `div`/`section`, and a
single one-off instance doesn't clear the evidence bar that justified extending `as` for
Settings' 6-file pattern.

⁸ **review VERIFIED, no code changed.** Investigated as `<PageHeader>`'s planned second consumer
and found the plan was wrong: Review's `<h1>{deckTitle}</h1>` is not a duplicate of the shell's
heading (which shows the generic "Library" on every `isLibrarySection` route, `/review/:deckId`
included) — migrating it through `<PageHeader>` would have deleted the page's only real heading
rather than fixed a duplicate. Corrected in PRIMITIVES.md's PageHeader section; `review` now
joins `quiz` on the "do not migrate" heading list, both for the identical reason. `.card`/`.face`
(the flashcard 3D flip) remain explicitly excluded from Card, per the Phase 2 audit's own LOW-
confidence call — confirmed still accurate on inspection. `.header` is a plain layout wrapper
(width + margin only), not a glass shell, so there was no Card candidate to migrate either. The
two hardcoded `border-radius: 20px` literals (exactly `--r-lg`) stay an open, separately-tracked
LOW finding, same treatment as other rounds' untouched blur-drift findings.

⁹ **terms VERIFIED, no code migrated.** `.header` is a standalone-document header (route sits
outside `AppShell`) — correctly N/A for `<PageHeader>`. `.tocBox`/`.backBtn`, the audit's two
LOW-confidence `subtle`-variant candidates, turned out not to match: `.tocBox` uses
`background: var(--glass-bg)` where `subtle` actually sets `--surface-2` (translucent-glass vs.
solid-flat, a real visual difference in both themes, not incidental), plus a padding
(`--s-5`) that matches no Card preset — two residual overrides on one LOW-confidence instance,
the same "not a genuine fit" call already made for NotesAiSidebar. Left CSS-only. In the
process, found `Card.module.css`'s `subtle` comment had miscited `terms.tocBox` and
`exams.overflowBadge` as matches (both actually use `--glass-bg`, and `overflowBadge` also uses
`--r-xs`, not a Card radius option) — corrected the comment so a future round doesn't repeat the
mistake; `notesSidebar.card` is the variant's one confirmed match.

¹⁰ **auth VERIFIED, no code migrated.** Re-checked the audit's do-not-migrate call against
current source (the same discipline that caught Terms' stale citation): `.card` still uses
`--glass-bg-strong`, a hardcoded `blur(36px)`, and sets no `border-radius` of its own — radius
and outer shadow come from the parent `.layout` (`--r-2xl` + `--shadow-lg` + `overflow: hidden`),
a load-bearing container/panel split for the signed-out screen. No Card variant matches this
recipe. `.brandHeader` is correctly N/A for `<PageHeader>` (route renders outside `AppShell`,
same as Terms). No issues found; confirmed still "the most internally consistent batch in the
app" per the original audit.

¹¹ **shell VERIFIED.** `Card`/`PageHeader` are both N/A for AppShell/Sidebar/Header (chrome, not
content; the shell is what PageHeader replaces elsewhere, not a consumer of it). Built the new
`IconButton` primitive (move #7) and applied it to Header's Log Out/Toggle Theme/mobile-menu
buttons — `.iconBtn`/`.menuToggle`'s shared recipe in `Header.module.css` shrank to just
`.menuToggle`'s doubled-selector responsive `display` toggle. `.clock` stays CSS-only (`--r-md`
radius doesn't fit Card, and it's a text pill, not an icon button). In the process, found move
#7's own citation was wrong: `library.module.css`'s `.iconBtn` is a different, smaller (32×32,
`--surface-2`) button, not a fourth match — corrected in `DESIGN_MOVES.md`, leaving 3 real
matches (Header, Exams exact; Dashboard's `.dismissBtn` close but missing blur + hover
escalation). `IconButton` itself is only wired into Header this round; rolling it out to Exams/
Dashboard is follow-up work. The audit's nested-`<main>` HIGH finding (every signed-in view
double-nests `<main>` inside the shell's own) is re-confirmed still present and deliberately
untouched — the audit itself scoped that fix to Phase 7 as a ~30-call-site sweep, not a Card/
IconButton-round change.

¹² **components VERIFIED, no code migrated — closes the app's last two open primitive
questions.** NotesAiSidebar's three surfaces (open since the Notes round; this file actually
lives in `views/notes/`, not `components/`, but the question was closed here rather than left
dangling): `.card` is a real `<button>`, excluded on element type alone; `.chat` (`<div>`) has
`panel`/`elevated`'s background token but neither's blur/shadow, and `subtle`'s no-blur/no-shadow
profile but not its background — a genuine hybrid that doesn't clear the 3-batch bar for a 5th
variant; `.dock` (`<div>`) matches `subtle` on background/border but its `22px` radius sits
deliberately between `--r-lg` (20px) and `--r-xl` (24px) — the closest near-miss of the three,
still a single instance needing a residual override, same call as Terms' `.tocBox`.
`create/MaterialPanel`'s flagged "re-declares a card shell" trigger, checked directly: neither of
its two glass surfaces is actually card-shaped — `.dropzone` is a dashed-border drop target (not
a content card, same pattern as Library's/Plan's dashed "new" tiles), `.stickyActions` is a
sticky footer tint with no border and no radius at all. `formShared`/`SubjectPanel`/`Button`/
`Modal`/`MiniTimer`/`commandBar` all reconfirmed already out of scope, no new findings. No new
`IconButton` candidates in `components/` either.
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
