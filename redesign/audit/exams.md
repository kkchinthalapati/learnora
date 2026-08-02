# Exams batch — 3 files

Status: AUDITED (2026-08-02) — code audit complete; screenshots not captured (see dashboard.md).
Source: `webapp/src/views/exams/`
Note: flagship sign-off screen (Phase 5). Preserve exam-difficulty color coding.

## ExamsView (views/exams/ExamsView.tsx)

- Route: `/exams`
- Related files: `exams.module.css` (~400 lines, owns the view + both modals), `ExamModal.tsx`,
  `DayDetailModal.tsx`, `examMeta.ts`
- Header: HAS `.pageHeader` canonical pattern — `exams.module.css:16-25`, used at
  `ExamsView.tsx:120-122`. Identical rule body to dashboard's and tasks' and timer's and
  settings'. **The comment above it (`ExamsView.tsx:114-118`) is stale** — it says "No shell
  exists yet (it belongs with the Dashboard, ledger step 12), so each migrated view carries its
  own h1 until then". The shell now exists (`components/AppShell.tsx`, `Header.tsx`). Whether
  per-view h1s are still wanted is a real design question this batch should surface, not a
  leftover to silently keep.
- Card usage: **4 glass-shell declarations**, none matching the dashboard recipe exactly:
  - `.container` (`:28-36`) — `--r-lg` (not `--r-xl`), `padding: var(--s-6)`,
    `box-shadow: var(--glass-inner), var(--shadow-sm)` — **omits `--glass-inner-bottom`** and
    uses `--shadow-sm`. Three-way divergence from dashboard's `.card` in one rule.
  - `.iconBtn` (`:55-72`) — glass shell on a 42px square button. Near-identical to dashboard's
    `.dismissBtn` (42px, `--r-md`, glass bg/border, `--glass-inner` + `--shadow-sm`, accent
    hover). **This pair is the strongest cross-batch duplication after `.card` itself.**
  - `.cell` (`:114-133`) — calendar day cell, `--glass-bg` + hardcoded `blur(8px)`, no border
    (the grid draws lines via `gap: 1px` + `background: var(--line)`).
  - `.overflowBadge` (`:174-183`) — `--glass-bg` + `--glass-border-subtle`, `--r-xs`.
  - Card primitive confidence: **HIGH for the shell, but this batch proves the variant API is
    mandatory.** A single-recipe `<Card>` cannot express `.container` without a visual delta.
- Spacing: **5 hardcoded px** — the cleanest view batch in the app. `:121` `padding: clamp(8px,
  1vw, 12px)` (intentional fluid), `:190` `padding: 5px 8px` (off-scale), `:279`
  `padding: 9px 8px` (off-scale), `:167-170` `width/height: 28px` on the today badge,
  `:104` `min-width: 520px` on the grid. Also `:99` `grid-auto-rows: minmax(96px, auto)` and
  `:98` `minmax(40px, 1fr)` — layout minimums, not spacing; leave alone.
- Accent usage: 13 references. `.iconBtn:hover`, `.cell:hover` (accent-soft + accent-ring inset),
  `.cell:focus-visible`, `.today .dayNumber` (accent fill + `0 0 12px var(--accent-glow)` glow),
  `.examBar` colour is `--accent-ink`, `.segmentedOption:has(input:checked)` accent text,
  `.segmentedOption:has(input:focus-visible)`. The today-badge glow is one of the four
  accent-glow instances DESIGN_MOVES.md hypothesis #4 flags.
- Distinctive/preserve:
  - **Exam-difficulty colour coding** (`:203-215`): `.diffEasy`/`.diffMedium`/`.diffHard` are
    135° gradients, and `.diffEasy`/`.diffMedium` hardcode a second stop (`#2aad80`, `#e0a94e`)
    that is **not** a token. `.diffHard` uses `--danger` → `--danger-2` (both tokens).
    The two literals are the only hardcoded hex colours in the batch — flagged below, but any
    change here needs care because this is explicitly on the preserve list.
  - `.statusCompleted` (`:222-229`) must stay last in the file — the comment explains it wins
    over `.diff-*` by source order instead of `!important`. **Do not reorder this file.**
  - `.examBar`'s `--accent-ink` / `--danger-on` contrast reasoning (`:185-189` comment) is the
    output of a prior contrast audit. Preserve the reasoning, not just the values.
- Accessibility: strong batch. `.cell:focus-visible` and `.segmentedOption:has(input:
  focus-visible)` both draw explicit accent rings; `aria-live="polite"` on the month heading
  (`ExamsView.tsx:129`); day cells are real `<button>`s with full accessible names
  ("March 20, 2026"). `@media (prefers-reduced-motion: reduce)` at `:232-239` covers `.cell`
  and `.examBar`. **`.dateError` uses `border-color: … !important` (`:326`) — the only
  `!important` left in the batch** after the port deliberately removed the others.
- Responsive: no width breakpoints at all — the calendar relies on `.container`'s
  `overflow-x: auto` plus `.daysGrid`'s `min-width: 520px` to scroll horizontally on narrow
  screens. Only `prefers-reduced-motion`. Worth a visual check on mobile in Phase 5; a
  horizontally-scrolling calendar is a defensible choice but it is the only view in the app
  that solves narrow layout this way.
- Test file: `ExamsView.test.tsx` + `ExamModal.test.tsx`. No `.closest()`. **Three
  `.className` assertions** (`:103`, `:191`, `:211-212`) — but all three are *differential*:
  they compare two elements' classNames to each other (`not.toEqual`, `new Set(...).size === 3`)
  rather than matching a literal string. A class-name swap is therefore safe **as long as the
  difficulty/status/today modifiers keep producing distinct class strings.** Collapsing
  `.diffEasy`/`.diffMedium`/`.diffHard` into one class with a CSS custom property would break
  `:191`. Record this as a hard constraint on any difficulty-colour refactor.
- Design-move tags: [card-primitive: HIGH] [pageheader-primitive: HIGH]
  [spacing-scale: LOW] [accent-restraint: MEDIUM] [header-actions: MEDIUM]
  [empty-loading-polish: LOW]
- Issues found (severity):
  - **MEDIUM — two hardcoded hex stops in the difficulty gradients.** `#2aad80` (`:204`) and
    `#e0a94e` (`:208`) sit outside the token system and outside the contrast audit that
    `tokens.css`/`themes.css` are described as having passed. They also will not respond to the
    13 accent presets or the Custom Theme Studio. `--danger-2` already exists as the pattern for
    the second stop; there is no `--success-2`/`--warning-2` equivalent. Raising this as an
    audit finding only — the preserve rule means the fix is the owner's call, not this pass's.
  - **LOW — `.dateError`'s `!important`** (`:326`). The port removed every other `!important`;
    this one survived and is beatable by source order the same way `.statusCompleted` is.
  - **LOW — stale comment** at `ExamsView.tsx:114-118` claiming no app shell exists.
  - **LOW — `.container` diverges from the dashboard shell three ways** (radius, shadow,
    missing inner-bottom) with no recorded rationale.
- Redesign status: TODO
