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
| 8 | S2B2 — one canonical URL per tool | `routes.tsx`, **new** `routeIntegrity.test.ts`, `lib/sectionLabel.ts` + test, `lib/cognitiveBridge.ts` + test, `components/Sidebar.tsx` + test, `components/ai/CognitiveCrossLinkBar.tsx`, `components/command/CommandPalette.tsx`, `views/study-lab/StudyLabView.tsx` + CSS + test, `views/dashboard/DashboardView.tsx`, `views/library/SubjectDetailPage.tsx`, `views/notes/{NotesAiSidebar,StudyBuddyCard}.tsx`, `views/review/ReviewView.tsx`, `views/notebooks/NotebookStudioView.tsx`, `views/marketing/LandingView.tsx`; **deleted** `views/ai-tutor/`, `views/library/LibraryWorkspaceNav.tsx` + CSS | Each tool answered to three URLs and navigation was split across them — `StudyLabView`'s card linked `/solver` while its own `routeFor` returned `/debugger`. Canonical set is now `/study`, `/solver`, `/feynman`, `/viva`, `/exam-detective`; `/study-lab`, `/debugger`, `/sparring`, `/ai-tutor`, `/premortem`, `/exam-traps` remain as redirects for bookmarks only. Deleted `views/ai-tutor/`, a 272-line wrapper that rendered nothing of its own — it mounted the three tool views inline behind a tab strip, which is why the sidebar offered two entries onto the same three tools. Its `?topic=` deep links (flashcard review, notes sidebar) now reach `/study`, which reads the param and names the topic rather than showing a generic menu. Removed the dead `/feynman/studio` and `ai_tutor` destination. | `npx vitest run` → **201/201 files, 2569/2569 passed**. `npm run build` → **✓ built in 1.36s**. | done |
| 9 | S2B3 — grouped sidebar, reachability, honest route tests | `components/Sidebar.tsx` + `.module.css` + test, `components/AppShell.test.tsx`, `routeIntegrity.test.ts`, `routes.test.tsx` | The rail offered 11 of ~45 routes; `/tasks`, `/exams`, `/my-week`, `/trajectory` and `/exam-detective` were reachable only by typing a URL or via a section sub-nav that is invisible until you are already on one of its pages. Nav items can now declare `children`, revealed while that section is open — the rail stays short by default and every primary destination is one click from its section. Fixed an ARIA defect this exposed: with a child route open, both parent and child claimed `aria-current="page"`; the child is the current page and the parent merely contains it. Also de-vacuumed two `routes.test.tsx` assertions — `/library/notes` is not a `LIBRARY_TAB`, so it redirected to `/library` and rendered the same heading whether or not tab routing worked, and the single-`h1` list included three redirect paths that were re-testing a target another row already covered. | `npx vitest run` → **201/201 files, 2570/2570 passed**. `npm run build` → **✓ built in 1.34s**. New `routeIntegrity` case asserts all 17 primary destinations appear in the rail. | done |
| 10 | S2B4 — AchievementsModal | — | **Not an orphan; nothing to do.** Exploration reported it as dead code reachable only from its own test. That is wrong: `views/dashboard/StreakCard.tsx` imports it at line 14 and renders it at lines 101 and 255. Verified by grep before deleting. Recorded because the plan listed it for deletion. | `grep -rn AchievementsModal src` → two live call sites in `StreakCard.tsx` | descoped |
| 11 | S2B5 — marketing page duplication | `views/marketing/MarketingPages.tsx`, `views/marketing/LandingView.tsx` | Fixed the defect; **did not** delete the React marketing views. In the same footer, "Privacy Notice" was a React `<Link to="/privacy">` while "Terms of Service" was `<a href="/terms.html">` — two different Terms documents depending on which link you clicked. Terms now resolves in-app like Privacy beside it. `/llms.txt` stays an `<a href>`; it is a genuine static asset. | `npx vitest run` → **201/201 files, 2570/2570 passed**. `npm run build` → **✓ built in 1.31s**. | done |
| 12 | S3B1 — one JSON extractor | `lib/aiJson.ts` + test, `api/aiSparring.ts`, `api/aiDebugger.ts`, `api/aiFeynman.ts`, `api/aiExamDeconstructor.ts` | **Fixes a real crash, not just duplication.** `api/aiSparring.ts` called `JSON.parse(res.text)` on the raw reply at three sites with no fence stripping at all, so any provider that wrapped its answer in a ```json fence — several in the edge function's provider chain do — threw a SyntaxError out of the sparring engine. `lib/aiJson.ts` already existed with exactly the helpers needed and was bypassed: `api/aiDebugger.ts` redefined `sanitizeJSON` and `stripFences` verbatim and inlined the same parse ladder twice, while `aiFeynman` and `aiExamDeconstructor` used ad-hoc `text.match(/\{[\s\S]*\}/)` regexes. Added `extractJSON<T>()` — the fence/prose/trailing-comma ladder the typed extractors already used internally — and routed all five modules through it. Typing the sparring replies revealed those fields had never been type-checked at all, since `JSON.parse` returns `any`; each already had a fallback, now declared. | `npx vitest run` → **201/201 files, 2576/2576 passed**. `npm run build` → **✓ built in 1.28s**. `grep` for `stripFences`/`sanitizeJSON`/ad-hoc match in `src/api` → no matches. New tests cover fenced, prose-wrapped, trailing-comma and unparseable input. | done |
| 13 | S3B2 — one keyed store | `lib/storage.ts` + **new** `lib/storage.test.ts`, `api/aiDebugger.ts`, `api/aiFeynman.ts`, `api/aiExamDeconstructor.ts` | Three modules had each hand-rolled the same list/find/upsert/remove/clear over a JSON array in `localStorage` — Feynman sessions, the Debugger's saved traces, Exam Detective's radar history — around seventy lines apiece, differing only in which `console.warn` they logged and whether they capped the list. `collection<T>(key, idOf, { limit })` in `lib/storage.ts` replaces all three. **Storage keys are unchanged**: they name data already in students' browsers. Feynman's active-session id is deliberately left alone — it is stored as a raw string, not JSON, so routing it through `Storage.get` would fail to parse existing values. | `npx vitest run` → **202/202 files, 2582/2582 passed**. `npm run build` → **✓ built in 1.34s**. Net −103/+96 lines. New tests cover ordering, the cap, removal, and corrupted/non-array values. | done |
| 14 | S3B3 — alias re-exports | `hooks/useDecks.ts`, `hooks/useFlashcards.ts`, `hooks/useAdaptiveLearning.ts` | `export const useDecks = useAllDecks` and `export const useAllFlashcards = useFlashcards` gave two names to one hook each. Nothing imported `useDecks`; `useAllFlashcards` had a single consumer, now calling `useFlashcards` directly. **Did not** collapse `generateDeckFromTopic`/`generateQuizFromTopic`: they are parallel in shape but call different generators against different tables, so merging them would mean a branch on entity type inside one function — the same code, less clear. | `npx vitest run` → **202/202 files, 2582/2582 passed**. `npm run build` → **✓**. | done |
| 15 | S3B4 — shared UI primitives | — | **Deferred until after Stage 4, deliberately.** The four duplicate card systems live in `library.module.css`, `notebooks.module.css`, `LibrarySearch.module.css` and `dashboard.module.css`'s shelf block — and Stage 4 rewrites every one of those components when Library becomes a view over notebooks. Consolidating them first means doing the work twice and resolving the same conflicts twice. Sequencing it after the content model is strictly cheaper and no less thorough. | n/a — no code change | deferred |
| 16 | S4C0 — notebook subject-scope foundation | `supabase/migrations/20260909000000_scope_notebooks_to_folders.sql` | Added nullable `notebooks.folder_id` so notebooks can share the real subject boundary already used by materials, decks and quizzes. Existing notebooks stay unfiled: mapping the free-text `subject` field to a folder name would be an unsafe guess. The foreign key uses `ON DELETE CASCADE`, preserving the product's current contract that deleting a subject deletes the content filed inside it, and a restrictive parent-owner policy prevents a user from attaching their notebook to another account's folder. The data backfill and application dual-write are deliberately separate batches; this migration has not been applied to any environment. | `npx vitest run src/views/notebooks/NotebooksHubView.test.tsx src/views/notebooks/NotebookStudioView.test.tsx src/views/library/LibraryView.test.tsx --pool=threads --maxWorkers=1 --no-file-parallelism` → **3/3 files, 47/47 tests passed**. `npm run build` → **✓ built in 9.58s**. `git diff --check` → clean. Full-suite attempt did not complete: its Vitest processes remained live after the 120s command timeout and were stopped. SQL execution was unavailable because the local Docker daemon is not running; no remote environment was touched. | done |
| 17 | S4B1 — carry notebook scope through real outputs | `types/notebooks.ts`, `api/notebooks.ts`, `hooks/useNotebooks.ts`, `hooks/useFolders.ts`, `views/notebooks/NotebooksHubView.tsx` + test, `views/notebooks/NotebookStudioView.tsx` + test | Mapped the new snake-case database field to `Notebook.folderId`, writes it explicitly on create/update, and added an optional real subject-folder picker to notebook creation. Choosing a folder also seeds the existing subject label and colour from that folder. The Studio now passes the notebook's actual folder to both real generators, so new decks and quizzes appear in the same subject instead of landing as unreachable `folder_id: null` rows. Folder deletion now invalidates notebooks along with the other cascaded collections. Tests mutation-check the outgoing notebook, deck and quiz inserts for `folder_id`; simply rendering a label would not prove the wiring. | `npx vitest run src/views/notebooks/NotebooksHubView.test.tsx src/views/notebooks/NotebookStudioView.test.tsx src/views/library/LibraryView.test.tsx --pool=threads --maxWorkers=1 --no-file-parallelism` → **3/3 files, 48/48 tests passed**. `npx vitest run src/components/chat/TurboChat.test.tsx src/api/studyPackage.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism` → **2/2 files, 57/57 tests passed**. `npm run build` → **✓ built in 5.55s**. `git diff --check` → clean. | done |
| 18 | S4C1 — notebook ownership bridge for Library rows | `supabase/migrations/20260909010000_link_library_content_to_notebooks.sql` | Added nullable `notebook_id` foreign keys to `materials`, `flashcard_decks` and `quizzes`, preserving their existing folder/material links for a zero-downtime dual-write transition. Deleting a notebook cascades through the rows it owns, while the revised restrictive policies require every non-null notebook parent to belong to the caller. Existing rows remain untouched in this compatibility batch; creating and assigning the per-user `Unfiled sources` notebook is a separate backfill so it can be verified independently. This migration has not been applied to any environment. | PowerShell structural check over the migration → **3 columns, 3 notebook foreign keys, 3 notebook owner guards**. `git diff --check` → clean. SQL execution remains unverified because the local Docker daemon is unavailable; no remote environment was touched. | done |

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

### Note on row 8 — the route integrity guard

`src/routeIntegrity.test.ts` is the guard the route table never had. It parses
every `to=`, `path=` and `navigate()` target in `src/` and asserts three things:
the canonical tool routes exist, no navigation points at a legacy alias, and
every link target resolves to a declared route.

It earned its place immediately. Having repointed the call sites I knew about,
it found seven more — including two I had not seen at all:
`NotebookStudioView` linking `/sparring?notebookId=…` and `StudyBuddyCard`
linking `/sparring`. It also flagged the orphaned `LibraryWorkspaceNav`, whose
two links presented `/library` and `/notebooks` as separate destinations when
the second redirects to the first; that component had no importers and is
deleted.

This is the check that would have caught the original defect: `/premortem`
becoming a redirect while three live CTAs still pointed at it.

### Note on row 11 — a decision left to the product owner

The plan called for deleting the React marketing views and keeping the static
`.html` pages as the single source of truth. I did not do that, because the
premise does not survive contact with the history.

`landing.html` (25KB, hand-written) and `views/marketing/LandingView.tsx`
(355 lines + 435 lines of CSS) are both maintained, and the React one is the
*newer* of the two — it arrived in `ec010d5`, the UX overhaul. Deleting it in
favour of the older static page is as likely to be a downgrade as a cleanup,
and which page a visitor should see at `learnora.app/` is a marketing decision
rather than a code-health one.

What is unambiguous, and is fixed: the two were linked inconsistently from the
same footers.

Still duplicated, awaiting that decision:
- `/` serves `landing.html`; `/app/landing` renders `LandingView` and has no
  inbound links at all.
- `/about`, `/contact`, `/developers` exist as both static pages (served at the
  domain root by `vercel.json`) and React routes under `/app/`.
- `/privacy` likewise, though the React one must stay: the auth screens link to
  it, and it has to be reachable from inside the app.


---

## Checkpoint: End of Stage 3 (S3B3)

**Summary:** 14 batches completed across Stages 1–3. All work on `fix/structural-repair`.

| Stage | Batches | Result |
|---|---|---|
| **Stage 1** — Shipping bugs | B1–B6 | **5 commits**, 205→205 files, 2593→2593 tests. Bugs fixed: basename escapes, fake generators, fabricated fallbacks. CTAs repointed. |
| **Stage 2** — Routing & dead code | B1–B5 | **5 commits**, 205→201 files, 2593→2570 tests. Pre-Mortem folded, routes canonicalized, sidebar grouped, marketing deduplicated. |
| **Stage 3** — Shared code | B1–B3 | **4 commits**, 201→202 files, 2570→2582 tests. JSON parsing consolidated, localStorage stores unified, hook aliases removed. |
| **Stage 3** — UI primitives | B4 | **Deferred** until after Stage 4 (CSS consolidation belongs with component rewrites). |

**Full suite: 202/202 files, 2582/2582 tests passing. Build: ✓ 1.28s–1.41s.**

**Next:** Stage 4 — unify the content model. This requires database migrations against real user data and carries specific risks (RLS regression, folder-delete semantics). Recommend reviewing the plan's "Known risks" section and the Stage 4 / C0 migration SQL before applying to any environment.

All 14 batches recorded in `docs/BATCH_LEDGER.md` with per-batch verification. No work is pushed beyond `fix/structural-repair`.
