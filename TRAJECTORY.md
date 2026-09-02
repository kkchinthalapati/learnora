# Trajectory

**What it is:** the grade you are heading for, and what the next hour of your
life is worth.

## Why this is the thing nobody else can copy

Every tool in this category is an artifact factory.

- **NotebookLM** answers questions from your sources. Excellent at it. It has no
  model of what you know, no idea when you are free, and no opinion about what
  you should do this afternoon.
- **Notion** gives you a database and asks you to build the system yourself —
  which is precisely the skill our users do not have. That is the whole reason
  they are here.
- **Turbo AI, StudyFetch, Quizlet** turn a PDF into flashcards. So do we, and it
  is table stakes.

All three optimise the *material*. None of them owns the *outcome*, and none of
them can, because owning the outcome needs two models nobody else is building:

1. **What this person knows, per topic, and how fast it is fading.** Learnora
   has been accumulating this for as long as it has had spaced repetition —
   every card interval and ease factor is a measurement of a specific memory.
2. **When this person is actually free.** Life Sync (`LIFE_SYNC.md`) — their
   real timetable, shifts, sleep window and honest daily capacity.

Hold both and a question opens up that no amount of content generation can
answer: **what is the next hour worth, and where should it go?**

A competitor can copy a screen in a week. Copying this means building a spaced
repetition system, waiting months for real memory data to accumulate per user,
and then convincing students to hand over their timetable. That is the moat —
not the chart.

## What it shows

- **A projected score on exam day**, with a confidence band that is wide when
  the evidence is thin and narrows as the student does more work.
- **The drift line** — where they land if they stop here. It falls, because
  memory fades whether or not you feel it. This is the number that gets someone
  off the sofa, and it is the honest half of the feature.
- **What the plan is worth**, in points, for hours they already have free.
- **What the next hour is worth, per topic.** "One 45-minute block on Titration
  is worth 4.2 points — 6× the same block on Bonding." This is the part nobody
  works out for themselves, and the part that changes behaviour.
- **How much more work would reach the target**, or an honest "there is not
  enough time left" when there is not.

Each row starts a timer on that topic in one click.

## The model

`webapp/src/lib/trajectory.ts`. Pure, deterministic, 42 tests.

| Piece | Rule |
| --- | --- |
| Decay | `m(t) = m · exp(-t/S)`, the same shape and the same `S` (`interval × ease/2.5`) that `adaptiveLearning.ts` already uses, so the two never disagree about how fast this student forgets. |
| Learning | `gain = (1 − m) · (1 − exp(−mins / 90))`. Diminishing returns against the gap that is left, which is why an hour on a 20% topic is worth ~8× an hour on a 90% topic. |
| Stability | Studying buys ~2.5 days of extra stability per hour, so it raises what you know *and* slows how fast you lose it. |
| Daily ceiling | One day can close at most 40% of a topic's remaining gap, whatever the hours. |
| Score | Weighted mean of per-topic mastery; deck weight is `√cardCount`, so a 100-card deck matters more than a 10-card deck but not ten times more. |
| Confidence | Band width scales with evidence volume, from ±22 points at zero evidence to zero at full. |

### The daily ceiling is the load-bearing constraint

Without it the model will happily report that sixty hours over the next two days
gets you to 95%. That is arithmetic, not advice, and it would be actively
harmful to exactly the student most likely to try it.

With it, "spread beats crammed" falls *out* of the model instead of being
asserted at the student as a study tip nobody has ever acted on. A test pins
this: fewer hours spread over a fortnight beat more hours crammed into two days.

### Where the honesty is

- Every forecast carries its band. A forecast without one is a lie told with a
  decimal point, and people make real decisions about their week on this screen.
- A deck with no cards is **unmeasured**, not zero — a student who has just
  uploaded their syllabus should not look doomed.
- Interventions are ranked against *today's* state, not the projected one,
  because the student is deciding what to do this afternoon.
- The screen says "a model, not a promise" and explains what it assumes.

## Files

| Piece | File |
| --- | --- |
| The model | `webapp/src/lib/trajectory.ts` (+ `.test.ts`) |
| Data join: memory model × time model | `webapp/src/hooks/useTrajectory.ts` |
| The screen | `webapp/src/views/trajectory/TrajectoryView.tsx` |
| The chart | `webapp/src/views/trajectory/TrajectoryChart.tsx` |
| Exam → folder matching (shared with readiness) | `matchExamFolder` in `webapp/src/lib/examReadiness.ts` |

Route `/trajectory`, in the sidebar under Progress, gated to Pro
(`STRIPE_SETUP.md`).

## Known limits

1. **Topics are decks.** A deck is the only unit in the app that carries memory
   state, so it is the only unit that can be projected. An exam whose material
   is not in decks gets an honest "not enough to go on" rather than a fabricated
   number.
2. **Exam ↔ folder matching is by name.** Same loose string match the readiness
   score already uses. An exam with no matching folder forecasts off everything,
   which is imprecise; the view says which of the two happened.
3. **No syllabus coverage model.** We can measure what the student has decks
   for; we cannot know what is on the exam that they have never made a card
   about. That unknown-unknown is the largest source of error in the forecast
   and the honest next thing to build — probably by parsing an uploaded
   specification into a topic list and treating unmatched topics as unmeasured
   weight.
4. **`minutesToTarget` re-simulates in 60-minute steps** up to a sixty-hour cap.
   Cheap enough (memoised, single-digit milliseconds) but it is a search, not a
   closed form, and it will get slower if the horizon grows a lot.
