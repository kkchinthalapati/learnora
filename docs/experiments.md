# Experiments

Live experiments, their pre-registered decision rules, and how to read them.
Assignment and tagging are in `webapp/src/lib/experiments.ts`; the plan these
come from is `research/strategy-roadmap.md` §4 (Stage 4).

Ground rules:
- Never withhold support known to work. Arms vary the **format or timing** of
  help, not whether a student gets it.
- The decision rule is written here **before** anyone looks at results.
- With the current user numbers, results are directional until each arm has
  at least 100 resolved misconceptions. Do not act on fewer.

## retest-delay-v1 (started 2026-10-09)

**Question.** Does a longer gap before the first retest make a corrected
belief stick better?

**Unit.** One misconception row. Assignment is a hash of the experiment id and
the row id (`armFor`). It is stable, with no table, roughly 50/50.

**Arms.**

| Arm | First retest no earlier than |
|---|---|
| `2d` | 2 days after the repair (the existing rule) |
| `4d` | 4 days after the repair |

Both arms get the same re-teach and contrast. Only when the check comes
differs. The resolution rule (a correct answer on a new question at least 2
days after the repair) is unchanged in both arms.

**Where the arm is recorded.** The repair observation's `detail` ends in
`[exp retest-delay-v1=2d]` or `=4d` (written by `useRecordRepair` and the
worked-solution path in `useQuizzes`).

**Primary outcome: recurrence.** Of the misconceptions resolved in each arm,
the share with a new `evidence` observation (the belief seen again) within 30
days of `resolved_at`.

**Secondary outcome.** Share resolved within 21 days of the first repair, and
the number of retests it took.

**Decision rule (pre-registered).** Adopt `4d` as the default if its
recurrence is lower by at least 10 percentage points and the 95% interval of
the difference excludes 0. Otherwise keep `2d`, which resolves sooner and
asks less of the student.

```sql
-- Run in the SQL editor. Aggregates only; no student content leaves the database.
with repairs as (
  select distinct on (o.misconception_id)
         o.misconception_id,
         substring(o.detail from '\[exp retest-delay-v1=(\w+)\]') as arm,
         o.occurred_at as repaired_at
  from public.misconception_observations o
  where o.kind = 'repair' and o.detail like '%[exp retest-delay-v1=%'
  order by o.misconception_id, o.occurred_at
),
outcomes as (
  select r.arm,
         m.id,
         m.resolved_at,
         m.resolved_at is not null and m.resolved_at <= r.repaired_at + interval '21 days' as resolved_21d,
         exists (
           select 1 from public.misconception_observations e
           where e.misconception_id = m.id and e.kind = 'evidence'
             and m.resolved_at is not null
             and e.occurred_at > m.resolved_at
             and e.occurred_at <= m.resolved_at + interval '30 days'
         ) as recurred_30d
  from repairs r join public.misconceptions m on m.id = r.misconception_id
)
select arm,
       count(*)                                         as repaired,
       count(*) filter (where resolved_at is not null)   as resolved,
       round(avg(resolved_21d::int)::numeric, 3)        as resolved_21d_rate,
       count(*) filter (where recurred_30d)             as recurred,
       round((count(*) filter (where recurred_30d))::numeric
             / nullif(count(*) filter (where resolved_at is not null), 0), 3) as recurrence_rate
from outcomes
group by arm
order by arm;
```
