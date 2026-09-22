# Feature audit — September 2026

Every route in the app, read against one question: **does this feature know
who it is talking to, and does anything else in the app learn from it?**

That is the only question worth asking here. Learnora is not competing on
having a flashcard generator — Quizlet, Turbo AI and StudyFetch all have one,
and theirs are fine. It is competing on being the only tool in the category
that holds two models nobody else is building (`TRAJECTORY.md`): what this
person knows per topic and how fast it is fading, and when this person is
actually free. A feature that neither reads those models nor feeds them is a
feature a competitor can ship in a fortnight.

So each row below is scored on two axes:

- **Feeds** — what this feature contributes to the shared models. A feature
  that diagnoses a student and keeps the diagnosis is a leak.
- **Reads** — what it knows about the student before it opens its mouth. A
  feature that starts from an empty form every time is a chatbot with a logo.

Anything under `archive/` was ignored per `CLAUDE.md`.

---

## What this pass changed

Five leaks and one silo, in commit order:

1. **Review → ledger.** Flashcard grading is the highest-volume signal in the
   app — hundreds of grades a week against a handful of quiz answers — and all
   of it went into `next_review_date` and nowhere else. The scheduler knew a
   card kept failing; the plan, the quiz generator and the tutor in the sidebar
   could not find out. `candidatesFromReviewLapses` now files a chronically
   failed card (FSRS difficulty ≥ 7, or a three-week interval that broke) as
   critical evidence, and confident recall of a card that used to be hard as a
   correction — so ordinary revision closes a ledger row.
2. **Trajectory → weekly plan.** The planner ranked by weakness. Weakness is
   not value: an hour on a topic at 20% that carries a tenth of the paper is
   worth less than an hour on one at 60% that carries a third, and no prompt
   tuning gets a model to work that out from topic names. The plan prompt now
   carries the forecast's marks-per-hour ranking and quotes the figure in each
   block, so a plan can be argued with rather than merely followed.
3. **Trajectory → dashboard.** The forecast was reachable from one page a
   student had to know to visit. `NextHourCard` leads the dashboard with the
   marks the next hour buys and a button that starts a block on it.
4. **Trajectory → timer.** The timer is where the hour is actually spent and
   had no idea what it was worth. The task binder answers "what did I say I'd
   do", which is a different and usually worse question.
5. **Exam Detective → ledger.** The Challenge Sprint produces the most precise
   evidence in the app — its distractors are named traps shipped with a written
   explanation of the belief that makes each look right — and kept all of it in
   `localStorage`.
6. **Study Lab → ledger.** The page asked "what do you need help with?" and
   offered four equal doors to a student whose work had already been diagnosed
   six ways.

Also fixed: `PlanView.test.tsx` had been failing on `main`, asserting a nav tab
called "Week" that `PlanSectionNav` renamed to "Study plan".

---

## The instruments

The four AI tools whose whole job is diagnosis. All four now both feed and read
the ledger, which is what makes them one product rather than four demos.

| Feature | Feeds | Reads | Verdict |
| --- | --- | --- | --- |
| **Cognitive Debugger** (`/debugger`) | Ledger, from the stack trace and from micro-repairs | Ledger, cognitive bridge | **Strong.** The clearest single tool in the app: it traces a wrong answer back to the idea underneath and writes the result somewhere the rest of the app can act on. |
| **Feynman** (`/feynman`) | Ledger, from teaching turns and the draft | Ledger, bridge | **Strong.** The apprentice's confusion points are a genuinely different signal from a quiz score, and the debrief route makes the session end somewhere. |
| **Pre-Mortem** (`/premortem`) | Ledger, from predicted traps | Ledger, radar history | **Strong.** The radar's recurrence view is the right shape. |
| **Socratic Sparring** (`/sparring`) | Ledger, weakly and correctly — an omission under debate pressure is filed `minor` | Ledger, student evidence, notebooks | **Strong.** The severity restraint here is right and should not be "improved". |
| **Exam Detective** (`/exam-detective`) | Ledger *(new)* | Trap archetypes, disarmed-trap history | **Was the biggest leak.** Now the most precise contributor: a bait answer is filed `critical` on first sight, which nothing else earns. |

**Remaining lever:** the Debugger and Feynman both write, and both read the
ledger, but neither reads the *trajectory*. A repair on a topic worth 0.2 marks
an hour and one worth 4.2 are presented identically. Worth telling a student
which repair pays.

## The daily loop

| Feature | Feeds | Reads | Verdict |
| --- | --- | --- | --- |
| **Dashboard** (`/`) | Continuity snapshots | Ledger, trajectory *(new)*, life context, sessions, exams | **Strong, and now leads with the right number.** Fifteen cards is a lot; the Customize modal is what keeps it survivable. |
| **Review** (`/review/:deckId`) | SRS state, ledger *(new)* | Ledger, weak topics, continuity | **Strong.** FSRS with a proper lapse model, AI grading, and now a diagnosis rather than only a schedule. |
| **Timer** (`/timer`) | Study sessions, adherence | Tasks, folders, rooms, trajectory *(new)* | **Good.** The session log is what plan adherence is computed from, so this is load-bearing infrastructure disguised as a stopwatch. |
| **Tasks** (`/tasks`) | Task completion → plan adherence | Urgency sort, recurrence | **Adequate, and the weakest link in this row.** Tasks are the one thing here with no model behind them: no estimate of how long a task takes, so they cannot be placed into real free time, and completing one teaches the app nothing about the subject. |
| **Study Lab** (`/study-lab`) | — | Ledger *(new)* | **Now useful.** Was a static four-item menu. |
| **Plan** (`/plan`) | Stored plan → next week's adherence note | Tasks, exams, evidence, ledger, adherence, availability, trajectory *(new)* | **The best-fed surface in the app.** Seven inputs, each with a rule attached. |
| **My Week** (`/my-week`) | Life context — availability, chronotype, ICS import | — | **Strong and underused.** Half the moat lives here, and the only things that read it are the plan, the trajectory and the timeline card. |
| **Trajectory** (`/trajectory`) | — | Everything | **The single best argument for this product.** Now feeds three other surfaces instead of being a destination. |

## Material and capture

| Feature | Feeds | Reads | Verdict |
| --- | --- | --- | --- |
| **Library** (`/library`) | Folders, materials, decks, quizzes | Ledger, on the subject detail page | **Solid.** Ordinary CRUD done properly, which is what it should be. |
| **Notes** (`/notes/:materialId`) | Notes content; nothing to the shared models | Material, notebooks | **The remaining leak.** The AI sidebar explains, summarises and quizzes; `notes` is already a valid ledger source in the schema and nothing writes it. A student's own written explanation is where misconceptions are most legible, and "Test me on it" produces graded answers that are dropped. |
| **Notebooks** (`/notebooks`) | Notebook content | Student evidence, ledger | **Strong.** Source-grounded, which is the NotebookLM comparison, and unlike NotebookLM it knows who is asking. |
| **Decks** (`/decks/:deckId`) | Cards → SRS → trajectory | — | **Adequate.** A card editor. Correctly boring. |
| **Quiz** (`/quiz/:quizId`) | Attempts → weak topics, evidence, ledger | Ledger, at generation | **Strong.** The mock-exam runner and the forecast are both real. |
| **Exams** (`/exams`) | Exam dates → trajectory, plan, readiness | Readiness scoring | **Load-bearing.** Every forecast in the app is anchored to a row created here, which makes the empty state more important than it looks. |

**Remaining lever:** Notes. It is the only feature left that diagnoses and
keeps it.

## Social, progress and shell

| Feature | Feeds | Reads | Verdict |
| --- | --- | --- | --- |
| **Study Room** (`/room`) | Group sessions, presence | Timer | **Fine, and honestly peripheral.** Presence and ambience, well built. |
| **Friends** (`/friends`) | Leaderboard totals | Sessions | **Fine.** |
| **Analytics** (`/analytics`) | — | Sessions, heatmap, retention | **Adequate.** Reports activity — hours, streaks, heatmap — where the app's own thesis is that activity is the wrong measure and projected outcome is the right one. It should be showing the trajectory curve. |
| **Achievements** | — | Session and streak history | **Fine.** |
| **Onboarding** (`/welcome`) | Life context, dashboard layout, focus areas | — | **Strong.** Hiding sections nobody asked for is the biggest single lever against the empty-dashboard problem. |
| **Settings** | Profile, preferences → plan prompt | Entitlements, usage | **Comprehensive.** 5.3k lines and the largest single surface; the self-reported profile correctly feeds the planner as a soft steer rather than a rule. |
| **Auth / Terms / Privacy / 404** | — | — | **Fine.** |

---

## The ledger, after this pass

Seven of the eight sources the schema allows now write to it:

| Source | Writes | Strength of evidence |
| --- | --- | --- |
| Exam Detective | Bait answers | Strongest — the question was built to prove the belief |
| Debugger | Stack traces, repairs | Strong — an explicit diagnosis |
| Review *(new)* | Chronic and broken-in card failures | Strong, and by far the highest volume |
| Feynman | Teaching turns | Strong |
| Pre-Mortem | Predicted traps | Moderate |
| Quiz | Wrong answers | Moderate — a single miss may be a slip |
| Sparring | Omissions under pressure | Weak, deliberately |
| **Notes** | **nothing** | **the remaining gap** |

## Honest problems

1. **Notes writes nothing to the ledger.** The schema has a slot for it. The
   sidebar's "Test me on it" grades answers and drops them.
2. **Tasks have no duration model.** Everything else in the app reasons in
   minutes against a real calendar; tasks reason in due dates. They cannot be
   placed into free time, which is why the plan has to re-derive everything.
3. **Analytics measures the wrong thing.** Hours studied and streaks held, on a
   page that sits one click from a projected exam score.
4. **Podcast generation is a toast that says "coming soon"**
   (`NotesAiSidebar.tsx`). Either build it or remove the button.
5. **Life Sync is half-used.** The student hands over their real timetable and
   three surfaces read it.
6. **The Debugger and Feynman do not know what a repair is worth.** They rank
   by severity; the trajectory can rank by marks.

## Why this is the obvious choice

Stated plainly, because it is the thing the audit is for. After this pass, a
student who fails the same flashcard four times gets:

- a ledger row that says *what* they believe wrongly, not just that a card is
  hard, merged with the diagnosis the Debugger made of the same concept last
  week;
- a weekly plan that schedules it ahead of five other weak topics because the
  arithmetic says that hour is worth 4.2 marks and the others are worth 0.7;
- a dashboard that opens with that number and a button that starts the block;
- a timer that says so again at the moment they choose what to work on;
- a quiz generated afterwards that targets the same belief;
- and a ledger row that closes itself when they recall the card confidently,
  without being asked to mark anything as fixed.

No part of that is content generation. Every competitor in this category can
make the flashcard. None of them can tell the student which hour to spend on
it, because none of them holds a memory model per topic and a real calendar at
the same time — and both of those take months of a student's actual use to
accumulate, not a sprint.
