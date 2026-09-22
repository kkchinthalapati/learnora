-- Folderless materials, decks and quizzes could not be created at all.
--
-- The three restrictive policies added in 20260909010000
-- (materials_parent_owner_guard, decks_parent_owner_guard,
-- quizzes_parent_owner_guard) each require that, when notebook_id is set, a
-- notebook with that id and the same owner is visible:
--
--   notebook_id is null or exists (
--     select 1 from public.notebooks parent_notebook
--     where parent_notebook.id = <table>.notebook_id
--       and parent_notebook.user_id = (select auth.uid()))
--
-- assign_library_notebook_ownership() (20260909040000) is a BEFORE INSERT
-- trigger that populates notebook_id. For a *foldered* row it resolves the
-- folder's 'folder_contents' notebook, which always already exists because
-- folders_sync_contents_notebook (20260909030000) creates it in an AFTER
-- INSERT on folders — i.e. in an earlier statement. The row is therefore
-- visible and the check passes.
--
-- For a *folderless* row there is no such owner. The account-level
-- 'unfiled_sources' notebook is created lazily by the BEFORE trigger itself,
-- inside the very same command as the row being checked. A row inserted by
-- the current command is not visible to that command's snapshot, so the
-- policy's EXISTS returns false and the insert is refused with 42501 —
-- even though the notebook was created correctly and with the right owner.
--
-- Verified against the project before writing this (all as role
-- `authenticated`, in rolled-back transactions):
--
--   folderless insert, no 'unfiled_sources' notebook   -> 42501
--   same insert, notebook pre-created in an earlier    -> SUCCESS
--     statement
--   first deck in a brand-new folder                   -> SUCCESS
--     (its notebook came from the folders AFTER trigger)
--
-- and all three of flashcard_decks, quizzes and materials fail identically.
--
-- The 20260909020000 backfill only created 'unfiled_sources' for accounts
-- that already had orphaned rows at that moment, so nearly every account has
-- never had one — and the only code that would create it is the trigger that
-- cannot. The failure is therefore permanent per account, not transient.
--
-- Fix: give 'unfiled_sources' the same guarantee 'folder_contents' has, by
-- making it exist ahead of the insert rather than during it. Nothing here
-- relaxes a policy; the ownership checks are untouched.

-- 1. Backfill every existing account, not just the ones with orphaned rows.
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
  profile.id,
  'Unfiled sources',
  'General Study',
  '#6B7280',
  'Sources and revision resources that were not assigned to a subject.',
  null,
  'unfiled_sources'
from public.profiles as profile
on conflict (user_id) where system_key = 'unfiled_sources'
do nothing;

-- 2. Keep it true for accounts created from here on. Mirrors
--    folders_sync_contents_notebook: an AFTER INSERT on the parent, so the
--    notebook is committed by an earlier statement than any library row the
--    account goes on to create.
--
--    SECURITY DEFINER because the profile row is inserted by
--    sync_profile_from_auth_user, which runs from an auth.users trigger
--    where auth.uid() is not the new account — the notebooks RLS policy
--    would otherwise reject this insert.
create or replace function public.ensure_unfiled_notebook()
returns trigger
language plpgsql
security definer
set search_path = public
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
    new.id,
    'Unfiled sources',
    'General Study',
    '#6B7280',
    'Sources and revision resources that were not assigned to a subject.',
    null,
    'unfiled_sources'
  )
  on conflict (user_id) where system_key = 'unfiled_sources'
  do nothing;

  return new;
end;
$$;

drop trigger if exists profiles_ensure_unfiled_notebook on public.profiles;
create trigger profiles_ensure_unfiled_notebook
after insert on public.profiles
for each row
execute function public.ensure_unfiled_notebook();

comment on function public.ensure_unfiled_notebook() is
  'Creates the account-level "Unfiled sources" notebook up front, so that '
  'assign_library_notebook_ownership() resolves an already-visible notebook '
  'instead of creating one in the same command as the row whose RLS check '
  'then has to see it.';
