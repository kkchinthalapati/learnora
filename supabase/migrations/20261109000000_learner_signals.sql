-- supabase/migrations/20261109000000_learner_signals.sql
-- How a student responds to what Learnora writes for them, so the next thing
-- it writes fits them better (webapp/src/lib/learnerSignals.ts):
--   section_result  how a Learn part went (got it first time / relearned /
--                   still to revisit), with the learner style it was taught in
--   reteach_pick    which "explain it another way" they reached for
--   rating          thumbs up or down on a piece of AI output, with a reason
-- Standing preferences and the student's own description of how they learn
-- live on profiles.study_profile, not here. Nothing here is free text from
-- the student: `value` is always one of the client's fixed ids. Owner-only, like
-- learning_events. The client degrades to "no signals" while this table is
-- missing, so applying it is safe at any time.

create table if not exists public.learner_signals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('section_result','reteach_pick','rating')),
  surface     text not null check (surface in ('learn','notes','podcast','chat','quiz','detective','call')),
  style       text check (style is null or char_length(style) <= 32),
  value       text check (value is null or char_length(value) <= 48),
  score       smallint check (score is null or score between -1 and 2),
  topic_key   text check (topic_key is null or char_length(topic_key) <= 160),
  ref         text check (ref is null or char_length(ref) <= 200),
  client_id   text check (client_id is null or char_length(client_id) <= 300),
  created_at  timestamptz not null default now()
);

create unique index if not exists learner_signals_client_id_idx
  on public.learner_signals (user_id, client_id) where client_id is not null;
create index if not exists learner_signals_user_created_idx
  on public.learner_signals (user_id, created_at desc);

alter table public.learner_signals enable row level security;

drop policy if exists "learner_signals_select_own" on public.learner_signals;
create policy "learner_signals_select_own" on public.learner_signals
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "learner_signals_insert_own" on public.learner_signals;
create policy "learner_signals_insert_own" on public.learner_signals
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "learner_signals_delete_own" on public.learner_signals;
create policy "learner_signals_delete_own" on public.learner_signals
  for delete to authenticated using ((select auth.uid()) = user_id);
