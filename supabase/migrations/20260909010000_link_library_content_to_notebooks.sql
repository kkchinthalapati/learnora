-- Stage 4 compatibility bridge: allow the existing Library rows to belong to
-- a notebook without removing their current folder/material relationships.
--
-- All three columns are nullable for a zero-downtime rollout. The application
-- can dual-write them after this migration lands; a later migration can
-- backfill existing rows into explicit notebooks before making the new
-- relationship authoritative.

alter table public.materials
  add column if not exists notebook_id uuid;

alter table public.flashcard_decks
  add column if not exists notebook_id uuid;

alter table public.quizzes
  add column if not exists notebook_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.materials'::regclass
      and conname = 'materials_notebook_id_fkey'
  ) then
    alter table public.materials
      add constraint materials_notebook_id_fkey
      foreign key (notebook_id) references public.notebooks (id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.flashcard_decks'::regclass
      and conname = 'flashcard_decks_notebook_id_fkey'
  ) then
    alter table public.flashcard_decks
      add constraint flashcard_decks_notebook_id_fkey
      foreign key (notebook_id) references public.notebooks (id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quizzes'::regclass
      and conname = 'quizzes_notebook_id_fkey'
  ) then
    alter table public.quizzes
      add constraint quizzes_notebook_id_fkey
      foreign key (notebook_id) references public.notebooks (id)
      on delete cascade;
  end if;
end
$$;

create index if not exists materials_notebook_id_idx
  on public.materials (notebook_id);
create index if not exists flashcard_decks_notebook_id_idx
  on public.flashcard_decks (notebook_id);
create index if not exists quizzes_notebook_id_idx
  on public.quizzes (notebook_id);

-- Replace the three restrictive guards so the new optional parent is checked
-- with the same ownership rule as the existing folder/material parents.
drop policy if exists "materials_parent_owner_guard" on public.materials;
create policy "materials_parent_owner_guard"
on public.materials as restrictive
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    folder_id is null
    or exists (
      select 1 from public.folders as parent_folder
      where parent_folder.id = materials.folder_id
        and parent_folder.user_id = (select auth.uid())
    )
  )
  and (
    notebook_id is null
    or exists (
      select 1 from public.notebooks as parent_notebook
      where parent_notebook.id = materials.notebook_id
        and parent_notebook.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "decks_parent_owner_guard" on public.flashcard_decks;
create policy "decks_parent_owner_guard"
on public.flashcard_decks as restrictive
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    folder_id is null
    or exists (
      select 1 from public.folders as parent_folder
      where parent_folder.id = flashcard_decks.folder_id
        and parent_folder.user_id = (select auth.uid())
    )
  )
  and (
    notebook_id is null
    or exists (
      select 1 from public.notebooks as parent_notebook
      where parent_notebook.id = flashcard_decks.notebook_id
        and parent_notebook.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "quizzes_parent_owner_guard" on public.quizzes;
create policy "quizzes_parent_owner_guard"
on public.quizzes as restrictive
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    folder_id is null
    or exists (
      select 1 from public.folders as parent_folder
      where parent_folder.id = quizzes.folder_id
        and parent_folder.user_id = (select auth.uid())
    )
  )
  and (
    material_id is null
    or exists (
      select 1 from public.materials as parent_material
      where parent_material.id = quizzes.material_id
        and parent_material.user_id = (select auth.uid())
    )
  )
  and (
    notebook_id is null
    or exists (
      select 1 from public.notebooks as parent_notebook
      where parent_notebook.id = quizzes.notebook_id
        and parent_notebook.user_id = (select auth.uid())
    )
  )
);

comment on column public.materials.notebook_id is
  'Optional notebook that owns this source during the Stage 4 transition.';
comment on column public.flashcard_decks.notebook_id is
  'Optional notebook that owns this generated deck.';
comment on column public.quizzes.notebook_id is
  'Optional notebook that owns this generated quiz.';
