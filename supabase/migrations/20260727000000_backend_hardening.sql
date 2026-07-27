-- Backend hardening pass, driven by `supabase db advisors --linked`.
-- Purely additive/internal: no column removed, no behavior visible to the
-- app changes — same rows, same access rules, just indexed and evaluated
-- more cheaply, plus a couple of integrity/exposure gaps closed.

-- =========================================================================
-- 1. Missing indexes on foreign-key columns.
--    Every list/fetch query in js/api.js filters by user_id (RLS adds the
--    same filter again under the hood), and folder/deck/material detail
--    views filter by the parent id — none of that was indexed beyond the
--    primary key, so it's been full-table-scanning since day one.
-- =========================================================================
create index if not exists exams_user_id_idx on public.exams (user_id);
create index if not exists folders_user_id_idx on public.folders (user_id);
create index if not exists materials_user_id_idx on public.materials (user_id);
create index if not exists materials_folder_id_idx on public.materials (folder_id);
create index if not exists notes_user_id_idx on public.notes (user_id);
create index if not exists notes_material_id_idx on public.notes (material_id);
create index if not exists flashcard_decks_user_id_idx on public.flashcard_decks (user_id);
create index if not exists flashcard_decks_folder_id_idx on public.flashcard_decks (folder_id);
create index if not exists flashcards_user_id_idx on public.flashcards (user_id);
create index if not exists flashcards_deck_id_idx on public.flashcards (deck_id);
create index if not exists quizzes_user_id_idx on public.quizzes (user_id);
create index if not exists quizzes_folder_id_idx on public.quizzes (folder_id);
create index if not exists quizzes_material_id_idx on public.quizzes (material_id);
create index if not exists quiz_attempts_quiz_id_idx on public.quiz_attempts (quiz_id);
create index if not exists study_sessions_folder_id_idx on public.study_sessions (folder_id);
create index if not exists tasks_user_id_idx on public.tasks (user_id);

-- =========================================================================
-- 2. RLS policies re-evaluating auth.uid() per row instead of once per
--    statement. Same access rules, cheaper query plan at scale.
--    (select auth.uid()) lets Postgres treat it as a stable subquery the
--    planner can evaluate once instead of once per row.
-- =========================================================================
alter policy "Select own exams" on public.exams using ((select auth.uid()) = user_id);
alter policy "Insert own exams" on public.exams with check ((select auth.uid()) = user_id);
alter policy "Update own exams" on public.exams using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Delete own exams" on public.exams using ((select auth.uid()) = user_id);

alter policy "Select own tasks" on public.tasks using ((select auth.uid()) = user_id);
alter policy "Insert own tasks" on public.tasks with check ((select auth.uid()) = user_id);
alter policy "Update own tasks" on public.tasks using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Delete own tasks" on public.tasks using ((select auth.uid()) = user_id);

alter policy "Users can manage own profile" on public.profiles using ((select auth.uid()) = id);
alter policy "Users can manage their own folders" on public.folders using ((select auth.uid()) = user_id);
alter policy "Users can manage their own materials" on public.materials using ((select auth.uid()) = user_id);
alter policy "Users can manage their own notes" on public.notes using ((select auth.uid()) = user_id);
alter policy "Users can manage their own decks" on public.flashcard_decks using ((select auth.uid()) = user_id);
alter policy "Users can manage their own flashcards" on public.flashcards using ((select auth.uid()) = user_id);

alter policy "quizzes_select_own" on public.quizzes using ((select auth.uid()) = user_id);
alter policy "quizzes_insert_own" on public.quizzes with check ((select auth.uid()) = user_id);
alter policy "quizzes_delete_own" on public.quizzes using ((select auth.uid()) = user_id);

alter policy "quiz_attempts_select_own" on public.quiz_attempts using ((select auth.uid()) = user_id);
alter policy "quiz_attempts_insert_own" on public.quiz_attempts with check ((select auth.uid()) = user_id);
alter policy "quiz_attempts_delete_own" on public.quiz_attempts using ((select auth.uid()) = user_id);

alter policy "study_sessions_select_own" on public.study_sessions using ((select auth.uid()) = user_id);
alter policy "study_sessions_insert_own" on public.study_sessions with check ((select auth.uid()) = user_id);
alter policy "study_sessions_delete_own" on public.study_sessions using ((select auth.uid()) = user_id);

alter policy "weekly_plans_select_own" on public.weekly_plans using ((select auth.uid()) = user_id);
alter policy "weekly_plans_upsert_own" on public.weekly_plans with check ((select auth.uid()) = user_id);
alter policy "weekly_plans_update_own" on public.weekly_plans using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "weekly_plans_delete_own" on public.weekly_plans using ((select auth.uid()) = user_id);

-- =========================================================================
-- 3. handle_new_user() is a dead-stub auth trigger (its real body is
--    commented out in supabase_auth_trigger.sql) but is still marked
--    SECURITY DEFINER and publicly callable via
--    /rest/v1/rpc/handle_new_user by anon and authenticated. The trigger
--    itself doesn't need EXECUTE granted to those roles to keep firing on
--    signup — only the exposed RPC path does, so this only removes an
--    unused, unauthenticated entry point.
-- =========================================================================
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- =========================================================================
-- 4. user_id was never NOT NULL on these five tables (unlike every other
--    table added since). RLS reads it as `auth.uid() = user_id`, which is
--    NULL (never true) for a NULL user_id — such a row would be invisible
--    to every user, including its creator, forever. Nothing in the app
--    ever inserts without a user_id, and a live check found zero existing
--    NULL rows, so this only forecloses a class of unreachable rows, not a
--    live constraint violation.
-- =========================================================================
alter table public.folders alter column user_id set not null;
alter table public.materials alter column user_id set not null;
alter table public.notes alter column user_id set not null;
alter table public.flashcard_decks alter column user_id set not null;
alter table public.flashcards alter column user_id set not null;
