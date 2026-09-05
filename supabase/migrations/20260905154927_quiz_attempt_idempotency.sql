-- Idempotency for quiz attempts.
--
-- The client writes an attempt once, from an effect that fires when a run
-- ends. That is enough within one tab and not enough anywhere else: a retried
-- write (the app now replays a mutation whose request never reached the
-- origin), a duplicated tab, or a resumed draft finishing twice all produced a
-- second row. A duplicate attempt is not cosmetic — attempts feed weak-topic
-- tracking, exam readiness and the trajectory forecast, so one quiz counted
-- twice quietly skews all three.
--
-- `attempt_key` identifies a *run*, not a request: it is generated when the
-- run starts and persisted with the local draft, so resuming keeps the same
-- key while genuinely starting the quiz again produces a new one.

alter table public.quiz_attempts
  add column if not exists attempt_key text;

-- Partial, so the rows already in the table (and any client too old to send a
-- key) stay legal with attempt_key null rather than colliding on it.
create unique index if not exists quiz_attempts_user_attempt_key_idx
  on public.quiz_attempts (user_id, attempt_key)
  where attempt_key is not null;

comment on column public.quiz_attempts.attempt_key is
  'Client-generated id for one quiz run. Unique per user (partial index, '
  'nulls exempt) so a retried or duplicated submit collapses onto the row '
  'that already exists instead of inserting a second attempt.';
