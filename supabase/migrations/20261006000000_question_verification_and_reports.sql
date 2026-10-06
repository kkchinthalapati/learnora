-- Question verification and "Report a problem".
--
-- 1. question_bank gains a review status and verification metadata. Only
--    'active' rows are served; a row reported often enough moves to
--    'review' and stops being served until someone looks at it.
-- 2. question_reports: a student reports a question or its explanation —
--    the question's ref, a reason from a short list, an optional note.
--    Nothing personal beyond the user id. Owner-only insert and select;
--    one report per user per question; at most 20 a day per user.
-- 3. question_flags: refs that have been pulled from circulation. Read by
--    the client to skip them; written only by the report trigger.
--    A bank question is pulled after reports from 3 different students; a
--    student's own generated question after their own report (it is theirs
--    alone).
-- 4. question_review_log: rejected-by-the-checker questions in seeded
--    subjects (written by learnora-ai with the service role) and pulled
--    questions, for a human to review with docs/question_review.sql. No
--    student can read or write it.
-- 5. An index for the daily verification caps (ai_request_log rows with
--    mode 'verify').
--
-- Refs: 'bank:<uuid>' for the practice bank, 'quiz:<quiz id>:<question key>'
-- for a saved quiz, 'gen:<question key>' for an unsaved check.
--
-- Revert: drop table if exists public.question_flags, public.question_reports,
--   public.question_review_log;
--   drop function if exists public.limit_question_reports();
--   drop function if exists public.flag_reported_question();
--   drop index if exists public.ai_request_log_verify_created_idx;
--   alter table public.question_bank drop column if exists review_status,
--     drop column if exists human_reviewed, drop column if exists verification,
--     drop column if exists report_count;

-- ── 1. Bank status ────────────────────────────────────────────────────────
alter table public.question_bank
  add column if not exists review_status text not null default 'active',
  add column if not exists human_reviewed boolean not null default false,
  add column if not exists verification jsonb,
  add column if not exists report_count integer not null default 0;

alter table public.question_bank
  drop constraint if exists question_bank_review_status_check;
alter table public.question_bank
  add constraint question_bank_review_status_check
  check (review_status in ('active', 'review', 'retired'));

create index if not exists question_bank_active_idx
  on public.question_bank (spec_key, topic_ref)
  where review_status = 'active';

-- ── 2. Reports ────────────────────────────────────────────────────────────
create table if not exists public.question_reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_ref  text not null check (question_ref ~ '^(bank|quiz|gen):[A-Za-z0-9:_-]{1,160}$'),
  -- The question as the student saw it, so a reviewer can read a generated
  -- question that lives only in one student's quiz.
  question_text text check (question_text is null or char_length(question_text) <= 1500),
  reason        text not null check (reason in
                  ('wrong_answer', 'unclear', 'more_than_one_answer', 'explanation_wrong', 'off_topic', 'inappropriate', 'other')),
  note          text check (note is null or char_length(note) <= 280),
  created_at    timestamptz not null default now(),
  unique (user_id, question_ref)
);

create index if not exists question_reports_ref_idx on public.question_reports (question_ref);
create index if not exists question_reports_user_created_idx on public.question_reports (user_id, created_at desc);

alter table public.question_reports enable row level security;

drop policy if exists "question_reports_insert_own" on public.question_reports;
create policy "question_reports_insert_own" on public.question_reports
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "question_reports_select_own" on public.question_reports;
create policy "question_reports_select_own" on public.question_reports
  for select to authenticated using ((select auth.uid()) = user_id);

revoke update, delete, truncate on public.question_reports from anon, authenticated;

-- ── 3. Flags ──────────────────────────────────────────────────────────────
create table if not exists public.question_flags (
  question_ref text primary key check (question_ref ~ '^(bank|quiz|gen):[A-Za-z0-9:_-]{1,160}$'),
  status       text not null default 'review' check (status in ('review', 'retired')),
  reporters    integer not null default 0,
  flagged_at   timestamptz not null default now()
);

alter table public.question_flags enable row level security;

drop policy if exists "question_flags_read_signed_in" on public.question_flags;
create policy "question_flags_read_signed_in" on public.question_flags
  for select to authenticated using (true);

revoke insert, update, delete, truncate on public.question_flags from anon, authenticated;

-- ── 4. Review log ─────────────────────────────────────────────────────────
create table if not exists public.question_review_log (
  id           uuid primary key default gen_random_uuid(),
  source       text not null check (source in ('verification', 'reports')),
  question_ref text,
  question     jsonb,
  reason       text check (reason is null or char_length(reason) <= 200),
  subject      text check (subject is null or char_length(subject) <= 80),
  spec_id      text check (spec_id is null or char_length(spec_id) <= 80),
  created_at   timestamptz not null default now()
);

create index if not exists question_review_log_created_idx
  on public.question_review_log (created_at desc);

alter table public.question_review_log enable row level security;
revoke all on public.question_review_log from anon, authenticated;

-- ── Triggers ──────────────────────────────────────────────────────────────
-- Rate limit: 20 reports per user per rolling day.
create or replace function public.limit_question_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*) from public.question_reports
    where user_id = new.user_id and created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'question report limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists question_reports_limit on public.question_reports;
create trigger question_reports_limit
  before insert on public.question_reports
  for each row execute function public.limit_question_reports();

-- Pull a question once enough different students report it.
create or replace function public.flag_reported_question()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporters integer;
  threshold integer;
begin
  select count(distinct user_id) into reporters
  from public.question_reports where question_ref = new.question_ref;

  threshold := case when new.question_ref like 'bank:%' then 3 else 1 end;

  if new.question_ref like 'bank:%' then
    update public.question_bank
      set report_count = reporters
      where id::text = substr(new.question_ref, 6);
  end if;

  if reporters >= threshold then
    insert into public.question_flags (question_ref, reporters)
      values (new.question_ref, reporters)
      on conflict (question_ref) do update set reporters = excluded.reporters;

    if new.question_ref like 'bank:%' then
      update public.question_bank
        set review_status = 'review'
        where id::text = substr(new.question_ref, 6) and review_status = 'active';
    end if;

    insert into public.question_review_log (source, question_ref, question, reason)
      values ('reports', new.question_ref,
              jsonb_build_object('text', new.question_text),
              format('%s report(s); latest: %s', reporters, new.reason));
  end if;
  return new;
end;
$$;

drop trigger if exists question_reports_flag on public.question_reports;
create trigger question_reports_flag
  after insert on public.question_reports
  for each row execute function public.flag_reported_question();

revoke all on function public.limit_question_reports() from public, anon, authenticated;
revoke all on function public.flag_reported_question() from public, anon, authenticated;

-- ── 5. Verification caps ──────────────────────────────────────────────────
create index if not exists ai_request_log_verify_created_idx
  on public.ai_request_log (created_at)
  where mode = 'verify';
