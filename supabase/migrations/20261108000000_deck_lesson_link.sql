-- Link a card set to the lesson it was made from (audit 2026-11-07, F-16).
--
-- Nothing tied a flashcard deck to its lesson, so the lesson page's Cards
-- tab was always empty and a lesson moved to another subject left its cards
-- behind. The study package now sets flashcard_decks.material_id when it
-- makes a deck; the lesson page lists decks by it, and a move refiles them.
--
-- Additive only: a nullable column, an index, and the existing restrictive
-- owner guard extended so a deck can point only at its owner's own lesson.
-- Existing decks keep material_id null (no backfill: nothing records which
-- lesson an old deck came from). Deleting a lesson keeps its decks, as the
-- delete confirmation says ("Card sets made from it stay in your Library").
--
-- Revert:
--   drop policy if exists decks_parent_owner_guard on public.flashcard_decks;
--   (recreate it without the material_id clause, as below minus that clause)
--   drop index if exists public.flashcard_decks_material_id_idx;
--   alter table public.flashcard_decks drop column if exists material_id;

alter table public.flashcard_decks
  add column if not exists material_id uuid
    references public.materials (id) on delete set null;

create index if not exists flashcard_decks_material_id_idx
  on public.flashcard_decks (material_id)
  where material_id is not null;

drop policy if exists decks_parent_owner_guard on public.flashcard_decks;
create policy decks_parent_owner_guard on public.flashcard_decks
  as restrictive
  for all
  to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      folder_id is null
      or exists (
        select 1 from public.folders parent_folder
        where parent_folder.id = flashcard_decks.folder_id
          and parent_folder.user_id = (select auth.uid())
      )
    )
    and (
      notebook_id is null
      or exists (
        select 1 from public.notebooks parent_notebook
        where parent_notebook.id = flashcard_decks.notebook_id
          and parent_notebook.user_id = (select auth.uid())
      )
    )
    and (
      material_id is null
      or exists (
        select 1 from public.materials parent_material
        where parent_material.id = flashcard_decks.material_id
          and parent_material.user_id = (select auth.uid())
      )
    )
  );
