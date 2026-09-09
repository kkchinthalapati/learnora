-- Keep the compatibility notebook for a subject in sync after the one-time
-- backfill. This closes the gap where a folder created tomorrow would have no
-- notebook owner for its new material.

create or replace function public.sync_folder_contents_notebook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
    new.name,
    new.name,
    new.color,
    'Files, notes and revision resources saved in this subject.',
    new.id,
    'folder_contents'
  )
  on conflict (folder_id) where system_key = 'folder_contents'
  do update set
    title = excluded.title,
    subject = excluded.subject,
    color = excluded.color;

  return new;
end;
$$;

-- Trigger functions do not need to be directly callable from the API.
revoke all on function public.sync_folder_contents_notebook() from public;
revoke all on function public.sync_folder_contents_notebook() from anon;
revoke all on function public.sync_folder_contents_notebook() from authenticated;

drop trigger if exists folders_sync_contents_notebook on public.folders;
create trigger folders_sync_contents_notebook
  after insert or update of name, color on public.folders
  for each row execute function public.sync_folder_contents_notebook();

comment on function public.sync_folder_contents_notebook() is
  'Maintains the internal folder_contents notebook for each subject folder.';
