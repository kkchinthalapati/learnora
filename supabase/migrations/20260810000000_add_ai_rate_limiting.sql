-- Per-user rate limiting for the `learnora-ai` edge function.
--
-- The AI pipeline (supabase/functions/learnora-ai/index.ts) has no cap on
-- how often one signed-in user can call it. Every mode — chat, quiz, plan,
-- flashcards, notes — spends a token budget against Learnora's own provider
-- keys (Gemini, Cerebras, Groq, Mistral, GitHub Models, OpenRouter), most of
-- which are free-tier and quota-limited account-wide, not per-user. A single
-- buggy client (a retry loop with no backoff) or a deliberately abusive one
-- can exhaust that shared quota for every other student in minutes, and
-- nothing before this migration would even notice, let alone stop it.
--
-- This is a usage log the edge function reads and writes as the calling
-- user (via their own JWT, same client it already builds for the auth
-- gate) — no SECURITY DEFINER RPCs needed, since a user is only ever
-- reading/writing their own rate-limit history. Same "owner-only, no
-- cross-user access" shape as push_subscriptions.

create table if not exists public.ai_request_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text,
  created_at timestamptz not null default now()
);

-- The rate-limit check is "how many rows for this user in the last N
-- minutes" — an index on (user_id, created_at) makes that a range scan
-- instead of a filtered sequential scan as the table grows.
create index if not exists ai_request_log_user_id_created_at_idx
  on public.ai_request_log (user_id, created_at);

alter table public.ai_request_log enable row level security;

drop policy if exists "ai_request_log_select_own" on public.ai_request_log;
create policy "ai_request_log_select_own" on public.ai_request_log
  for select using ((select auth.uid()) = user_id);

drop policy if exists "ai_request_log_insert_own" on public.ai_request_log;
create policy "ai_request_log_insert_own" on public.ai_request_log
  for insert with check ((select auth.uid()) = user_id);

-- No update/delete policy: a rate-limit log a client could rewrite or clear
-- would not be a rate limit. Old rows are harmless and small (one skinny row
-- per accepted AI call) — a periodic prune isn't worth the operational
-- weight of scheduling one for a table this cheap to keep in full.
