-- A lesson's place in its subject.
--
-- Lessons (materials) had no order: every list sorted them by when they were
-- added. A subject is a course, and a course has a sequence, so a subject's
-- page now shows its lessons as a path with the next one marked, and the
-- student can move a lesson up or down. `position` is that place, counted
-- from 0 within the subject (folder).
--
-- Null means "never placed": those lessons follow the placed ones in the
-- order they were added, which is how every existing lesson reads until the
-- student moves something. Nothing is backfilled, so applying this changes no
-- existing row and no screen.
--
-- Additive and nullable. Row access is unchanged: the column sits under
-- materials' existing owner-only policy ("Users can manage their own
-- materials"), so a student can order only their own lessons.
--
-- The client degrades until this is applied: reading uses select(*) and
-- treats a missing position as null, and the first failed write hides the
-- move buttons (webapp/src/api/materials.ts setOrder).
--
-- Revert: alter table public.materials drop column if exists position;

alter table public.materials
  add column if not exists position integer
    check (position is null or position >= 0);
