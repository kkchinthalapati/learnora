-- Images generated in the chat ("Generate image").
--
-- The learnora-ai edge function (mode "image") generates a diagram, stores it
-- here under the student's own user id, and returns only the storage key. The
-- chat transcript keeps that key, never the image bytes or a URL, and the app
-- reads it back through a short-lived signed URL — the same shape as
-- `card-media` (20260905010000_add_flashcard_images.sql).
--
-- The upload is made with the student's own JWT, not the service role, so the
-- insert policy below is what decides where it may land.
--
-- Private bucket. 5 MB is well above a 1024px PNG from any provider in the
-- image chain; SVG is excluded because it is a document that can carry script.
--
-- Idempotent: the bucket insert is skipped if it exists, and each policy is
-- dropped before it is created.
--
-- To revert (objects must be removed first; Storage refuses to drop a
-- non-empty bucket):
--   drop policy if exists "chat_media_read_own" on storage.objects;
--   drop policy if exists "chat_media_insert_own" on storage.objects;
--   drop policy if exists "chat_media_delete_own" on storage.objects;
--   delete from storage.buckets where id = 'chat-media';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Every object is filed under the owner's user id; these policies make that
-- prefix load-bearing. No update policy: a generated image is never
-- overwritten, only written once and (on account deletion) removed.
drop policy if exists "chat_media_read_own" on storage.objects;
create policy "chat_media_read_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "chat_media_insert_own" on storage.objects;
create policy "chat_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "chat_media_delete_own" on storage.objects;
create policy "chat_media_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
