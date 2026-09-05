-- Avatar upload.
--
-- `profiles.avatar_url` has existed since the friends feature — it is
-- populated for anyone who signs in through an OAuth provider that supplies
-- a picture (Google, etc.) — but nothing let an email/password student set
-- one, and `AccountTab` never rendered it either way; every avatar in the
-- app, including this one, was initials-only.
--
-- Public bucket, unlike `card-media`: avatar_url is already stored and read
-- everywhere as a plain URL (auth metadata, the leaderboard RPC, the study
-- room presence payload) with no signed-URL refresh path, and it is shown on
-- boards other people load without the owner present to authorize a signed
-- fetch. A student's own display picture is not sensitive the way a card's
-- private study material is, so public-read matches what the column already
-- assumed.
--
-- One object per user: upload always writes to `<user_id>/avatar`, so a
-- re-upload overwrites in place instead of accumulating orphaned files that
-- would need separate cleanup.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MB; client-side downscale keeps a real photo well under this
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "avatars_read_public" on storage.objects;
create policy "avatars_read_public"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "avatars_write_own" on storage.objects;
create policy "avatars_write_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
