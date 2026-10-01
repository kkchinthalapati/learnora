-- The misconception ledger: durable memory of what a student misunderstands.
--
-- Every AI instrument in this app already produces a named diagnosis and then
-- discards it. The Cognitive Debugger returns a stack trace whose `severed`
-- layers name the broken prerequisite. Feynman returns `hiddenMisconceptions`
-- and, per teaching turn, `confusionPoints` and `solvedPoints`. The Pre-Mortem
-- radar returns `predictedFailures` with a `coreTrap`. Sparring returns
-- `missingPoints` and `keyConceptsMastered`. All of it lived in component
-- state, or at most in `lib/cognitiveBridge.ts` — a single-payload
-- sessionStorage clipboard that survives exactly one navigation.
--
-- The consequence: `lib/studentEvidence.ts`, the only model of the student the
-- AI surfaces actually read, was built from quiz scores alone. Percentages per
-- topic. It could say "you are at 54% on hydrolysis" but never "you believe
-- water is consumed rather than added, the Debugger found it on the 12th,
-- Feynman caught the same belief on the 19th, and you have not corrected it."
--
-- Two tables rather than one. `misconceptions` is the aggregate a feature
-- reads — one row per concept a student has trouble with, carrying status and
-- counts. `misconception_observations` is the append-only evidence trail
-- behind it. Keeping them apart is what makes recurrence expressible: the
-- claim "three times, across two different tools" is a query over the trail,
-- not a counter someone has to trust. It also means a correction can be
-- recorded without destroying the history of the error, which is the whole
-- point of a ledger.
--
-- RLS follows 20260828000000 and the notebooks migration: a permissive owner
-- policy, plus a restrictive parent-ownership guard so an observation cannot
-- reference a misconception belonging to another account.

create table if not exists public.misconceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Subject is free text everywhere else in this schema (exams, folders,
  -- notebooks all carry a `subject text`), so it stays free text here rather
  -- than inventing a foreign key the rest of the app does not have.
  subject text not null default '',

  -- `concept` is what a human reads: "hydrolysis consumes water". `concept_key`
  -- is the same thing normalised (lowercased, punctuation and filler stripped)
  -- so two tools describing one belief in different words collapse to one row
  -- instead of two. The uniqueness constraint below is what performs the merge.
  concept text not null,
  concept_key text not null,

  -- The student's actual wrong belief, in one or two sentences, as diagnosed.
  -- Distinct from `concept`: the concept names the territory, this names the
  -- error inside it.
  summary text not null default '',

  -- open      — observed, never corrected since
  -- improving — corrected at least once, but observed again afterwards, or not
  --             yet corrected enough times to trust
  -- resolved  — corrected repeatedly with no fresh evidence since
  -- Deliberately not a boolean. A misconception that comes back is the single
  -- most important signal this table can carry, and "improving" is the state
  -- that lets a feature say so.
  status text not null default 'open'
    check (status in ('open', 'improving', 'resolved')),

  severity text not null default 'moderate'
    check (severity in ('critical', 'moderate', 'minor')),

  -- Which instrument diagnosed this first. Kept for provenance in the UI
  -- ("found by the Debugger"), not for logic — logic reads the trail.
  origin_tool text not null default 'quiz'
    check (origin_tool in
      ('debugger', 'feynman', 'premortem', 'sparring', 'quiz', 'notes', 'review')),

  -- Counts denormalised from the observation trail. They are maintained by the
  -- trigger below rather than by the client, so a feature can rank by
  -- recurrence without joining and aggregating on every read.
  times_observed integer not null default 0,
  times_corrected integer not null default 0,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Set when status becomes 'resolved', cleared if it regresses. The gap
  -- between this and a later `last_seen_at` is how long a repair held.
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The merge rule. One belief per subject per student, however many tools find
-- it. `api/misconceptions.ts` upserts against this constraint.
create unique index if not exists misconceptions_user_subject_concept_key
  on public.misconceptions (user_id, subject, concept_key);

create table if not exists public.misconception_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  misconception_id uuid not null
    references public.misconceptions (id) on delete cascade,

  source_tool text not null
    check (source_tool in
      ('debugger', 'feynman', 'premortem', 'sparring', 'quiz', 'notes', 'review')),

  -- The row in the originating feature this came from: a stack trace id, a
  -- quiz attempt id, a sparring session id. Free text because those ids live
  -- in different tables and some (the Debugger's traces) are client-generated.
  source_id text,

  -- evidence   — the misconception was observed again
  -- correction — the student demonstrated the correct understanding
  -- Both are recorded. A ledger that only stored failures could never close a
  -- row, and one that overwrote failures on success could never show a relapse.
  kind text not null check (kind in ('evidence', 'correction')),

  -- What actually happened, in the tool's own words: the failed question, the
  -- sentence Feynman flagged, the trap that caught them. This is what gets
  -- quoted back to the student, so it is stored verbatim and never regenerated.
  detail text not null default '',

  occurred_at timestamptz not null default now()
);

-- Reads: the open ledger for a student ordered by how much it matters, and the
-- trail behind one row. The partial index serves the common case — most
-- queries want what is still wrong, and resolved rows accumulate forever.
create index if not exists misconceptions_user_status_idx
  on public.misconceptions (user_id, status, last_seen_at desc);
create index if not exists misconceptions_user_open_idx
  on public.misconceptions (user_id, last_seen_at desc)
  where status <> 'resolved';
create index if not exists misconception_observations_parent_idx
  on public.misconception_observations (misconception_id, occurred_at desc);

alter table public.misconceptions enable row level security;
alter table public.misconception_observations enable row level security;

create policy "misconceptions_owner" on public.misconceptions
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "misconception_observations_owner"
on public.misconception_observations
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "misconception_observations_parent_owner_guard"
on public.misconception_observations as restrictive
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.misconceptions as parent
    where parent.id = misconception_observations.misconception_id
      and parent.user_id = (select auth.uid())
  )
);

-- Status is derived from the evidence, not asserted by whichever tool happened
-- to write last. Putting the rule in a trigger keeps six different callers from
-- each implementing their own version of "is this fixed yet", and means the
-- counts cannot drift from the trail they summarise.
--
-- The rule:
--   evidence    -> always reopens. Seeing the error again outranks any history
--                  of correction, and `resolved_at` is cleared so a relapse is
--                  visible as a relapse.
--   correction  -> 'resolved' once corrections outnumber observations and at
--                  least two have been recorded; otherwise 'improving'.
-- Two corrections rather than one because a single right answer is as easily
-- luck as learning, and this table is read by features that reschedule a
-- student's week.
create or replace function public.apply_misconception_observation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  observed integer;
  corrected integer;
begin
  select
    count(*) filter (where kind = 'evidence'),
    count(*) filter (where kind = 'correction')
    into observed, corrected
  from public.misconception_observations
  where misconception_id = new.misconception_id;

  update public.misconceptions
  set
    times_observed = observed,
    times_corrected = corrected,
    last_seen_at = greatest(last_seen_at, new.occurred_at),
    status = case
      when new.kind = 'evidence' then 'open'
      when corrected >= 2 and corrected > observed then 'resolved'
      else 'improving'
    end,
    resolved_at = case
      when new.kind = 'correction' and corrected >= 2 and corrected > observed
        then new.occurred_at
      else null
    end,
    updated_at = now()
  where id = new.misconception_id;

  return new;
end;
$$;

drop trigger if exists misconception_observations_apply
  on public.misconception_observations;
create trigger misconception_observations_apply
  after insert on public.misconception_observations
  for each row execute function public.apply_misconception_observation();

create or replace function public.touch_misconception_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists misconceptions_touch_updated_at on public.misconceptions;
create trigger misconceptions_touch_updated_at
  before update on public.misconceptions
  for each row execute function public.touch_misconception_updated_at();
