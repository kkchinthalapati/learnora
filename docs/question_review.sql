-- Question review: run by hand in the Supabase SQL Editor (service role).
-- Tables from migration 20261006000000_question_verification_and_reports.sql.
-- There is no admin UI on purpose; these are read-only queries plus the two
-- small updates at the bottom for acting on what you find.

-- 1. Everything waiting for a human, newest first: questions the checker
--    rejected in seeded subjects, and questions pulled after reports.
select
  l.created_at,
  l.source,                              -- 'verification' | 'reports'
  l.subject,
  l.spec_id,
  l.reason,
  coalesce(l.question->>'question', l.question->>'text') as question,
  l.question->'choices'                  as choices,
  l.question->>'correctIndex'            as marked_answer,
  l.question_ref
from public.question_review_log l
order by l.created_at desc
limit 200;

-- 2. Reports per question, with every reason and note given.
select
  r.question_ref,
  count(distinct r.user_id)                      as reporters,
  array_agg(distinct r.reason)                   as reasons,
  array_remove(array_agg(r.note), null)          as notes,
  min(r.question_text)                           as question,
  max(r.created_at)                              as last_reported,
  (f.question_ref is not null)                   as pulled
from public.question_reports r
left join public.question_flags f using (question_ref)
group by r.question_ref, f.question_ref
order by reporters desc, last_reported desc;

-- 3. Bank questions currently out of circulation, with their report count.
select id, spec_key, topic_ref, review_status, report_count, question, choices, correct_index
from public.question_bank
where review_status <> 'active'
order by report_count desc;

-- 4. Verification volume and caps today (QUIZ_VERIFY_USER_DAILY /
--    QUIZ_VERIFY_GLOBAL_DAILY in the function's secrets).
select
  count(*)                                       as checks_today,
  count(distinct user_id)                        as students,
  max(per_user)                                  as busiest_student
from (
  select user_id, count(*) over (partition by user_id) as per_user
  from public.ai_request_log
  where mode = 'verify' and created_at >= date_trunc('day', now() at time zone 'utc')
) t;

-- ── Acting on a review ───────────────────────────────────────────────────
-- Put a bank question back after fixing or clearing it (marks it reviewed by
-- a human, so it is never re-checked automatically):
--   update public.question_bank
--     set review_status = 'active', human_reviewed = true
--     where id = '<uuid>';
--   delete from public.question_flags where question_ref = 'bank:<uuid>';
--
-- Retire one for good:
--   update public.question_bank set review_status = 'retired' where id = '<uuid>';
