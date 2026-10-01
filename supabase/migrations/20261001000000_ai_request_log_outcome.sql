-- Which provider and model answered each AI request, how long it took, and
-- which providers failed before it. ai_request_log held only the tool and
-- the time, so a dead key (Cerebras answered 402 to every request on
-- 2026-09-25) or a slow model was visible only in raw function logs.
--
-- Additive and nullable: rows written before this, and requests that never
-- reach a provider, simply leave them empty. learnora-ai writes them with
-- the service role after a request succeeds; students keep their existing
-- owner-only SELECT/INSERT and gain nothing new.
--
-- Revert: alter table public.ai_request_log
--   drop column if exists provider, drop column if exists model,
--   drop column if exists latency_ms, drop column if exists failed_providers;

alter table public.ai_request_log
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists latency_ms integer check (latency_ms is null or latency_ms >= 0),
  add column if not exists failed_providers text[];
