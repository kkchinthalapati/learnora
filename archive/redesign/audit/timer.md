# Timer batch — 2 files

Status: AUDITED (2026-08-02) — code audit complete; screenshots not captured (see dashboard.md).
Source: `webapp/src/views/timer/`

## TimerView (views/timer/TimerView.tsx)

- Route: `/timer`
- Related files: `timer.module.css` (~415 lines), `MiniTimer.tsx` + `MiniTimer.module.css`
- Header: HAS `.pageHeader` canonical pattern — `timer.module.css:16-25`, used at
  `TimerView.tsx:150`. Byte-identical rule body to dashboard/exams/settings/tasks (copy 5 of 5).
- Card usage: **2 glass-shell declarations, both Recipe B** (`--r-lg`, `--glass-inner` +
  `--shadow-sm`): `.panel` at `:34-42` (`padding: var(--s-6)`) and a second at `:199-204` (the
  focus stage, `padding: clamp(32px, 5vw, 56px) clamp(20px, 4vw, 40px)`).
  `MiniTimer.module.css:21` adds a third — `--glass-inner` + `--shadow-lg`, the floating dock.
  - Card primitive confidence: **MEDIUM-HIGH.** Two exact Recipe B call sites; the MiniTimer
    dock is a floating surface (like CommandBar and Modal) and belongs to a different tier.
- Spacing: **8 hardcoded px**, distinct values `8 9 10 16 20 24 28 32 36 40 56`. Off-scale:
  `9px`, `10px`, `28px`, `36px`, `56px` — though **most of the large ones live inside `clamp()`
  fluid expressions** (`:30`, `:196`, `:345`), which are intentional and should be documented
  rather than snapped. `MiniTimer.module.css` has only 2 (`4px`, `6px`).
  This batch has the widest *spread* of px values in the app but the smallest share of genuine
  drift — the fluid-clamp idiom is doing real work here.
- Accent usage: 13 in `timer.module.css` + 6 in `MiniTimer.module.css` = **19 across the batch**.
  Uses: `.segOption` checked/focus states, the SVG progress ring `stroke: var(--accent)` with
  `drop-shadow(0 0 16px var(--accent-glow))`, an infinite `ring-glow` animation cycling the
  glow between 4px and 12px, an accent shimmer gradient on the focus stage, a
  `linear-gradient(90deg, var(--accent), var(--accent-hover))` progress bar with a
  `0 0 12px var(--accent-glow)` halo, and the MiniTimer's pulsing accent dot.
  **This is the most accent-saturated screen in the app by effect count**, and the only one
  with two *continuously running* accent animations (`ring-glow` 4s infinite,
  `mini-timer-pulse` 1.6s infinite, plus `shimmer-drift` 20s infinite). Direct evidence for
  DESIGN_MOVES hypothesis #4.
- Distinctive/preserve: the file comment records that the vanilla's mobile `!important`s on
  `.mini-timer`'s inset were deliberately dropped (`timer.module.css:6`,
  `MiniTimer.module.css:2`). Do not reintroduce.
- Accessibility:
  - `@media (prefers-reduced-motion: reduce)` at `:410-414` sets `animation: none` — verify it
    covers **all three** infinite animations (`ring-glow`, `shimmer-drift`, and MiniTimer's
    `mini-timer-pulse`, which lives in a different file with its own query). A missed one means
    a permanently animating element for a user who asked for stillness.
  - `.segOption:has(input:focus-visible)` (`:96-98`) draws an explicit accent ring — same
    pattern as exams' segmented control. Good.
  - The MiniTimer dock is `role="status"` + `aria-live="polite"` (asserted at
    `TimerView.test.tsx:526-529`) — correct for a passively-updating clock.
- Responsive: **the most breakpoints of any batch** — `@media (max-width: 1024px)` (`:385`),
  `@media (max-width: 768px)` (`:394`), `prefers-reduced-motion` (`:410`), plus MiniTimer's own
  768px and reduced-motion queries. 1024px is shared only with the auth batch.
- Test file: `TimerView.test.tsx` (~530 lines). **One structure-sensitive query:** `:526-528`
  `.closest('[role="status"]')`, with an in-file comment explaining it must be scoped past the
  toast container which also carries `role="status"`. Attribute-based, so **unaffected by
  class-name swaps**, but do not add or remove `role="status"` wrappers around the dock.
  No `.className` assertions, no snapshots.
- Design-move tags: [card-primitive: MEDIUM] [pageheader-primitive: HIGH]
  [spacing-scale: LOW — most px are intentional clamps] [accent-restraint: HIGH]
  [header-actions: LOW] [empty-loading-polish: LOW]
- Issues found (severity):
  - **MEDIUM — accent saturation peaks here.** Three infinite animations plus a glowing ring,
    a glowing progress bar and a pulsing dot, all keyed to `--accent`/`--accent-glow`. Needs
    checking against the loudest of the 13 presets (pink `#ec4899`, rose `#f43f5e`, violet
    `#8452f5`) before Phase 3 decides whether hypothesis #4 survives. This is the screen most
    likely to look garish on a saturated preset.
  - **LOW — reduced-motion coverage spans two files.** `timer.module.css:410` and
    `MiniTimer.module.css`'s own query must both be complete; confirm no infinite animation
    escapes.
- Redesign status: TODO
