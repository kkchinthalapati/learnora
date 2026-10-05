-- Onboarding for every student: any country, any exam board, any subject.
--
-- 1. Relax the hard-coded lists. profiles_exam_type_check allowed seven
--    values (ap, ib, a_level, gcse, sat, act, other) and profiles_region_check
--    seven regions, so a student sitting the Abitur, WAEC or the HKDSE could
--    only be "other". Both become shape checks. Every existing row satisfies
--    the new checks (they are supersets), so nothing is rewritten and nothing
--    breaks.
-- 2. Add where the student is and what they sit: country (ISO 3166-1
--    alpha-2), board (free text when theirs isn't listed), age_band, and the
--    study profile the onboarding questions fill in, saved as they answer.
-- 3. subject_outlines: a topic list per subject when there is no seeded
--    syllabus. Starts as an AI draft (verified = false), editable by the
--    student, with equal weights until real ones exist.
--
-- Data minimisation: an age band, never a date of birth. study_profile holds
-- answers about study habits only; nothing in it is sent to an AI provider
-- except the subject, level and board (webapp/src/lib/studyProfile.ts
-- `aiContext`).
--
-- Written, not applied. Ordered after 20261005010000. Idempotent.
--
-- Revert: drop table if exists public.subject_outlines;
--   alter table public.profiles drop column if exists country,
--     drop column if exists board, drop column if exists age_band,
--     drop column if exists study_profile,
--     drop column if exists study_profile_updated_at;
--   Re-adding the old exam_type/region checks fails if any row now holds a
--   value outside the old lists; set those to 'other' / null first.

-- ── 1. Relaxed checks ─────────────────────────────────────────────────────
alter table public.profiles
  drop constraint if exists profiles_exam_type_check;
alter table public.profiles
  add constraint profiles_exam_type_check check (
    exam_type is null or (char_length(exam_type) between 1 and 60)
  );

alter table public.profiles
  drop constraint if exists profiles_region_check;
alter table public.profiles
  add constraint profiles_region_check check (
    region is null or region ~ '^[A-Z]{2}$' or region = 'INTL'
  );

-- ── 2. Profile columns ────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists country text,
  add column if not exists board text,
  add column if not exists age_band text,
  add column if not exists study_profile jsonb,
  add column if not exists study_profile_updated_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_country_check;
alter table public.profiles
  add constraint profiles_country_check check (country is null or country ~ '^[A-Z]{2}$');

alter table public.profiles
  drop constraint if exists profiles_board_check;
alter table public.profiles
  add constraint profiles_board_check check (board is null or char_length(board) between 1 and 80);

alter table public.profiles
  drop constraint if exists profiles_age_band_check;
alter table public.profiles
  add constraint profiles_age_band_check check (
    age_band is null or age_band in ('under13', '13-15', '16-17', '18+')
  );

alter table public.profiles
  drop constraint if exists profiles_study_profile_check;
alter table public.profiles
  add constraint profiles_study_profile_check check (
    study_profile is null
    or (jsonb_typeof(study_profile) = 'object' and pg_column_size(study_profile) <= 65536)
  );

comment on column public.profiles.age_band is
  'under13 | 13-15 | 16-17 | 18+. A band, never a date of birth. Never sent to AI providers.';
comment on column public.profiles.study_profile is
  'Onboarding answers (availability, session length, confidence, goals…), saved as answered. See webapp/src/lib/studyProfile.ts.';

-- ── 3. Draft topic outlines for unseeded subjects ─────────────────────────
create table if not exists public.subject_outlines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  subject     text not null check (char_length(subject) between 1 and 80),
  subject_key text not null check (char_length(subject_key) between 1 and 80),
  level       text check (level is null or char_length(level) <= 60),
  board       text check (board is null or char_length(board) <= 80),
  -- [{ "title": text, "weight": number }], at most 60 topics
  topics      jsonb not null default '[]'::jsonb check (
                jsonb_typeof(topics) = 'array'
                and jsonb_array_length(topics) <= 60
                and pg_column_size(topics) <= 32768
              ),
  source      text not null default 'ai_draft' check (source in ('ai_draft', 'student')),
  -- False until a teacher-checked syllabus replaces it. The UI says so.
  verified    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, subject_key)
);

create index if not exists subject_outlines_user_idx
  on public.subject_outlines (user_id, updated_at desc);

alter table public.subject_outlines enable row level security;

drop policy if exists "subject_outlines_select_own" on public.subject_outlines;
create policy "subject_outlines_select_own" on public.subject_outlines
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "subject_outlines_insert_own" on public.subject_outlines;
create policy "subject_outlines_insert_own" on public.subject_outlines
  for insert to authenticated with check ((select auth.uid()) = user_id and verified = false);

drop policy if exists "subject_outlines_update_own" on public.subject_outlines;
create policy "subject_outlines_update_own" on public.subject_outlines
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and verified = false);

drop policy if exists "subject_outlines_delete_own" on public.subject_outlines;
create policy "subject_outlines_delete_own" on public.subject_outlines
  for delete to authenticated using ((select auth.uid()) = user_id);
