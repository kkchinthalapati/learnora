-- Photos as study material: a whiteboard, worksheet or textbook page.
--
-- The Create panel (webapp/src/components/create/MaterialPanel.tsx) now
-- accepts a photo, shrinks it in the browser to a JPEG of at most 2048px
-- (webapp/src/lib/studyImage.ts), and stores it in `materials` like any other
-- upload before Gemini reads it into notes. The allowlist set in
-- 20260928000000_storage_limits_and_session_guards.sql has no image types, so
-- that upload would be refused by Storage.
--
-- Only the three types the client produces or passes through are added. SVG
-- stays out on purpose: it is a document that can carry script, not a photo.
-- The 10 MB file_size_limit is unchanged.
--
-- Idempotent: types already present are not added twice, and a bucket with no
-- allowlist at all (null — everything allowed) is left alone.
--
-- To revert:
--   update storage.buckets
--   set allowed_mime_types = array(
--     select t from unnest(allowed_mime_types) as t
--     where t not in ('image/jpeg', 'image/png', 'image/webp')
--   )
--   where id = 'materials';

update storage.buckets as b
set allowed_mime_types = b.allowed_mime_types || array(
  select t
  from unnest(array['image/jpeg', 'image/png', 'image/webp']) as t
  where t <> all (b.allowed_mime_types)
)
where b.id = 'materials'
  and b.allowed_mime_types is not null
  and not (b.allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']);
