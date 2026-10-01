-- Persist FSRS memory state on flashcards.
--
-- The scheduler (webapp/src/views/review/srs.ts) models each card with a
-- stability (days until recall decays to the target retention) and a
-- difficulty (1..10). Both were computed on every review and then thrown
-- away, because `flashcards` had nowhere to put them: the next review had to
-- re-derive stability from `srs_interval`, so the model never accumulated any
-- history and every grade was scheduled as if the card were nearly new.
--
-- Both columns are nullable on purpose. A card last reviewed before this
-- migration has NULL for each and falls back to the interval/ease pair; it
-- picks up real memory state from its next review onward, so no backfill is
-- needed and no existing schedule is disturbed.

alter table public.flashcards
  add column if not exists stability double precision,
  add column if not exists difficulty double precision;

comment on column public.flashcards.stability is
  'FSRS memory stability in days. NULL for cards not yet reviewed under FSRS.';
comment on column public.flashcards.difficulty is
  'FSRS card difficulty, 1 (easiest) to 10 (hardest). NULL for pre-FSRS cards.';
