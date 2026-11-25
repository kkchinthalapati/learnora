-- What the tutor remembers between conversations: which lessons a student
-- has worked on with it, and when.
--
-- The Ask tutor's transcript lives in the browser (lib/chatTranscript.ts), so
-- on another device, or after clearing a browser, the tutor starts from
-- nothing. This keeps the smallest thing that gives it continuity: one row
-- per lesson the student asked the tutor about, with the lesson's title, its
-- subject, how many conversations, and the last time. The tutor is told
-- "earlier you worked on these" and nothing more.
--
-- Deliberately not stored: anything the student typed, anything the tutor
-- replied, or any judgement about the student. What they got wrong already
-- has its own record (the misconception ledger), which they can see.
--
-- The student sees every row in Settings > Privacy and AI, can remove any
-- one or all of them, and can switch remembering off (a synced setting;
-- nothing is written while it is off). Rows go with the lesson when it is
-- deleted, and with the account.
--
-- New table, so nothing existing changes. The client degrades until this is
-- applied: the same rows are kept in the browser instead
-- (webapp/src/api/tutorMemory.ts), which is what the transcript already is.
--
-- Revert: drop table if exists public.tutor_memory;

create table if not exists public.tutor_memory (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  material_id   uuid not null references public.materials(id) on delete cascade,
  lesson_title  text not null check (char_length(lesson_title) between 1 and 200),
  subject       text check (subject is null or char_length(subject) <= 120),
  times         integer not null default 1 check (times between 1 and 100000),
  last_at       timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create unique index if not exists tutor_memory_user_material_idx
  on public.tutor_memory (user_id, material_id);
create index if not exists tutor_memory_user_last_idx
  on public.tutor_memory (user_id, last_at desc);

alter table public.tutor_memory enable row level security;

drop policy if exists "tutor_memory_select_own" on public.tutor_memory;
create policy "tutor_memory_select_own" on public.tutor_memory
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "tutor_memory_insert_own" on public.tutor_memory;
create policy "tutor_memory_insert_own" on public.tutor_memory
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "tutor_memory_update_own" on public.tutor_memory;
create policy "tutor_memory_update_own" on public.tutor_memory
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "tutor_memory_delete_own" on public.tutor_memory;
create policy "tutor_memory_delete_own" on public.tutor_memory
  for delete to authenticated using ((select auth.uid()) = user_id);
