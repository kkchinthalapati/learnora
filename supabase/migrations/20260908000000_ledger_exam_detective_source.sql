-- Exam Detective as a ledger source.
--
-- 20260907000000 enumerated the six instruments that existed when the ledger
-- landed. The Challenge Sprint is a seventh, and it produces the most precise
-- evidence any of them can: its distractors are not wrong answers, they are
-- named traps with a written explanation of the belief that makes each one
-- look right. A student choosing the bait has not slipped — they have
-- demonstrated the exact misconception the question was built to detect.
--
-- Widening a CHECK is safe in both directions here: no existing row carries
-- the new value, and nothing in the app reads `origin_tool` for logic — the
-- UI reads it for provenance ("found by the Debugger") and every ranking
-- decision goes through the observation trail instead.

alter table public.misconceptions
  drop constraint if exists misconceptions_origin_tool_check;

alter table public.misconceptions
  add constraint misconceptions_origin_tool_check
  check (origin_tool in
    ('debugger', 'feynman', 'premortem', 'sparring', 'quiz', 'notes', 'review',
     'exam-detective'));

alter table public.misconception_observations
  drop constraint if exists misconception_observations_source_tool_check;

alter table public.misconception_observations
  add constraint misconception_observations_source_tool_check
  check (source_tool in
    ('debugger', 'feynman', 'premortem', 'sparring', 'quiz', 'notes', 'review',
     'exam-detective'));
