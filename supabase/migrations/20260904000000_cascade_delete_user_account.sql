-- Make account deletion actually possible.
--
-- Every table holding user data references auth.users, but two of them --
-- public.tasks and public.exams -- were created with the default ON DELETE
-- NO ACTION rather than ON DELETE CASCADE. Every other user-owned table
-- (folders, materials, notes, flashcards, flashcard_decks, quizzes,
-- quiz_attempts, study_sessions, weekly_plans, notebooks and its three child
-- tables, profiles, push_subscriptions, push_notification_log, friendships,
-- ai_request_log) already cascades.
--
-- The consequence is worse than an orphaned row. NO ACTION does not leave
-- data behind -- it makes the parent delete FAIL. `auth.admin.deleteUser()`
-- raises a foreign-key violation for any account that has ever created a
-- single task or exam, which is every real account. So "delete my account"
-- could not have succeeded for a real user, and this is a legal obligation
-- (UK GDPR Art. 17 / GDPR Art. 17, right to erasure), not a nice-to-have.
--
-- Dropping and recreating is the only way to change a foreign key's delete
-- action in Postgres; there is no ALTER CONSTRAINT for it. The constraint
-- names are the Postgres defaults (<table>_<column>_fkey), confirmed against
-- the live schema before this was written.
--
-- Rewriting the constraint takes a brief ACCESS EXCLUSIVE lock on the child
-- table and requires a scan to validate. Both tables are small (per-user
-- study data), so this is a fast operation -- but it is a lock, so apply it
-- outside peak hours if that ever stops being true.

alter table public.tasks
  drop constraint if exists tasks_user_id_fkey;

alter table public.tasks
  add constraint tasks_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.exams
  drop constraint if exists exams_user_id_fkey;

alter table public.exams
  add constraint exams_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;
