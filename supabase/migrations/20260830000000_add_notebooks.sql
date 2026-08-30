-- Notebooks: real persistence for a feature that had none.
--
-- The Notebooks studio shipped with a working grounded AI tutor (three
-- callEdge round-trips) and a working "cheat sheet -> flashcard deck" export
-- that writes to public.flashcard_decks — but its own state lived entirely in
-- localStorage under "learnora_notebooks_v1", seeded with hardcoded NCERT
-- sample content. A student lost every notebook by switching browser, and
-- nothing synced between devices.
--
-- Sources, messages and artifacts are separate tables rather than jsonb
-- columns on notebooks. Sources carry a `selected` flag toggled per grounding
-- query, and chat history grows without bound — holding either as jsonb means
-- rewriting the whole notebook row on every message.
--
-- RLS follows the pattern established in 20260828000000: a permissive owner
-- policy plus a restrictive parent-ownership guard, so a child row cannot
-- reference a notebook belonging to another account.

create table if not exists public.notebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  subject text not null default '',
  color text not null default '#4A90E2',
  description text,
  -- Rich-text HTML from the notes canvas, same as public.notes.content.
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notebook_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  title text not null,
  type text not null default 'note'
    check (type in ('pdf', 'note', 'web', 'textbook', 'syllabus', 'past_paper')),
  content text not null default '',
  url text,
  -- Whether this source is in scope for the next grounded answer.
  selected boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.notebook_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Denormalised on purpose: a citation is a snapshot of the snippet as it was
  -- quoted, and must not change if the source is later edited or deleted.
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notebook_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  type text not null
    check (type in ('feynman', 'cheat_sheet', 'flashcards', 'quiz', 'summary')),
  title text not null,
  content text not null,
  summary text,
  created_at timestamptz not null default now()
);

-- Listing queries: a user's notebooks by recency, and each child set by parent.
create index if not exists notebooks_user_updated_idx
  on public.notebooks (user_id, updated_at desc);
create index if not exists notebook_sources_notebook_idx
  on public.notebook_sources (notebook_id, created_at);
create index if not exists notebook_messages_notebook_idx
  on public.notebook_messages (notebook_id, created_at);
create index if not exists notebook_artifacts_notebook_idx
  on public.notebook_artifacts (notebook_id, created_at desc);

alter table public.notebooks enable row level security;
alter table public.notebook_sources enable row level security;
alter table public.notebook_messages enable row level security;
alter table public.notebook_artifacts enable row level security;

create policy "notebooks_owner" on public.notebooks
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "notebook_sources_owner" on public.notebook_sources
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "notebook_messages_owner" on public.notebook_messages
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "notebook_artifacts_owner" on public.notebook_artifacts
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Restrictive parent guards: owning the child row is not enough, the parent
-- notebook must belong to the same account.
create policy "notebook_sources_parent_owner_guard"
on public.notebook_sources as restrictive
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.notebooks as parent
    where parent.id = notebook_sources.notebook_id
      and parent.user_id = (select auth.uid())
  )
);

create policy "notebook_messages_parent_owner_guard"
on public.notebook_messages as restrictive
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.notebooks as parent
    where parent.id = notebook_messages.notebook_id
      and parent.user_id = (select auth.uid())
  )
);

create policy "notebook_artifacts_parent_owner_guard"
on public.notebook_artifacts as restrictive
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.notebooks as parent
    where parent.id = notebook_artifacts.notebook_id
      and parent.user_id = (select auth.uid())
  )
);

-- updated_at drives the hub's ordering and the "last opened" shelf, so it must
-- not depend on the client remembering to set it.
create or replace function public.touch_notebook_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notebooks_touch_updated_at on public.notebooks;
create trigger notebooks_touch_updated_at
  before update on public.notebooks
  for each row execute function public.touch_notebook_updated_at();
