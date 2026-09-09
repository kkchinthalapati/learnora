# Batch ledger — structural repair

Work from `~/.claude/plans/i-worked-with-codex-quizzical-journal.md`, done one
batch at a time. A batch is not closed until its verification command has
actually been run and its real result recorded below.

Statuses: **open** (in progress) · **done** · **descoped** (with reason).

| # | Stage / batch | Files touched | What changed & why | Verification: command + real result | Status |
|---|---|---|---|---|---|
| 1 | S1B1 — basename escapes | `lib/appUrl.ts` (new), `lib/appUrl.test.ts` (new), `components/Sidebar.tsx`, `context/TimerProvider.tsx`, `views/timer/TimerView.tsx`, `views/plan/PlanSectionNav.tsx`, `api/auth.ts`, `api/friends.ts` | Three `window.location.href = "/signup"` calls bypassed the router's `/app` basename, so `vercel.json`'s catch-all turned them into a hard 404. Sidebar and TimerView now use `useNavigate()` (client-side, no reload). `TimerProvider` is mounted **above** `<BrowserRouter>` in `App.tsx`, so `useNavigate` is unavailable there — it uses the new `appUrl()`. `PlanSectionNav`'s non-router `<a href>` fallback had the same defect. The basename idiom already existed privately in `api/auth.ts` and `api/friends.ts`; both now call the shared helper instead, so there is one implementation rather than three. | `npx vitest run` → **204/205 files, 2589/2590 tests passed**. The single failure (`SubjectDetailPage`) is pre-existing — see row 2. `npm run build` → **✓ built in 1.43s**. `grep -rn 'location.href = "/'` → no matches outside a doc comment. | done |
| 2 | S1B1a — repair pre-existing red test | `views/library/SubjectDetailPage.test.tsx` and/or `components/create/CreateModal.tsx` | Discovered while verifying row 1, so recorded separately rather than folded in. `SubjectDetailPage > "opens the create dialog with this folder pre-selected"` fails on a clean checkout of `main` too (verified by stashing): it looks for a heading "Build study resources" that the `CreateModal` rewrite in `4a548c1` renamed. This is the third broken-on-main test found so far. Fixed first because a red suite makes every later batch's verification meaningless. | `npx vitest run` → **205/205 files, 2590/2590 tests passed** (suite fully green for the first time). Mutation-checked: severing `openCreateModal({ folderId, … })` in `SubjectDetailPage.tsx:231` makes it fail, and restoring it makes it pass. | done |
| 3 | S1B2 — replace the stub generators | `views/notebooks/NotebookStudioView.tsx`, `views/notebooks/NotebookStudioView.test.tsx` | `handleGenerateFlashcards` and `handleGenerateQuiz` wrote a `notebook_artifacts` row advertising "8 Cards" / "Five quick questions" and created **no** `flashcard_decks`, `flashcards` or `quizzes` row at all. Both now call the generators the rest of the app already uses (`generateDeck`, `generateQuizFrom`), surface real errors instead of a success toast, and offer a Review/Start action on the row they actually created. Also added `groundedSourceText()`: the chat path fenced source text with `fenceUntrusted` but the cheat-sheet and Feynman generators interpolated `s.content` raw — the same prompt-injection hole with none of the protection. All four callers now share the fenced, capped builder. | `npx vitest run` → **205/205 files, 2592/2592 passed**. `npm run build` → **✓ built in 1.31s**. Mutation-checked: restoring the original stub bodies makes both new tests fail, and the real implementation makes them pass. | done |

### Note on row 2

The original assertion was vacuous in two independent ways, both worth
recording because the same pattern is expected elsewhere:

1. It asserted a heading (`"Build study resources"`) and an
   `aria-label="Creation summary"` landmark that the `4a548c1` create-dialog
   rewrite deleted. Grep confirms "Creation summary" now appears nowhere in
   `src/` except that test.
2. Rewriting it to assert the Subject `<select>` value **still** passed with the
   wiring severed: `MaterialPanel` falls back to `folders[0].id` when given no
   `folderId`, and the fixture served exactly one folder — the page's own. The
   test now serves `[chemistry, biology]` so the defaulted and passed-through
   values differ.

### Note on row 3

Two consequences worth carrying forward:

- **Quota.** The stubs made no `callEdge` call, so both buttons were free. They
  now bill the `flashcards` and `quiz` tool quotas
  (`20260906000000_add_plus_tier_and_tool_quotas`). A student who leaned on the
  free buttons will start hitting limits from a control that never cost
  anything. Quota surfacing in the studio is worth a look before release.
- **Decks land unfiled.** `generateDeck` is called with `folderId: null`,
  because a notebook has no folder until Stage 4 adds `notebooks.folder_id`.
  This is the same orphaning that batch S1B4 was meant to fix, and it cannot be
  fixed before the schema supports it — see row 4.

