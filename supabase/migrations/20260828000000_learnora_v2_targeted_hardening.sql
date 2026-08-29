-- Support the recurring due-review queries and reject child rows whose
-- parent belongs to another account. Existing owner policies remain in place.

create index if not exists flashcards_user_next_review_date_idx
  on public.flashcards (user_id, next_review_date asc nulls first);

create policy "materials_parent_owner_guard"
on public.materials as restrictive
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    folder_id is null
    or exists (
      select 1
      from public.folders as parent_folder
      where parent_folder.id = materials.folder_id
        and parent_folder.user_id = (select auth.uid())
    )
  )
);

create policy "notes_parent_owner_guard"
on public.notes as restrictive
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    material_id is null
    or exists (
      select 1
      from public.materials as parent_material
      where parent_material.id = notes.material_id
        and parent_material.user_id = (select auth.uid())
    )
  )
);

create policy "decks_parent_owner_guard"
on public.flashcard_decks as restrictive
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    folder_id is null
    or exists (
      select 1
      from public.folders as parent_folder
      where parent_folder.id = flashcard_decks.folder_id
        and parent_folder.user_id = (select auth.uid())
    )
  )
);

create policy "flashcards_parent_owner_guard"
on public.flashcards as restrictive
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    deck_id is null
    or exists (
      select 1
      from public.flashcard_decks as parent_deck
      where parent_deck.id = flashcards.deck_id
        and parent_deck.user_id = (select auth.uid())
    )
  )
);

create policy "quizzes_parent_owner_guard"
on public.quizzes as restrictive
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    folder_id is null
    or exists (
      select 1
      from public.folders as parent_folder
      where parent_folder.id = quizzes.folder_id
        and parent_folder.user_id = (select auth.uid())
    )
  )
  and (
    material_id is null
    or exists (
      select 1
      from public.materials as parent_material
      where parent_material.id = quizzes.material_id
        and parent_material.user_id = (select auth.uid())
    )
  )
);

create policy "quiz_attempts_parent_owner_guard"
on public.quiz_attempts as restrictive
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.quizzes as parent_quiz
    where parent_quiz.id = quiz_attempts.quiz_id
      and parent_quiz.user_id = (select auth.uid())
  )
);

create policy "study_sessions_parent_owner_guard"
on public.study_sessions as restrictive
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    folder_id is null
    or exists (
      select 1
      from public.folders as parent_folder
      where parent_folder.id = study_sessions.folder_id
        and parent_folder.user_id = (select auth.uid())
    )
  )
);
