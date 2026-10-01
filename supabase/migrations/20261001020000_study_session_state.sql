-- Study sessions (Explain / Socratic / Practice / Teach / Recall) saved on
-- the server as well as in the browser.
--
-- Sessions lived only in localStorage: a session started at school could
-- not be resumed on a phone ("That session isn't on this device. Sessions
-- are saved in the browser you studied in."), and Today's Resume card only
-- appeared on the original device. The client keeps localStorage as a
-- write-through cache and upserts here (webapp/src/api/studySessionSync.ts).
--
-- Owner-only RLS on every verb, matching every other student table. The
-- record is bounded so a runaway transcript cannot grow a row without
-- limit.
--
-- Revert: drop table if exists public.study_session_state;

create table if not exists public.study_session_state (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null check (id ~ '^[A-Za-z0-9_-]{6,80}$'),
  status     text not null check (status in ('active', 'paused', 'done')),
  record     jsonb not null check (pg_column_size(record) <= 262144),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists study_session_state_user_updated_idx
  on public.study_session_state (user_id, updated_at desc);

alter table public.study_session_state enable row level security;

drop policy if exists "study_session_state_select_own" on public.study_session_state;
create policy "study_session_state_select_own" on public.study_session_state
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "study_session_state_insert_own" on public.study_session_state;
create policy "study_session_state_insert_own" on public.study_session_state
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "study_session_state_update_own" on public.study_session_state;
create policy "study_session_state_update_own" on public.study_session_state
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "study_session_state_delete_own" on public.study_session_state;
create policy "study_session_state_delete_own" on public.study_session_state
  for delete to authenticated using ((select auth.uid()) = user_id);
