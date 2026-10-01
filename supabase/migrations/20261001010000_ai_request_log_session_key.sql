-- Bill the daily AI allowance per study session instead of per call.
--
-- A Study session (Explain, Socratic, Teach, Practice) makes several calls.
-- Counted per call, the free plan's 2 a day for these tools meant one
-- Explain session a day, and a Socratic session hit the limit after its
-- first answer and fell back to canned questions. learnora-ai now counts
-- each distinct session_key once (with a per-session call cap) and every
-- call without one as before.
--
-- Additive and nullable. Apply BEFORE deploying the learnora-ai version
-- that writes it: until then the function's insert fails, which it logs
-- and allows (it fails open), so limits would not be enforced.
--
-- Revert: drop index if exists ai_request_log_user_tool_created_idx;
--         alter table public.ai_request_log drop column if exists session_key;

alter table public.ai_request_log
  add column if not exists session_key text
    check (session_key is null or session_key ~ '^[A-Za-z0-9_-]{6,80}$');

create index if not exists ai_request_log_user_tool_created_idx
  on public.ai_request_log (user_id, tool, created_at);
