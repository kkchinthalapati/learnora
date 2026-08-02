# Plan batch — 1 file

Status: AUDITED (2026-08-02) — code audit complete; screenshots not captured (see dashboard.md).
Source: `webapp/src/views/plan/`

## PlanView (views/plan/PlanView.tsx)

- Route: `/plan`
- Related files: `plan.module.css` (~250 lines), `planMeta.ts`
- Header: **NONE.** `PlanView.tsx:195-199` renders `<main className={styles.view}>` and goes
  straight into `.summaryCard`, whose internal `.weekRange` line is the only title-like text.
  There is no `h1` and no `.pageHeader`. **This is the only signed-in view in the app with no
  page-level heading** — a document-outline and screen-reader-navigation gap, not just a visual
  inconsistency. Flagged below.
- Card usage: **4 glass-shell declarations, all Recipe B** (`--r-lg`, `--glass-inner` +
  `--shadow-sm`): `:23-28` (`.summaryCard`), `:46-51`, `:90-95` (`.dayCard`, with a hardcoded
  `blur(16px)` instead of `--glass-blur`), `:241-246`. Highly uniform within the batch — the
  cleanest single-recipe batch in the app, and good evidence that Recipe B is a real, deliberate
  "panel" tier rather than accidental drift.
  - Card primitive confidence: **HIGH** — four call sites, one recipe, no per-card exceptions.
- Spacing: **5 hardcoded px**, distinct values `2 4 10 12 28 36 56`. `10px`, `28px`, `36px`,
  `56px` and `2px` are off the `--s-*` scale. `56px`/`36px` look like grid/track sizing rather
  than spacing — check before snapping.
- Accent usage: 5 references — among the lightest in the app. Restrained and appropriate for a
  dense schedule grid.
- Distinctive/preserve: the file's header comment records that the vanilla's `!important` run on
  `.plan-week-grid.is-empty` was deliberately dropped. Do not reintroduce it.
- Accessibility: `role="alert"` on the load error (`PlanView.tsx:215`); the skeleton day card
  is `aria-hidden="true"` (`:38`), which is correct. **No `:focus-visible` rules in this
  module at all** — it relies entirely on the global ring from `index.css`. That is acceptable
  (the global ring is the documented default) but worth a visual check, because `.dayCard` has
  `overflow` behaviour that may clip a 2px outset outline.
  - The missing `h1` (above) is the batch's real accessibility finding.
- Responsive: `@media (max-width: 900px)` twice (`:75`, `:101`) — matches the notes batch's
  breakpoint. Plus `prefers-reduced-motion` at `:216`.
- Test file: `PlanView.test.tsx` + `planMeta.test.ts`. **No `.closest()`, no `.className`
  assertions.** Safe for a class-name swap.
- Design-move tags: [card-primitive: HIGH] [pageheader-primitive: HIGH — currently absent]
  [spacing-scale: MEDIUM] [accent-restraint: LOW] [header-actions: LOW]
  [empty-loading-polish: MEDIUM]
- Issues found (severity):
  - **MEDIUM — no page heading.** `PlanView.tsx` renders no `h1`. Every other signed-in view has
    one. Adding `<PageHeader title="Plan" />` in Phase 6 fixes the inconsistency and the
    document-outline gap in the same change.
  - **LOW — hardcoded `blur(16px)`** at `:91-92` against `--glass-blur: 18px`. Third instance of
    this same drift (see notes, library, dashboard `.logItem`).
- Redesign status: TODO
