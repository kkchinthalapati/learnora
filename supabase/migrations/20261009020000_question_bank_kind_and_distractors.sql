-- Question bank: what each question asks for, and what each wrong option means.
--
--   kind                       'recall' | 'apply' | 'explain'. The mastery
--                              ladder's rungs need their kind of evidence
--                              (webapp/src/lib/knowledgeModel.ts); a bank
--                              question states its kind instead of having
--                              it read from the wording.
--   distractor_misconceptions  one entry per choice: a misconception
--                              catalogue id (webapp/src/lib/misconceptionCatalogue.ts)
--                              or null. Picking a mapped distractor is the
--                              diagnosis itself — deterministic, no AI call
--                              (research/learning-engine-architecture.md §B).
--
-- Additive and nullable: existing rows keep working; the app reads null kind
-- as "read it from the wording" and null mappings as "not mapped".
--
-- Revert: alter table public.question_bank
--   drop column if exists kind, drop column if exists distractor_misconceptions;

alter table public.question_bank
  add column if not exists kind text
    check (kind is null or kind in ('recall', 'apply', 'explain')),
  add column if not exists distractor_misconceptions jsonb
    check (
      distractor_misconceptions is null
      or (jsonb_typeof(distractor_misconceptions) = 'array'
          and jsonb_array_length(distractor_misconceptions) = jsonb_array_length(choices))
    );
