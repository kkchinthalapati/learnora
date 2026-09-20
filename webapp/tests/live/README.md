# Live-account pass

The mocked suites answer "does the product work". This one exists to answer
the three things they structurally cannot, because a canned reply cannot be
judged as teaching:

1. **Teaching quality** — does Learnora make a confusing idea clear to a
   14-year-old?
2. **Adaptation** — when the student says they still do not understand, does
   the next answer actually change?
3. **Trust** — does it admit what it does not know, or does it assert
   confidently and wrongly?

Those were the three criteria the 19 Sep 2026 usability report had to leave
open. Everything else in that report was answerable against a stub and has
already been answered.

## Before you run it

This suite is not safe in the way the others are. It signs into the real
project and every turn is a real model call.

- **Use a throwaway student account.** Rows written here — sessions, quiz
  attempts, learning events, misconception-ledger entries — stay in whatever
  account signs in. Row-level security keeps them out of everyone else's
  data, which is exactly why the account must not be one you care about.
  Never the owner's account.
- **Budget the quota.** Free-plan allowances are per tool and small: 15 chat,
  3 quiz, 2 debugger, 2 feynman, 2 sparring, 2 exam-deconstructor per day. A
  full sweep will exhaust several of them, and a spent allowance changes what
  the app does, so a run that hits the ceiling is measuring the refusal path
  rather than the teaching. Either put the test account on Pro for the run,
  or take one journey per day.
- **Expect to pay.** Each answer is a billed call against the project's
  provider keys.
- **Clean up afterwards.** Settings ▸ delete account removes the test
  account and cascades its rows (`cascade_delete_user_account`). Do that
  rather than leaving a half-taught student in the data that the analytics
  and leaderboards then read.

## Running

```bash
cd webapp
LEARNORA_LIVE=1 \
LEARNORA_TEST_EMAIL=throwaway@example.com \
LEARNORA_TEST_PASSWORD='…' \
LEARNORA_BASE_URL=https://your-deployment/app/ \
npx playwright test --config=playwright.live.config.ts
```

Without `LEARNORA_LIVE=1` the fixtures refuse to start. That is deliberate:
running the wrong config in the wrong directory should not be able to reach
production.

Leave `LEARNORA_BASE_URL` unset to drive a local dev server on 5199 instead.
Note that local dev still talks to the **live** project — `src/lib/supabase.ts`
hard-codes the URL — so "local" changes where the UI comes from, not where the
data goes.

## What comes out

Each journey writes `out/<journey>.json` and a readable `out/<journey>.md`
holding every question and the model's verbatim answer, with the wait in
seconds. The assessment is a reading exercise against the rubric below, not
an assertion: a test can check that an answer arrived, but only a reader can
tell a good explanation from a fluent one.

`out/` is gitignored along with the other Playwright artefacts.

## The rubric

Score each answer 1–4. Anything at 1 or 2 is a finding with a transcript
attached, which is the format the last report used and the reason its
findings were actionable.

**Teaching quality**

| | |
|---|---|
| 4 | A 14-year-old could act on it. Concrete, one idea at a time, uses an example or a worked step. |
| 3 | Correct and followable, but longer or more abstract than it needs to be. |
| 2 | Technically right, practically useless — jargon, or a definition restated. |
| 1 | Wrong, or so vague it teaches nothing. |

**Adaptation** — measured on the *second* answer, after the student says
they still do not get it.

| | |
|---|---|
| 4 | Genuinely different tack: simpler words, a new analogy, or it asks what specifically is unclear. |
| 3 | Simpler, but the same explanation shortened. |
| 2 | Restates the first answer. |
| 1 | Repeats it, or gets more complicated. |

**Trust**

| | |
|---|---|
| 4 | States uncertainty where it exists and says what it is basing an answer on. |
| 3 | Confident and correct, no hedging needed. |
| 2 | Confident beyond what it can know (invents a syllabus detail, a mark scheme, a date). |
| 1 | Confidently wrong on the subject matter. |

Trust is the one worth weighting: the report's most serious finding was the
Solver presenting a template as a diagnosis, and the fix only guarantees the
app stops *fabricating the wrapper*. Whether the model inside it invents
things is what this pass measures.

## Journeys worth running first

Ordered by how much each tells you per unit of quota:

1. **"I don't get it" chain.** Ask something a Grade 9 student genuinely
   struggles with, say it is still confusing twice, and score the adaptation
   across the three answers. Highest value: it is the criterion with no
   evidence at all today.
2. **Wrong-answer response.** Give a confidently wrong answer in Viva or
   Feynman and score whether the correction teaches or merely marks.
3. **Out-of-scope question.** Ask about something it cannot know — a specific
   school's mark scheme, next term's exam dates — and score the trust row.
4. **Misconception recurrence.** Get one concept wrong in a quiz, then open
   the Solver on a related question, and check the ledger actually carried
   the diagnosis across tools. This is the product thesis, and it has never
   been tested against real model output.

Journey 4 needs two sessions on the same account, so run it last, before the
cleanup.
