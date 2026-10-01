# Close the loop — design

**Date:** 2026-09-16 · **Source:** AUDIT_REPORT.md §7 (Maya Vance, second pass) · **Branch:** `feat/close-the-loop`

## 1. Problem

Learnora's differentiator is the trajectory model (`lib/trajectory.ts`): "what is the
next hour of your life worth, and where should it go?" Today that model

- is fed only by flashcard memory state and quiz `weak_topics` (`buildTopicStates`);
- ignores timed study (`study_sessions`), Feynman, Viva, Solver and Detective outcomes;
- reads availability from `learnora_life_context_v1`, a localStorage-only object, so the
  forecast differs between a student's phone and laptop;
- renders its one actionable card (`NextHourCard`) on the dashboard's second tab, which
  the mobile tab strip hides;
- hands off to a timer whose post-session "quick check" is an unscored chat prompt.

Studying does not count as evidence, and the evidence that exists does not sync.

## 2. Goal

One closed loop, on the home screen:

> Today → *Study Enzymes next, 45 min, because…* → **Start** → timer → grounded quick
> check → evidence recorded → NextHour recomputed on the same screen → *Enzymes moved
> 3 → 4. Next: Titration.*

…and every outcome-producing tool (timer, quick check, Feynman, Viva, Solver, Detective)
appends to one account-scoped evidence stream the forecast reads.

Non-goals: refactoring `NotebookStudioView`, migrating Feynman/Solver onto
`ConversationShell`, per-course frameworks, changing the SRS scheduler.

## 3. Architecture

### 3.1 `learning_events` (new table, migration `20260916030000_learning_events.sql`)

```sql
create table public.learning_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  topic_key    text not null,            -- normalised topic label (see 3.2)
  deck_id      uuid references flashcard_decks(id) on delete set null,
  folder_id    uuid references folders(id) on delete set null,
  source       text not null check (source in
                 ('timer','quick_check','feynman','viva','solver','detective')),
  score        real check (score is null or (score >= 0 and score <= 1)),
  minutes      int  not null default 0 check (minutes >= 0),
  occurred_at  timestamptz not null default now(),
  payload      jsonb not null default '{}'::jsonb,
  client_id    text                      -- idempotency key from the client
);
create unique index learning_events_client_id_idx on learning_events (user_id, client_id)
  where client_id is not null;
create index learning_events_user_occurred_idx on learning_events (user_id, occurred_at desc);
-- RLS: owner-only select/insert/delete, same policy shape as study_sessions.
```

`score` is the outcome (null for a pure time event); `minutes` is the time spent. A
timer session is `{source:'timer', minutes, score:null}`. A quick check is
`{source:'quick_check', minutes:0, score: correct/total, payload:{questions, answers}}`.
A Feynman debrief is `{source:'feynman', score: understandingScore/100}`. Viva is
`{source:'viva', score: overallScore/100}`. Solver and Detective record `score` 1 for a
correct repair / disarmed trap, 0 otherwise.

`client_id` lets the timer's offline queue (`lib/offlineSync.ts`) replay without
duplicates.

### 3.2 Topic keys

A topic is a deck (`trajectory.ts`: "a deck is the unit of a topic"). Events carry
`deck_id` when the caller knows it and always carry `topic_key = normaliseTopicKey(label)`
(trim, lowercase, collapse whitespace, strip punctuation). `buildTopicStates` matches an
event to a deck by `deck_id` first, then by `topic_key` equality with the deck's
normalised title, then by the same loose `includes` rule quiz weak-topics already use.
New module `lib/topicKey.ts` owns normalisation; `trajectory.ts` imports it.

### 3.3 Engine change (`lib/trajectory.ts`)

`TopicSources` gains `events: LearningEvent[]`. In `buildTopicStates`, per deck, after
the card-derived `retention`/`evidence`/`stabilityDays`:

1. **Time events** (`minutes > 0`, any source): apply `learningGain(mastery, minutes)`
   decayed by days since `occurred_at` (`decayOneDay` applied `daysAgo` times, floored
   by `stabilityDays`), and add `STABILITY_DAYS_PER_HOUR * minutes/60` to stability.
   Capped at `MAX_DAILY_GAIN_FRACTION` per calendar day, same as the simulator.
2. **Score events** (`score != null`): blend as a Bayesian-ish update —
   `mastery = mastery + (score - mastery) * w` where `w = SCORE_EVENT_WEIGHT (0.35)` for
   the newest event, halved for each older event on the same topic (recency-weighted).
   Evidence rises by `min(1, evidence + 0.15)` per score event, capped at 1.
3. Events older than `EVENT_HORIZON_DAYS = 45` are ignored.

A deck with zero cards but events is now *measured* (evidence > 0) rather than
`UNMEASURED_MASTERY`; that is the point.

All constants exported. Pure and deterministic, as the file promises.

### 3.4 Evidence API and hook

- `api/learningEvents.ts`: `learningEventsApi.record(input)`, `fetchSince(days)`.
  `record` accepts `clientId` and swallows the unique-violation as success.
- `hooks/useLearningEvents.ts`: React Query, key `['learning_events']`, 45-day window.
- `hooks/useTrajectory.ts` and `lib/trajectoryJoin.ts` take `events` alongside
  `attempts`. Plan loader (`api/aiPlan.ts` / `views/plan/planTargets.ts`) gets the same.
- Offline: `record` goes through `offlineSync`'s queue when the network is down, keyed by
  `clientId`.

### 3.5 Timer → evidence

`TimerProvider`'s session-log path (where `sessionsApi.log` is called) also calls
`learningEventsApi.record({source:'timer', minutes, topic_key, deck_id?, folder_id,
clientId: localSession.guestSessionId ?? id})`. `prepareFocus` gains an optional
`deckId` so `NextHourCard.start()` can pass `top.topicId` (a deck id) through.
`activeDeckId` is added to the timer context next to `activeFolderId`.

### 3.6 Quick check (replaces the chat prompt)

New `components/quickcheck/QuickCheck.tsx` + `lib/quickCheck.ts`:

1. Build source text for the topic: front/back of up to 30 cards from the matched deck,
   plus the latest notes material in the same folder whose title loosely matches
   (first 2,000 chars). Fallback: `Topic: <label>` (what `generateQuizFromTopic` does).
2. `generateQuizQuestions(...)` — a new export in `api/aiQuiz.ts` that is
   `generateQuizFrom` without the `quizzesApi.add` persistence. `questionCount: 4`,
   difficulty `Medium`, `tool: 'quiz'`.
3. Inline runner (one question at a time, four choices, feedback after each), rendered
   inside the existing "Lock in what you learned" modal on `/timer` and inside the Today
   screen's session-complete panel.
4. On finish: `learningEventsApi.record({source:'quick_check', score, payload})`,
   invalidate `['learning_events']`, show "Enzymes: 3 → 4" using `renderGrade` on the
   before/after `scoreOf`-weighted topic mastery, then the new NextHour suggestion.

Signed-out users keep the current toast ("Create a free account…").

### 3.7 Today (replaces the dashboard)

`views/today/TodayView.tsx` mounted at `/`. `DashboardView` stays reachable at
`/dashboard` for one release (sidebar item removed; command palette entry "Full
dashboard" kept) and is deleted in a follow-up.

Order, no tabs, no Customize modal:

1. **Decision** — `NextHourCard` content restated as the page hero: topic, minutes, one
   sentence of reason (`atRisk` → "fading", else "biggest gain per hour"), projected
   range in the student's scale, one primary **Start** button, one text link "Why this?"
   → `/trajectory`. If `needsMaterial`: hero becomes "Add material for <exam> to get a
   next step" with a Create button. If no exam: "Add your next exam" → `/exams`.
   `mastery around N` copy is replaced by a level word (`masteryLevel()`:
   <0.35 "low", <0.65 "building", else "solid").
2. **Session complete** (conditional) — after a timer session logs, this slot shows the
   QuickCheck (3.6) in place, then the before/after line.
3. **Due today** — `TasksCard` (existing) with tasks due today/overdue only.
4. **Next exam** — `NextExamCard` (existing), readiness shown through `renderGrade` so
   it agrees with the hero's scale.
5. **Continue** — `RecentNotebooksShelf` + `ResumeLearningCard` (existing).
6. Footer link: "Everything else → Progress".

Copy: `TodayTimelineCard`'s "lectures, shifts and training" becomes goal-aware
("classes, practice and work" for `school`). `dashboardDate()` uses browser locale.

Mobile: single column; hero visible in first viewport at 375×812.

### 3.8 Life context sync

- Migration `20260916040000_profiles_life_context.sql`: `profiles.life_context jsonb`,
  `profiles.life_context_updated_at timestamptz`.
- `LifeContext` gains `updatedAt: string | null`. `saveLifeContext` stamps it.
- `importedIcs` / `importedLabel` / `importedAt` are **never** synced — the module
  promises the calendar never leaves the device. `toSyncableLifeContext()` strips them.
- `useLifeContext` gains a one-shot hydrate on auth: fetch `profiles.life_context`; if
  server `updatedAt` > local, replace local (minus ICS fields, which stay); else if local
  newer, push. `save()` pushes after writing locally (fire-and-forget, errors logged).
  Same pattern as `SettingsProvider`'s framework pins from #99.

### 3.9 AI tools → evidence

Minimal hooks, no UI change:

- Feynman: where the debrief's `understandingScore` is finalised → record
  `{source:'feynman', score, topic_key: session.concept, minutes: session duration}`.
- Sparring/Viva: where `overallScore` is finalised → record `{source:'viva', …}`.
- Solver (`aiDebugger.ts`): on a micro-repair marked correct → `{source:'solver', score:1}`.
- Detective (`aiExamDeconstructor.ts`): on a trap disarmed → `{source:'detective',
  score:1, topic_key: trap.topic}`.

Their localStorage session stores stay (drafts/UI), which is out of scope to migrate.

### 3.10 Copy and small fixes riding along

- `TopicValueHint.tsx:63` and `trajectory.ts:633`: "marks" → `fullCreditLabel`-aware
  "points"; the per-hour figure rendered as a comparison ("3× the value of Titration")
  instead of a raw number.
- `dashboard.module.css` tab strip: keep, but the dashboard is no longer the home.
- `DashboardView.tsx:51` test-mode tab override removed (tests set `initialTab`).

## 4. Data flow

```
Timer end ──► sessionsApi.log ──► learningEventsApi.record(timer)
                                          │
QuickCheck finish ─────────────────────────┤
Feynman/Viva/Solver/Detective ────────────┤
                                          ▼
                              learning_events (Supabase, RLS)
                                          │  useLearningEvents (45d)
useLifeContext ◄── profiles.life_context  │
      │                                   ▼
      └──────────► trajectoryJoin.buildForecast({decks, cards, attempts, events, life})
                                          │
                                          ▼
                       TodayView hero / NextHourCard / TrajectoryView / plan
```

## 5. Error handling

- Evidence writes never block the user action that produced them; failures log and
  enqueue for retry (offlineSync). A quick check whose record fails still shows the local
  before/after, computed from an optimistic in-memory event.
- Quiz generation failure (`QuizShapeError`, quota, network): modal shows the error with
  "Try again" and "Skip"; no event recorded.
- Life-context hydrate failure: silently keep local; retry on next auth change.
- Migration not yet applied (table missing): `learningEventsApi` catches the PostgREST
  404/42P01 and degrades to local-only for the session, logging once.

## 6. Testing

- `lib/trajectory.test.ts`: time events raise mastery and stability; score events blend
  with recency weighting; horizon; deck with events but no cards is measured; determinism.
- `lib/topicKey.test.ts`: normalisation and matching.
- `api/learningEvents.test.ts` (msw): record, idempotent replay, missing-table fallback.
- `hooks/useLifeContext.test.tsx`: hydrate newer-server / newer-local / ICS never leaves.
- `components/quickcheck/QuickCheck.test.tsx`: generates, scores, records, shows delta.
- `views/today/TodayView.test.tsx`: hero states (decision / needsMaterial / no exam);
  Start hands deck id to timer; session-complete slot; mobile snapshot of order.
- `TimerProvider.test`: logging a session records a timer event with the deck id.
- Existing suites updated where `TopicSources` / `ForecastSources` gained `events`.

## 7. Delivery

Five PR-sized slices on one branch, in order; each green on `tsc -b`, vitest, oxlint:

1. Schema + API + engine (3.1–3.4, tests).
2. Timer → evidence + QuickCheck (3.5–3.6).
3. Today view (3.7) + copy fixes (3.10).
4. Life-context sync (3.8).
5. AI tools → evidence (3.9).

Ops note for the PR: apply two migrations; no new secrets.
