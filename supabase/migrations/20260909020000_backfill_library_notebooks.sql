-- Stage 4 data backfill: give every legacy Library row an explicit notebook
-- owner without guessing from notebook titles or free-text subject labels.
--
-- `system_key` distinguishes compatibility notebooks from student-created
-- notebooks. Titles are not identifiers: a student may already have named a
-- notebook "Unfiled sources", and that notebook must not silently absorb
-- unrelated rows.

alter table public.notebooks
  add column if not exists system_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notebooks'::regclass
      and conname = 'notebooks_system_key_check'
  ) then
    alter table public.notebooks
      add constraint notebooks_system_key_check
      check (system_key in ('folder_contents', 'unfiled_sources'));
  end if;
end
$$;

-- One compatibility notebook represents the legacy contents of each folder.
-- A separate partial index identifies the one unfiled notebook per account.
create unique index if not exists notebooks_folder_contents_unique_idx
  on public.notebooks (folder_id)
  where system_key = 'folder_contents';

create unique index if not exists notebooks_unfiled_sources_unique_idx
  on public.notebooks (user_id)
  where system_key = 'unfiled_sources';

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
on conflict (folder_id) where system_key = 'folder_contents'
do nothing;

-- Only accounts with genuinely unfiled legacy content need this notebook.
-- UNION removes duplicate user ids without relying on titles or timestamps.
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
  orphan.user_id,
  'Unfiled sources',
  'General Study',
  '#6B7280',
  'Sources and revision resources that were not assigned to a subject.',
  null,
  'unfiled_sources'
from (
  select user_id from public.materials
    where notebook_id is null and folder_id is null
  union
  select user_id from public.flashcard_decks
    where notebook_id is null and folder_id is null
  union
  select user_id from public.quizzes
    where notebook_id is null and folder_id is null
) as orphan
on conflict (user_id) where system_key = 'unfiled_sources'
do nothing;

-- Preserve every ownership decision already made by the dual-writing client.
-- Foldered rows go to their folder's compatibility notebook; only genuinely
-- unfiled rows go to the account's fallback notebook.
update public.materials as material
set notebook_id = notebook.id
from public.notebooks as notebook
where material.notebook_id is null
  and material.user_id = notebook.user_id
  and (
    (
      material.folder_id is not null
      and notebook.system_key = 'folder_contents'
      and notebook.folder_id = material.folder_id
    )
    or (
      material.folder_id is null
      and notebook.system_key = 'unfiled_sources'
    )
  );

update public.flashcard_decks as deck
set notebook_id = notebook.id
from public.notebooks as notebook
where deck.notebook_id is null
  and deck.user_id = notebook.user_id
  and (
    (
      deck.folder_id is not null
      and notebook.system_key = 'folder_contents'
      and notebook.folder_id = deck.folder_id
    )
    or (
      deck.folder_id is null
      and notebook.system_key = 'unfiled_sources'
    )
  );

update public.quizzes as quiz
set notebook_id = notebook.id
from public.notebooks as notebook
where quiz.notebook_id is null
  and quiz.user_id = notebook.user_id
  and (
    (
      quiz.folder_id is not null
      and notebook.system_key = 'folder_contents'
      and notebook.folder_id = quiz.folder_id
    )
    or (
      quiz.folder_id is null
      and notebook.system_key = 'unfiled_sources'
    )
  );

comment on column public.notebooks.system_key is
  'Internal identity for compatibility notebooks; null for student-created notebooks.';
