-- Images on flashcards.
--
-- Cards were text-only, which rules out most of what flashcards are actually
-- good for outside vocabulary: anatomy, diagrams, chemical structures, map
-- work, anything where the prompt *is* the picture.
--
-- Two columns rather than one plus a side flag: an image can belong to the
-- prompt ("what is this structure?") or to the answer (the diagram that
-- explains it), and often a card wants one on each. A single column would
-- have needed a discriminator that means the same thing with more ways to be
-- wrong.
--
-- Paths point into the private `card-media` bucket created below; they are
-- storage keys, not URLs, and are read back through short-lived signed URLs
-- the same way `materials.storage_path` is.

alter table public.flashcards
  add column if not exists front_image_path text,
  add column if not exists back_image_path text;

comment on column public.flashcards.front_image_path is
  'Storage key in the card-media bucket for the image shown with the prompt.';
comment on column public.flashcards.back_image_path is
  'Storage key in the card-media bucket for the image shown with the answer.';

-- Private bucket. Unlike `materials`, which predates the migration history and
-- was created by hand in the dashboard, this one is declared here so a fresh
-- environment comes up able to store card images without a manual step.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'card-media',
  'card-media',
  false,
  5242880, -- 5 MB; a flashcard image that needs more than this wants cropping
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Every object is filed under the owner's user id, and the policies below are
-- what make that prefix load-bearing rather than a convention: a student can
-- only reach objects whose first path segment is their own id.
drop policy if exists "card_media_read_own" on storage.objects;
create policy "card_media_read_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'card-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "card_media_insert_own" on storage.objects;
create policy "card_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'card-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "card_media_update_own" on storage.objects;
create policy "card_media_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'card-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "card_media_delete_own" on storage.objects;
create policy "card_media_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'card-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
