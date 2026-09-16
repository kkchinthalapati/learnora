-- supabase/migrations/20260916030000_learning_events.sql
-- One account-scoped evidence stream for everything that tells the trajectory
-- model what a student knows: timed study, quick checks, Feynman, Viva,
-- Solver and Detective outcomes. Replaces the per-tool localStorage silos for
-- outcomes so the forecast is the same on every device.

create table if not exists public.learning_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  topic_key    text not null,
  deck_id      uuid references public.flashcard_decks(id) on delete set null,
  folder_id    uuid references public.folders(id) on delete set null,
  source       text not null check (source in ('timer','quick_check','feynman','viva','solver','detective')),
  score        real check (score is null or (score >= 0 and score <= 1)),
  minutes      int  not null default 0 check (minutes >= 0),
  occurred_at  timestamptz not null default now(),
  payload      jsonb not null default '{}'::jsonb,
  client_id    text
);

create unique index if not exists learning_events_client_id_idx
  on public.learning_events (user_id, client_id) where client_id is not null;
create index if not exists learning_events_user_occurred_idx
  on public.learning_events (user_id, occurred_at desc);

alter table public.learning_events enable row level security;

drop policy if exists "learning_events_select_own" on public.learning_events;
create policy "learning_events_select_own" on public.learning_events
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "learning_events_insert_own" on public.learning_events;
create policy "learning_events_insert_own" on public.learning_events
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "learning_events_delete_own" on public.learning_events;
create policy "learning_events_delete_own" on public.learning_events
  for delete to authenticated using ((select auth.uid()) = user_id);
