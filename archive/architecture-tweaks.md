# Learnora v2 architecture tweaks

Status: checked-in migration, not applied to the linked Supabase project.

## Scope

The v2 interface does not require new tables, renamed columns, or a new data-access layer. One query index and seven parent-ownership guards address concrete patterns in the current application. All React query functions and response shapes stay unchanged.

Migration: `supabase/migrations/20260828000000_learnora_v2_targeted_hardening.sql`

## Due-review index

`flashcardsApi.fetchDueCount()` filters each account's cards by `next_review_date`. `flashcardsApi.fetchAllDue()` applies the same filter, sorts null dates first, and returns the first 50 cards. The existing migration only indexes `user_id` and `deck_id` separately.

The new index matches the owner filter and sort order:

```sql
create index if not exists flashcards_user_next_review_date_idx
  on public.flashcards (user_id, next_review_date asc nulls first);
```

This index supports the due count and ordered due list used by the sidebar badge, Dashboard, and review entry points. The existing `flashcards_user_id_idx` remains until production index statistics show that it is redundant.

## Parent ownership guards

The existing policies limit child rows by their own `user_id`. They do not verify that a submitted parent UUID belongs to the same account. PostgreSQL foreign keys verify that the parent exists, but that check does not replace tenant ownership validation.

The migration adds restrictive policies for these relationships:

| Child column                | Required parent ownership              |
| --------------------------- | -------------------------------------- |
| `materials.folder_id`       | `folders.user_id = auth.uid()`         |
| `notes.material_id`         | `materials.user_id = auth.uid()`       |
| `flashcard_decks.folder_id` | `folders.user_id = auth.uid()`         |
| `flashcards.deck_id`        | `flashcard_decks.user_id = auth.uid()` |
| `quizzes.folder_id`         | `folders.user_id = auth.uid()`         |
| `quizzes.material_id`       | `materials.user_id = auth.uid()`       |
| `quiz_attempts.quiz_id`     | `quizzes.user_id = auth.uid()`         |
| `study_sessions.folder_id`  | `folders.user_id = auth.uid()`         |

Nullable parent fields remain nullable. Inserts and updates that supply a parent UUID must resolve to a parent owned by the signed-in account. Reads and deletes keep the existing owner rule.

The policies are restrictive, so they add checks to the current permissive owner policies instead of replacing them. No client query changes are required.

## Deferred indexes

Four candidate indexes match part or all of current query shapes but are deferred until the linked database can provide row counts and query plans.

| Candidate                                         | Reason for deferral                                                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `exams (user_id, exam_date)`                      | Exams are sorted by date, but per-user volume may be too small for the extra index to matter.                               |
| `materials (user_id, folder_id, created_at desc)` | It helps folder listings but not the global recent-material query because `folder_id` separates the owner and date columns. |
| `notes (user_id, material_id, created_at desc)`   | It helps material-scoped notes but not the global note list.                                                                |
| `quizzes (user_id, created_at desc)`              | It matches the list query. Per-user sorting cost is unverified because the query has no limit.                              |

These are not included in the migration.

## Deferred schema work

The repository does not contain baseline migrations for the original study tables. The timestamped migrations alter those tables but cannot create a fresh database from an empty schema. That is a reproducibility gap, not evidence that the linked database is missing the tables or RLS.

Creating a retrospective baseline during a UI redesign could conflict with the linked schema. Reconcile and capture that baseline as a separate database task.

The profile owner policy also permits account owners to update or delete their profile row directly. Restricting profile columns could interfere with future profile editing, so v2 leaves that policy unchanged for a separate product decision.

## Supabase CLI workflow

Commands below use the CLI version used for this audit.

```bash
npx supabase@2.115.0 migration list --linked
npx supabase@2.115.0 db push --dry-run --linked
npx supabase@2.115.0 db push --linked
npx supabase@2.115.0 db lint --linked --schema public --level warning --fail-on error
```

The dry run should list only `20260828000000_learnora_v2_targeted_hardening.sql`. Apply the migration in a test or preview project before production. The final lint command checks the linked schema after application.

The linked migration history matched local migrations through `20260810000000` during the baseline audit. A later dry-run attempt stopped at database authentication for `cli_login_postgres`, before migration planning. No remote change occurred. Supply the current database password through `SUPABASE_DB_PASSWORD` or relink the project before running the commands above.

## Rollback SQL

Rollback is manual because Supabase migrations move forward. Use only if the new migration must be reverted:

```sql
drop policy if exists "study_sessions_parent_owner_guard" on public.study_sessions;
drop policy if exists "quiz_attempts_parent_owner_guard" on public.quiz_attempts;
drop policy if exists "quizzes_parent_owner_guard" on public.quizzes;
drop policy if exists "flashcards_parent_owner_guard" on public.flashcards;
drop policy if exists "decks_parent_owner_guard" on public.flashcard_decks;
drop policy if exists "notes_parent_owner_guard" on public.notes;
drop policy if exists "materials_parent_owner_guard" on public.materials;
drop index if exists public.flashcards_user_next_review_date_idx;
```

Rollback restores the earlier owner-only checks. It does not change or delete application records.
