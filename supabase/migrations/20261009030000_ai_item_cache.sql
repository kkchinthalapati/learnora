-- AI text for a practice-bank question, generated once and reused.
--
-- Hint ladders and wrong-answer explanations for a bank question are the
-- same for every student at the same level; each device used to pay for its
-- own (research/efficiency-audit.md, E4). learnora-ai stores the reply under
-- a SHA-256 of the whole request (supabase/functions/_shared/itemCache.js),
-- so a cached reply is only served for exactly the request that produced it.
--
-- Service role only: RLS on with no policies, so students can neither read
-- the table directly nor write to it (no cache poisoning from a client).
--
-- ai_request_log.status gains 'cached': a request answered from here, logged
-- with refunded = true so it costs no allowance and the hit rate is visible.
--
-- Revert: drop table if exists public.ai_item_cache; and restore the
-- status check without 'cached' (after deleting or updating cached rows).

create table if not exists public.ai_item_cache (
  request_hash text primary key check (request_hash ~ '^[0-9a-f]{64}$'),
  question_ref text not null check (question_ref ~ '^bank:[0-9a-fA-F-]{36}$'),
  tool         text,
  content      text not null check (char_length(content) between 1 and 20000),
  model        text,
  hits         integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists ai_item_cache_ref_idx on public.ai_item_cache (question_ref);

alter table public.ai_item_cache enable row level security;
revoke all on public.ai_item_cache from anon, authenticated;

alter table public.ai_request_log
  drop constraint if exists ai_request_log_status_check;
alter table public.ai_request_log
  add constraint ai_request_log_status_check
  check (status is null or status in ('ok', 'failed_all', 'vision_unavailable', 'cached'));
