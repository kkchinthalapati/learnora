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
| 1 | B1 | Today quick-add drops `due_date` | **VERIFIED** `651cfba` |
| 2 | C1 | Folderless insert 42501 + catch-block reports success | **C1a VERIFIED** `caf1db7` · **C1b migration written, NOT APPLIED** `d24e1f1` |
| 3 | C3 | Feynman `solvedPoints` exact-match; planted misconceptions into ledger | **RETRACTED — mostly not a bug.** See below |
| 4 | C2 | Studio Tools output never surfaced | TODO |
| 5 | B2 | Chat follow-up chips stuck disabled | TODO |
| 6 | B4 | Review recap "weak topics" word salad | TODO |
| 7 | B5 | Feynman left pane shows stale first question | TODO |
| 8 | B3 | AI flashcard grading shows no verdict | TODO |
| 9 | B8 | "Quiz not found" dead end | TODO |
| 10 | B7 | Phantom "Canceled quiz generation" | TODO |
| 11 | C4 | Exam forecast ignores subject | TODO (likely DEFERRED — schema change) |

## C1 — full diagnosis (IMPORTANT: my original report's root cause was wrong)

The QA report said "RLS rejects `folder_id: null`". **That is not the cause.**
Both the old and current policy versions explicitly allow `folder_id is null`,
and I confirmed the *live* policy does too.

The real cause, proven against the live DB:

1. `flashcard_decks` has a BEFORE INSERT trigger
   `decks_assign_notebook_ownership` -> `assign_library_notebook_ownership()`.
2. When `folder_id` is null it creates an `unfiled_sources` notebook and sets
   `new.notebook_id` to it — **inside the same command** as the deck insert.
3. The restrictive policy `decks_parent_owner_guard` then checks
   `EXISTS (select 1 from notebooks where id = new.notebook_id and user_id = auth.uid())`.
   That subquery runs against the command's snapshot and **cannot see a row the
   same command just inserted** -> 42501.

Proof (all run as `role authenticated` with the user's JWT claims, rolled back):

| Scenario | Result |
|---|---|
| A: folderless, user has no `unfiled_sources` notebook | **42501** |
| A': same, but the `unfiled_sources` notebook pre-created in an earlier statement | **SUCCESS** |
| B: first deck in a brand-new folder | SUCCESS |
| C: folder that already has its `folder_contents` notebook | SUCCESS |

And as superuser (RLS bypassed), the row the trigger creates is verified in a
*later* statement to be correct and correctly owned:
`notebook_id=… exists=true system_key=unfiled_sources owner=48d0db12-…`
— i.e. the data is valid; only same-command visibility is the problem.

**Consequence:** a user who has no `unfiled_sources` notebook can never create
a folderless deck, and the only thing that creates that notebook is this same
failing trigger. Live data agrees: my test user has 0 unfiled notebooks, and
both folderless call sites fail for them.

Affected client call sites (both pass `folderId = null`):
- `webapp/src/views/feynman/FeynmanDebriefView.tsx:132`
- `webapp/src/context/ChatProvider.tsx:730`

### Split of the fix
- **C1a (client, safe to do now):** the Feynman handler reports success from its
  catch block; chat's save reports nothing at all. Fix the honesty bug so a
  failed save is visibly a failure.
- **C1b (database):** needs a migration so the parent notebook exists *before*
  the deck insert. **Live production DB — do NOT apply unilaterally.** Author
  the migration, verify in a rolled-back transaction, hand to the user to apply.

## Checkpoint log

### 2026-09-22 — session start
- Full suite green at baseline. No code changed yet.

### C1 — refined diagnosis (supersedes the section above in two ways)

**(a) The chat "Save as deck" is NOT silent — my QA report was wrong.**
It already shows an error toast via `showToast(..., { error: true })`
(`ChatProvider.tsx:745-755`). I originally read the DOM ~6s after clicking and
`TOAST_DEFAULT_DURATION` is 6000ms, so I measured just after it auto-dismissed.
Re-verified live with 700ms polling: the toast is present the whole time.
**No fix made — the code was already correct.** The only real complaint left is
that the toast shows raw Postgres text (logged as U10 below).

**(b) The real cause is same-command visibility, and it hits three tables.**
`folders` has an AFTER INSERT trigger `folders_sync_contents_notebook` that
creates each folder's `folder_contents` notebook, so a foldered row's parent
notebook always exists from an *earlier statement* and is visible to the RLS
check. There is no equivalent owner for the account-level `unfiled_sources`
notebook: it is created lazily by `assign_library_notebook_ownership()`, a
BEFORE INSERT trigger on the row *being checked*. Same command -> invisible to
the command snapshot -> the policy's EXISTS is false -> 42501.

Confirmed all three entities fail identically for a folderless insert:
`flashcard_decks`, `quizzes`, `materials`. So this is not just "save a deck" —
any unfiled note/quiz/deck is impossible for an affected account.

The 20260909020000 backfill only created `unfiled_sources` for accounts that
already had orphaned rows, so most accounts never had one, and the only thing
that would create it is the trigger that cannot. Permanent per account.

**C1b fix authored but DELIBERATELY NOT APPLIED:**
`supabase/migrations/20260922000000_ensure_unfiled_notebook_exists.sql`
- backfills `unfiled_sources` for every row in `public.profiles`
- adds `profiles_ensure_unfiled_notebook` AFTER INSERT trigger for new accounts
- relaxes no policy

Verified in rolled-back transactions against the live project: after the
backfill, folderless inserts give `flashcard_decks SUCCESS`, `quizzes SUCCESS`,
`materials` past the RLS guard (it then only trips a `type` check constraint
from my probe's dummy value). Before it, all three were 42501.

**ACTION REQUIRED BY A HUMAN:** this touches a live production database.
Apply with `supabase db push` (or the dashboard) after review. Nothing in this
session has been applied to production.

## C3 — RETRACTED. My QA report was wrong on both counts.

I re-ran a full Feynman session with `window.fetch` patched to capture the raw
edge-function reply, and taught one turn that fixed both planted misconceptions.

**Claim 1 — "exact string match never fires, counter hard-wired to 0": FALSE.**
The model returned exactly:
```json
"solvedConcepts": ["Main product versus byproduct", "Gas exchange location"]
```
verbatim concept labels, because the prompt already instructs it to
(`aiFeynman.ts` rule 5: "Copy the concept names exactly as written above").
`toKnownConcepts` matched both and the UI showed **`2/2 sorted`, both ✅ Sorted**.
The mechanism works.

**Claim 2 — "planted misconceptions are written into the misconception ledger":
FALSE.** The ledger is the `public.misconceptions` table. Queried directly for
my account: it holds `origin_tool` values `quiz` and `sparring` only — **zero
feynman rows**. `FeynmanDebriefView` never calls `useRecordMisconceptions`.
What I mistook for a ledger entry was the `CognitiveCrossLinkBar` at the top of
the debrief — an in-page "take this to another tool" widget reading the current
session, which looks like the solver's "Past mistakes" card.

**What is actually true:** in my original session the model did *not* echo the
labels (it put the credit in prose in `whatMadeSense` and left `solvedConcepts`
unusable), so credit was silently dropped and the debrief then listed all three
as still shaky. That is model-compliance brittleness with no fallback and no
signal — real, but **observed once and not reproducible**, and severity is far
below "critical".

**No code change made.** Fixing matching on one unreproducible observation would
be exactly the speculative change this task forbids. Logged for a future session
with the evidence above.

### B1 — VERIFIED, committed `651cfba`
- Added a failing `dueOnly` test, confirmed red (`due_date: null`), fixed the
  spread in `DashboardTasksWidget.tsx`, test green.
- `npx vitest run src/views/tasks/` -> 2 files / 40 tests pass.
- Re-verified in the live browser: task appears under "Due today" immediately.
