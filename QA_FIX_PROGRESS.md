# QA Fix Progress — findings from QA_STUDENT_SESSION_2026-09-22.md

Working log so any session can resume from the last verified checkpoint.
**Read this file first, then `git log` and `git status`.**

## Ground rules for this work
- Reproduce and diagnose before editing. No speculative changes.
- One bug at a time, small batches. Narrow test after each; full suite periodically.
- No unrelated refactors.

## Baseline
- Branch: `fix/dark-theme-contrast`
- Baseline full suite BEFORE any fix: **224 files / 2838 tests passed** (~312s).
  Command: `npm test --prefix webapp`
- Full suite is slow (~5 min). Prefer:
  `npx vitest run src/path/to/File.test.tsx` (from `webapp/`)

## Status legend
`TODO` · `DIAGNOSING` · `FIXED (tests pending)` · `VERIFIED` · `DEFERRED`

## Work queue (ordered)

| # | ID | Title | Status |
|---|----|-------|--------|
| 1 | B1 | Today quick-add drops `due_date` | TODO |
| 2 | C1 | Folderless deck RLS 403 + catch-block reports success | TODO |
| 3 | C3 | Feynman `solvedPoints` exact-match; planted misconceptions into ledger | TODO |
| 4 | C2 | Studio Tools output never surfaced | TODO |
| 5 | B2 | Chat follow-up chips stuck disabled | TODO |
| 6 | B4 | Review recap "weak topics" word salad | TODO |
| 7 | B5 | Feynman left pane shows stale first question | TODO |
| 8 | B3 | AI flashcard grading shows no verdict | TODO |
| 9 | B8 | "Quiz not found" dead end | TODO |
| 10 | B7 | Phantom "Canceled quiz generation" | TODO |
| 11 | C4 | Exam forecast ignores subject | TODO (likely DEFERRED — schema change) |

## Checkpoint log

### 2026-09-22 — session start
- Full suite green at baseline. No code changed yet.
