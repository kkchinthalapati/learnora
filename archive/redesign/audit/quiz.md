# Quiz batch — 3 files

Status: AUDITED (2026-08-02) — code audit complete; screenshots not captured (see dashboard.md).
Source: `webapp/src/views/quiz/`
Note: preserve the flashcard flip interaction.
**Correction:** the flip interaction is not in this batch — it lives in `review.md`
(`review.module.css:60-100`). Quiz has no flip.

## QuizRunner / QuizReview (views/quiz/QuizRunner.tsx, QuizReview.tsx)

- Route: `/quiz/:quizId` (runner), `/quiz/:quizId/review` (review). `QuizHost.tsx` is the
  shared shell, not routed directly.
- Related files: `quiz.module.css` (~340 lines), `quizMeta.ts`
- Header: **no `.pageHeader`.** Both screens use `.panel h1` (`quiz.module.css:27-31`) — the
  heading lives *inside* the card rather than above it. Defensible for a focused,
  single-task screen (the quiz is the page), and consistent between runner and review.
  Treat as a deliberate third header pattern alongside `.pageHeader` and Notes' toolbar; record
  it, do not "fix" it.
- Card usage: **2 glass-shell declarations, both Recipe B** (`--r-lg`, `--glass-inner` +
  `--shadow-sm`): `.panel` at `:16-25` and a second at `:263-266`. Plus four `--r-md` inner
  surfaces (`:39`, `:90`, `:160`, `:306`, `:334`) for choice rows and result blocks.
  - Card primitive confidence: **MEDIUM-HIGH** — only two shells, but both are exact Recipe B.
- Spacing: **13 hardcoded px**, distinct values `6 8 10 12 16 20 24`. Off-scale: `6px`, `10px`.
  The rest are on-scale literals — cheap token swap.
- Accent usage: 4 references — the lightest of any interactive view. Correct instinct: the
  quiz uses semantic correct/incorrect colour, not accent, to carry meaning.
- Distinctive/preserve:
  - The file comment (`:5-7`) records that the vanilla's `!important` run on
    `.correct-choice`/`.wrong-choice` was deliberately dropped in favour of source order.
    **Do not reorder this file**, same hazard as `exams.module.css`'s `.statusCompleted`.
  - Correct/incorrect choice colouring is semantic feedback — treat it with the same care as
    exam-difficulty colour coding even though it is not named on the preserve list.
- Accessibility: **no `:focus-visible` rules in this module** — relies on the global ring.
  Choice rows are `<li>`-wrapped controls (see test note). Worth verifying in Phase 4 that a
  keyboard user can tell which choice is focused *and* which is selected, since selection is
  communicated by background colour.
- Responsive: no width breakpoints; only `prefers-reduced-motion` (`:5` region). Single-column
  centred layout, so this is fine.
- Test file: `QuizRunner.test.tsx` + `QuizReview.test.tsx`. **One DOM-depth-sensitive helper:**
  `QuizReview.test.tsx:82-84` — `choiceRow(text)` returns `screen.getByText(text).closest("li")`
  and is the `within()` root for the file's assertions. **Hard constraint: choice rows must stay
  `<li>` elements.** A `<Card>` inside the `<li>` is safe; replacing the `<li>` is not.
- Design-move tags: [card-primitive: MEDIUM] [pageheader-primitive: N/A — heading inside panel
  by design] [spacing-scale: MEDIUM] [accent-restraint: LOW] [header-actions: LOW]
  [empty-loading-polish: LOW]
- Issues found (severity):
  - **LOW — no explicit focus styling on choice rows.** Selection and focus may be hard to
    distinguish when both are expressed as background colour. Verify visually in Phase 4.
  - **LOW — the batch stub's flashcard-flip note is misfiled** (belongs to `review.md`).
- Redesign status: TODO
