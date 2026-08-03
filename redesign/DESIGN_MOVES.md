# Design Moves

Status: APPROVED 2026-08-03. Moves #1, #2 (with the decision below), #3, #5, #7, #8, #9 are
approved to implement. Moves #4 and #6 remain PENDING VISUAL for the 12 source-only batches —
approved in principle, but confirm against a screenshot before applying to a given view (already
confirmed for Dashboard/Notes/Exams via this project's live-rendered flagship audit).

Synthesis date: 2026-08-02. Evidence: all 15 batch files in `redesign/audit/`, each AUDITED.

A move only survives from hypothesis to approved if audit evidence (see `redesign/audit/*.md`
design-move tags) shows MEDIUM+ confidence in 3 or more batches. Anything weaker stays a
per-view note in that batch's audit file — it does not become a systemic move applied
everywhere.

**Two rules applied during this synthesis, worth stating so the tallies can be checked:**
1. The `chat` batch is excluded from every tally. It is permanently out of scope, so evidence
   from it can never justify a move that will never be applied there.
2. Moves whose hypothesis asks a *visual* question (does this look tasteful?) cannot be
   confirmed or killed from a static code read. Those are marked **PENDING VISUAL** below and
   carry structural evidence only. See "Screenshot gap" at the end.

---

## Verdicts at a glance

| # | Move | Batches at MEDIUM+ | Verdict |
|---|---|---|---|
| 1 | Card primitive | 10 | **SURVIVES** — contract needs revision |
| 2 | PageHeader primitive | 9 | **APPROVED** — drop the 5 duplicate h1s (decided 2026-08-03) |
| 3 | Spacing-scale conformance | 8 | **SURVIVES** — larger than assumed |
| 4 | Accent restraint | 4 | **PENDING VISUAL** |
| 5 | Header action-affordance | 4 | **SURVIVES** — already built in Library |
| 6 | Empty/loading/error polish | 4 | **PENDING VISUAL** |
| 7 | Icon-button primitive (new) | 4 | **SURVIVES** |
| 8 | Breakpoint coordination (new) | 6 | **SURVIVES** |
| 9 | Single `<main>` landmark (new) | 10 | **SURVIVES** — correctness, not taste |

---

## 1. Card primitive — SURVIVES (10 batches at MEDIUM+)

Confirmed at MEDIUM+ in: dashboard (HIGH), exams (HIGH), library (HIGH), plan (HIGH),
settings (HIGH), tasks (HIGH), components (HIGH), notes (MEDIUM), quiz (MEDIUM), timer (MEDIUM).
Explicitly **do not migrate** in: review (3D flashcard surface), auth (one-off two-part
construction), terms (two `subtle` surfaces, not worth it), chat (out of scope).

**The going-in confidence was right, but the contract in `PRIMITIVES.md` is wrong.** It guessed
`default | flat | subtle`. The evidence shows the real split is two *elevation tiers* that are
each used consistently, plus a floating tier:

- **Recipe A — "elevated"**: `--r-xl` + `box-shadow: var(--glass-inner),
  var(--glass-inner-bottom), var(--shadow-md)`. **6 declarations**, in dashboard (×3),
  library (×2), settings (×1).
- **Recipe B — "panel"**: `--r-lg` + `box-shadow: var(--glass-inner), var(--shadow-sm)`.
  **23 declarations**, in plan (×4), library (×3), tasks (×2), timer (×2), quiz (×2),
  exams (×2), Header (×2), Button (×1), dashboard (×2), review (×1). *Recipe B is the app's
  actual default*, by a factor of four — not Recipe A, which the plan assumed.
- **Floating tier**: `--glass-inner` + `--shadow-lg` — Modal, MiniTimer, and (with fully
  hardcoded values) chat's `.panel` and dashboard's CommandBar.
- **Subtle tier**: `--surface-2` or `--glass-bg` + `--glass-border-subtle`, no blur, no shadow —
  terms' `.tocBox`, notes-sidebar's `.card`, exams' `.overflowBadge`.
- **Two one-off hybrids**: settings' `.card` (Recipe A's inner-bottom + Recipe B's radius and
  shadow) and notes' `.editorPane` (Recipe A's inner-bottom + `--shadow-sm`).

Two further contract-affecting findings:

- **Hover elevation belongs in the primitive.** Four independent implementations at three
  different targets: `Button.secondary` → `--shadow-md`, `Header.iconBtn` → `--shadow-md`,
  `settings.card` → `--shadow-md`, `library.card` → `--shadow-lg`. Pick one scale.
- **A "list row" tier is real.** `tasks.taskItem` and `dashboard.logItem` are the same object
  declared twice (same padding `16px 20px`, same hardcoded `blur(16px)`, same `--r-lg`, same
  Recipe B shadow). Not speculative — two verbatim copies.

**Hard constraints on the implementation** (from the test audit, non-negotiable):
- `<Card>` **must render a `div` root.** `DashboardView.test.tsx:528` climbs `.closest("div")`
  from an `h2` and then calls `getByRole("listitem")` (singular). A `section`/`article` root
  makes that climb reach `main` and match every list on the page → hard failure. No polymorphic
  `as` prop.
- Wrapping is fine; **replacing semantic elements is not.** `SubjectDetailPage.test.tsx:100`
  requires `<section>`; `QuizReview.test.tsx:83` and `LibraryView.test.tsx` require `<li>`.
- `notes.editorPane`'s `overflow: hidden` is load-bearing for Quill's scroll.

**Blur drift to resolve while doing this**: five modules hardcode a blur instead of using
`--glass-blur` (18px) — `dashboard.logItem` 16px, `tasks.taskItem` 16px, `plan.dayCard` 16px,
`notes.toolbar` 12px, `library` 12px, plus `exams.cell` 8px and `auth.card` 36px (the last two
look deliberate).

## 2. PageHeader primitive — APPROVED (9 batches), decision made 2026-08-03

Confirmed at MEDIUM+ in: dashboard, exams, library, plan, settings, tasks, timer, components
(all HIGH), review (MEDIUM). The duplication is exactly as predicted: **five byte-identical
copies** of the same 10-line rule in `dashboard.module.css:12-21`, `exams.module.css:16-25`,
`settings.module.css:421-431`, `tasks.module.css:15-24`, `timer.module.css:16-25`.

**But the audit found a problem that changes what this move should be.** The app shell's
`Header` already renders the section label (`Header.tsx:66`, `sectionLabel(pathname, t)`), and
the five `.pageHeader` views render an `<h1>` with **the same string** directly beneath it. For
`/` the two strings are identical in every locale (`i18n.ts:11` `nav_dashboard: "Dashboard"`
vs `:20` `title_dashboard: "Dashboard"`; `es` `Tablero`/`Tablero`; `fr` `Tableau`/`Tableau`).
The user reads "Dashboard" twice, stacked, about 20px apart.

`Header.tsx:16-24` explains *why* the shell's copy is a `<p>` and not an `<h1>` (avoiding two
`h1`s per page). That reasoning is sound and was never wrong — but it was written to justify
keeping both elements, and nothing since has asked whether both should exist.

**Decision: APPROVED 2026-08-03 — go with the audit's recommendation.** Promote the shell
header's label (`Header.tsx:66`) to the page's real `<h1>`, and drop the five per-view `<h1>`
copies on Dashboard, Tasks, Exams, Timer, and Settings. Build `<PageHeader>` only for views
whose header says something the shell cannot: Library (subtitle + actions), Review (deck
title), Notes (document title in the sticky toolbar — already its own thing, not a new build).
This turns the primitive from "extract five copies of a redundant heading" into "a header for
views that have something of their own to say", and it removes a real double-heading rather
than encoding it.

**Implementation implication for Phase 4**: `Header.tsx`'s `.title` element needs to become a
real `<h1>` (it's currently a `<p>`, per the comment at `Header.tsx:16-24` explaining why —
that reasoning was sound for a world with per-view h1s, and no longer applies once those are
dropped). The five views lose their `.pageHeader`/`<h1>` block entirely; they do not get a
`<PageHeader>` in its place, since the shell now covers that role for them.

Either way, the contract needs one change the evidence is unambiguous about: **PageHeader needs
a `sub`/subtitle slot.** Two batches independently invented one (`library.headerSub`,
`review.progress`), and the shell header has one too. `PRIMITIVES.md` currently offers
`eyebrow`, which no view uses.

Batches that must **not** be migrated: notes (sticky editor toolbar — confirmed deliberate),
quiz (heading inside the panel, deliberate), terms and auth (outside the shell, own chrome).

## 3. Spacing-scale conformance — SURVIVES (8 batches at MEDIUM+)

Confirmed at MEDIUM+ in: notes (HIGH), settings (HIGH), dashboard, library, plan, quiz, tasks,
components (MEDIUM). The hypothesis asked "is this 3 instances or 30?" — **the answer is 192.**

- **192 hardcoded px declarations** in padding/margin/gap across **30 of 36** CSS modules.
- **24 modules** contain values genuinely off the `--s-*` scale (4/8/12/16/20/24/32/40/48/64).
- Excluding the out-of-scope `chat` batch (21 of the 192), the in-scope figure is **171**.

Worst offenders, in order: `chat` 21 (out of scope), `appearance` 19, `notesSidebar` 18,
`library` 14, `lib/markdown` 14, `quiz` 13, `dashboard` 11, `tasks` 9, `settings` 8.

Two qualifications that keep this from being a blind find-and-replace:

- **Most literals are on-scale values written as numbers** (`16px` where `--s-4` exists). Those
  are a zero-risk token swap.
- **Genuinely off-scale values cluster in specific places**: `11px`/`18px` appear only in
  `appearance.module.css`; `7px`/`14px` only in `notesSidebar.module.css`. Both are among the
  newest modules. `9px`, `10px`, `6px`, `5px`, `2px` are scattered.
- **Values inside `clamp()` are usually deliberate** (timer's fluid stage padding, auth's card
  padding, dashboard's `clamp(20px, 3vw, 28px)`). Document these; do not snap them.

Reference implementations that are already fully on-token: `security.module.css` (0 hardcoded
px) and `notes.module.css` (3, all on-scale literals).

## 4. Accent restraint — PENDING VISUAL (4 batches at MEDIUM+, but structural evidence only)

Confirmed at MEDIUM+ in: library (HIGH), timer (HIGH), dashboard (MEDIUM), exams (MEDIUM).
N/A in settings' AppearanceTab, where accent density *is* the subject matter.

Accent reference counts per module: appearance 25, library 25, dashboard 18, chat 15, timer 13,
notesSidebar 13, exams 13, MaterialPanel 12, tasks 10, Sidebar 10, Button 10.

**Timer is the screen most at risk**, and this is a new finding: it runs **three simultaneous
infinite accent animations** — `ring-glow` (4s, cycling an SVG `drop-shadow` between 4px and
12px of `--accent-glow`), `shimmer-drift` (20s), and MiniTimer's `mini-timer-pulse` (1.6s) —
on top of a glowing progress bar and an accent-stroked ring.

**This move cannot be confirmed or killed from code.** The hypothesis explicitly requires
checking against multiple presets, and the audit could not run the app (see Screenshot gap).
What the audit *can* say is that the structural conditions for the concern are real and
concentrated in four screens. The visual check should prioritise the loudest presets —
violet `#8452f5`, pink `#ec4899`, rose `#f43f5e` (`appearance.module.css:255-270`) — against
Timer, Dashboard and Library, in both themes.

## 5. Header action-affordance — SURVIVES (4 batches at MEDIUM+)

Confirmed at MEDIUM+ in: library (HIGH), shell (HIGH), exams (MEDIUM), tasks (MEDIUM).

**No longer exploratory: Library has already built it.** `library.module.css:23-44` +
`LibraryView.tsx:78-84` is `display: flex; justify-content: space-between; flex-wrap: wrap`
with an `h1`, a `.headerSub` subtitle and a right-hand action slot — the exact shape hypothesis
#5 proposed. The shell's `Header` is the same shape again (title + subtitle left, controls
right). So the pattern is proven in the codebase twice; the move is to generalise it, not to
invent it.

Ties directly into move #2 — resolve that decision first, since it determines whether the
`actions` slot lives on a per-view `PageHeader` or on the shell header.

## 6. Empty/loading/error visual polish — PENDING VISUAL (4 batches at MEDIUM+)

Confirmed at MEDIUM+ in: auth (HIGH), library, plan, components (MEDIUM).

Structural consistency is confirmed good: `Skeleton`/`EmptyState`/`role="alert"`/`aria-busy`
are used uniformly across every async view. The hypothesis asked about *visual quality*, which
a code read cannot answer.

One genuinely reusable pattern did surface, from the auth batch: `auth.module.css:305-307` sets
`animation: none` for decorative motion under `prefers-reduced-motion`, but `:336-338`
deliberately gives the **loader** `animation-duration: 3s` instead of `none` — a spinner that
stops spinning stops communicating. **Adopt this as the house rule** and check the other
reduced-motion blocks against it; several (`timer`, `MiniTimer`, `chat`) blanket-disable.

## 7. Icon-button primitive — NEW, SURVIVES (4 batches at MEDIUM+)

Not among the seeded hypotheses; surfaced by the audit. The same 42px square glass icon button
is declared **four times**:

- `Header.module.css:36-60` — `.iconBtn, .menuToggle` (the canonical one)
- `exams.module.css:55-72` — `.iconBtn`
- `library.module.css:279-287` — `.iconBtn`
- `dashboard.module.css:433-447` — `.dismissBtn`

All four are 42×42, `--r-md`, glass bg + border, `--glass-inner` + `--shadow-sm`, with an
accent-soft hover. They differ only in whether the hover escalates the shadow. This is the
second-strongest duplication in the app after the card shell itself, and unlike the card shell
it has **no** variant spread to design around.

## 8. Breakpoint coordination — NEW, SURVIVES (6 batches at MEDIUM+)

Not among the seeded hypotheses. The app uses **five uncoordinated width breakpoints**:

- **520px** — `create/MaterialPanel.module.css` only
- **768px** — AppShell, Header, Sidebar, settings, timer, commandBar, MiniTimer (7 modules)
- **860px** — `dashboard.module.css` only
- **900px** — notes (×2), notesSidebar, plan (×2)
- **1024px** — timer, auth

The shell trio is correctly coordinated on 768. The view batches drifted. 860 and 520 are
each used exactly once. Meanwhile library, tasks, exams, quiz, review and terms have **no**
width breakpoints at all and lay out intrinsically (`auto-fit`/`minmax`/`flex-wrap`) — which
is the better pattern and should be the stated preference, with named breakpoint tokens for
the cases that genuinely need them.

## 9. Single `<main>` landmark — NEW, SURVIVES (10 batches)

A correctness finding rather than a taste one, but it must be applied systematically, so it
belongs here. `AppShell.tsx:42` renders `<main className={styles.mainContent}>` wrapping
`<Outlet />`, and **every signed-in view renders its own `<main>` inside it** — roughly 30 call
sites across dashboard, tasks, exams, timer, plan, settings, library, notes, quiz and review.

Nested `main` landmarks are invalid HTML and give screen-reader users two overlapping "main"
regions on every page. It is a port artefact: the views were built before the shell existed
(ledger step 12), each correctly claimed `<main>` at the time, and nothing revisited it.

Fix: the shell keeps `<main>`; views become `<div>` or `<section>`. Mechanical, but wide —
schedule it in Phase 7's consistency pass, not inside a card swap, so a test regression has an
obvious cause.

---

## Cross-cutting defects found during the audit (not design moves)

These are recorded in their batch files and should be fixed on their own merits, independently
of whether the moves above are approved:

- **HIGH — the dashboard AI command bar input has no focus indicator.**
  `commandBar.module.css:52,56-58` sets `outline: none` and `box-shadow: none` on `:focus`;
  the global rules in `index.css` cannot reach it (the `:where(…):focus-visible` ring excludes
  inputs by design, and the `input:focus` accent ring loses on specificity, (0,1,1) vs (0,2,0)).
  WCAG 2.4.7 failure on the dashboard's primary AI entry point. See `audit/dashboard.md`.
- **MEDIUM — the command bar is mis-centred on desktop.** `.bar` uses `left: 50%` of the
  viewport, and the file's own comment says this is a placeholder "because the React app has no
  sidebar yet". The sidebar now exists at `--sidebar-width: 264px`, so the bar sits ~132px left
  of the content column's centre. See `audit/dashboard.md`.
- **MEDIUM — exam-difficulty gradients hardcode two hex stops** (`#2aad80`, `#e0a94e`,
  `exams.module.css:204,208`) outside the token system and the contrast audit, and they do not
  respond to the 13 presets. `--danger-2` already models the right pattern; there is no
  `--success-2`/`--warning-2`. On the preserve list, so the fix is the owner's call.
  See `audit/exams.md`.
- **LOW — selected accent swatch ring is a hardcoded `#fff`** (`appearance.module.css:197`),
  likely low-contrast in light mode. See `audit/settings.md`.
- **LOW — two surviving `!important`s** (`tasks.module.css:216`, `exams.module.css:341`), both
  the same `.dateError` rule, both beatable by source order.
- **LOW — `transition: all`** at `terms.module.css:45`, the only one in the app.

## Ledger corrections the audit turned up

- The `chat` preserve rule says "glass/**purple** styling". The purple is gone on purpose —
  `chat.module.css:120-125` records replacing a fixed indigo `#6b7ee8` with the user's accent so
  the bubble follows their preset. Preserving "purple" literally would undo that.
- The `library` batch stub calls it a "split-pane view using a toolbar". It is a tabbed
  single-column view with a header-plus-actions. Notes is the only real toolbar case.
- The `quiz` batch stub carries the "preserve the flashcard flip" note. The flip is in `review`.
- `lib/markdown.module.css` (14 hardcoded px, renders AI output on every AI surface) is not
  covered by any of the 15 batch rows.

## Screenshot gap

No screenshots were captured in Phase 2. Every batch except `terms` and `auth` sits behind
Supabase auth, and this pass had no signed-in session to capture from. Moves #4 and #6 are the
two that genuinely need them and are marked PENDING VISUAL above; the other seven rest on
structural evidence that a code read establishes on its own.

Recommendation: fold visual capture into Phase 4 rather than reopening Phase 2. The primitive
swap needs a real before/after diff anyway, so the screenshots get taken once and serve both
purposes. `terms` and `auth` can be captured immediately if an early baseline is wanted.

## Approved moves (Phase 3 output)

1. **Card primitive** — build per the `panel`/`elevated`/`row`/`subtle` contract in
   `PRIMITIVES.md`. Do not migrate: review, auth, terms, chat (see move #1 above).
2. **PageHeader primitive** — build per the decision above: shell header becomes the real
   `<h1>`, 5 duplicate per-view h1s dropped, `<PageHeader>` built only for Library/Review.
3. **Spacing-scale conformance** — snap on-scale-but-hardcoded values to tokens as each batch
   is touched; document `clamp()` and genuinely off-scale values rather than forcing them.
5. **Header action-affordance** — generalise Library's existing header+actions shape; ties to
   move #2's `actions` slot.
7. **Icon-button primitive** — extract the 42px glass icon button (4 call sites).
8. **Breakpoint coordination** — adopt named breakpoint tokens; prefer intrinsic layout
   (`auto-fit`/`minmax`/`flex-wrap`) over new width breakpoints where a batch has none today.
9. **Single `<main>` landmark** — shell keeps `<main>`, views become `<div>`/`<section>`.
   Scheduled for Phase 7 (wide, mechanical, ~30 call sites) rather than bundled into Phase 4/6.

**Approved in principle, confirm visually per-batch before applying:**
4. **Accent restraint** — already visually confirmed for Dashboard/Notes/Exams (reads fine in
   both themes and a loud preset). Confirm the other 12 batches as they're touched in Phase 6,
   prioritising Timer (three simultaneous accent animations, flagged as highest-risk).
6. **Empty/loading/error polish** — structurally confirmed everywhere; visually confirmed for
   Dashboard/Notes/Exams. Adopt the auth batch's reduced-motion house rule (spinners keep a
   3s animation-duration instead of `none` — a stopped spinner stops communicating) across
   `timer`/`MiniTimer`/`chat` as those are touched.

## Sign-off

Status: APPROVED 2026-08-03.
