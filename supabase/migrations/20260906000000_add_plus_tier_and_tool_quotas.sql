-- Per-tool AI quotas, and a "plus" tier between free and pro.
--
-- Two changes, both driven by the same decision: replace one shared
-- `aiGenerationsPerDay` pool with a cap per specific tool (chat, notes,
-- flashcards, quiz, plan, and the five differentiator tools — debugger,
-- pre-mortem, feynman, exam deconstructor, sparring), so a student cannot
-- exhaust the whole day's chat budget with one flashcard-heavy session or
-- vice versa. Enforcement lives in `learnora-ai` (supabase/functions/
-- learnora-ai/index.ts); this migration only adds the column that lets it
-- count per tool instead of per user.
--
-- `mode` already existed and stays exactly what it was — the response-shape
-- contract (json vs plain text, and which JSON shape) — because several
-- distinct product features share a mode today (pre-mortem, feynman and the
-- exam deconstructor all request `mode: "quiz"` purely for its JSON parsing).
-- `tool` is new and is the actual feature identity for billing purposes; the
-- two are independent axes on the same row.

alter table public.ai_request_log
  add column if not exists tool text;

-- The rate limiter's hot query is now "how many rows for this user, for this
-- specific tool, since midnight" — an index with `tool` as the second column
-- makes that a range scan instead of a filtered scan over every mode the user
-- triggered today.
create index if not exists ai_request_log_user_id_tool_created_at_idx
  on public.ai_request_log (user_id, tool, created_at);

alter table public.profiles
  drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check check (plan in ('free', 'plus', 'pro'));
