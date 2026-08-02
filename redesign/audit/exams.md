# Exams batch — 3 renderable files

Status: AUDITED — 2026-08-02.
Source: `webapp/src/views/exams/`
Flagship sign-off screen (Phase 5) — third and last of the flagship trio (Dashboard, Notes,
Exams). Preserve exam-difficulty color coding (explicit ledger instruction).

Rendering: **live, via Playwright against the real running Vite dev server** (not source-only),
same technique as `dashboard.md`/`notes.md`. No `.env`/live Supabase credentials exist in this
repo; reached `/exams` anyway by:
1. Seeding `localStorage["sb-mlvgqwqiynpwpwzqufdf-auth-token"]` with a shaped-correctly fake
   session (future `expires_at`), plus the `learnora_mode` / `learnora_theme` / `learnora_accent`
   / `learnora_sidebar` / `learnora_bg` / `learnora_font` / `learnora_size` appearance keys —
   **all `JSON.stringify`d** before `localStorage.setItem` (per `notes.md`'s documented gotcha;
   got it right on the first pass this time by reusing that script directly).
2. Intercepting `**/rest/v1/**` and `**/auth/v1/**` with Playwright `page.route`, returning
   fixtures shaped like `ExamsView.test.tsx`'s and `ExamModal.test.tsx`'s own MSW handlers (same
   entity name/shape: `exams`, a flat array with `id`, `user_id`, `exam_name`, `exam_date`,
   `difficulty`, `status`; `GET` returns the array, `POST`/`PATCH`/`DELETE` return empty
   201/204s since no screenshot actually submits a mutation, it only opens dialogs pre-filled
   from fixture data).
3. "Today" is fixed by the environment's system date, **2026-08-02** — fixtures were built
   around that (a mix of an already-past, not-completed exam and a past-but-completed exam both
   on Aug 1, one exam on today Aug 2, several future exams at varying difficulties, and a
   4-exam day on Aug 20 to exercise both the `+N more` overflow badge and the day-detail modal
   with more than 2 rows).

Screenshots captured (`redesign/screenshots/exams/`):
- `ExamsView-light.png` — light, default accent (teal), populated month
- `ExamsView-dark.png` — dark, default accent, populated month (same fixture)
- `ExamsView-dark-cyberpunk.png` — dark, `cyberpunk` accent preset, populated month
- `ExamsView-dark-empty.png` — dark, default accent, zero exams for the visible month
- `ExamsView-dark-modal-new.png` — dark, default accent, "+ Add exam" create dialog (toolbar
  button, defaults to today's date, Medium pre-selected, no Status field, no Delete button)
- `ExamsView-dark-modal-edit.png` — dark, default accent, edit dialog for an existing Hard/
  Completed exam (Status dropdown + Delete button both present, Hard pre-selected)
- `ExamsView-dark-day-detail.png` — dark, default accent, day-detail modal for Aug 20 (all 4
  exams listed, not just the 2 the cell itself shows — confirms the modal is the full list, the
  calendar cell's `+2 more` is a display-only truncation)
- `ExamsView-dark-loading.png` — dark, default accent, REST held open 8s (Skeleton block,
  `aria-busy="true"`)

**Difficulty color coding confirmed live across all three levels simultaneously**: Easy renders
a green→darker-green gradient bar ("Bio Lab"), Medium an amber→darker-amber gradient ("Pop Quiz",
"Physics Final", "Enviro Sci"), Hard a red→darker-red gradient with white text ("Calculus Exam",
"Stats Test"). The coding survives the cyberpunk accent swap unchanged (semantic tokens, not
accent tokens — confirmed by reading the CSS, see `ExamsView` entry below) and reads correctly
in light mode too (colors, not just contrast-inverted ink). A past-and-not-completed exam
("Missed Quiz", Aug 1) renders visibly dimmed/desaturated relative to its neighbors; a
past-but-completed exam ("History Test", Aug 1) renders with strikethrough text on a neutral
gray fill instead of its difficulty color — both effects visible side-by-side in the same cell in
every populated screenshot.

---

## ExamsView (`webapp/src/views/exams/ExamsView.tsx`)

- Route: `/exams` (protected, inside `AppShell`) — confirmed in `webapp/src/routes.tsx:70`
- Related files: `exams.module.css` (`.view`, `.pageHeader`, `.container`, `.toolbar`,
  `.monthNav`, `.iconBtn`, `.hint`, `.weekdays`, `.daysGrid`, `.cell`, `.empty`, `.dayNumber`,
  `.today`, `.overflowBadge`, `.examBar`, `.diffEasy/.diffMedium/.diffHard`, `.isPast`,
  `.statusCompleted`), `examMeta.ts` (`MAX_EXAM_BARS_PER_DAY`, pure constant, no CSS of its own),
  `components/Button.tsx`, `components/Skeleton.tsx`, `hooks/useExams.ts`, `lib/date.ts`
  (`formatDateStr`/`localDateStr`/`MONTH_NAMES`), `DayDetailModal`, `ExamModal`
- Screenshots: the composed page in all 8 captures — this file owns the calendar grid itself,
  everything else in the batch is a modal it opens
- Header: **HAS the canonical `.pageHeader` pattern** — `<div className={styles.pageHeader}>
  <h1>Exams</h1></div>` (lines 120-122), styled identically to Dashboard's own instance
  (`exams.module.css:16-25` vs. `dashboard.module.css:12-21` — same `margin-bottom: var(--s-6)`,
  same `font-family: var(--font-head); font-size: var(--fs-2xl); font-weight: 700; margin: 0` on
  the `h1`). Title-only, no actions slot, consistent with the other two flagship screens. The code
  comment at lines 116-119 ("No shell exists yet... each migrated view carries its own h1... same
  as Tasks and Settings") is copy-identical in spirit to comments seen in the other two flagship
  files — a genuine, repeated pattern across the codebase, not just these three views.
- Card usage: **the densest concentration of glass-shell variants found in any single file across
  the audit so far** — five distinct surface declarations in one 400-line CSS module:
  1. `.container` (lines 27-36) — the calendar's own outer shell, a **near-exact but drifted**
     instance of the canonical 6-line block: has `background: var(--glass-bg)`,
     `backdrop-filter: blur(var(--glass-blur)) var(--glass-saturate)` (correctly tokenized, unlike
     several drifted instances found in `dashboard.md`/`notes.md`), `border: 1px solid
     var(--glass-border)`, but **`border-radius: var(--r-lg)` (20px) instead of `--r-xl`
     (24px)** — this is the exact drift this batch's task brief flagged in advance — and
     `box-shadow: var(--glass-inner), var(--shadow-sm)`, **missing the `--glass-inner-bottom`
     layer** the canonical block carries (`dashboard.md`'s `.card`/`.historyCard`/
     `.onboardingBanner`, `notes.md`'s `.editorPane` all have three shadow layers; this has two).
     Whether the missing radius step and shadow layer are an intentional "one size down" variant
     (this *is* a bigger single-purpose panel, unlike a repeated stat card) or accidental drift
     from copy-paste is a judgment call for Phase 4 — but it is a **measurable, code-confirmed
     difference**, not a maybe.
  2. `.iconBtn` (lines 58-76, the ‹/› month-nav buttons) — a **second, smaller** near-instance:
     `background: var(--glass-bg)`, `backdrop-filter: blur(var(--glass-blur))` (tokenized), no
     `-webkit-` duplicate omission, `border: 1px solid var(--glass-border)`, `border-radius:
     var(--r-md)` (16px, a third distinct radius step within this one file), `box-shadow:
     var(--glass-inner), var(--shadow-sm)` — same two-layer shadow as `.container`. This is a
     "glass icon button" shape that doesn't exist as a named variant anywhere else in the audited
     batches yet — CommandBar's send button is accent-filled, not glass; this is genuinely new.
  3. `.cell` (lines 116-132, every calendar day square) — a **partial-glass, flatter surface**:
     `background: var(--glass-bg)` but **`backdrop-filter: blur(8px)` hardcoded instead of
     `var(--glass-blur)`** — this is the **third independent instance** of the exact same
     hardcoded-blur-instead-of-token drift `dashboard.md` first flagged (`SessionHistoryCard`'s
     `.logItem`, `blur(16px)`) and `notes.md` found a second instance of (`NotesEditorPane`'s
     `.toolbar`, `blur(12px)`). Three batches, three different hardcoded blur values (16px, 12px,
     8px) all standing in for the same token — strong, now cross-batch-confirmed evidence this is
     a systemic copy-paste habit, not a one-off. No `border`, no `box-shadow` at rest (comes from
     `.daysGrid`'s 1px background-color gap trick instead, lines 103-114). A dark-mode-specific
     override further swaps `.cell`'s background to `var(--surface)` entirely
     (`:global(body.dark-theme) .cell`, lines 150-152) — a fourth variation on top of the base
     rule, not present anywhere else in the audited CSS.
  4. `.overflowBadge` (lines 177-186, the "+2 more" chip) — a **fifth, tiny** partial-glass
     surface: `background: var(--glass-bg)`, `border: 1px solid var(--glass-border-subtle)`
     (the "-subtle" border variant, same one `NotesAiSidebar`'s `.card` used), `border-radius:
     var(--r-xs)` — no backdrop-filter at all, no box-shadow. A fourth radius step in this same
     file (`--r-xs`=8px, on top of `--r-md`/`--r-lg` above and `--r-sm` used in the modal CSS
     below).
  5. `.empty` (lines 144-148, leading blank cells before day 1) — explicitly **not glass**:
     `background: var(--surface-2); backdrop-filter: none` — a deliberate flat/inert treatment
     for a non-interactive filler cell, correctly distinguished from the real, clickable `.cell`.
  Combined with `dashboard.md`'s 4 instances and `notes.md`'s "5th instance + 3 more variants"
  finding, this file alone contributes **2 more near-exact instances of the full shell (`.container`,
  `.iconBtn`) plus 3 more genuinely different partial/flat variants (`.cell`, `.overflowBadge`,
  `.empty`)** — the single richest variant catalogue found in the audit. Strongly reinforces
  `notes.md`'s recommendation that the eventual Card primitive ship with a `variant` prop rather
  than one fixed shape, and adds a new candidate variant (glass icon-button, `.iconBtn`) neither
  prior batch surfaced.
- Spacing: `.view` `padding: var(--s-6) var(--s-6) var(--s-8)` (line 11) — identical to
  Dashboard's own `.view` padding, on-scale. `.container` `padding: var(--s-6)` (line 34,
  on-scale, tokenized). `.toolbar` `gap: var(--s-3)` / `margin-bottom: var(--s-6)` (lines 43-44,
  on-scale, tokenized). `.monthNav` `gap: var(--s-3)` (line 55, on-scale, tokenized). `.iconBtn`
  `width/height: 42px` (lines 60-61) — an icon-badge size, not a spacing violation (same
  non-issue category as `StreakCard`'s `.folderDot`/`NotesAiSidebar`'s `.cardIcon`). `.hint`
  `margin: 0 0 var(--s-4)` (line 88, on-scale, tokenized). `.weekdays` `padding-bottom: var(--s-3)`
  (line 100, on-scale, tokenized). `.daysGrid` `gap: 1px` (line 107, intentional hairline grid
  line via background-color trick, not a spacing violation) / `margin-top: var(--s-4)` (line 113,
  on-scale, tokenized). `.cell` `gap: var(--s-2)` (line 119, tokenized) but `padding: clamp(8px,
  1vw, 12px)` (line 120) — **both clamp bounds are individually on-scale (`--s-2`=8, `--s-3`=12)
  but hardcoded as raw px instead of `clamp(var(--s-2), 1vw, var(--s-3))`**, the exact same
  "on-scale but not tokenized" pattern `dashboard.md` flagged for `.card`'s own
  `clamp(20px, 3vw, 28px)` padding — now confirmed as a second file independently doing the same
  thing with clamp(). `.overflowBadge` `padding: var(--s-1) var(--s-2)` (line 181, on-scale,
  **correctly tokenized** — a clean counter-example). `.examBar` `padding: 5px 8px` (line 197) —
  8px matches `--s-2` but hardcoded, 5px is genuinely off-scale (between `--s-1`=4/`--s-2`=8).
  `.inputGroup` `gap: var(--s-2)` / `margin-bottom: var(--s-4)` (lines 254-255, on-scale,
  tokenized). `.segmented` `gap: var(--s-1)` / `padding: var(--s-1)` (lines 267-268, on-scale,
  tokenized — clean). `.segmentedOption` `padding: 9px 8px` (line 279) — 8px matches `--s-2`
  hardcoded, 9px off-scale (between `--s-2`=8/`--s-3`=12). `.modalActions` `gap: var(--s-3)` /
  `margin-top: var(--s-8)` (lines 317-318, on-scale, tokenized). `.actionsRight` `gap: var(--s-3)`
  (line 323, tokenized). `.dayList` `gap: var(--s-3)` / `margin-bottom: var(--s-4)` (lines
  363-364, tokenized). `.dayItem` `gap: var(--s-3)` / `padding: var(--s-3)` (lines 373, 375, both
  **correctly tokenized** — the file's own comment at lines 367-368 notes this replaced inline
  `style` assignments the vanilla used, and it was done cleanly). `.dayItemText` `gap: 4px` (line
  392) — matches `--s-1` but hardcoded. Net count: roughly half of this file's spacing
  declarations are cleanly tokenized (`.overflowBadge`, `.segmented`, `.modalActions`,
  `.actionsRight`, `.dayList`, `.dayItem`) and half are on-scale-but-hardcoded or genuinely
  off-scale (`.cell`'s clamp, `.examBar`, `.segmentedOption`, `.dayItemText`) — a **MEDIUM**
  showing for design-move #3, better than `NotesAiSidebar`'s worst-in-audit density but not as
  clean as `FocusCard`'s zero-violations record. **Zero raw-rem font-size skips found** — every
  font-size in this file uses a `--fs-*` token, a clean result unlike `NotesAiSidebar`'s four.
- Accent usage: five touches, all either hover/focus-only or a single small persistent glow —
  the most restrained of the three flagship files:
  - `.iconBtn:hover` → `background: var(--accent-soft); color: var(--accent-text); border-color:
    var(--accent-ring)` (lines 79-81) — hover-only.
  - `.cell:hover` → `background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent-ring)`
    (lines 135-136) — hover-only.
  - `.cell:focus-visible` → `outline: 2px solid var(--accent)` (line 140) — focus-only.
  - `.today .dayNumber` → `background: var(--accent); color: var(--accent-on); box-shadow: 0 0
    12px var(--accent-glow)` (lines 166-174) — the one **persistent, always-on** accent touch,
    a small circular badge on the current day's number. Same motif family as `NextExamCard`'s
    "today" glow in `dashboard.md`, but contained to a 28px circle rather than a whole card wash
    — reads calmly in both default and cyberpunk (confirmed live).
  - `.segmentedOption:has(input:checked)` → `color: var(--accent-text); box-shadow: var(--shadow-sm)`
    (lines 303-305) — persistent while a difficulty is selected in the modal, but this is a
    **selection-state indicator on a form control**, not decoration — the same category as
    `FocusCard`'s `:focus-visible` accent pairing, functionally justified.
  Crucially, **none of the difficulty-coded exam bars use the accent system at all** — confirmed
  by reading `.diffEasy/.diffMedium/.diffHard` (lines 213-224), which reference only
  `--success`/`--warning`/`--danger` (+ one hardcoded hex second gradient stop each, see
  Distinctive/preserve below). This is the correct, ledger-mandated separation between "your
  theme" (accent) and "this exam's difficulty" (semantic) — confirmed to hold up visually across
  all 13 presets' worth of intent by checking both default-teal and cyberpunk-pink captures side
  by side: the difficulty colors are bit-for-bit identical between the two screenshots, only the
  chrome around them (today badge, sidebar, buttons) changes.
- Distinctive/preserve: **the exam-difficulty color coding, confirmed working correctly and
  worth documenting precisely** since the ledger singles it out for preservation:
  - `.examBar`'s base rule sets `color: var(--accent-ink)` (line 196) with a code comment
    explaining this is a deliberate default ("Flat ink: reads on Easy and Medium's gradients in
    both modes") that `.diffHard` alone overrides to `var(--danger-on)` because Hard's red doesn't
    clear AA for dark ink the way Easy/Medium's colors do (comment at lines 192-195).
  - `.diffEasy` (lines 213-215) and `.diffMedium` (lines 217-219) each end their two-stop gradient
    with a **hardcoded hex color** (`#2aad80`, `#e0a94e`) that has **no corresponding CSS custom
    property anywhere in `tokens.css`/`themes.css`** — this is not an oversight: `tokens.css`
    itself documents why, in a comment directly above `--danger-2`'s declaration (`tokens.css:
    59-68`): *"the exam list's difficulty chip paints a two-stop gradient... `--success-2`/
    `--warning-2` don't exist because their gradients read fine with `--success-on`/`--warning-on`
    as-is [and are] needed nowhere else."* Only Hard needed a second, purpose-built token
    (`--danger-2`, light mode `#97362d` at `tokens.css:69`, dark mode `#e87068` at
    `themes.css:39`, both accompanied by their own AA-contrast-rationale comments) because only
    Hard's contrast math failed with the plain `--danger` stop repeated. **This means the two
    "hardcoded hex" gradient stops are a deliberate, load-bearing, AA-contrast-tested design
    decision with only one consumer each, not duplicated state that a token would clean up** —
    worth flagging clearly so a future redesign pass doesn't "fix" this into a contrast
    regression by naively tokenizing or normalizing it.
  - **Cross-batch inconsistency worth flagging**: Dashboard's `NextExamCard` implements the
    *same* difficulty concept with a **completely different visual treatment** —
    `dashboard.module.css:184-197`'s `.diffEasy/.diffMedium/.diffHard` are flat
    `background: var(--success-soft); color: var(--success)` pills (soft-tint text badges), while
    this file's version is a filled two-stop gradient bar with light/dark-mode-aware ink. Both are
    internally consistent and individually well-executed, but a user who sees "Easy" on the
    Dashboard's Next Exam card and then "Easy" on the Exams calendar is looking at two different
    shapes and fill styles for the same semantic concept, confirmed by comparing
    `dashboard/DashboardView-dark.png` against `exams/ExamsView-dark.png` directly. Not
    necessarily wrong (a calendar bar and a stat-card pill are different UI contexts) but worth a
    deliberate call in Phase 3/4 about whether "exam-difficulty color coding" as a preserved
    concept means "these exact tokens, whatever container they're in" (already true — both use
    `--success`/`--warning`/`--danger`) or should also mean "the same visual treatment" (not
    currently true).
  - `.isPast` (lines 226-229, `opacity: 0.55; filter: saturate(0.5)`) and `.statusCompleted`
    (lines 232-238, replaces the fill with `var(--surface-2)` + strikethrough text) are two
    distinct, stacked-but-mutually-exclusive treatments confirmed working correctly in the live
    render (`ExamsView-dark.png`'s Aug 1 cell shows "Missed Quiz" dimmed/desaturated next to
    "History Test" struck-through-and-grayed, side by side, both instantly distinguishable from
    each other and from the undimmed/uncompleted bars elsewhere on the same screenshot). The
    file's own comment (lines 1-8) notes the vanilla needed `!important` to make
    `.status-completed` win over the `.diff-*` rules and that a CSS Module lets it just come later
    in the file instead — confirmed true, no `!important` present anywhere in this stylesheet.
- Accessibility: loading state has `aria-busy="true"` (line 170) wrapping a labeled
  `<Skeleton label="Loading your calendar" height={320}>` — consistent with the other two
  flagship screens. Error state uses `role="alert"` (line 164). Month heading is
  `<h2 aria-live="polite">` (line 137) so a month change is announced — the code comment (line
  135-136) notes the vanilla "just rewrote the heading silently," i.e. this is a genuine a11y
  improvement over the ported original, not parity work. **One notable pattern worth flagging**:
  each day cell is `role="button" tabIndex={0}` (lines 199-200) on a `<div>`, with a manual
  `onKeyDown` handler for Enter/Space (lines 208-214) — but that same cell can contain 1-2 *real*
  `<button>` elements (the exam bars themselves, line 231). This is an interactive
  `role="button"` container with genuinely interactive native `<button>` descendants — a nested-
  interactive-controls pattern that most accessibility linters (and some screen readers) flag,
  even though the click handler correctly bails out via `.closest("button")` (line 205) to avoid
  double-firing. `DayDetailModal`'s row buttons avoid this entirely by being one flat `<button>`
  per row with no nested controls (see that entry below) — worth considering whether the calendar
  cell could do the same (e.g. making the day-number a separate small button rather than the
  whole cell) if accessibility polish becomes an approved move; low-to-medium severity, not a
  correctness bug (keyboard activation and click both work correctly today, confirmed by the
  "activates a cell from the keyboard" test).
- Responsive: **no viewport-width breakpoint of its own** — unlike Dashboard's 860px grid-collapse
  or Notes' 900px split-to-column, this file relies on `.daysGrid`'s `min-width: 520px` (line 112)
  plus `.container`'s `overflow-x: auto` (line 28) to make the whole 7-column calendar
  horizontally scrollable on narrow viewports rather than reflowing. This is very likely the
  *correct* choice for a calendar grid (there's no sensible single-column collapse for 7 weekday
  columns), so it reads as a deliberate, structurally sound decision rather than a missing
  breakpoint — but like the other two flagship files, it hasn't been verified at a narrow
  viewport in the captured screenshots (1440px only), so this is a documented gap for a follow-up
  narrow-viewport pass, not a new finding beyond what `dashboard.md`/`notes.md` already flagged
  for their own files. Only `@media (prefers-reduced-motion: reduce)` (lines 240-248) is present,
  disabling `.cell`/`.examBar` transitions — same treatment pattern as `CommandBar`.
- Test file: `ExamsView.test.tsx` — role/text queries throughout (`getByRole("button", {name:
  ...})` built from a `cellFor(day)` helper that matches the cell's own `aria-label`,
  `within(dialog)`, `findByText`). **No `.closest()` or other DOM-depth-sensitive queries found**
  — a clean result, matching `notes.md`'s two files and improving on `dashboard.md`'s two
  instances. One structural note worth flagging for Phase 4 test-writers: the "gives each
  difficulty its own bar styling" test (lines 166-194) and "marks today differently" test (lines
  96-104) both assert on **`.className` equality/inequality** rather than a specific class name —
  robust to a Card-primitive rename (unlike a hardcoded `toHaveClass("diffEasy")` would be) but
  worth knowing this is deliberately class-agnostic already, i.e. these two tests specifically
  need *no* changes for a primitive swap, unlike `dashboard.md`'s `.closest()` cases which do.
- Design-move tags: [PageHeader primitive: HIGH] (third clean canonical instance, byte-for-byte
  matching pattern with Dashboard's own) · [Card primitive: HIGH — richest variant evidence in
  the audit] (2 more near-exact shell instances with a measurable radius/shadow drift, plus 3 more
  distinct partial/flat variants, plus a third independent hardcoded-blur-instead-of-token
  instance) · [spacing-scale conformance: MEDIUM] (roughly half tokenized, half
  hardcoded-but-on-scale or genuinely off-scale; zero font-size-token skips, a clean result) ·
  [accent restraint: LOW/fine — best showing of the three flagship files] (5 touches, 4 of them
  interaction-state-only, the 1 persistent touch is a small contained glow, and the
  difficulty-coding itself correctly stays off the accent system entirely) ·
  [empty/loading/error polish: HIGH] (all 3 non-happy-path states present and consistent with the
  other two flagship screens) · [header action-affordance: MEDIUM] (the toolbar's "+ Add exam"
  button already sits next to the month-nav controls, one row below the bare `<h1>` — the
  clearest existing precedent yet for what an integrated header-with-action could look like, but
  it currently costs two full spacing units — `.pageHeader`'s `margin-bottom: var(--s-6)` plus
  `.container`'s `padding: var(--s-6)` — of vertical distance between the `<h1>` and the actual
  action)
- Issues found (severity):
  - **Low — nested interactive controls in the calendar cell.** `role="button"` div containing
    real `<button>` exam-bar children (see Accessibility above). Functionally correct today
    (click/keyboard both work, confirmed by tests and live render) but a nonstandard ARIA pattern
    worth a second look if accessibility polish becomes an approved move.
  - **Low/maintainability — `.container`'s radius/shadow drift from the canonical Card shell**
    (`--r-lg` instead of `--r-xl`, missing the `--glass-inner-bottom` shadow layer). Possibly
    intentional (this is a larger, singular panel, not a repeated card), but undocumented as such
    — worth a decision recorded in Phase 4 either way.
  - **Low/maintainability — third independent instance of hardcoded `blur(Npx)` instead of
    `var(--glass-blur)`** (`.cell`, `blur(8px)`), joining `dashboard.md`'s and `notes.md`'s
    findings. Three batches, three different hardcoded values, same root cause.
- Redesign status: TODO

---

## ExamModal (`webapp/src/views/exams/ExamModal.tsx`)

- Route: not routed — opened as an overlay from `ExamsView` (clicking an empty day, an existing
  exam bar, the toolbar's "+ Add exam", or the day-detail modal's own "+ Add exam"/edit-row
  actions), keyed on `overlay.exam?.id ?? "new-${date}"` so switching which exam is being edited
  remounts the form fresh (`ExamsView.tsx:262`) rather than reusing stale field state — the same
  keying discipline `notes.md` noted for `NotesEditorPane`.
- Related files: `exams.module.css` (`.inputGroup`, `.segmented`, `.segmentedOption`,
  `.modalActions`, `.actionsRight`, `.ghostDanger`, `.dateError` + its keyframes),
  `components/Modal.tsx` (**shared `components/` primitive, out of scope for this batch but
  reused here — provides the `role="dialog"`/focus-trap/overlay chrome**, its own
  `Modal.module.css` not audited here), `components/Button.tsx`, `context/dialog` (the shared
  `confirm()` used for delete), `context/toast`, `hooks/useExams.ts` (`useSaveExam`/`useDeleteExam`),
  `examMeta.ts` (`DIFFICULTIES`, `STATUSES`), `lib/date.ts` (`localDateStr`)
- Screenshots: `ExamsView-dark-modal-new.png` (create), `ExamsView-dark-modal-edit.png` (edit,
  Hard/Completed exam, Status + Delete both visible)
- Header: no `.pageHeader` — uses `Modal`'s own `title`/`subtitle` props (`ExamModal.tsx:107-116`,
  "New exam"/"Edit exam" with matching subtitle copy), the shared dialog-header pattern, not a
  page-level concern of this batch.
- Card usage: none of its own — this file only contributes form-specific CSS (`.inputGroup`,
  `.segmented`, `.ghostDanger`, `.dateError`) layered inside `Modal`'s shell, which is a
  `components/` concern.
- Spacing: see the `ExamsView` entry above for the full inventory — this file's rules
  (`.inputGroup`, `.segmented`/`.segmentedOption`, `.modalActions`, `.actionsRight`,
  `.ghostDanger`, `.dateError`) live in the same shared `exams.module.css` and were counted there
  to avoid duplicating the same line-by-line list twice. Net: mostly clean/tokenized
  (`.inputGroup`, `.segmented`, `.modalActions`, `.actionsRight`), one off-scale instance
  (`.segmentedOption`'s `9px 8px` padding).
- Accent usage: `.segmentedOption:has(input:checked)` (lines 302-306) is the only accent touch in
  this file's own CSS — persistent while a difficulty is selected, functionally justified (see
  `ExamsView` entry). Everything else (Save/Cancel/Delete buttons) is styled by the shared
  `Button` component's own variant classes, a `components/` concern.
- Distinctive/preserve: two date-validation behaviors worth flagging as functional, not visual,
  but load-bearing for any redesign that touches this form's fields:
  1. **Only a *new* exam is forced into the future** (line 64, `if (!editing && date < today)`) —
     an existing exam may legitimately be re-dated into the past (e.g. marking it Completed after
     the fact), per the code comment at lines 61-63. The date `<input>`'s own `min` attribute
     reflects this: `min={editing ? undefined : today}` (line 143) — confirmed live, the edit
     screenshot's date field has no native `min` constraint (existing exam dated 2020-01-15 would
     otherwise be rejected by the browser itself).
  2. `noValidate` on the `<form>` (line 122) is explained by its own comment (lines 118-121):
     native constraint validation on the date `min` would block the submit event before the JS
     past-date check below it ever ran, silently making the "Add exam" button look dead rather
     than showing the intended toast + shake-animation error. `.dateError`'s `animation:
     exam-shake 0.5s` (lines 339-342, keyframes 344-357) plus `onAnimationEnd={() =>
     setDateInvalid(false)}` (line 146) is a deliberate re-triggerable shake — clicking Add again
     with the same bad date replays the shake via a `requestAnimationFrame`-delayed state flip
     (`ExamModal.tsx:65-66`), not just a static red border.
- Accessibility: every field uses `useId()`-generated ids tied via `htmlFor`/`id`
  (`nameId`/`dateId`/`statusId`, lines 40-42) — no implicit-label guessing. The difficulty control
  is a real `role="radiogroup" aria-label="Difficulty"` (lines 154-157) wrapping visually-hidden
  native `<input type="radio">` elements (`.segmentedOption input`, `exams.module.css:290-296`:
  `position: absolute; opacity: 0; inset: 0`) under styled `<label>` "pills" — a correct
  accessible-custom-control pattern, not a div-with-onClick fake. `:focus-visible` is handled via
  the modern `:has()` selector (`.segmentedOption:has(input:focus-visible)`, lines 308-311) —
  works in all evergreen browsers this app is likely to target, but worth flagging as a
  `:has()`-dependent style if the project's browser-support baseline is ever formally set. Delete
  routes through the shared `useDialog().confirm()` (an `alertdialog`, confirmed by the test file)
  rather than deleting immediately — consistent with the app-wide destructive-action pattern.
- Responsive: no component-specific breakpoint; inherits `Modal`'s own responsive behavior
  (out of scope, `components/` concern).
- Test file: `ExamModal.test.tsx` — role/label queries throughout (`getByLabelText`,
  `getByRole("radio", {name: ...})`, `getByRole("alertdialog")` for the delete-confirm dialog).
  **No `.closest()` calls.** Thorough coverage: create-vs-edit field visibility, difficulty
  defaulting, min-date presence/absence, past-date rejection with no POST fired, PATCH survives a
  past date on an existing exam, POST always forces `status: "Scheduled"` regardless of what the
  (hidden, create-only) form state would imply, save-failure keeps the dialog open, delete only
  fires after confirm accept, 5-year max-date cap, Cancel fires `onClose` without any network call.
- Design-move tags: [Card primitive: N/A] (no shell of its own, delegates entirely to `Modal`) ·
  [spacing-scale conformance: shares `ExamsView`'s MEDIUM finding, same stylesheet] ·
  [accent restraint: LOW/fine] (single, functionally-justified touch)
- Issues found (severity): none blocking
- Redesign status: TODO

---

## DayDetailModal (`webapp/src/views/exams/DayDetailModal.tsx`)

- Route: not routed — opened from `ExamsView` when a calendar cell with 1+ existing exams is
  activated (`ExamsView.tsx:101-108`), i.e. this is the modal a click on *any* non-empty day
  reaches, not something reserved for overflow days specifically (confirmed live: clicking the
  Aug 20 cell, which has 4 exams and shows the `+2 more` badge, opens this same modal listing all
  4 — the calendar cell's 2-bar-plus-badge display is purely a space-saving truncation, the modal
  is always the complete, authoritative list for that day).
- Related files: `exams.module.css` (`.dayList`, `.dayItem`, `.dayItemText`, `.dayItemName`,
  `.dayItemMeta`), `components/Modal.tsx` (shared, out of scope), `components/Icon.tsx`,
  `components/Button.tsx`, `examMeta.ts` (`formatDayTitle`)
- Screenshots: `ExamsView-dark-day-detail.png` — all 4 Aug 20 exams listed ("Bio Lab · Easy •
  Scheduled", "Enviro Sci · Medium • Scheduled", "Stats Test · Hard • Scheduled", "Extra Makeup ·
  Medium • Scheduled"), each with a pencil icon
- Header: uses `Modal`'s own `title` prop, `` `Exams on ${formatDayTitle(dateStr)}` `` (line 40,
  `examMeta.ts`'s `formatDayTitle` formats via `toLocaleDateString` with an explicit
  `T00:00:00` local-midnight anchor — the function's own comment, `examMeta.ts:11-12`, notes bare
  `new Date("2026-08-01")` parses as UTC and would show the wrong day west of Greenwich; confirmed
  correct in the live capture, "Exams on Thu, Aug 20" matches the fixture date exactly) —
  no `.pageHeader`, a dialog-title concern.
- Card usage: `.dayItem` (lines 369-383) is a **flat, non-glass surface** —
  `background: var(--surface-active)`, no border, no backdrop-filter, no box-shadow — a fourth
  distinct "not full glass" variant when counted alongside `ExamsView`'s own `.cell`/
  `.overflowBadge`/`.empty` partial variants, reinforcing the same file-wide theme of many small
  shape variations rather than one repeated shell. The file's own comment (lines 8-17) explains
  each row is now a real `<button>` rather than the vanilla's `innerHTML`-built row with a
  hand-rolled `cloneNode` re-bind trick — a genuine simplification, not just a port.
- Spacing: `.dayList` `gap: var(--s-3)` / `margin-bottom: var(--s-4)` (lines 363-364, on-scale,
  tokenized). `.dayItem` `gap: var(--s-3)` / `padding: var(--s-3)` (lines 373, 375, both
  correctly tokenized — a clean result, and notably an *improvement* on the vanilla, whose inline
  JS `style` assignments (`js/main.js:1806-1812`, per the code comment) are exactly the kind of
  ad hoc styling a CSS Module was meant to replace). `.dayItemText` `gap: 4px` (line 392) —
  matches `--s-1` but hardcoded, the file's one off-scale note.
- Accent usage: `.dayItem:hover` → `background: var(--accent-soft)` (line 386) — the only touch
  in this file, hover-only, restrained.
- Distinctive/preserve: none flagged beyond what's already covered by `ExamsView`'s
  difficulty/status meta text (each row shows `{difficulty} • {status}`, line 62, plain text — no
  color-coding is reapplied at this smaller list-row scale, i.e. the difficulty color only lives
  on the calendar's own exam bars, not duplicated here as another badge). This is arguably a
  missed opportunity for visual consistency (a Hard exam in this list looks identical to an Easy
  one until you read the word) but is also arguably the right restraint for a plain-text detail
  row — worth a product/design call, not flagged as a defect.
- Accessibility: each row is `<button aria-label="Edit exam: {name}">` (line 56) — a single flat
  interactive element per row, **correctly avoiding the nested-interactive-controls pattern**
  `ExamsView`'s own calendar cell has (see that entry's Accessibility note) — this is the cleaner
  of the two interaction patterns in the batch. The trailing pencil icon is wrapped in
  `<span aria-hidden="true">` (line 65) since the button's own `aria-label` already communicates
  the action — correct, avoids double-announcement.
- Responsive: no component-specific breakpoint; inherits `Modal`'s own behavior.
- Test file: covered inside `ExamsView.test.tsx` (no separate `DayDetailModal.test.tsx`) — the
  "opens the day list instead when the day already has exams," "hands off from the day list to
  the edit dialog," and "adds another exam for the same day from the day list" cases (lines
  231-244, 271-313) exercise this component directly via `within(dialog).getByRole("button",
  {name: "Edit exam: ..."})` and `within(dialog).getByRole("button", {name: "+ Add exam"})`.
  **No `.closest()` calls.**
- Design-move tags: [Card primitive: LOW-MEDIUM] (`.dayItem` is a flat, deliberately non-glass
  row surface — a real variant to catalogue, not a shell candidate on its own) ·
  [spacing-scale conformance: clean, near-zero violations — best showing of the three files in
  this batch] · [accent restraint: LOW/fine]
- Issues found (severity): none blocking
- Redesign status: TODO

---

## Design-move tally for this batch (feeds DESIGN_MOVES.md's "Evidence batches" fields)

1. **Card primitive** — Confidence: **HIGH**, and this batch is the richest single source of
   variant evidence in the audit: `.container` and `.iconBtn` are 2 more near-exact instances of
   the canonical shell (bringing the running cross-batch count to roughly 7), each with its own
   measurable drift (`.container`'s radius/shadow-layer difference is a new, previously-unseen
   drift shape; `.iconBtn` introduces a "glass icon button" variant no prior batch had). `.cell`,
   `.overflowBadge`, `.empty`, and `DayDetailModal`'s `.dayItem` add four more distinct
   partial-glass or flat variants. Combined with `notes.md`'s three-variant finding in
   `NotesAiSidebar`, there is now strong, repeated cross-batch evidence that the eventual Card
   primitive needs a small number of named variants (full-glass / bg-only / flat / icon-button),
   not one fixed shape with size-only tuning.
2. **PageHeader primitive** — Confidence: **HIGH**, third clean canonical instance
   (`ExamsView`'s `.pageHeader` + `<h1>Exams</h1>`), title-only, structurally and stylistically
   identical to Dashboard's. All three flagship screens now agree on this pattern where a
   PageHeader is used at all (Notes deliberately opts out in favor of a toolbar, already recorded
   as preserved, not a gap).
3. **Spacing-scale conformance** — Confidence: **MEDIUM**, consistent with the design doc's
   starting estimate. Roughly half of this batch's spacing declarations are cleanly tokenized
   (a noticeably better ratio than `NotesAiSidebar`'s worst-in-audit showing), with recurring
   off-scale/hardcoded values concentrated in small UI chrome (`.examBar`, `.segmentedOption`,
   `.iconBtn`'s clamp) rather than layout-level spacing. **Zero font-size-token skips** — a clean
   result across all three files in this batch, unlike `dashboard.md`'s `AIActionsCard` (1 skip)
   or `notes.md`'s `NotesAiSidebar` (4 skips). This batch's clamp() finding
   (`.cell`'s `clamp(8px, 1vw, 12px)`) is now the **second independent instance** of the exact
   same "individually-on-scale clamp bounds written as raw px" pattern `dashboard.md` first
   flagged for `.card`'s own padding.
4. **Accent restraint** — Confidence: reinforces **MEDIUM**, but this batch is the **best-behaved
   of the three flagship files** for this move: 5 accent touches total, 4 of them
   interaction-state-only (hover/focus), 1 persistent-but-small (the today-badge glow, confined
   to a 28px circle rather than a whole-card wash). Critically, the difficulty-color system —
   the most visually prominent recurring color signal on this entire screen — correctly never
   touches the accent system at all, confirmed identical between default-teal and cyberpunk-pink
   captures. This is a positive data point suggesting accent density is a per-view choice already
   being made reasonably well in at least one of the three flagship screens, not a universal
   problem.
5. **Header action-affordance** — Confidence: **MEDIUM**, upgraded from the design doc's starting
   "LOW/exploratory." `ExamsView`'s toolbar (month-nav + "+ Add exam") is the clearest existing
   precedent yet across all three flagship batches for what a header-integrated primary action
   could look like — but it currently sits a full two spacing-units below the bare `<h1>`, inside
   the `.container` panel rather than the `.pageHeader` row itself. Worth a concrete design
   proposal in Phase 3 (e.g. move "+ Add exam" up into the `.pageHeader` row) rather than staying
   purely exploratory.
6. **Empty/loading/error polish** — Confidence: **HIGH**, consistent with both prior flagship
   batches. All three non-happy-path states (`aria-busy`+labeled Skeleton, `role="alert"`, and a
   genuinely empty populated-but-zero-exams month) are present and visually calm, confirmed in
   `ExamsView-dark-empty.png` and `ExamsView-dark-loading.png`.

### New finding not covered by the six seeded hypotheses

**Exam-difficulty color coding is visually inconsistent across the two screens that both display
it.** Dashboard's `NextExamCard` difficulty pill (`dashboard.module.css:184-197`) is a flat
soft-tint badge (`background: var(--success-soft); color: var(--success)`); this batch's exam-bar
difficulty coding (`exams.module.css:213-224`) is a filled two-stop gradient with mode-aware ink.
Both correctly use only semantic (`--success`/`--warning`/`--danger`) tokens, never accent — so
the ledger's literal instruction ("preserve exam-difficulty color coding") is honored at the
token level in both places — but the two *visual treatments* of that same concept differ. Worth a
deliberate Phase 3 decision: is "preserve" scoped to the color tokens (already true everywhere) or
also the shape/fill treatment (not currently unified)? Flagging rather than resolving, since the
ledger's "preserve, do not erase" instruction reads as being about the color-to-difficulty mapping
surviving redesign, not necessarily about pixel-for-pixel shape parity between two already-shipped,
independently-designed components.

## Test-safety flags for Phase 4 (Card/PageHeader primitive migration)

**Clean batch — zero `.closest()` or other DOM-depth-sensitive queries found** across
`ExamsView.test.tsx` and `ExamModal.test.tsx` (`DayDetailModal` has no separate test file; it's
exercised through `ExamsView.test.tsx`). This is the **second of three flagship batches** to come
back clean on this specific risk (`notes.md` was the first); only `dashboard.md` has the two
`.closest("div")` instances that need attention before a primitive swap. Two positive patterns
worth carrying forward as the model for future batches:
- `ExamsView.test.tsx`'s difficulty and today-marker assertions compare `.className` values for
  *equality/inequality* rather than asserting a specific class string exists (lines 96-104,
  166-194) — already resilient to a class-name-changing primitive swap, no rewrite needed.
- Every dialog-scoped assertion uses `within(await screen.findByRole("dialog"))` rather than a
  DOM-position-dependent query — safe against any structural change to what's *inside* the modal.

**No action needed for this batch's tests before a primitive swap.**
