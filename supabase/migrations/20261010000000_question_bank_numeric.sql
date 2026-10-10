-- Typed-in numeric answers in the practice bank.
--
--   answer_type     'mcq' (default) or 'numeric'.
--   numeric_answer  for 'numeric': { value, tolerance?, relTolerance?, unit?,
--                   acceptUnits? }, marked by code (webapp/src/lib/numericAnswer.ts),
--                   never by a model.
--
-- A numeric row keeps one "choice": the key as shown ("9 J"), with
-- correct_index 0, so every index-based path (reports, attempts, the quiz
-- runner) works unchanged. The choices check is widened to allow that single
-- choice for numeric rows only; multiple-choice rows still need 2–6.
--
-- Revert: delete numeric rows first, then
--   alter table public.question_bank drop constraint if exists question_bank_choices_check;
--   alter table public.question_bank add constraint question_bank_choices_check
--     check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) between 2 and 6);
--   alter table public.question_bank drop constraint if exists question_bank_numeric_check;
--   alter table public.question_bank drop column if exists numeric_answer, drop column if exists answer_type;

alter table public.question_bank
  add column if not exists answer_type text not null default 'mcq'
    check (answer_type in ('mcq', 'numeric')),
  add column if not exists numeric_answer jsonb;

alter table public.question_bank
  drop constraint if exists question_bank_choices_check;
alter table public.question_bank
  add constraint question_bank_choices_check
  check (
    jsonb_typeof(choices) = 'array'
    and jsonb_array_length(choices) between 1 and 6
    and (answer_type = 'numeric' or jsonb_array_length(choices) >= 2)
  );

alter table public.question_bank
  drop constraint if exists question_bank_numeric_check;
alter table public.question_bank
  add constraint question_bank_numeric_check
  check (
    (answer_type = 'mcq' and numeric_answer is null)
    or (answer_type = 'numeric'
        and jsonb_typeof(numeric_answer) = 'object'
        and jsonb_typeof(numeric_answer -> 'value') = 'number'
        and correct_index = 0
        and jsonb_array_length(choices) = 1)
  );
