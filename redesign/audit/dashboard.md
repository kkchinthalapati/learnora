# Dashboard batch — 8 files

Status: AUDITED (2026-08-02) — code audit complete; screenshots not captured (see note).
Source: `webapp/src/views/dashboard/`

Screenshots: NOT CAPTURED. Every view in this batch is behind Supabase auth, and capturing
them needs a signed-in session this audit pass could not create. The audit below is a static
read of the CSS/TSX; the Screenshots column in the ledger stays `—`. Visual capture should be
folded into Phase 4, where the primitive swap needs a real before/after diff anyway.

## DashboardView (views/dashboard/DashboardView.tsx)

- Route: `/` (also `/dashboard`) — the app's index route
- Related files: `dashboard.module.css` (510 lines), `commandBar.module.css`, subcomponents
  NextExamCard, FocusCard, StreakCard, TasksCard, AIActionsCard, OnboardingBanner,
  SessionHistoryCard, CommandBar
- Header: HAS `.pageHeader` canonical pattern — `dashboard.module.css:12-21`, used at
  `DashboardView.tsx:24`. Shape is exactly `<div className={styles.pageHeader}><h1>`.
- Card usage: **3 distinct full glass-shell declarations**, byte-for-byte the same five
  properties:
  - `.card` (`dashboard.module.css:39-50`) — `--r-xl`, `padding: clamp(20px, 3vw, 28px)`
  - `.onboardingBanner` (`:411-420`) — `--r-xl`, `padding: 20px 24px`
  - `.historyCard` (`:463-471`) — `--r-xl`, `padding: clamp(20px, 3vw, 28px)` (identical to
    `.card` except it omits the flex column)
  - plus `.logItem` (`:486-501`) — a *nested* lighter shell (`--r-lg`, `blur(16px)` hardcoded,
    `--shadow-sm` instead of `--shadow-md`). This is the "flat/subtle" variant the PRIMITIVES
    contract anticipated, and it is nested inside `.historyCard`.
  - `.dismissBtn` (`:433-447`) also re-declares glass bg/border/inner-shadow on a 42px button.
  - Card primitive confidence: **HIGH**. `.card`/`.historyCard`/`.onboardingBanner` collapse to
    `<Card>` with no visual delta; `.logItem` maps to a `flat`-ish variant but has a hardcoded
    `blur(16px)` that does not match `--glass-blur: 18px` — resolve that before it is folded in.
- Spacing: mostly on-scale. **11 hardcoded px** in padding/margin/gap. Off-scale values:
  - `:49`/`:470` `padding: clamp(20px, 3vw, 28px)` — 28px is off the `--s-*` scale (24 or 32).
    Intentional fluid clamp; document rather than snap.
  - `:412` `padding: 20px 24px` (= `--s-5 --s-6`, on-scale but hardcoded — pure token swap)
  - `:268` `padding: 10px 12px`, `:300` `padding: 14px`, `:492` `padding: 16px 20px`,
    `:177` `padding: 3px 10px`, `:341` `padding: 4px 10px` — 10/14/3 are genuinely off-scale
  - `:171` `gap: 5px`, `:279` `gap: 6px`, `:344` `margin: 2px` — off-scale micro-values
  - `:344` `font-size: 0.75rem` is the only rem font-size not using an `--fs-*` token
- Accent usage: **18 references** — the heaviest in the app after settings/library. Uses:
  `.statNumber`/`.statNumberLeft`/`.countdown` accent text (3 large numerals), `.link` accent
  text, `.examCard::before` accent-soft radial gradient, `.srsDue` accent-soft fill,
  `.focusPresetBtn` hover, `.aiBtn` hover, `.aiIcon`, `.streakBar` fill, `.dismissBtn` hover,
  `.logMinutes`, plus the CommandBar's `0 0 30px var(--accent-glow)` halo.
- Distinctive/preserve: exam-difficulty colour coding (`.diffEasy`/`.diffMedium`/`.diffHard`,
  `:184-197`) — semantic success/warning/danger, explicitly on the preserve list.
- Accessibility:
  - `aria-busy="true"` on loading card shells; `role="alert"` on error empty states — good.
  - **ISSUE:** `commandBar.module.css:47-58` sets `outline: none` on `.input` and
    `.input:focus { box-shadow: none }`. The global fallbacks in `index.css` cannot save it:
    the `:where(a, …):focus-visible` ring at `:90-100` deliberately excludes inputs, and the
    `input…:focus` accent ring at `:102-116` scores (0,1,1) against the module's (0,2,0). Net
    result: the dashboard AI command bar input has **no focus indicator at all** (WCAG 2.4.7).
  - Only 1 `:focus-visible` rule in `dashboard.module.css` (`.focusPresetBtn`, `:245`); the rest
    of the batch relies on the global ring, which is correct and fine.
- Responsive: one breakpoint, `@media (max-width: 860px)` (`:33-37`) collapsing `.grid` from
  `1.35fr 1fr` to `1fr`. CommandBar has its own `768px`. Note the batch's 860px does not match
  any other module's breakpoint (768/900/1024 are used elsewhere) — see the components batch.
- Test file: `DashboardView.test.tsx` (561 lines). Queries are role/text-based **except two
  DOM-depth-sensitive queries**:
  - `:263` `screen.getByText("Streak").closest("div")` — climbs from the `.eyebrow` span to the
    `.card` div.
  - `:528` `screen.getByText("Recent focus sessions").closest("div")` — climbs from the `h2` to
    `.historyCard`, then asserts `within(history).getByRole("listitem")` (singular — throws on
    multiple matches).
  - **Concrete constraint for Phase 4:** `<Card>` must render a `div` as its root element. If it
    renders `section`/`article`, `:528` climbs to `main.view` and `getByRole("listitem")` matches
    every list on the page → hard test failure. `:263` would not fail but would silently become a
    vacuous assertion. An extra *inner* wrapper div is survivable; a non-div root is not.
    Do not give `Card` an `as`/`component` polymorphic prop for this batch.
- Design-move tags: [card-primitive: HIGH] [pageheader-primitive: HIGH]
  [spacing-scale: MEDIUM] [accent-restraint: MEDIUM] [header-actions: LOW]
  [empty-loading-polish: LOW]
- Issues found (severity):
  - **HIGH — CommandBar input has no focus indicator.** `commandBar.module.css:52,56-58`.
    Keyboard users cannot see the dashboard's primary AI entry point when focused.
  - **MEDIUM — CommandBar is mis-centred on desktop.** `.bar` uses `left: 50%` on the viewport
    (`commandBar.module.css:15`), and the file's own comment at `:7-10` says this is a
    placeholder because "the React app has no sidebar yet". The sidebar now exists and is
    `--sidebar-width: 264px` (`tokens.css:154`, consumed by `Sidebar.module.css:6`), so the bar
    sits ~132px left of the content column's true centre on desktop. Restore the
    `calc(var(--sidebar-width) + …)` centring the comment describes, accounting for the
    collapsed state.
  - **LOW — `.logItem` hardcodes `blur(16px)`** (`:495-496`) against `--glass-blur: 18px`
    everywhere else. Inconsistent nested-surface blur.
  - **LOW — `font-size: 0.75rem`** at `:344` bypasses the `--fs-*` scale (`--fs-xs` is the
    intended token).
- Redesign status: TODO
