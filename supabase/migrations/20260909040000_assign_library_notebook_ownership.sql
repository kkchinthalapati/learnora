-- Make notebook ownership an invariant for every new Library row, including
-- callers that have not yet been migrated to pass notebook_id explicitly.
-- Explicit student-notebook ownership always wins; only a null notebook_id is
-- assigned to the folder compatibility notebook or the user's unfiled one.

create or replace function public.assign_library_notebook_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.notebook_id is not null then
    return new;
  end if;

  if new.folder_id is not null then
    insert into public.notebooks (
      user_id,
      title,
      subject,
      color,
      description,
      folder_id,
      system_key
    )
    select
      folder.user_id,
      folder.name,
      folder.name,
      folder.color,
      'Files, notes and revision resources saved in this subject.',
      folder.id,
      'folder_contents'
    from public.folders as folder
    where folder.id = new.folder_id
      and folder.user_id = new.user_id
    on conflict (folder_id) where system_key = 'folder_contents'
    do update set
      title = excluded.title,
      subject = excluded.subject,
      color = excluded.color
    returning id into new.notebook_id;
  else
    insert into public.notebooks (
      user_id,
      title,
      subject,
      color,
      description,
      folder_id,
      system_key
    )
    values (
      new.user_id,
      'Unfiled sources',
      'General Study',
      '#6B7280',
      'Sources and revision resources that were not assigned to a subject.',
      null,
      'unfiled_sources'
    )
    on conflict (user_id) where system_key = 'unfiled_sources'
    do update set user_id = excluded.user_id
    returning id into new.notebook_id;
  end if;

  return new;
end;
$$;

-- Trigger functions are invoked by PostgreSQL, not directly through the API.
revoke all on function public.assign_library_notebook_ownership() from public;
revoke all on function public.assign_library_notebook_ownership() from anon;
revoke all on function public.assign_library_notebook_ownership() from authenticated;

drop trigger if exists materials_assign_notebook_ownership on public.materials;
create trigger materials_assign_notebook_ownership
before insert on public.materials
for each row execute function public.assign_library_notebook_ownership();

drop trigger if exists decks_assign_notebook_ownership on public.flashcard_decks;
create trigger decks_assign_notebook_ownership
before insert on public.flashcard_decks
for each row execute function public.assign_library_notebook_ownership();

drop trigger if exists quizzes_assign_notebook_ownership on public.quizzes;
create trigger quizzes_assign_notebook_ownership
before insert on public.quizzes
for each row execute function public.assign_library_notebook_ownership();

-- The preceding backfill assigned every existing row, and these triggers
-- assign every future insert. Make the relationship authoritative now that
-- both sides of that transition are covered.
alter table public.materials
  alter column notebook_id set not null;
alter table public.flashcard_decks
  alter column notebook_id set not null;
alter table public.quizzes
  alter column notebook_id set not null;
