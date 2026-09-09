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
| 4 | S1B3 — remove fabricated AI fallbacks | `views/notebooks/NotebookStudioView.tsx`, `views/notebooks/NotebookStudioView.test.tsx` | On a failed `callEdge`, `handleGenerateCheatSheet` saved a hardcoded note about congruency conditions and `handleGenerateFeynman` a bicycle-wheel analogy, each toasting "generated and saved". The invented text entered the artifact list attributed to the student's own sources and was indistinguishable from a real result. Both now surface the real error and save nothing. | `npx vitest run` → **205/205 files, 2593/2593 passed**. `grep` for the invented strings in `src/` → no matches. New test asserts a failed generation writes zero `notebook_artifacts` rows and shows an error. | done |
| 5 | S1B4 — orphaned decks | — | **Descoped into Stage 4.** `handleCreateDeckFromArtifact` files decks with `folder_id: null`, and the plan called for passing "the real scope". There is no scope to pass: `notebooks` has no `folder_id` column until Stage 4's migration adds one, and a notebook's `subject` is free text, not a folder reference. Guessing a folder from the subject string would file decks under the wrong subject, which is worse than leaving them unfiled. Stage 4's backfill files these decks via the per-user "Unfiled sources" notebook. | n/a — no code change | descoped |
| 6 | S1B5 — repoint dead CTAs | `views/study-lab/StudyLabView.tsx`, `views/library/SubjectDetailPage.tsx`, `views/pro-welcome/WelcomeToProView.tsx` | Three live CTAs pointed at redirect-only paths. Study Lab's "Set up a stress test" and the subject page's trap button went to `/premortem`, which `<Navigate>`s to `/ai-tutor` — a screen with no trap practice on it. Pro Welcome's "Open notebooks" went to `/notebooks`, which redirects to `/library`. Repointed to `/exam-detective` and `/library`. Study Lab's supporting copy drew a distinction between this link and "Exam Trap Practice" that no longer exists now both are the same destination, so it was rewritten to describe what Exam Detective actually offers. `handleLaunchPreMortem` renamed to `handleLaunchExamDetective`. | `npx vitest run` → **205/205 files, 2593/2593 passed**. `npm run build` → **✓ built in 1.34s**. | done |
| 7 | S2B1 — merge Pre-Mortem into Exam Detective | **new** `views/exam-detective/SubjectPicker.tsx`; `views/exam-detective/ExamDetectiveHubView.tsx` + test; `examDetective.module.css`; `routes.tsx`; `routes.test.tsx`; `styles/drift.baseline.json`; **deleted** `views/premortem/` (4 components, 4 CSS modules, 4 test files) and `api/aiPreMortem.ts` | Ported the one piece genuinely worth keeping. Exam Detective hardcoded `subject = "Calculus & STEM"` and offered a `<select>` of five generic strings unrelated to anything the student had told the app — the "chatbot with a logo" failure its own `FEATURE_AUDIT.md` names. `SubjectPicker` sources the subject from the student's exams, then their subject folders, then free text, and consumes the `CognitiveBridge` payload that `SubjectDetailPage` has been writing to nobody (row 6). **Did not** port Pre-Mortem's radar: `ImmunityRadarRecord` already carries timestamp, subject and per-category scores, so exam-detective's data model was already as rich — re-rendering it a second way is churn, not value. Added guards so an empty subject cannot generate a sprint or deconstruction. | `npx vitest run` → **201/201 files, 2570/2570 passed** (4 dead premortem suites removed). `npm run build` → **✓ built in 1.30s**. New tests assert the picker lists the student's own exam and folder, excludes the canned "Calculus & STEM", and opens on a bridged subject. | done |

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

### Note on row 6

`SubjectDetailPage.handleLaunchExamDetective` still writes a `CognitiveBridge`
payload (`subject`, `suggestedAction: "run_premortem"`) that nothing reads —
`ExamDetectiveHubView` does not import `CognitiveBridge` at all. The button was
already dropping its subject context before this change; repointing it does not
fix that. Wiring Exam Detective to the bridge belongs to Stage 2, where the
Pre-Mortem merge brings in the exam/subject config form that would consume it.

### Note on row 7

`/premortem`, `/premortem/radar`, `/exam-traps` and `/exam-traps/radar` are kept
as redirects rather than deleted — they now point at `/exam-detective` instead of
`/ai-tutor`, so an old bookmark reaches the feature it was about. Their previous
target had no trap practice on it at all.

Still outstanding from this merge: `lib/cognitiveBridge.ts` and
`components/ai/CognitiveCrossLinkBar.tsx` still declare a `"premortem"` tool in
their type unions and label maps, and `lib/sectionLabel.ts` still branches on
`/premortem` and `/exam-traps`. Those are the Stage 2 dead-reference sweep.

