-- Give an exam a subject, so a forecast can be about that subject.
--
-- `exams` carried only (exam_name, exam_date, difficulty, status). Everything
-- that needs to know an exam's subject — `matchExamFolder`, and through it
-- both `useExamReadiness` and the Trajectory forecast — had to guess it by
-- substring-matching the exam's *name* against folder names. That works for
-- "Chemistry Paper 1" and fails for "Grade 9 Biology End of Term" against a
-- folder called "Biology"... and, having failed, the forecast silently fell
-- back to every deck in the library, so a Biology exam was projected from
-- maths flashcards.
--
-- The column is nullable and nothing backfills it: existing exams keep working
-- exactly as they do today, falling back to name matching. It is an additional,
-- explicit signal, not a replacement.
--
-- ON DELETE SET NULL rather than CASCADE: deleting a subject folder must not
-- delete the exam. The exam still has a date the student needs.

alter table public.exams
  add column if not exists folder_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.exams'::regclass
      and conname = 'exams_folder_id_fkey'
  ) then
    alter table public.exams
      add constraint exams_folder_id_fkey
      foreign key (folder_id) references public.folders (id)
      on delete set null;
  end if;
end $$;

create index if not exists exams_folder_id_idx on public.exams (folder_id);

-- Same shape as the parent guards on materials/flashcard_decks/quizzes: a
-- restrictive policy so an exam cannot be filed into somebody else's folder.
-- `folder_id is null` stays legal — an exam without a subject is the norm
-- today and remains valid.
--
-- No trigger creates the parent here, so the same-command visibility problem
-- that broke folderless decks (see 20260922000000) cannot arise: the folder
-- always predates the exam.
drop policy if exists "exams_parent_owner_guard" on public.exams;
create policy "exams_parent_owner_guard"
on public.exams as restrictive
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    folder_id is null
    or exists (
      select 1 from public.folders as parent_folder
      where parent_folder.id = exams.folder_id
        and parent_folder.user_id = (select auth.uid())
    )
  )
);

comment on column public.exams.folder_id is
  'Optional subject folder. When set, exam readiness and the Trajectory '
  'forecast scope to it instead of guessing the subject from exam_name.';
