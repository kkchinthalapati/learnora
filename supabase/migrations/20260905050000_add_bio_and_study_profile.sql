-- Bio and study configuration on profiles.
--
-- Two settings-audit items that were skipped in the privacy-tab PR because
-- they needed decisions, not because they were hard to build. Both are
-- resolved here:
--
-- `bio` — friends-only, 280 characters (long enough to say something, short
-- enough that nobody mistakes it for a notes field). It is never read by the
-- leaderboard RPC or any query a non-friend can reach; the friends list is
-- the only surface that will render it.
--
-- `subject`, `exam_type`, `target_grade`, `study_pace` — free text for
-- subject and target_grade (a syllabus's grading scale is not something this
-- schema should hardcode: IB uses 1-7, most US schools use letters, GCSE
-- uses 9-1), a checked enum for exam_type and study_pace, where the set of
-- reasonable values actually is closed. `study_pace` is read by
-- `loadAdaptiveContext` (webapp/src/api/aiPlan.ts) as prompt guidance for
-- the weekly planner; `exam_type` and `subject` ride along in the same
-- STUDENT CONTEXT block so the planner and chat surfaces know what they're
-- planning for. None of the four are backfilled — existing accounts simply
-- have nulls, which the UI renders as unset and the planner treats as "no
-- guidance given" rather than a wrong guess.

alter table public.profiles
  add column if not exists bio text,
  add column if not exists subject text,
  add column if not exists exam_type text,
  add column if not exists target_grade text,
  add column if not exists study_pace text;

alter table public.profiles
  drop constraint if exists profiles_bio_length_check;
alter table public.profiles
  add constraint profiles_bio_length_check check (char_length(bio) <= 280);

alter table public.profiles
  drop constraint if exists profiles_exam_type_check;
alter table public.profiles
  add constraint profiles_exam_type_check check (
    exam_type is null or exam_type in (
      'ap', 'ib', 'a_level', 'gcse', 'sat', 'act', 'other'
    )
  );

alter table public.profiles
  drop constraint if exists profiles_study_pace_check;
alter table public.profiles
  add constraint profiles_study_pace_check check (
    study_pace is null or study_pace in ('light', 'balanced', 'intensive')
  );

comment on column public.profiles.bio is
  'Free-text, friends-only. Never selected by get_friends_leaderboard or any RPC a non-friend can call.';
comment on column public.profiles.study_pace is
  'light | balanced | intensive. Read by loadAdaptiveContext as planner time-budget guidance.';
