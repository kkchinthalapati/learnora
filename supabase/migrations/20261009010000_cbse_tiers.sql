-- CBSE tiers: Standard and Basic.
--
-- The syllabus catalogue now carries CBSE Classes 9 and 10 Science and
-- Mathematics (webapp/src/lib/syllabus/cbse.ts). Class 10 Mathematics is
-- examined at Standard (041) and Basic (241); a CBSE subject with one paper
-- for everyone uses the single tier 'Standard'. exams.syllabus_tier and
-- question_bank.tier only allowed the GCSE and IB tiers, so an exam on a
-- CBSE spec could not be saved with its tier.
--
-- Widening a check constraint: no existing row can violate the new one.
--
-- Revert: (only once no row uses the new values)
--   alter table public.exams drop constraint if exists exams_syllabus_tier_check;
--   alter table public.exams add constraint exams_syllabus_tier_check
--     check (syllabus_tier is null or syllabus_tier in ('Foundation', 'Higher', 'SL', 'HL'));
--   (and the same for question_bank_tier_check)

alter table public.exams
  drop constraint if exists exams_syllabus_tier_check;
alter table public.exams
  add constraint exams_syllabus_tier_check
  check (syllabus_tier is null
         or syllabus_tier in ('Foundation', 'Higher', 'SL', 'HL', 'Standard', 'Basic'));

alter table public.question_bank
  drop constraint if exists question_bank_tier_check;
alter table public.question_bank
  add constraint question_bank_tier_check
  check (tier is null or tier in ('Foundation', 'Higher', 'SL', 'HL', 'Standard', 'Basic'));
