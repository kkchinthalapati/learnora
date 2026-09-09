-- Stage 4 compatibility foundation: let a notebook use the same subject scope
-- as materials, flashcard decks and quizzes.
--
-- Existing notebooks deliberately remain unfiled. `notebooks.subject` is free
-- text, so matching it to `folders.name` would silently put some students'
-- work under the wrong subject. A later, explicit backfill can create the
-- required per-user fallback scope without guessing.

alter table public.notebooks
  add column if not exists folder_id uuid;

-- PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS. Keep the migration safe to
-- replay in local/dev environments by checking the catalogue first.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notebooks'::regclass
      and conname = 'notebooks_folder_id_fkey'
  ) then
    alter table public.notebooks
      add constraint notebooks_folder_id_fkey
      foreign key (folder_id)
      references public.folders (id)
      on delete cascade;
  end if;
end
$$;

create index if not exists notebooks_folder_id_idx
  on public.notebooks (folder_id);

-- The owner policy on notebooks prevents cross-account rows, but without a
-- parent guard an authenticated user could still point their own notebook at
-- another user's folder id. Match the restrictive guard used by materials,
-- decks and quizzes. NULL remains valid for notebooks not filed yet.
drop policy if exists "notebooks_folder_owner_guard" on public.notebooks;
create policy "notebooks_folder_owner_guard"
on public.notebooks as restrictive
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    folder_id is null
    or exists (
      select 1
      from public.folders as parent_folder
      where parent_folder.id = notebooks.folder_id
        and parent_folder.user_id = (select auth.uid())
    )
  )
);

comment on column public.notebooks.folder_id is
  'Optional subject scope shared with materials, decks and quizzes.';
