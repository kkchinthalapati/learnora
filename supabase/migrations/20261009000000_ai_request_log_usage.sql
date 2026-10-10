-- Token counts, a status, and refunds that keep the row.
--
-- Two gaps this closes (research/efficiency-audit.md, E1):
--   1. No token counts, so cost per session could not be worked out.
--   2. A request no provider answered had its row *deleted* to hand the
--      student's allowance back, which made every total outage invisible:
--      the log only ever showed requests that succeeded.
--
-- learnora-ai now marks such rows `refunded = true` with a status instead of
-- deleting them, and every quota count (edge function and the client's usage
-- meter) filters `refunded = false`. Students keep owner-only SELECT/INSERT
-- and still have no UPDATE, so they cannot refund their own rows.
--
-- Additive: existing rows default to refunded = false and a null status,
-- which counts exactly as before.
--
-- Revert: alter table public.ai_request_log
--   drop column if exists status, drop column if exists input_tokens,
--   drop column if exists output_tokens, drop column if exists refunded;
--   (then redeploy the previous learnora-ai, which deletes instead).

alter table public.ai_request_log
  add column if not exists status text
    check (status is null or status in ('ok', 'failed_all', 'vision_unavailable')),
  add column if not exists input_tokens integer
    check (input_tokens is null or input_tokens >= 0),
  add column if not exists output_tokens integer
    check (output_tokens is null or output_tokens >= 0),
  add column if not exists refunded boolean not null default false;

comment on column public.ai_request_log.status is
  'ok: a provider answered. failed_all: every provider failed. vision_unavailable: no image-capable provider answered. Null on rows written before 2026-10-09 or still in flight.';
comment on column public.ai_request_log.refunded is
  'True when the request reached no provider; the row no longer counts against any limit.';
