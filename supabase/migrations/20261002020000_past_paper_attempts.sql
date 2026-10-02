-- Past papers a student has sat, and what they scored.
--
-- Learnora cannot host exam-board past papers: AQA, OCR, Pearson and the IB
-- reserve them (docs/QUESTION_SOURCES.md). It can send the student to the
-- board's own past-paper page and record the result when they come back.
-- A full paper sat under timed conditions is the best evidence of exam
-- readiness there is, far better than the app's own quizzes, so the exam
-- page shows it beside the quiz forecast.
--
-- Self-reported, self-marked against the board's mark scheme. Nothing here
-- reproduces a paper: only its name, series and the marks.
--
-- Owner-only RLS on every verb. An attempt may only be filed against one of
-- the student's own exams.
--
-- Revert: drop table if exists public.past_paper_attempts;

create table if not exists public.past_paper_attempts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exam_id    bigint not null references public.exams (id) on delete cascade,
  paper      text not null check (char_length(btrim(paper)) between 1 and 80),
  series     text check (series is null or char_length(series) <= 40),
  marks      numeric(6, 1) not null check (marks >= 0),
  max_marks  numeric(6, 1) not null check (max_marks > 0 and max_marks <= 1000),
  sat_on     date not null default current_date,
  notes      text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  check (marks <= max_marks)
);

create index if not exists past_paper_attempts_user_exam_idx
  on public.past_paper_attempts (user_id, exam_id, sat_on desc);

alter table public.past_paper_attempts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'past_paper_attempts' and policyname = 'past_paper_attempts_select_own') then
    create policy "past_paper_attempts_select_own" on public.past_paper_attempts
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'past_paper_attempts' and policyname = 'past_paper_attempts_insert_own') then
    create policy "past_paper_attempts_insert_own" on public.past_paper_attempts
      for insert to authenticated with check (
        (select auth.uid()) = user_id
        and exists (select 1 from public.exams e where e.id = exam_id and e.user_id = (select auth.uid()))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'past_paper_attempts' and policyname = 'past_paper_attempts_update_own') then
    create policy "past_paper_attempts_update_own" on public.past_paper_attempts
      for update to authenticated
      using ((select auth.uid()) = user_id)
      with check (
        (select auth.uid()) = user_id
        and exists (select 1 from public.exams e where e.id = exam_id and e.user_id = (select auth.uid()))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'past_paper_attempts' and policyname = 'past_paper_attempts_delete_own') then
    create policy "past_paper_attempts_delete_own" on public.past_paper_attempts
      for delete to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;

revoke all on public.past_paper_attempts from anon;
