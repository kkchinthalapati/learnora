-- Which exam specification an exam is, and at which tier.
--
-- An exam was a name and a date, so "GCSE Biology" told the app nothing about
-- what is examined: every quiz, explanation and plan block was generic. The
-- exam-board ledger (webapp/src/lib/syllabus/) knows the specifications'
-- papers and topics; an exam now points at one by id, e.g.
-- syllabus_id = 'aqa-gcse-biology-8461', syllabus_tier = 'Higher'.
--
-- The catalogue ships with the webapp rather than as a table: it is reference
-- data, identical for every student and versioned with the code that reads
-- it. So syllabus_id is checked for shape only, not against a foreign key;
-- the client treats an id it does not know as no spec at all.
--
-- Additive and nullable. Existing exams keep working with no spec. Row access
-- is unchanged: the columns sit under exams' existing owner-only RLS.
--
-- The client degrades until this is applied: a save that names a spec is
-- retried without it (webapp/src/api/exams.ts).
--
-- Revert: alter table public.exams
--   drop column if exists syllabus_id, drop column if exists syllabus_tier;

alter table public.exams
  add column if not exists syllabus_id text
    check (syllabus_id is null or syllabus_id ~ '^[a-z0-9-]{3,60}$'),
  add column if not exists syllabus_tier text
    check (syllabus_tier is null or syllabus_tier in ('Foundation', 'Higher', 'SL', 'HL'));
