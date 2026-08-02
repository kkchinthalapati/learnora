# Tasks batch — 3 files

Status: AUDITED (2026-08-02) — code audit complete; screenshots not captured (see dashboard.md).
Source: `webapp/src/views/tasks/`

## TasksView (views/tasks/TasksView.tsx)

- Route: `/tasks`
- Related files: `tasks.module.css` (~270 lines), `TaskItem.tsx`, `DashboardTasksWidget.tsx`,
  `sortTasks.ts`, `useTaskActions.ts`
- Header: HAS `.pageHeader` canonical pattern — `tasks.module.css:15-24`, used at
  `TasksView.tsx:57`. Byte-identical rule body to dashboard/exams/settings/timer (copy 3 of 5).
- Card usage: **3 glass-shell declarations, all Recipe B** (`--r-lg`, `--glass-inner` +
  `--shadow-sm`):
  - `.addRow` (`:28-40`) — the new-task composer bar, `padding: var(--s-5)`
  - `.taskItem` (`:82-95`) — the task row, `padding: 16px 20px`, hardcoded `blur(16px)`,
    plus `transform` hover. **This is structurally the same object as dashboard's `.logItem`**
    (`dashboard.module.css:486-501`): same padding, same `blur(16px)`, same `--r-lg`, same
    `--glass-inner`/`--shadow-sm`, same flex-row-with-wrap. Two independent copies of a
    "glass list row".
  - `:209-211` — a third shell, `--r-lg`
  - Card primitive confidence: **HIGH**, and this batch supplies the clearest evidence for a
    *list-row* surface as a distinct tier from the container card.
- Spacing: **9 hardcoded px**, distinct values `4 5 6 8 10 12 16 20`. Off-scale: `5px`, `6px`,
  `10px`. `padding: 16px 20px` at `:84` is on-scale-but-literal.
- Accent usage: 10 references — moderate. Due-date badges, hover states, the composer's focus
  affordances.
- Distinctive/preserve: due-date urgency colouring (overdue vs today vs upcoming) is semantic
  state, in the same family as exam-difficulty coding. Not on the formal preserve list, but the
  test at `:331` depends on overdue and today producing **different class strings** — see below.
- Accessibility: 2 `:focus-visible` rules. Task rows expose due dates through accessible names
  (`"Due date: 2020-01-01"`, asserted in the test file), which is good practice — the date is
  not conveyed by colour alone. **`.dateError` uses `border-color: var(--danger) !important`
  (`:216`)** — one of only two surviving `!important` declarations in the app (the other is the
  identical rule in `exams.module.css:341`).
- Responsive: `prefers-reduced-motion` only; no width breakpoints. The row layout uses
  `flex-wrap`, so it degrades intrinsically — same approach as Library.
- Test file: `TasksView.test.tsx` (~370 lines) + `DashboardTasksWidget.test.tsx`.
  - **`:331` `expect(overdue.className).not.toEqual(today.className)`** — differential, not a
    literal match, so a class-name swap is safe **provided overdue and today keep producing
    distinct class strings.** Collapsing the urgency modifiers into one class driven by a CSS
    custom property would break this, exactly as with exams' difficulty modifiers.
  - `:368` `within(toast.closest("[role]") ?? toast)` — attribute-based, unaffected by classes.
  - No snapshots.
- Design-move tags: [card-primitive: HIGH] [pageheader-primitive: HIGH] [spacing-scale: MEDIUM]
  [accent-restraint: LOW] [header-actions: MEDIUM — the composer row is arguably a header
  action] [empty-loading-polish: LOW]
- Issues found (severity):
  - **LOW — `!important` on `.dateError`** (`:216`). Duplicated verbatim in
    `exams.module.css:341`. Both are beatable by source order; the port removed every other
    `!important` in the app.
  - **LOW — hardcoded `blur(16px)`** at `:87-88`. Fourth instance of this drift.
  - **LOW — `.taskItem` and dashboard's `.logItem` are the same object declared twice.**
    Feeds the list-row tier in the Card variant question.
- Redesign status: TODO
