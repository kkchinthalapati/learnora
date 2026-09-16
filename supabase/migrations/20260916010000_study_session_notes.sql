-- One optional line of "what I actually covered", captured at session end.
-- Nullable; the timer logs sessions without it exactly as before.
alter table public.study_sessions
  add column if not exists notes text;
