# Close the Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make timed study, quick checks and the AI tools count as evidence in the trajectory forecast, sync that evidence (and the student's week) across devices, and put the resulting "study X next" decision on a new *Today* home screen.

**Architecture:** One new Supabase table `learning_events` is the account-scoped evidence stream. `lib/trajectory.ts#buildTopicStates` gains an `events` input and blends time and score events into per-deck mastery. `sessionsApi.log` and the AI tools append events. A new `views/today/TodayView` at `/` renders the decision, a grounded in-place quick check after a session, and the delta. `profiles.life_context` mirrors the localStorage week with last-write-wins.

**Tech Stack:** React 19, TypeScript, React Router 8, TanStack Query 5, Supabase (PostgREST + RLS), Vitest + Testing Library + msw, CSS modules. Commands run from `webapp/`.

**Spec:** `docs/superpowers/specs/2026-09-16-close-the-loop-design.md`

## Global Constraints

- All commands run in `webapp/`. Verify each task with `npx tsc -b && npx vitest run <files> && npx oxlint` before committing; run the full `npx vitest run` at the end of Tasks 3, 6, 8 and 11.
- msw runs with `onUnhandledRequest: "error"` (`src/test/setup.ts`). Any new REST path (`learning_events`) needs default handlers in `src/test/mocks/handlers.ts` in the same task that first calls it.
- Never sync `importedIcs`, `importedLabel`, `importedAt` from `LifeContext` to the server (`lib/lifeContext.ts:134-140` promises the calendar never leaves the device).
- Evidence writes never block or fail the user action that produced them: catch, `console.warn`, continue.
- `lib/trajectory.ts` stays pure and deterministic; every new constant is exported.
- Copy: no "marks". Use "points" or `getFramework().fullCreditLabel` where a label is needed.
- Commit after every task with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` as the last line of the message.
- Do not read `archive/` (CLAUDE.md).

---

## File map

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260916030000_learning_events.sql` | Table, indexes, RLS |
| `supabase/migrations/20260916040000_profiles_life_context.sql` | `profiles.life_context`, `life_context_updated_at` |
| `webapp/src/api/types.ts` | `LearningEvent`, `LearningEventSource` |
| `webapp/src/api/learningEvents.ts` | `learningEventsApi.record / fetchSince` |
| `webapp/src/hooks/useLearningEvents.ts` | React Query hook, key `["learning_events"]` |
| `webapp/src/lib/topicKey.ts` | `normaliseTopicKey`, `topicMatches` |
| `webapp/src/lib/trajectory.ts` | `events` input, blending, `masteryLevel` |
| `webapp/src/lib/trajectoryJoin.ts`, `hooks/useTrajectory.ts`, `api/aiPlan.ts` | pass `events` through |
| `webapp/src/api/sessions.ts`, `context/TimerProvider.tsx`, `context/timer.ts` | timer → evidence, `activeDeckId` |
| `webapp/src/api/aiQuiz.ts` | `generateQuizQuestions` (no persistence) |
| `webapp/src/lib/quickCheck.ts` | build source text; score answers |
| `webapp/src/components/quickcheck/QuickCheck.tsx` (+ `.module.css`) | inline 4-question runner |
| `webapp/src/views/today/TodayView.tsx` (+ `today.module.css`, `TodayHero.tsx`, `SessionCompletePanel.tsx`) | new home |
| `webapp/src/routes.tsx`, `lib/sectionLabel.ts`, `components/Sidebar.tsx`, `components/command/CommandPalette.tsx` | mount `/` → Today, `/dashboard` → old view |
| `webapp/src/views/timer/TimerView.tsx`, `TopicValueHint.tsx` | QuickCheck in modal; copy |
| `webapp/src/views/dashboard/NextHourCard.tsx`, `TodayTimelineCard.tsx`, `DashboardView.tsx` | copy + test-mode removal |
| `webapp/src/api/profile.ts`, `lib/lifeContext.ts`, `hooks/useLifeContext.ts` | life-context sync |
| `webapp/src/api/aiFeynman.ts`, `aiSparring.ts`, `aiDebugger.ts`, `aiExamDeconstructor.ts` | AI tools → evidence |

---

### Task 1: Schema, types and `learningEventsApi`

**Files:**
- Create: `supabase/migrations/20260916030000_learning_events.sql`
- Create: `webapp/src/api/learningEvents.ts`
- Create: `webapp/src/api/learningEvents.test.ts`
- Modify: `webapp/src/api/types.ts` (append after `WeakTopic`, ~line 148)
- Modify: `webapp/src/test/mocks/handlers.ts` (add default handlers)

**Interfaces:**
- Produces:
  ```ts
  export type LearningEventSource = "timer" | "quick_check" | "feynman" | "viva" | "solver" | "detective";
  export interface LearningEvent { id: string; user_id: string; topic_key: string; deck_id: string | null; folder_id: string | null; source: LearningEventSource; score: number | null; minutes: number; occurred_at: string; payload: Record<string, unknown>; client_id: string | null; }
  export interface RecordLearningEventInput { topicKey: string; source: LearningEventSource; score?: number | null; minutes?: number; deckId?: string | null; folderId?: string | null; payload?: Record<string, unknown>; clientId?: string | null; occurredAt?: string; }
  learningEventsApi.record(input: RecordLearningEventInput): Promise<void>
  learningEventsApi.fetchSince(daysBack?: number): Promise<LearningEvent[]>
  ```

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260916030000_learning_events.sql
-- One account-scoped evidence stream for everything that tells the trajectory
-- model what a student knows: timed study, quick checks, Feynman, Viva,
-- Solver and Detective outcomes. Replaces the per-tool localStorage silos for
-- outcomes so the forecast is the same on every device.

create table if not exists public.learning_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  topic_key    text not null,
  deck_id      uuid references public.flashcard_decks(id) on delete set null,
  folder_id    uuid references public.folders(id) on delete set null,
  source       text not null check (source in ('timer','quick_check','feynman','viva','solver','detective')),
  score        real check (score is null or (score >= 0 and score <= 1)),
  minutes      int  not null default 0 check (minutes >= 0),
  occurred_at  timestamptz not null default now(),
  payload      jsonb not null default '{}'::jsonb,
  client_id    text
);

create unique index if not exists learning_events_client_id_idx
  on public.learning_events (user_id, client_id) where client_id is not null;
create index if not exists learning_events_user_occurred_idx
  on public.learning_events (user_id, occurred_at desc);

alter table public.learning_events enable row level security;

drop policy if exists "learning_events_select_own" on public.learning_events;
create policy "learning_events_select_own" on public.learning_events
  for select using (auth.uid() = user_id);
drop policy if exists "learning_events_insert_own" on public.learning_events;
create policy "learning_events_insert_own" on public.learning_events
  for insert with check (auth.uid() = user_id);
drop policy if exists "learning_events_delete_own" on public.learning_events;
create policy "learning_events_delete_own" on public.learning_events
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 2: Add the types** to `webapp/src/api/types.ts` after the `WeakTopic` interface:

```ts
/* Learning events — the evidence stream behind the trajectory forecast.
 * `score` is an outcome in 0–1 (null for a pure time event); `minutes` is
 * time spent. See supabase/migrations/20260916030000_learning_events.sql. */
export type LearningEventSource =
  | "timer"
  | "quick_check"
  | "feynman"
  | "viva"
  | "solver"
  | "detective";

export interface LearningEvent {
  id: string;
  user_id: string;
  topic_key: string;
  deck_id: string | null;
  folder_id: string | null;
  source: LearningEventSource;
  score: number | null;
  minutes: number;
  occurred_at: string;
  payload: Record<string, unknown>;
  client_id: string | null;
}
```

- [ ] **Step 3: Write the failing API test** `webapp/src/api/learningEvents.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession, mockNoAuthSession } from "../test/mockSession";
import { learningEventsApi } from "./learningEvents";

const url = `${SUPABASE_URL}/rest/v1/learning_events`;

describe("learningEventsApi", () => {
  beforeEach(() => mockAuthSession("user-1"));
  afterEach(() => vi.restoreAllMocks());

  it("records an event scoped to the user with defaults filled", async () => {
    let body: Record<string, unknown>[] | undefined;
    server.use(
      http.post(url, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json(null, { status: 201 });
      }),
    );
    await learningEventsApi.record({
      topicKey: "enzymes",
      source: "timer",
      minutes: 45,
      deckId: "deck-1",
      clientId: "c-1",
    });
    expect(body?.[0]).toMatchObject({
      user_id: "user-1",
      topic_key: "enzymes",
      source: "timer",
      minutes: 45,
      score: null,
      deck_id: "deck-1",
      folder_id: null,
      client_id: "c-1",
      payload: {},
    });
  });

  it("treats a duplicate client_id as success", async () => {
    server.use(
      http.post(url, () =>
        HttpResponse.json(
          { code: "23505", message: "duplicate key value" },
          { status: 409 },
        ),
      ),
    );
    await expect(
      learningEventsApi.record({ topicKey: "x", source: "timer", clientId: "c" }),
    ).resolves.toBeUndefined();
  });

  it("rejects a score outside 0-1 before sending", async () => {
    await expect(
      learningEventsApi.record({ topicKey: "x", source: "viva", score: 1.4 }),
    ).rejects.toThrow(/score/);
  });

  it("fetches the recent window scoped to the user, newest first", async () => {
    let captured: URL | undefined;
    server.use(
      http.get(url, ({ request }) => {
        captured = new URL(request.url);
        return HttpResponse.json([]);
      }),
    );
    await learningEventsApi.fetchSince(45);
    expect(captured?.searchParams.get("user_id")).toBe("eq.user-1");
    expect(captured?.searchParams.get("order")).toBe("occurred_at.desc");
    expect(captured?.searchParams.get("occurred_at")).toMatch(/^gte\./);
  });

  it("returns [] when the table is missing (migration not applied)", async () => {
    server.use(
      http.get(url, () =>
        HttpResponse.json(
          { code: "42P01", message: "relation does not exist" },
          { status: 404 },
        ),
      ),
    );
    await expect(learningEventsApi.fetchSince()).resolves.toEqual([]);
  });

  it("throws without a session", async () => {
    mockNoAuthSession();
    await expect(learningEventsApi.fetchSince()).rejects.toThrow("Not authenticated");
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `npx vitest run src/api/learningEvents.test.ts`
Expected: FAIL — cannot resolve `./learningEvents`.

- [ ] **Step 5: Implement `webapp/src/api/learningEvents.ts`**

```ts
import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { LearningEvent, LearningEventSource } from "./types";

export interface RecordLearningEventInput {
  topicKey: string;
  source: LearningEventSource;
  /** 0–1 outcome; omit or null for a pure time event. */
  score?: number | null;
  minutes?: number;
  deckId?: string | null;
  folderId?: string | null;
  payload?: Record<string, unknown>;
  /** Idempotency key: a replayed insert with the same key is a no-op. */
  clientId?: string | null;
  occurredAt?: string;
}

/** Days of evidence the forecast reads. Older events are ignored by
 *  `buildTopicStates` anyway, so fetching more is wasted bytes. */
export const LEARNING_EVENT_WINDOW_DAYS = 45;

/* PostgREST surfaces a missing relation as 404 with code 42P01. The table is
 * new; a deployment that has not applied the migration yet should degrade
 * to "no evidence", not break every screen that forecasts. */
function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || /does not exist/i.test(error.message ?? "");
}

export const learningEventsApi = {
  async record(input: RecordLearningEventInput): Promise<void> {
    if (input.score != null && (input.score < 0 || input.score > 1)) {
      throw new Error(`learning event score must be 0–1, got ${input.score}`);
    }
    const userId = await requireUserId();
    const { error } = await supabase.from("learning_events").insert([
      {
        user_id: userId,
        topic_key: input.topicKey,
        deck_id: input.deckId ?? null,
        folder_id: input.folderId ?? null,
        source: input.source,
        score: input.score ?? null,
        minutes: Math.max(0, Math.round(input.minutes ?? 0)),
        occurred_at: input.occurredAt ?? new Date().toISOString(),
        payload: input.payload ?? {},
        client_id: input.clientId ?? null,
      },
    ]);
    if (!error) return;
    if (error.code === "23505") return; // replayed client_id — already recorded
    if (isMissingTable(error)) {
      console.warn("[learningEvents] table missing; event dropped:", error.message);
      return;
    }
    throw new Error(error.message);
  },

  async fetchSince(daysBack = LEARNING_EVENT_WINDOW_DAYS): Promise<LearningEvent[]> {
    const userId = await requireUserId();
    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    const { data, error } = await supabase
      .from("learning_events")
      .select("*")
      .eq("user_id", userId)
      .gte("occurred_at", since.toISOString())
      .order("occurred_at", { ascending: false });
    if (error) {
      if (isMissingTable(error)) return [];
      throw new Error(error.message);
    }
    return data ?? [];
  },
};
```

- [ ] **Step 6: Add default msw handlers** in `webapp/src/test/mocks/handlers.ts`, next to the `study_sessions` handlers (~line 118):

```ts
  http.get(rest("learning_events"), () => HttpResponse.json([])),
  http.post(rest("learning_events"), () => HttpResponse.json(null, { status: 201 })),
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npx tsc -b && npx vitest run src/api/learningEvents.test.ts && npx oxlint`
Expected: PASS, 6 tests.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260916030000_learning_events.sql webapp/src/api/learningEvents.ts webapp/src/api/learningEvents.test.ts webapp/src/api/types.ts webapp/src/test/mocks/handlers.ts
git commit -m "feat(evidence): learning_events table and API

One account-scoped evidence stream for the trajectory model. Idempotent
on client_id; degrades to no-evidence when the migration is not applied.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `lib/topicKey.ts`

**Files:**
- Create: `webapp/src/lib/topicKey.ts`
- Create: `webapp/src/lib/topicKey.test.ts`

**Interfaces:**
- Produces: `normaliseTopicKey(label: string): string`, `topicMatches(a: string, b: string): boolean`

- [ ] **Step 1: Failing test** `webapp/src/lib/topicKey.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { normaliseTopicKey, topicMatches } from "./topicKey";

describe("normaliseTopicKey", () => {
  it("lowercases, trims, collapses whitespace and strips punctuation", () => {
    expect(normaliseTopicKey("  Enzymes &  Kinetics! ")).toBe("enzymes kinetics");
    expect(normaliseTopicKey("Titration (acids/bases)")).toBe("titration acids bases");
  });
  it("returns an empty string for nothing useful", () => {
    expect(normaliseTopicKey("  --  ")).toBe("");
  });
});

describe("topicMatches", () => {
  it("matches equal keys and containment either way", () => {
    expect(topicMatches("Enzymes", "enzymes")).toBe(true);
    expect(topicMatches("AP Bio: Enzymes", "Enzymes")).toBe(true);
    expect(topicMatches("Enzymes", "Enzyme kinetics and rates")).toBe(true);
  });
  it("does not match unrelated or empty topics", () => {
    expect(topicMatches("Enzymes", "Titration")).toBe(false);
    expect(topicMatches("", "Titration")).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/topicKey.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement** `webapp/src/lib/topicKey.ts`

```ts
/* Topic identity across the app.
 *
 * A topic is a deck title in the trajectory model, a free-text task on the
 * timer, a concept in Feynman, a subject in Viva. None of those agree on
 * capitalisation or punctuation, and they never will, so evidence is keyed by
 * a normalised form and matched loosely — the same `includes` rule
 * `buildTopicStates` already uses for quiz weak-topics. */

export function normaliseTopicKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when either normalised key contains the other. Empty never matches. */
export function topicMatches(a: string, b: string): boolean {
  const ka = normaliseTopicKey(a);
  const kb = normaliseTopicKey(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}
```

- [ ] **Step 4: Run** the test — PASS. `npx tsc -b && npx oxlint`.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/topicKey.ts webapp/src/lib/topicKey.test.ts
git commit -m "feat(evidence): topic key normalisation and loose matching

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Engine — events feed `buildTopicStates`

**Files:**
- Modify: `webapp/src/lib/trajectory.ts` (`TopicSources` ~line 177, `buildTopicStates` ~195–268, constants block ~40–90)
- Modify: `webapp/src/lib/trajectory.test.ts`
- Modify: `webapp/src/lib/trajectoryJoin.ts` (`ForecastSources` ~line 40, `buildTopicStates` call ~118)
- Modify: `webapp/src/hooks/useTrajectory.ts`
- Modify: `webapp/src/api/aiPlan.ts` (~388–405)
- Create: `webapp/src/hooks/useLearningEvents.ts`

**Interfaces:**
- Consumes: `LearningEvent` (Task 1), `topicMatches` (Task 2)
- Produces:
  - `TopicSources.events?: LearningEvent[]` (optional so existing callers compile)
  - `ForecastSources.events?: LearningEvent[]`
  - `export const EVENT_HORIZON_DAYS = 45`, `SCORE_EVENT_WEIGHT = 0.35`, `SCORE_EVENT_EVIDENCE = 0.15`
  - `export function masteryLevel(mastery: number): "low" | "building" | "solid"`
  - `useLearningEvents(): UseQueryResult<LearningEvent[]>`

- [ ] **Step 1: Failing tests** — append to `webapp/src/lib/trajectory.test.ts` (reuse its `deck`/`card` helpers and `TODAY`):

```ts
import type { LearningEvent } from "../api/types";
import { EVENT_HORIZON_DAYS, SCORE_EVENT_WEIGHT, masteryLevel } from "./trajectory";

function event(patch: Partial<LearningEvent> & { topic_key: string }): LearningEvent {
  return {
    id: `e-${Math.random()}`,
    user_id: "u1",
    deck_id: null,
    folder_id: null,
    source: "timer",
    score: null,
    minutes: 0,
    occurred_at: `${TODAY}T10:00:00Z`,
    payload: {},
    client_id: null,
    ...patch,
  };
}

describe("buildTopicStates with learning events", () => {
  const now = new Date(`${TODAY}T12:00:00Z`);

  it("a timer event raises mastery and stability on the matching deck", () => {
    const decks = [deck({ id: "d1", title: "Enzymes" })];
    const cards = [card({ id: "c1", deck_id: "d1", srs_interval: 5 })];
    const before = buildTopicStates({ decks, cards, attempts: [], now })[0];
    const after = buildTopicStates({
      decks, cards, attempts: [], now,
      events: [event({ topic_key: "enzymes", minutes: 60 })],
    })[0];
    expect(after.mastery).toBeGreaterThan(before.mastery);
    expect(after.stabilityDays).toBeGreaterThan(before.stabilityDays);
  });

  it("matches by deck_id before topic_key", () => {
    const decks = [deck({ id: "d1", title: "Enzymes" }), deck({ id: "d2", title: "Titration" })];
    const cards = [card({ id: "c1", deck_id: "d1" }), card({ id: "c2", deck_id: "d2" })];
    const states = buildTopicStates({
      decks, cards, attempts: [], now,
      events: [event({ topic_key: "something else", deck_id: "d2", minutes: 60 })],
    });
    const base = buildTopicStates({ decks, cards, attempts: [], now });
    expect(states[1].mastery).toBeGreaterThan(base[1].mastery);
    expect(states[0].mastery).toBe(base[0].mastery);
  });

  it("a score event pulls mastery toward the score by SCORE_EVENT_WEIGHT", () => {
    const decks = [deck({ id: "d1", title: "Enzymes" })];
    const cards = [card({ id: "c1", deck_id: "d1" })];
    const base = buildTopicStates({ decks, cards, attempts: [], now })[0].mastery;
    const after = buildTopicStates({
      decks, cards, attempts: [], now,
      events: [event({ topic_key: "enzymes", source: "quick_check", score: 1 })],
    })[0].mastery;
    expect(after).toBeCloseTo(base + (1 - base) * SCORE_EVENT_WEIGHT, 5);
  });

  it("older score events count half as much as the newest", () => {
    const decks = [deck({ id: "d1", title: "Enzymes" })];
    const cards = [card({ id: "c1", deck_id: "d1" })];
    const one = buildTopicStates({
      decks, cards, attempts: [], now,
      events: [event({ topic_key: "enzymes", source: "viva", score: 1, occurred_at: `${TODAY}T11:00:00Z` })],
    })[0].mastery;
    const two = buildTopicStates({
      decks, cards, attempts: [], now,
      events: [
        event({ topic_key: "enzymes", source: "viva", score: 1, occurred_at: `${TODAY}T11:00:00Z` }),
        event({ topic_key: "enzymes", source: "viva", score: 1, occurred_at: `${TODAY}T09:00:00Z` }),
      ],
    })[0].mastery;
    expect(two).toBeGreaterThan(one);
    expect(two - one).toBeLessThan(one - buildTopicStates({ decks, cards, attempts: [], now })[0].mastery);
  });

  it("a deck with events but no cards becomes measured", () => {
    const decks = [deck({ id: "d1", title: "Enzymes" })];
    const state = buildTopicStates({
      decks, cards: [], attempts: [], now,
      events: [event({ topic_key: "enzymes", source: "quick_check", score: 0.75 })],
    })[0];
    expect(state.evidence).toBeGreaterThan(0);
    expect(state.mastery).not.toBe(UNMEASURED_MASTERY);
  });

  it("ignores events beyond the horizon", () => {
    const decks = [deck({ id: "d1", title: "Enzymes" })];
    const cards = [card({ id: "c1", deck_id: "d1" })];
    const stale = new Date(now.getTime() - (EVENT_HORIZON_DAYS + 1) * 86_400_000).toISOString();
    const base = buildTopicStates({ decks, cards, attempts: [], now })[0];
    const after = buildTopicStates({
      decks, cards, attempts: [], now,
      events: [event({ topic_key: "enzymes", score: 1, source: "viva", occurred_at: stale })],
    })[0];
    expect(after.mastery).toBe(base.mastery);
  });

  it("is deterministic", () => {
    const decks = [deck({ id: "d1", title: "Enzymes" })];
    const cards = [card({ id: "c1", deck_id: "d1" })];
    const events = [event({ topic_key: "enzymes", minutes: 30 }), event({ topic_key: "enzymes", source: "viva", score: 0.6 })];
    const a = buildTopicStates({ decks, cards, attempts: [], now, events });
    const b = buildTopicStates({ decks, cards, attempts: [], now, events });
    expect(a).toEqual(b);
  });
});

describe("masteryLevel", () => {
  it("buckets mastery into three words", () => {
    expect(masteryLevel(0.1)).toBe("low");
    expect(masteryLevel(0.5)).toBe("building");
    expect(masteryLevel(0.8)).toBe("solid");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/trajectory.test.ts` — FAIL (missing exports / `events` ignored).

- [ ] **Step 3: Implement in `webapp/src/lib/trajectory.ts`**

Add imports at the top:

```ts
import type { Flashcard, FlashcardDeck, LearningEvent, QuizAttempt } from "../api/types";
import { topicMatches } from "./topicKey";
```

Add to the constants block:

```ts
/** Evidence older than this is ignored: what a student knew six weeks ago is
 *  not what they know now, and the SRS state already carries the durable
 *  part of it. */
export const EVENT_HORIZON_DAYS = 45;
/** How far one scored outcome (a quick check, a Viva round) pulls mastery
 *  toward the score. The newest event on a topic carries this weight; each
 *  older one carries half of the one before it. */
export const SCORE_EVENT_WEIGHT = 0.35;
/** Evidence gained per scored outcome. Four checks on a topic with no cards
 *  is enough to trust the number more than a fresh deck of twenty. */
export const SCORE_EVENT_EVIDENCE = 0.15;
```

Extend `TopicSources`:

```ts
  /** Outcomes and time from the timer, quick checks and the AI tools. Optional
   *  so a caller that has not fetched them still gets the card-only forecast. */
  events?: LearningEvent[];
```

Add a helper above `buildTopicStates`:

```ts
/** Events that belong to a deck: by id when the recorder knew it, else by the
 *  same loose title match quiz weak-topics use. Newest first. */
function eventsForDeck(
  deck: FlashcardDeck,
  events: LearningEvent[],
): LearningEvent[] {
  return events
    .filter((e) =>
      e.deck_id ? e.deck_id === deck.id : topicMatches(e.topic_key, deck.title),
    )
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

/** Fold a deck's events into the card-derived state. Time events apply
 *  `learningGain` and then decay for the days since; score events blend
 *  toward the score with recency-halved weights. */
function applyEvents(
  base: { mastery: number; evidence: number; stabilityDays: number },
  events: LearningEvent[],
  now: Date,
): { mastery: number; evidence: number; stabilityDays: number } {
  let { mastery, evidence, stabilityDays } = base;
  const horizon = now.getTime() - EVENT_HORIZON_DAYS * 86_400_000;
  const live = events.filter((e) => new Date(e.occurred_at).getTime() >= horizon);

  /* Time first, oldest first, so a later check measures the studied state. */
  for (const e of [...live].reverse()) {
    if (e.minutes <= 0) continue;
    const daysAgo = Math.max(
      0,
      Math.floor((now.getTime() - new Date(e.occurred_at).getTime()) / 86_400_000),
    );
    let gain = learningGain(mastery, e.minutes);
    for (let d = 0; d < daysAgo; d++) gain = decayOneDay(gain, stabilityDays);
    mastery = Math.min(1, mastery + gain);
    stabilityDays += STABILITY_DAYS_PER_HOUR * (e.minutes / 60);
  }

  let weight = SCORE_EVENT_WEIGHT;
  for (const e of live) {
    if (e.score == null) continue;
    mastery = mastery + (e.score - mastery) * weight;
    evidence = Math.min(1, evidence + SCORE_EVENT_EVIDENCE);
    weight /= 2;
  }

  return {
    mastery: Math.max(0, Math.min(1, mastery)),
    evidence,
    stabilityDays: Math.max(MIN_STABILITY_DAYS, stabilityDays),
  };
}
```

In `buildTopicStates`, change the `raw = decks.map(...)` body so both branches pass through `applyEvents`:

```ts
  const events = src.events ?? [];
  const raw = decks.map((deck) => {
    const cards = src.cards.filter((c) => c.deck_id === deck.id);
    const cardCount = cards.length;
    const deckEvents = eventsForDeck(deck, events);

    if (cardCount === 0) {
      const blended = applyEvents(
        { mastery: UNMEASURED_MASTERY, evidence: 0, stabilityDays: MIN_STABILITY_DAYS },
        deckEvents,
        now,
      );
      return { id: deck.id, label: deck.title, ...blended, weight: 1, cardCount: 0 };
    }

    const retention = /* unchanged */;
    const evidence = /* unchanged */;
    const stabilityDays = /* unchanged */;
    const penalty = Math.min(0.3, weaknessFor(deck.title) * 0.06);

    const blended = applyEvents(
      {
        mastery: Math.max(0, Math.min(1, retention - penalty)),
        evidence: Math.min(1, evidence * 0.7 + Math.min(1, cardCount / 20) * 0.3),
        stabilityDays: Math.max(MIN_STABILITY_DAYS, stabilityDays),
      },
      deckEvents,
      now,
    );

    return {
      id: deck.id,
      label: deck.title,
      ...blended,
      weight: Math.sqrt(cardCount) || 1,
      cardCount,
    };
  });
```

(Keep the existing `retention`/`evidence`/`stabilityDays` expressions verbatim where the comment says "unchanged".)

Add near `scoreOf`:

```ts
/** The word a student reads instead of a mastery decimal. A mastery is not a
 *  grade, so it is never rendered through the grade scale. */
export function masteryLevel(mastery: number): "low" | "building" | "solid" {
  if (mastery < 0.35) return "low";
  if (mastery < 0.65) return "building";
  return "solid";
}
```

- [ ] **Step 4: Thread events through the join and the hook**

`webapp/src/lib/trajectoryJoin.ts`: add `events?: LearningEvent[]` to `ForecastSources` (import the type), and pass `events: src.events ?? []` into the `buildTopicStates` call.

Create `webapp/src/hooks/useLearningEvents.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { learningEventsApi } from "../api/learningEvents";

export const learningEventsKeys = { all: ["learning_events"] as const };

/** The recent evidence window the forecast reads. Invalidate `all` after
 *  recording an event so every forecast on screen recomputes. */
export function useLearningEvents() {
  return useQuery({
    queryKey: learningEventsKeys.all,
    queryFn: () => learningEventsApi.fetchSince(),
  });
}
```

`webapp/src/hooks/useTrajectory.ts`: import and call `useLearningEvents()`, include `events.isPending` in `anyPending`, pass `events: events.data ?? []` to `buildForecast`, add `events.data` to the `useMemo` deps.

`webapp/src/api/aiPlan.ts` (~388): add `learningEventsApi.fetchSince()` to the `Promise.all` and pass `events` into `buildForecast`.

- [ ] **Step 5: Run** `npx tsc -b && npx vitest run src/lib src/hooks/useTrajectory src/api/aiPlan && npx oxlint` — PASS. Fix any test that constructs `TopicSources`/`ForecastSources` (optional field, so none should break).

- [ ] **Step 6: Full suite** `npx vitest run` — PASS.

- [ ] **Step 7: Commit**

```bash
git add webapp/src/lib/trajectory.ts webapp/src/lib/trajectory.test.ts webapp/src/lib/trajectoryJoin.ts webapp/src/hooks/useTrajectory.ts webapp/src/hooks/useLearningEvents.ts webapp/src/api/aiPlan.ts
git commit -m "feat(trajectory): learning events raise mastery, stability and evidence

Timed study applies learningGain and decays for the days since; scored
outcomes blend toward the score with recency-halved weights. A deck with
events and no cards is now measured rather than assumed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Timer → evidence

**Files:**
- Modify: `webapp/src/api/sessions.ts` (`LogSessionInput`, `log`)
- Modify: `webapp/src/api/sessions.test.ts` (create if absent, pattern of `tasks.test.ts`)
- Modify: `webapp/src/context/timer.ts` (`prepareFocus` signature ~line 38, add `activeDeckId`)
- Modify: `webapp/src/context/TimerProvider.tsx` (`prepareFocus` ~385, session log ~100–120)
- Modify: `webapp/src/views/dashboard/NextHourCard.tsx:42-45`
- Modify: `webapp/src/views/dashboard/NextHourCard.test.tsx` (assert deck id passed)
- Modify: `webapp/src/lib/offlineSync.ts` (no change needed — `logSession` replays `sessionsApi.log`, which now records the event with the same `clientId`)

**Interfaces:**
- Produces:
  - `LogSessionInput` gains `deckId?: string | null; topicLabel?: string | null; clientId?: string | null;`
  - `prepareFocus(mins: number, task?: string, folderId?: string | null, deckId?: string | null)`
  - `TimerContextValue.activeDeckId: string | null`, `setActiveDeckId(id: string | null)`

- [ ] **Step 1: Failing API test** — in `webapp/src/api/sessions.test.ts` (create with the same imports as `tasks.test.ts`):

```ts
it("records a timer learning event after logging the session", async () => {
  let eventBody: Record<string, unknown>[] | undefined;
  server.use(
    http.post(`${SUPABASE_URL}/rest/v1/study_sessions`, () =>
      HttpResponse.json(null, { status: 201 }),
    ),
    http.post(`${SUPABASE_URL}/rest/v1/learning_events`, async ({ request }) => {
      eventBody = (await request.json()) as Record<string, unknown>[];
      return HttpResponse.json(null, { status: 201 });
    }),
  );
  await sessionsApi.log({
    minutes: 45,
    task: "Enzymes",
    folderId: "folder-1",
    deckId: "deck-1",
    clientId: "sess-1",
  });
  expect(eventBody?.[0]).toMatchObject({
    source: "timer",
    minutes: 45,
    topic_key: "enzymes",
    deck_id: "deck-1",
    folder_id: "folder-1",
    client_id: "sess-1",
  });
});

it("does not record an event for a session with no task", async () => {
  let hit = false;
  server.use(
    http.post(`${SUPABASE_URL}/rest/v1/learning_events`, () => {
      hit = true;
      return HttpResponse.json(null, { status: 201 });
    }),
  );
  await sessionsApi.log({ minutes: 25, task: null });
  expect(hit).toBe(false);
});

it("still resolves when the event write fails", async () => {
  server.use(
    http.post(`${SUPABASE_URL}/rest/v1/learning_events`, () =>
      HttpResponse.json({ message: "boom" }, { status: 500 }),
    ),
  );
  await expect(sessionsApi.log({ minutes: 25, task: "Enzymes" })).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run** `npx vitest run src/api/sessions.test.ts` — FAIL.

- [ ] **Step 3: Implement** in `webapp/src/api/sessions.ts`

```ts
import { learningEventsApi } from "./learningEvents";
import { normaliseTopicKey } from "../lib/topicKey";

export interface LogSessionInput {
  minutes: number;
  task?: string | null;
  folderId?: string | null;
  timerType?: string | null;
  notes?: string | null;
  /** The deck the session was started for (NextHour hands this over). */
  deckId?: string | null;
  /** Idempotency key shared by the session and its learning event, so an
   *  offline replay cannot double-count the hour. */
  clientId?: string | null;
}
```

At the end of `log`, after the insert succeeds:

```ts
    /* The hour counts as evidence. Failure here must not fail the session
       log — the row is already in; the forecast merely misses one hour. */
    const topic = (task ?? "").trim();
    if (topic && topic !== "None") {
      try {
        await learningEventsApi.record({
          topicKey: normaliseTopicKey(topic),
          source: "timer",
          minutes,
          deckId: deckId ?? null,
          folderId,
          clientId: clientId ?? null,
          payload: { task: topic, timerType },
        });
      } catch (err) {
        console.warn("[sessions] learning event not recorded:", err);
      }
    }
```

(Add `deckId = null, clientId = null` to the destructured parameters.)

- [ ] **Step 4: Timer context** — in `webapp/src/context/timer.ts` change the `prepareFocus` type to `(mins: number, task?: string, folderId?: string | null, deckId?: string | null) => void` and add `activeDeckId: string | null; setActiveDeckId: (id: string | null) => void;`. In `TimerProvider.tsx`: add `const [activeDeckId, setActiveDeckId] = useState<string | null>(null);`, set it in `prepareFocus` when `deckId !== undefined`, include both in the context value and its `useMemo` deps; in the session-log path (~line 110) pass `deckId: activeDeckId, clientId: crypto.randomUUID()` to both the local log input (ignore there) and `logSession.mutate({...})`; reset `setActiveDeckId(null)` alongside the note reset. Check `useStudyRoom.test.ts`'s `createTimerApi` stub and add the two new fields.

- [ ] **Step 5: NextHourCard** — `start` becomes `prepareFocus(INTERVENTION_BLOCK_MINS, top.label, undefined, top.topicId)`. In `NextHourCard.test.tsx` find the test that asserts `prepareFocus` was called and extend the expectation to `toHaveBeenCalledWith(45, "Titration", undefined, "topic-1")`.

- [ ] **Step 6: Run** `npx tsc -b && npx vitest run src/api/sessions src/context src/views/dashboard/NextHourCard src/hooks/useStudyRoom && npx oxlint` — PASS.

- [ ] **Step 7: Commit**

```bash
git add webapp/src/api/sessions.ts webapp/src/api/sessions.test.ts webapp/src/context/timer.ts webapp/src/context/TimerProvider.tsx webapp/src/views/dashboard/NextHourCard.tsx webapp/src/views/dashboard/NextHourCard.test.tsx webapp/src/hooks/useStudyRoom.test.ts
git commit -m "feat(timer): a logged session is evidence for its topic

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `generateQuizQuestions` and `lib/quickCheck.ts`

**Files:**
- Modify: `webapp/src/api/aiQuiz.ts` (split `generateQuizFrom` ~161–225)
- Modify: `webapp/src/api/aiQuiz.test.ts`
- Create: `webapp/src/lib/quickCheck.ts`, `webapp/src/lib/quickCheck.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // api/aiQuiz.ts
  export async function generateQuizQuestions(args: { sourceText: string; topic: string; settings: Settings; options?: QuizOptions }): Promise<QuizQuestion[]>
  // lib/quickCheck.ts
  export const QUICK_CHECK_QUESTIONS = 4;
  export function buildQuickCheckSource(args: { topic: string; cards: Flashcard[]; decks: FlashcardDeck[]; materials: Material[] }): { sourceText: string; deckId: string | null }
  export function scoreQuickCheck(questions: QuizQuestion[], answers: Array<number | null>): { correct: number; total: number; score: number }
  ```

- [ ] **Step 1: Failing tests**

Append to `webapp/src/api/aiQuiz.test.ts` (follow its existing mocking of `callEdge`):

```ts
it("generateQuizQuestions returns parsed questions without saving a quiz", async () => {
  // mock callEdge to return a JSON array of 2 questions, mock quizzesApi.add to throw if called
  const questions = await generateQuizQuestions({
    sourceText: "Topic: Enzymes",
    topic: "Enzymes",
    settings,
    options: { questionCount: 2 },
  });
  expect(questions).toHaveLength(2);
  expect(addSpy).not.toHaveBeenCalled();
});
```

Create `webapp/src/lib/quickCheck.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildQuickCheckSource, scoreQuickCheck } from "./quickCheck";
import type { Flashcard, FlashcardDeck, Material } from "../api/types";

const deck = { id: "d1", title: "Enzymes", folder_id: "f1" } as FlashcardDeck;
const cards = [
  { id: "c1", deck_id: "d1", front: "What is Km?", back: "Substrate conc at half Vmax" },
  { id: "c2", deck_id: "d1", front: "Competitive inhibitor?", back: "Binds active site" },
] as Flashcard[];

describe("buildQuickCheckSource", () => {
  it("uses the matched deck's cards and reports the deck id", () => {
    const { sourceText, deckId } = buildQuickCheckSource({ topic: "enzymes", cards, decks: [deck], materials: [] });
    expect(deckId).toBe("d1");
    expect(sourceText).toContain("What is Km?");
    expect(sourceText).toContain("Substrate conc at half Vmax");
  });
  it("adds a matching material's text, capped", () => {
    const material = { id: "m1", folder_id: "f1", title: "Enzyme kinetics notes", content: "x".repeat(5000) } as Material;
    const { sourceText } = buildQuickCheckSource({ topic: "Enzymes", cards, decks: [deck], materials: [material] });
    expect(sourceText.length).toBeLessThan(3500);
    expect(sourceText).toContain("Enzyme kinetics notes");
  });
  it("falls back to a bare topic line", () => {
    const { sourceText, deckId } = buildQuickCheckSource({ topic: "Titration", cards, decks: [deck], materials: [] });
    expect(sourceText).toBe("Topic: Titration");
    expect(deckId).toBeNull();
  });
});

describe("scoreQuickCheck", () => {
  it("counts correct answers and returns a 0-1 score", () => {
    const qs = [
      { question: "a", choices: ["x", "y"], correctIndex: 1 },
      { question: "b", choices: ["x", "y"], correctIndex: 0 },
    ];
    expect(scoreQuickCheck(qs, [1, 1])).toEqual({ correct: 1, total: 2, score: 0.5 });
    expect(scoreQuickCheck(qs, [null, null])).toEqual({ correct: 0, total: 2, score: 0 });
  });
});
```

Check `Material`'s content field name in `api/types.ts` (it may be `content`, `text` or `body`) and use the real one in both the test and the implementation.

- [ ] **Step 2: Run** both files — FAIL.

- [ ] **Step 3: Implement**

In `webapp/src/api/aiQuiz.ts`, extract the prompt+call+parse part of `generateQuizFrom` into:

```ts
/** Generate questions without saving a quiz. The quick check after a timer
 *  session wants four questions it will score itself and record as a learning
 *  event; a saved quiz row per session would litter the library. */
export async function generateQuizQuestions({
  sourceText,
  topic,
  settings,
  options = {},
}: {
  sourceText: string;
  topic: string;
  settings: Settings;
  options?: QuizOptions;
}): Promise<QuizQuestion[]> {
  let misconceptionFocus = "";
  try {
    misconceptionFocus = buildMisconceptionFocus(await misconceptionsApi.fetchAll(), topic);
  } catch (err) {
    console.warn("[quiz] Could not read misconception ledger:", err);
  }
  const { text } = await callEdge({
    history: [
      {
        role: "user",
        content: buildQuizPrompt({
          sourceText,
          topic,
          difficulty: options.difficulty ?? QUIZ_DEFAULTS.difficulty,
          personality: options.personality ?? AI_PERSONA_QUIZ_HOST[settings.aiPersona],
          count: options.questionCount ?? QUIZ_DEFAULTS.questionCount,
          misconceptionFocus,
        }),
      },
    ],
    mode: "quiz",
    tool: "quiz",
    settings,
  });
  const questions = extractQuizJSON(text);
  if (questions.length === 0) throw new QuizShapeError();
  return questions;
}
```

and make `generateQuizFrom` call it then `quizzesApi.add(...)`.

Create `webapp/src/lib/quickCheck.ts`:

```ts
import type { Flashcard, FlashcardDeck, Material } from "../api/types";
import type { QuizQuestion } from "./aiJson";
import { topicMatches } from "./topicKey";

export const QUICK_CHECK_QUESTIONS = 4;
const MAX_CARDS = 30;
const MAX_MATERIAL_CHARS = 2000;

/** Source text for a post-session check: the topic's own cards and, when one
 *  matches, the student's notes — so the questions are about what they
 *  studied, not what the model thinks the topic usually contains. */
export function buildQuickCheckSource({
  topic,
  cards,
  decks,
  materials,
}: {
  topic: string;
  cards: Flashcard[];
  decks: FlashcardDeck[];
  materials: Material[];
}): { sourceText: string; deckId: string | null } {
  const deck = decks.find((d) => topicMatches(d.title, topic)) ?? null;
  const parts: string[] = [];

  if (deck) {
    const deckCards = cards.filter((c) => c.deck_id === deck.id).slice(0, MAX_CARDS);
    if (deckCards.length > 0) {
      parts.push(
        `Flashcards for ${deck.title}:\n` +
          deckCards.map((c) => `Q: ${c.front}\nA: ${c.back}`).join("\n\n"),
      );
    }
  }

  const material = materials.find(
    (m) => (deck ? m.folder_id === deck.folder_id : true) && topicMatches(m.title, topic),
  );
  if (material) {
    const text = String(material.content ?? "").slice(0, MAX_MATERIAL_CHARS);
    if (text.trim()) parts.push(`Notes — ${material.title}:\n${text}`);
  }

  return {
    sourceText: parts.length > 0 ? parts.join("\n\n") : `Topic: ${topic}`,
    deckId: deck?.id ?? null,
  };
}

export function scoreQuickCheck(
  questions: Pick<QuizQuestion, "correctIndex">[],
  answers: Array<number | null>,
): { correct: number; total: number; score: number } {
  const total = questions.length;
  const correct = questions.reduce(
    (n, q, i) => n + (answers[i] != null && answers[i] === q.correctIndex ? 1 : 0),
    0,
  );
  return { correct, total, score: total === 0 ? 0 : correct / total };
}
```

(Replace `material.content` with the real `Material` text field.)

- [ ] **Step 4: Run** `npx tsc -b && npx vitest run src/api/aiQuiz src/lib/quickCheck && npx oxlint` — PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/api/aiQuiz.ts webapp/src/api/aiQuiz.test.ts webapp/src/lib/quickCheck.ts webapp/src/lib/quickCheck.test.ts
git commit -m "feat(quick-check): grounded question generation and scoring

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `QuickCheck` component, wired into the timer modal

**Files:**
- Create: `webapp/src/components/quickcheck/QuickCheck.tsx`, `QuickCheck.module.css`, `QuickCheck.test.tsx`
- Modify: `webapp/src/views/timer/TimerView.tsx` (`startSessionCheck` ~188–213, modal ~701–725)
- Modify: `webapp/src/views/timer/TimerView.test.tsx` (the quick-check test, if any, now expects the component not the chat)

**Interfaces:**
- Consumes: `generateQuizQuestions`, `buildQuickCheckSource`, `scoreQuickCheck`, `learningEventsApi.record`, `learningEventsKeys.all`, `useAllDecks`, `useFlashcards`, `useMaterials` (check `hooks/useMaterials.ts` for the all-materials hook name), `useSettings`, `useTrajectory`, `masteryLevel`
- Produces:
  ```tsx
  export function QuickCheck(props: { topic: string; deckId?: string | null; folderId?: string | null; onDone: (result: { correct: number; total: number; score: number }) => void; onSkip: () => void }): JSX.Element
  ```

- [ ] **Step 1: Failing component test** `QuickCheck.test.tsx`

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import { authValue } from "../../test/auth";
import { QuickCheck } from "./QuickCheck";

const generate = vi.fn();
const record = vi.fn();
vi.mock("../../api/aiQuiz", async (orig) => ({
  ...(await orig<typeof import("../../api/aiQuiz")>()),
  generateQuizQuestions: (...a: unknown[]) => generate(...a),
}));
vi.mock("../../api/learningEvents", () => ({
  learningEventsApi: { record: (...a: unknown[]) => record(...a), fetchSince: async () => [] },
}));

const questions = [
  { question: "What is Km?", choices: ["A", "B", "C", "D"], correctIndex: 1 },
  { question: "Inhibitor?", choices: ["A", "B", "C", "D"], correctIndex: 0 },
];

describe("QuickCheck", () => {
  beforeEach(() => {
    generate.mockReset().mockResolvedValue(questions);
    record.mockReset().mockResolvedValue(undefined);
  });

  it("asks one question at a time, scores, records and reports", async () => {
    const onDone = vi.fn();
    renderWithProviders(
      <QuickCheck topic="Enzymes" deckId="d1" onDone={onDone} onSkip={() => {}} />,
      authValue(),
    );
    await screen.findByText("What is Km?");
    await userEvent.click(screen.getByRole("button", { name: "B" }));
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Inhibitor?");
    await userEvent.click(screen.getByRole("button", { name: "C" }));
    await userEvent.click(screen.getByRole("button", { name: /finish/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ correct: 1, total: 2, score: 0.5 }));
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ source: "quick_check", score: 0.5, topicKey: "enzymes", deckId: "d1" }),
    );
  });

  it("shows an error with retry when generation fails", async () => {
    generate.mockRejectedValueOnce(new Error("quota"));
    renderWithProviders(<QuickCheck topic="Enzymes" onDone={() => {}} onSkip={() => {}} />, authValue());
    await screen.findByText(/couldn.t build/i);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    await screen.findByText("What is Km?");
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement `QuickCheck.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../Button";
import { Skeleton } from "../Skeleton";
import { generateQuizQuestions } from "../../api/aiQuiz";
import { learningEventsApi } from "../../api/learningEvents";
import { learningEventsKeys } from "../../hooks/useLearningEvents";
import { useAllDecks } from "../../hooks/useDecks";
import { useFlashcards } from "../../hooks/useFlashcards";
import { useMaterials } from "../../hooks/useMaterials";
import { useSettings } from "../../context/settings";
import { buildQuickCheckSource, scoreQuickCheck, QUICK_CHECK_QUESTIONS } from "../../lib/quickCheck";
import { normaliseTopicKey } from "../../lib/topicKey";
import type { QuizQuestion } from "../../lib/aiJson";
import styles from "./QuickCheck.module.css";

export interface QuickCheckResult { correct: number; total: number; score: number }

export function QuickCheck({
  topic,
  deckId = null,
  folderId = null,
  onDone,
  onSkip,
}: {
  topic: string;
  deckId?: string | null;
  folderId?: string | null;
  onDone: (result: QuickCheckResult) => void;
  onSkip: () => void;
}) {
  const qc = useQueryClient();
  const { settings } = useSettings();
  const decks = useAllDecks();
  const cards = useFlashcards();
  const materials = useMaterials();
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [attempt, setAttempt] = useState(0);
  const [resolvedDeckId, setResolvedDeckId] = useState<string | null>(deckId);

  const ready = !decks.isPending && !cards.isPending && !materials.isPending;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setError(null);
    setQuestions(null);
    const source = buildQuickCheckSource({
      topic,
      cards: cards.data ?? [],
      decks: decks.data ?? [],
      materials: materials.data ?? [],
    });
    setResolvedDeckId(deckId ?? source.deckId);
    generateQuizQuestions({
      sourceText: source.sourceText,
      topic,
      settings,
      options: { questionCount: QUICK_CHECK_QUESTIONS, difficulty: "Medium" },
    })
      .then((qs) => {
        if (cancelled) return;
        setQuestions(qs);
        setAnswers(new Array(qs.length).fill(null));
        setIndex(0);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, attempt, topic]);

  if (error) {
    return (
      <div className={styles.state} role="alert">
        <p>Couldn&rsquo;t build a check for {topic}. {error}</p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onSkip}>Skip</Button>
          <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
        </div>
      </div>
    );
  }
  if (!questions) {
    return <Skeleton label={`Writing a quick check on ${topic}`} height={160} />;
  }

  const q = questions[index];
  const chosen = answers[index];
  const last = index === questions.length - 1;

  const finish = async () => {
    const result = scoreQuickCheck(questions, answers);
    try {
      await learningEventsApi.record({
        topicKey: normaliseTopicKey(topic),
        source: "quick_check",
        score: result.score,
        deckId: resolvedDeckId,
        folderId,
        payload: { questions, answers },
      });
      void qc.invalidateQueries({ queryKey: learningEventsKeys.all });
    } catch (err) {
      console.warn("[quickCheck] result not recorded:", err);
    }
    onDone(result);
  };

  return (
    <div className={styles.check}>
      <p className={styles.progress}>Question {index + 1} of {questions.length}</p>
      <h3 className={styles.question}>{q.question}</h3>
      <div className={styles.choices} role="group" aria-label="Answers">
        {q.choices.map((choice, i) => {
          const state =
            chosen == null ? "" : i === q.correctIndex ? styles.correct : i === chosen ? styles.wrong : "";
          return (
            <button
              key={i}
              type="button"
              className={`${styles.choice} ${state}`}
              disabled={chosen != null}
              onClick={() => setAnswers((a) => a.map((v, j) => (j === index ? i : v)))}
            >
              {choice}
            </button>
          );
        })}
      </div>
      {chosen != null && q.feedback ? <p className={styles.feedback}>{q.feedback}</p> : null}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onSkip}>Skip</Button>
        {last ? (
          <Button disabled={chosen == null} onClick={() => void finish()}>Finish</Button>
        ) : (
          <Button disabled={chosen == null} onClick={() => setIndex((i) => i + 1)}>Next</Button>
        )}
      </div>
    </div>
  );
}
```

Verify hook names (`useAllDecks`, `useFlashcards`, `useMaterials`, `useSettings`) against `hooks/` and `context/` before writing; adjust imports to the real exports. Add a small `QuickCheck.module.css` (stack layout, 44px min-height choice buttons, `.correct`/`.wrong` tones using existing `--ok`/`--danger` tokens from `index.css`).

- [ ] **Step 4: Wire into `TimerView.tsx`**

Replace `startSessionCheck`'s chat branch: keep the signed-out toast; for signed-in users set `const [checking, setChecking] = useState(false)` and render inside the modal body:

```tsx
{checking && completedSession ? (
  <QuickCheck
    topic={completedSession.notes || completedSession.task || "what I just studied"}
    folderId={completedSession.folderId ?? null}
    onDone={({ correct, total }) => {
      showToast(`${correct}/${total} on ${completedSession.task}. Logged as evidence.`);
      setChecking(false);
      setCompletedSession(null);
    }}
    onSkip={() => { setChecking(false); setCompletedSession(null); }}
  />
) : (
  <p className={styles.quizPrompt}>Retrieval straight after learning reveals what stuck while the material is still fresh.</p>
)}
```

The modal footer's "Start quick check" calls `setChecking(true)` for signed-in users; hide the footer while `checking`. Remove the now-unused `chat.send` prompt and the `chat` import if nothing else uses it.

- [ ] **Step 5: Run** `npx tsc -b && npx vitest run src/components/quickcheck src/views/timer && npx oxlint` — PASS. Then `npx vitest run` — PASS.

- [ ] **Step 6: Commit**

```bash
git add webapp/src/components/quickcheck webapp/src/views/timer/TimerView.tsx webapp/src/views/timer/TimerView.test.tsx
git commit -m "feat(timer): grounded, scored quick check after a session

Replaces the free-text chat prompt with four questions drawn from the
topic's own cards and notes, scored and recorded as a learning event.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Today view

**Files:**
- Create: `webapp/src/views/today/TodayView.tsx`, `TodayHero.tsx`, `SessionCompletePanel.tsx`, `today.module.css`, `TodayView.test.tsx`, `TodayHero.test.tsx`
- Modify: `webapp/src/routes.tsx` (`/` → `TodayView`, add `/dashboard` → `DashboardView`)
- Modify: `webapp/src/lib/sectionLabel.ts` (`sectionLabel("/") → "Today"`; `primaryDestinationForPath("/dashboard") → "dashboard"`)
- Modify: `webapp/src/components/Sidebar.tsx` (item label "Today", `to: "/"`)
- Modify: `webapp/src/components/command/CommandPalette.tsx` (~385: add "Full dashboard" → `/dashboard`)
- Modify: `webapp/src/routes.test.tsx:40` (`["/", "Today"]`) and add `["/dashboard", "Dashboard"]`
- Modify: `webapp/src/views/dashboard/DashboardView.tsx:51` (remove test-mode override; its test passes `initialTab="all"`)
- Modify: `webapp/src/views/dashboard/NextHourCard.tsx:74` (mastery copy → `masteryLevel`), `TodayTimelineCard.tsx:141` (goal-aware copy), `DashboardView.tsx:31` (`en-GB` → `undefined`)
- Modify: `webapp/src/views/timer/TopicValueHint.tsx:55-63` and `lib/trajectory.ts:633` ("marks" → "points")

**Interfaces:**
- Consumes: `useTrajectory`, `useTimer().prepareFocus(mins, task, folderId, deckId)`, `QuickCheck`, `masteryLevel`, `renderGrade`/`getGradeScale`/`normaliseScore`, `SESSION_LOGGED_EVENT` + `readRecentFocusSessions` (`lib/localSessions.ts`), existing cards `TasksCard`, `NextExamCard`, `RecentNotebooksShelf`, `ResumeLearningCard`, `useAuth` + `readOnboarding` (`lib/onboarding.ts:548`) for the goal.
- Produces: `TodayView` (default export not needed; named), `TodayHero` props `{ exam, forecast, needsMaterial, isPending, onStart(deckId, label) }`.

- [ ] **Step 1: Failing tests**

`TodayHero.test.tsx` — mock nothing; pass props directly:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { TodayHero } from "./TodayHero";
import type { Exam } from "../../api/types";
import type { TrajectoryForecast } from "../../lib/trajectory";

const exam = { id: 1, exam_name: "AP Chem Unit 3", exam_date: "2026-09-18" } as Exam;
const forecast = {
  examName: "AP Chem Unit 3", examDate: "2026-09-18", daysRemaining: 2,
  todayScore: 52, projectedScore: 61, driftScore: 47, planValue: 14,
  confidence: { lower: 55, upper: 68, evidence: 0.6 }, curve: [], availableMins: 300,
  minsToTarget: null, targetScore: 70, verdict: "close", topics: [],
  interventions: [{ topicId: "d1", label: "Enzymes", points: 3, pointsPerHour: 4, mastery: 0.3, atRisk: false }],
} as TrajectoryForecast;

describe("TodayHero", () => {
  it("renders the decision and hands the deck id to Start", async () => {
    const onStart = vi.fn();
    render(<MemoryRouter><TodayHero exam={exam} forecast={forecast} needsMaterial={false} isPending={false} onStart={onStart} /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Study Enzymes next");
    expect(screen.getByText(/mastery is low/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /start 45 min/i }));
    expect(onStart).toHaveBeenCalledWith("d1", "Enzymes");
  });
  it("asks for material when there is an exam but nothing to project", () => {
    render(<MemoryRouter><TodayHero exam={exam} forecast={null} needsMaterial isPending={false} onStart={() => {}} /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/add material for AP Chem Unit 3/i);
  });
  it("asks for an exam when there is none", () => {
    render(<MemoryRouter><TodayHero exam={null} forecast={null} needsMaterial={false} isPending={false} onStart={() => {}} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /add your next exam/i })).toHaveAttribute("href", "/exams");
  });
});
```

`TodayView.test.tsx` — mock `useTrajectory` (as `NextHourCard.test.tsx` does) and `context/timer`; render with `renderWithProviders(<TodayView />, authValue(), { withRouter: true })`; assert (a) the hero is the first `section` in `main`, (b) the hero, "Due today", "Next exam" and "Continue" headings appear in that order (`getAllByRole("heading", {level: 2})` text order), (c) dispatching `window.dispatchEvent(new Event(SESSION_LOGGED_EVENT))` after seeding `localStorage` with one recent session shows the "Session complete" panel with a "Start quick check" button.

- [ ] **Step 2: Run** `npx vitest run src/views/today` — FAIL.

- [ ] **Step 3: Implement**

`TodayHero.tsx`:

```tsx
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import type { Exam } from "../../api/types";
import { INTERVENTION_BLOCK_MINS, masteryLevel, type TrajectoryForecast } from "../../lib/trajectory";
import { getGradeScale, normaliseScore, renderGrade } from "../../lib/gradeScale";
import styles from "./today.module.css";

export function TodayHero({ exam, forecast, needsMaterial, isPending, onStart }: {
  exam: Exam | null;
  forecast: TrajectoryForecast | null;
  needsMaterial: boolean;
  isPending: boolean;
  onStart: (deckId: string, label: string) => void;
}) {
  if (isPending) {
    return <section className={styles.hero} aria-busy="true"><Skeleton label="Working out your next step" height={140} /></section>;
  }
  if (!exam) {
    return (
      <section className={styles.hero}>
        <h1 className={styles.headline}>Add your next exam to get a next step</h1>
        <p className={styles.reason}>Learnora works out what the next hour is worth once it knows what you are working towards.</p>
        <Link to="/exams" className={styles.primaryLink}>Add your next exam</Link>
      </section>
    );
  }
  const top = forecast?.interventions[0];
  if (needsMaterial || !forecast || !top || top.pointsPerHour <= 0) {
    return (
      <section className={styles.hero}>
        <h1 className={styles.headline}>Add material for {exam.exam_name} to get a next step</h1>
        <p className={styles.reason}>A deck or notes for this exam is enough to start forecasting.</p>
        <Link to="/library" className={styles.primaryLink}>Open Library</Link>
      </section>
    );
  }
  const scale = getGradeScale();
  const grade = (s: number) => renderGrade(normaliseScore(s), scale);
  const lower = grade(forecast.confidence.lower);
  const upper = grade(forecast.confidence.upper);
  const level = masteryLevel(top.mastery);
  return (
    <section className={styles.hero} aria-labelledby="today-hero">
      <span className={styles.eyebrow}><Icon name="zap" size={13} /> Your next hour</span>
      <h1 id="today-hero" className={styles.headline}>Study {top.label} next</h1>
      <p className={styles.reason}>
        {top.atRisk
          ? `${top.label} is fading — revisit it before it costs you on ${exam.exam_name}.`
          : `Your mastery is ${level}, and an hour here moves ${exam.exam_name} more than anywhere else.`}{" "}
        {exam.exam_name} is in {forecast.daysRemaining} {forecast.daysRemaining === 1 ? "day" : "days"}; projected{" "}
        {lower === upper ? `around ${lower}` : `${lower}–${upper}`}.
      </p>
      <div className={styles.heroActions}>
        <Button size="lg" onClick={() => onStart(top.topicId, top.label)}>
          Start {INTERVENTION_BLOCK_MINS} min on {top.label}
        </Button>
        <Link to="/trajectory" className={styles.whyLink}>Why this?</Link>
      </div>
    </section>
  );
}
```

`SessionCompletePanel.tsx`: props `{ session: RecentFocusSession; onClose(): void }`; state `checking`; renders heading "Session complete: {task}", a "Start quick check" button (→ `QuickCheck` with `topic={session.notes || session.task}`, `folderId={session.folderId}`), and after `onDone` shows "{correct}/{total} on {task} — your next step is updated below." then a "Done" button calling `onClose`. Signed-out (`useOptionalAuth()?.session == null`): render the sign-up toast copy from `TimerView` as text with a link to `/signup` instead of the button.

`TodayView.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useTimer } from "../../context/timer";
import { useTrajectory } from "../../hooks/useTrajectory";
import { INTERVENTION_BLOCK_MINS } from "../../lib/trajectory";
import { SESSION_LOGGED_EVENT, readRecentFocusSessions, type RecentFocusSession } from "../../lib/localSessions";
import { TodayHero } from "./TodayHero";
import { SessionCompletePanel } from "./SessionCompletePanel";
import { TasksCard } from "../dashboard/TasksCard";
import { NextExamCard } from "../dashboard/NextExamCard";
import { RecentNotebooksShelf } from "../dashboard/RecentNotebooksShelf";
import { ResumeLearningCard } from "../dashboard/ResumeLearningCard";
import styles from "./today.module.css";

export function TodayView() {
  const navigate = useNavigate();
  const { prepareFocus } = useTimer();
  const { exam, forecast, needsMaterial, isPending } = useTrajectory();
  const [completed, setCompleted] = useState<RecentFocusSession | null>(null);

  useEffect(() => {
    const onLogged = () => setCompleted(readRecentFocusSessions()[0] ?? null);
    window.addEventListener(SESSION_LOGGED_EVENT, onLogged);
    return () => window.removeEventListener(SESSION_LOGGED_EVENT, onLogged);
  }, []);

  return (
    <div className={styles.view}>
      <TodayHero
        exam={exam}
        forecast={forecast}
        needsMaterial={needsMaterial}
        isPending={isPending}
        onStart={(deckId, label) => {
          prepareFocus(INTERVENTION_BLOCK_MINS, label, undefined, deckId);
          void navigate("/timer");
        }}
      />
      {completed ? <SessionCompletePanel session={completed} onClose={() => setCompleted(null)} /> : null}
      <section className={styles.region} aria-labelledby="today-due"><h2 id="today-due" className={styles.regionTitle}>Due today</h2><TasksCard /></section>
      <section className={styles.region} aria-labelledby="today-exam"><h2 id="today-exam" className={styles.regionTitle}>Next exam</h2><NextExamCard /></section>
      <section className={styles.region} aria-labelledby="today-continue"><h2 id="today-continue" className={styles.regionTitle}>Continue</h2><RecentNotebooksShelf /><ResumeLearningCard /></section>
      <p className={styles.footer}>Everything else — streaks, rings, peers, history — lives in <a href="/analytics">Progress</a> and the <a href="/dashboard">full dashboard</a>.</p>
    </div>
  );
}
```

Check `TasksCard`'s required props (`taskInputRef`) and `readRecentFocusSessions`/`RecentFocusSession` export names in `lib/localSessions.ts`; adapt. `today.module.css`: single column, `gap: var(--s-6)`; hero `padding: var(--s-6)`, headline `font-family: var(--font-display); font-size: clamp(1.75rem, 4vw, 2.5rem)`; at `max-width: 640px` the hero's Start button is full-width.

- [ ] **Step 4: Route, label, nav, palette**

`routes.tsx`: import `TodayView` (eager, it is the home) and change `<Route path="/" element={<DashboardView />} />` to `<TodayView />`; add `<Route path="/dashboard" element={<DashboardView />} />` right after it.
`sectionLabel.ts`: in `sectionLabel`, `if (pathname === "/") return "Today";` and `if (pathname.startsWith("/dashboard")) return t("nav_dashboard");`; in `primaryDestinationForPath`, `if (pathname === "/" || pathname.startsWith("/dashboard")) return "dashboard";`. Add `"/"` to `HERO_ROUTES` (the Today hero owns its `<h1>`).
`Sidebar.tsx`: first item `label: "Today"`, drop its `translationKey`.
`CommandPalette.tsx` (~385): keep the "Dashboard" entry but point it at `/dashboard` and title it "Full dashboard"; add a "Today" entry → `/`.
`routes.test.tsx:40`: `["/", "Today"]`; add `["/dashboard", "Dashboard"]` row. Update any `Sidebar.test.tsx` / `AppShell.test.tsx` / `Header.test.tsx` expectations that look for the "Dashboard" nav label at `/`.

- [ ] **Step 5: Copy fixes**

- `NextHourCard.tsx:74`: `` `Your mastery here is ${masteryLevel(top.mastery)}.` `` (import `masteryLevel`); update `NextHourCard.test.tsx` if it asserted the old sentence.
- `TodayTimelineCard.tsx:141`: read `readOnboarding(useAuth().user)?.goal`; `school` → "classes, practice and work", `university` → keep "lectures, shifts and training", otherwise "work, commitments and downtime".
- `DashboardView.tsx:31`: `new Intl.DateTimeFormat(undefined, {...})`; `:51` delete the `MODE === "test"` line and pass `initialTab="all"` in `DashboardView.test.tsx` where the tests need the full grid.
- `TopicValueHint.tsx:55-63`: "marks" → "points" (both branches). `trajectory.ts:633`: "marks per hour" → "points per hour". Update any tests asserting "marks".

- [ ] **Step 6: Run** `npx tsc -b && npx vitest run && npx oxlint` — PASS.

- [ ] **Step 7: Browser check** (if the Browser tool is available): `npm run dev`, open `/app/harness.html?route=/` at 1280px and 375px; confirm the hero is the first thing on screen and the Start button is within the first viewport on mobile. Take screenshots for the PR.

- [ ] **Step 8: Commit**

```bash
git add webapp/src/views/today webapp/src/routes.tsx webapp/src/routes.test.tsx webapp/src/lib/sectionLabel.ts webapp/src/components/Sidebar.tsx webapp/src/components/command/CommandPalette.tsx webapp/src/views/dashboard webapp/src/views/timer/TopicValueHint.tsx webapp/src/lib/trajectory.ts webapp/src/lib/trajectory.test.ts
git commit -m "feat(today): one decision on the home screen

/ is now Today: the next-hour decision, one Start, a quick check after
the session, then tasks due, next exam and continue. The tabbed
dashboard moves to /dashboard.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Life-context sync

**Files:**
- Create: `supabase/migrations/20260916040000_profiles_life_context.sql`
- Modify: `webapp/src/api/profile.ts` (add `fetchLifeContext`, `updateLifeContext`)
- Modify: `webapp/src/api/profile.test.ts`
- Modify: `webapp/src/lib/lifeContext.ts` (`updatedAt`, `toSyncableLifeContext`, stamp in `saveLifeContext`)
- Modify: `webapp/src/lib/lifeContext.test.ts`
- Modify: `webapp/src/hooks/useLifeContext.ts`, `useLifeContext.test.tsx`
- Modify: `webapp/src/test/mocks/handlers.ts` (`profiles` GET fixture may need `life_context: null`)

**Interfaces:**
- Produces:
  ```ts
  // lib/lifeContext.ts
  LifeContext.updatedAt?: string | null
  export type SyncableLifeContext = Omit<LifeContext, "importedIcs" | "importedLabel" | "importedAt">;
  export function toSyncableLifeContext(ctx: LifeContext): SyncableLifeContext
  export function mergeRemoteLifeContext(local: LifeContext, remote: SyncableLifeContext | null): LifeContext  // keeps local ICS fields, takes remote when remote.updatedAt > local.updatedAt
  // api/profile.ts
  profileApi.fetchLifeContext(): Promise<{ lifeContext: SyncableLifeContext | null; updatedAt: string | null }>
  profileApi.updateLifeContext(ctx: SyncableLifeContext): Promise<void>
  // hooks/useLifeContext.ts
  export function hydrateLifeContextFromProfile(): Promise<void>   // called once per sign-in by AuthProvider or SettingsProvider
  ```

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/20260916040000_profiles_life_context.sql
-- The student's week (Life Sync) mirrored from localStorage so the
-- trajectory forecast uses the same available hours on every device.
-- Never contains the imported calendar (importedIcs): that stays local.
alter table public.profiles
  add column if not exists life_context jsonb,
  add column if not exists life_context_updated_at timestamptz;
```

- [ ] **Step 2: Failing lib tests** — append to `lifeContext.test.ts`:

```ts
describe("sync helpers", () => {
  it("toSyncableLifeContext strips the imported calendar", () => {
    const ctx = { ...DEFAULT_LIFE_CONTEXT, importedIcs: "BEGIN:VCALENDAR", importedLabel: "school", importedAt: "2026-09-01" };
    const out = toSyncableLifeContext(ctx);
    expect(out).not.toHaveProperty("importedIcs");
    expect(out).not.toHaveProperty("importedLabel");
    expect(out).not.toHaveProperty("importedAt");
  });
  it("mergeRemoteLifeContext takes the newer side and keeps local ICS", () => {
    const local = { ...DEFAULT_LIFE_CONTEXT, wakeTime: "07:00", updatedAt: "2026-09-10T00:00:00Z", importedIcs: "X" };
    const remoteNewer = { ...toSyncableLifeContext(DEFAULT_LIFE_CONTEXT), wakeTime: "06:00", updatedAt: "2026-09-12T00:00:00Z" };
    const merged = mergeRemoteLifeContext(local, remoteNewer);
    expect(merged.wakeTime).toBe("06:00");
    expect(merged.importedIcs).toBe("X");
    const remoteOlder = { ...remoteNewer, wakeTime: "05:00", updatedAt: "2026-09-01T00:00:00Z" };
    expect(mergeRemoteLifeContext(local, remoteOlder).wakeTime).toBe("07:00");
    expect(mergeRemoteLifeContext(local, null)).toBe(local);
  });
  it("saveLifeContext stamps updatedAt", () => {
    saveLifeContext({ ...DEFAULT_LIFE_CONTEXT });
    expect(loadLifeContext().updatedAt).toMatch(/^\d{4}-/);
  });
});
```

- [ ] **Step 3: Implement lib** — add `updatedAt?: string | null` to `LifeContext`; in `normalizeLifeContext` carry it through (string or null); `saveLifeContext` writes `{ ...ctx, updatedAt: new Date().toISOString() }`; add:

```ts
export type SyncableLifeContext = Omit<LifeContext, "importedIcs" | "importedLabel" | "importedAt">;

/** What is allowed to leave the device. The imported calendar is the
 *  student's private data and the module's promise is that it never does. */
export function toSyncableLifeContext(ctx: LifeContext): SyncableLifeContext {
  const { importedIcs: _i, importedLabel: _l, importedAt: _a, ...rest } = ctx;
  return rest;
}

/** Last write wins by `updatedAt`; the local calendar import always survives. */
export function mergeRemoteLifeContext(
  local: LifeContext,
  remote: SyncableLifeContext | null,
): LifeContext {
  if (!remote) return local;
  const localAt = local.updatedAt ?? "";
  const remoteAt = remote.updatedAt ?? "";
  if (remoteAt <= localAt) return local;
  return normalizeLifeContext({
    ...remote,
    importedIcs: local.importedIcs ?? null,
    importedLabel: local.importedLabel ?? null,
    importedAt: local.importedAt ?? null,
  });
}
```

- [ ] **Step 4: Profile API** — in `profile.ts` add:

```ts
  async fetchLifeContext(): Promise<{ lifeContext: SyncableLifeContext | null; updatedAt: string | null }> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("profiles")
      .select("life_context, life_context_updated_at")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { lifeContext: (data?.life_context as SyncableLifeContext | null) ?? null, updatedAt: data?.life_context_updated_at ?? null };
  },

  async updateLifeContext(ctx: SyncableLifeContext): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("profiles")
      .update({ life_context: ctx, life_context_updated_at: ctx.updatedAt ?? new Date().toISOString() })
      .eq("id", userId);
    if (error) throw new Error(error.message);
  },
```

(Match the `profiles` primary-key column used by the existing `updateRegion` — `id` or `user_id`.) Add two tests in `profile.test.ts` following its existing style: fetch selects the two columns; update sends `life_context` without `importedIcs`.

- [ ] **Step 5: Hook** — in `useLifeContext.ts`:

```ts
import { profileApi } from "../api/profile";
import { mergeRemoteLifeContext, toSyncableLifeContext } from "../lib/lifeContext";

let hydratedFor: string | null = null;

/** Once per signed-in user: pull the server copy, keep whichever is newer,
 *  push ours if it is the newer one. Failures keep the local week. */
export async function hydrateLifeContextFromProfile(userId: string): Promise<void> {
  if (hydratedFor === userId) return;
  hydratedFor = userId;
  try {
    const { lifeContext: remote } = await profileApi.fetchLifeContext();
    const local = getSnapshot();
    const merged = mergeRemoteLifeContext(local, remote);
    if (merged !== local) {
      cached = merged;
      saveLifeContext(merged);
      window.dispatchEvent(new Event(LIFE_CONTEXT_CHANGED_EVENT));
    } else if (local.updatedAt && (!remote || (remote.updatedAt ?? "") < local.updatedAt)) {
      await profileApi.updateLifeContext(toSyncableLifeContext(local));
    }
  } catch (err) {
    hydratedFor = null;
    console.warn("[lifeContext] hydrate failed; keeping local week:", err);
  }
}
```

`save` in the hook: after `saveLifeContext(next)`, read back `cached = loadLifeContext()` (so `updatedAt` is stamped) and `void profileApi.updateLifeContext(toSyncableLifeContext(cached)).catch((err) => console.warn("[lifeContext] push failed:", err))` — only when a session exists (`supabase.auth.getSession()` is async; simplest: attempt and let `requireUserId` reject, which the catch swallows). `resetLifeContextCache` also resets `hydratedFor = null`.

Call `hydrateLifeContextFromProfile(user.id)` from `SettingsProvider.tsx` in the same effect that restores the profile pins (~line 68), after the pins resolve.

Tests in `useLifeContext.test.tsx`: (a) remote newer replaces local and dispatches the change event; (b) local newer pushes without `importedIcs` in the PATCH body; (c) fetch failure leaves local untouched.

- [ ] **Step 6: Run** `npx tsc -b && npx vitest run src/lib/lifeContext src/hooks/useLifeContext src/api/profile src/context/SettingsProvider && npx oxlint` — PASS; then full suite.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260916040000_profiles_life_context.sql webapp/src/api/profile.ts webapp/src/api/profile.test.ts webapp/src/lib/lifeContext.ts webapp/src/lib/lifeContext.test.ts webapp/src/hooks/useLifeContext.ts webapp/src/hooks/useLifeContext.test.tsx webapp/src/context/SettingsProvider.tsx webapp/src/test/mocks/handlers.ts
git commit -m "feat(life-sync): the student's week follows the account

Mirrors life context to profiles.life_context, last write wins; the
imported calendar never leaves the device.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Feynman and Viva → evidence

**Files:**
- Modify: `webapp/src/views/feynman/FeynmanStudioView.tsx` (`handleFinishAndDebrief` ~199–222)
- Modify: `webapp/src/api/aiSparring.ts` (`submitStudentAnswer`, after `saveSparringSession(updatedSession)` ~817)
- Tests: `webapp/src/views/feynman/FeynmanStudioView.test.tsx` (create a focused test if none), `webapp/src/api/aiSparring.test.ts`

**Interfaces:**
- Consumes: `learningEventsApi.record`, `normaliseTopicKey`, `learningEventsKeys.all`

- [ ] **Step 1: Failing tests**

`aiSparring.test.ts`: mock `../api/learningEvents` (`record` spy). Drive `submitStudentAnswer` the way the existing tests do and assert `record` was called with `{ source: "viva", topicKey: normaliseTopicKey(session.topic), score: evaluation.overallScore / 100, payload: expect.objectContaining({ round: expect.any(Number) }) }`.

`FeynmanStudioView.test.tsx`: mock `generateFeynmanDebrief` to resolve `{ understandingScore: 72, ... }` (use the real `FeynmanDebriefReport` shape from `aiFeynman.ts:~385`), click "Finish" (find the button's real label in the view), assert `record` called with `{ source: "feynman", score: 0.72, topicKey: normaliseTopicKey(session.topic) }`.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

`FeynmanStudioView.tsx`, inside `handleFinishAndDebrief` after `saveFeynmanSession(completedSession)`:

```ts
      void learningEventsApi
        .record({
          topicKey: normaliseTopicKey(session.topic),
          source: "feynman",
          score: Math.max(0, Math.min(1, debrief.understandingScore / 100)),
          minutes: Math.round(
            (Date.now() - new Date(session.createdAt).getTime()) / 60000,
          ),
          payload: { sessionId: session.id, subject: session.subject },
        })
        .then(() => queryClient.invalidateQueries({ queryKey: learningEventsKeys.all }))
        .catch((err) => console.warn("[feynman] evidence not recorded:", err));
```

(`queryClient` via `useQueryClient()`; confirm `debrief.understandingScore` is the field on `FeynmanDebriefReport` — if the report exposes a different final-score field, use that one.)

`aiSparring.ts`, after `saveSparringSession(updatedSession)` in `submitStudentAnswer`:

```ts
  void learningEventsApi
    .record({
      topicKey: normaliseTopicKey(session.topic),
      source: "viva",
      score: Math.max(0, Math.min(1, evaluation.overallScore / 100)),
      payload: { sessionId: session.id, round: session.currentRound },
    })
    .catch((err) => console.warn("[viva] evidence not recorded:", err));
```

(`evaluation` is whatever local name holds the round's `SparringEvaluation` there; read the surrounding code.) Invalidate `learning_events` from `SocraticSparringView` after `submitStudentAnswer` resolves, via `useQueryClient`.

- [ ] **Step 4: Run** `npx tsc -b && npx vitest run src/api/aiSparring src/views/feynman src/views/sparring && npx oxlint` — PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/views/feynman webapp/src/api/aiSparring.ts webapp/src/api/aiSparring.test.ts webapp/src/views/sparring
git commit -m "feat(evidence): Feynman debriefs and Viva rounds move the forecast

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Solver and Detective → evidence

**Files:**
- Modify: `webapp/src/api/aiDebugger.ts` (`recordRepairSuccess` ~380)
- Modify: `webapp/src/api/aiDebugger.test.ts`
- Modify: `webapp/src/views/exam-detective/ChallengeSprintRunner.tsx` (~101 and ~441 where `markTrapDisarmed` is called) and `AhaWalkthroughModal.tsx:58`
- Modify: `webapp/src/views/exam-detective/ChallengeSprintRunner.test.tsx` (or the closest existing test)

- [ ] **Step 1: Failing tests**

`aiDebugger.test.ts`: seed a trace with `rootConcept: "Sign errors in integration"` via `saveTrace`, call `recordRepairSuccess(trace.id, repairId)`, assert `record` (mocked) called with `{ source: "solver", score: 1, topicKey: "sign errors in integration", payload: { traceId, repairId } }`.

Detective test: render `ChallengeSprintRunner` with `subject="Enzymes"`, answer a question correctly (follow the existing test's flow), assert `record` called with `{ source: "detective", score: 1, topicKey: "enzymes", payload: expect.objectContaining({ trapId: expect.any(String) }) }`; answer one wrongly, assert a `score: 0` event.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

`aiDebugger.ts`, at the end of `recordRepairSuccess` (after the trace is updated):

```ts
  if (trace) {
    void learningEventsApi
      .record({
        topicKey: normaliseTopicKey(trace.rootConcept),
        source: "solver",
        score: 1,
        payload: { traceId, repairId },
      })
      .catch((err) => console.warn("[solver] evidence not recorded:", err));
  }
```

(If `rootConcept` lives on a layer rather than the trace, use `trace.layers.find((l) => l.level === 1)?.concept`; read the `CognitiveStackTrace` interface at ~line 30–60.)

`ChallengeSprintRunner.tsx`: add a helper at module level:

```ts
function recordTrapEvidence(subject: string | undefined, trapId: string, correct: boolean) {
  void learningEventsApi
    .record({
      topicKey: normaliseTopicKey(subject || trapId.replace(/-/g, " ")),
      source: "detective",
      score: correct ? 1 : 0,
      payload: { trapId },
    })
    .catch((err) => console.warn("[detective] evidence not recorded:", err));
}
```

Call it where an answer is graded (the branch that calls `markTrapDisarmed(currentQ.trapArchetypeId)` on a correct answer, and its wrong-answer sibling). Leave `AhaWalkthroughModal` alone (a walkthrough is reading, not an outcome).

- [ ] **Step 4: Run** `npx tsc -b && npx vitest run src/api/aiDebugger src/views/exam-detective src/views/debugger && npx oxlint` — PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/api/aiDebugger.ts webapp/src/api/aiDebugger.test.ts webapp/src/views/exam-detective
git commit -m "feat(evidence): Solver repairs and Detective answers move the forecast

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Ledger, harness fixtures, final verification

**Files:**
- Modify: `AUDIT_REPORT.md` (append "§7 execution status" table)
- Modify: `webapp/src/dev/harness.tsx` / `fixtures.ts` (intercept `learning_events` GET → `[]`, POST → 201; `profiles` GET includes `life_context: null`) so the harness renders Today
- Modify: `README.md` or `SUPABASE_SETUP.md` (one line: apply the two new migrations)

- [ ] **Step 1: Harness** — find the REST interceptor in `harness.tsx` (it answers by path shape) and add `learning_events` alongside `study_sessions`.

- [ ] **Step 2: Ledger** — append to `AUDIT_REPORT.md`:

```markdown
### 7.6 Execution status (feat/close-the-loop)

| Move | State | Where |
|---|---|---|
| Home = one decision | ✅ | `views/today/`, `/` → Today, `/dashboard` keeps the grid |
| Sessions are evidence | ✅ | `api/sessions.ts` → `learning_events(timer)`; `trajectory.ts#applyEvents` |
| Real quick check | ✅ | `components/quickcheck/QuickCheck.tsx`, on `/timer` and Today |
| Evidence follows the account | ✅ | migration `20260916030000`; Feynman/Viva/Solver/Detective append |
| Week follows the account | ✅ | migration `20260916040000`; `profiles.life_context`, ICS stays local |
| Copy leaks | ✅ | "marks" → "points"; mastery as a level word; goal-aware Life Sync copy |

**Ops:** apply both migrations before deploy. No new secrets.
**Open:** localStorage session *drafts* for Feynman/Viva/Solver stay per-device (outcomes sync; transcripts do not).
```

- [ ] **Step 3: Full verification** — `npx tsc -b && npx vitest run && npx oxlint && npx prettier --check $(git diff --name-only main -- 'webapp/src/**/*.ts' 'webapp/src/**/*.tsx' 'webapp/src/**/*.css')`. Fix anything red. Record the counts for the PR.

- [ ] **Step 4: Commit**

```bash
git add AUDIT_REPORT.md webapp/src/dev SUPABASE_SETUP.md
git commit -m "docs: record close-the-loop execution status; harness serves learning_events

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review

- **Spec coverage:** 3.1 → T1; 3.2 → T2; 3.3 → T3; 3.4 → T1/T3 (offline replay rides on `sessionsApi.log`, T4); 3.5 → T4; 3.6 → T5/T6; 3.7 → T7 (hero, session panel, order, copy, mobile); 3.8 → T8; 3.9 → T9/T10; 3.10 → T7 step 5. §5 error handling → T1 (missing table), T6 (retry/skip), T8 (hydrate failure). §6 tests → each task. Ops note → T11.
- **Placeholders:** the "unchanged" markers in T3 refer to existing expressions that stay verbatim; hook/field names flagged "verify" are read from the codebase by the implementer before use.
- **Type consistency:** `RecordLearningEventInput.topicKey/source/score/minutes/deckId/folderId/payload/clientId` used identically in T4, T6, T9, T10; `prepareFocus(mins, task, folderId, deckId)` in T4 and T7; `learningEventsKeys.all` in T3, T6, T9; `masteryLevel` in T3 and T7; `SyncableLifeContext` in T8 only.
