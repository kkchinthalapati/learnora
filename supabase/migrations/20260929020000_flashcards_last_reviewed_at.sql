-- Offline flashcard review: order card reviews by when they happened.
--
-- A review graded with no connection waits in the device's queue and is
-- written when the connection comes back — possibly hours later, and possibly
-- after the same card was reviewed again on another device. Until now the
-- write was unconditional, so whichever arrived last won, not whichever
-- happened last: a stale offline grade could overwrite a newer schedule.
--
-- The client (webapp/src/api/flashcards.ts `updateReview`) now stamps each
-- review with the moment it was graded and writes only
--   where last_reviewed_at is null or last_reviewed_at < <this review's time>
-- so the newest review wins wherever it came from, and replaying a review
-- that already landed (a retry, a double flush) matches no row and changes
-- nothing — the sync is idempotent.
--
-- Nullable with no default and no backfill: every existing card simply has no
-- recorded review yet, which the condition treats as "older than anything".
-- Row access is unchanged — the column sits under flashcards' existing
-- owner-only RLS policies.
--
-- The client degrades to the old unconditional write until this is applied.
--
-- Reverse with:
--   alter table public.flashcards drop column if exists last_reviewed_at;

alter table public.flashcards
  add column if not exists last_reviewed_at timestamptz;

comment on column public.flashcards.last_reviewed_at is
  'When the latest applied review was graded (client time). Reviews older than this are ignored, so offline replays are idempotent and the newest review wins.';
