-- A2 (20261001010000) created ai_request_log_user_tool_created_idx on
-- (user_id, tool, created_at). 20260906000000 already created
-- ai_request_log_user_id_tool_created_at_idx on exactly the same columns, so
-- every AI request has been writing two identical indexes since A2 went live.
-- The planner can use either; this drops the newer copy.
--
-- A2 itself is left as written: it is applied in production, and on a fresh
-- database this migration runs straight after it.
--
-- Revert: create index if not exists ai_request_log_user_tool_created_idx
--           on public.ai_request_log (user_id, tool, created_at);

drop index if exists public.ai_request_log_user_tool_created_idx;

-- Guard: the original must still be there, or the quota query loses its index.
create index if not exists ai_request_log_user_id_tool_created_at_idx
  on public.ai_request_log (user_id, tool, created_at);
