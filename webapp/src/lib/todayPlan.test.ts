import { describe, expect, it } from "vitest";
import type { QuizAttempt, Task } from "../api/types";
import type { LastStudySession } from "./continuity";
import type { Misconception } from "./misconceptions";
import type { TrajectoryForecast } from "./trajectory";
import {
  alsoWorthDoing,
  chooseTodayScenario,
  recentRoughTest,
  weekDates,
  type TodayInput,
} from "./todayPlan";

const now = new Date("2026-09-30T10:00:00Z");

const session: LastStudySession = {
  id: "s1",
  objective: "Electron transport",
  mode: "explain",
  stepIndex: 2,
  totalSteps: 5,
  minutesLeft: 12,
  status: "paused",
  lastActiveAt: "2026-09-29T18:00:00Z",
};

const attempt: QuizAttempt = {
  id: "a1",
  user_id: "u",
  quiz_id: "q1",
  score: 11,
  total: 16,
  answers_json: [],
  weak_topics: null,
  created_at: "2026-09-29T20:00:00Z",
};

const quizMisconception = {
  id: "m1",
  subject: "Biology",
  concept: "Where ATP synthase sits",
  conceptKey: "atp synthase",
  summary: "Placed in the outer membrane",
  status: "open",
  severity: "critical",
  originTool: "quiz",
  timesObserved: 3,
  timesCorrected: 0,
  firstSeenAt: "2026-09-29T20:00:00Z",
  lastSeenAt: "2026-09-29T20:00:10Z",
  resolvedAt: null,
} as Misconception;

const forecast = {
  interventions: [
    { topicId: "d1", label: "Enzymes", points: 3, pointsPerHour: 4, mastery: 0.3, atRisk: false },
  ],
  topics: [
    { id: "d1", label: "Enzymes", mastery: 0.3, evidence: 0.6, stabilityDays: 60, weight: 1, cardCount: 10 },
    { id: "d2", label: "Glycolysis", mastery: 0.7, evidence: 0.6, stabilityDays: 3, weight: 1, cardCount: 10 },
  ],
} as unknown as TrajectoryForecast;

const base: TodayInput = {
  now,
  shortOnTime: false,
  session: null,
  attempts: [],
  misconceptions: [],
  hasExam: true,
  needsMaterial: false,
  forecast,
  dueCards: 0,
  tasks: [],
};

describe("chooseTodayScenario", () => {
  it("leads with the forecast's next step by default", () => {
    expect(chooseTodayScenario(base)).toBe("next");
  });

  it("puts ten minutes ahead of everything, then an unfinished session, then a rough test", () => {
    const all = {
      ...base,
      session,
      attempts: [attempt],
      misconceptions: [quizMisconception],
    };
    expect(chooseTodayScenario({ ...all, shortOnTime: true })).toBe("short");
    expect(chooseTodayScenario(all)).toBe("returning");
    expect(chooseTodayScenario({ ...all, session: null })).toBe("rough");
  });

  it("ignores a finished session", () => {
    expect(
      chooseTodayScenario({ ...base, session: { ...session, status: "done" } }),
    ).toBe("next");
  });

  it("is clear when nothing is worth doing, and recall-first when cards are due", () => {
    const quiet = { ...base, forecast: { ...forecast, interventions: [] } as TrajectoryForecast };
    expect(chooseTodayScenario(quiet)).toBe("clear");
    expect(chooseTodayScenario({ ...quiet, dueCards: 8 })).toBe("short");
  });

  it("onboards without an exam or material, unless there is a session to resume", () => {
    expect(chooseTodayScenario({ ...base, hasExam: false })).toBe("empty");
    expect(chooseTodayScenario({ ...base, needsMaterial: true })).toBe("empty");
    expect(chooseTodayScenario({ ...base, hasExam: false, session })).toBe("returning");
  });
});

describe("recentRoughTest", () => {
  it("needs a recent imperfect attempt and quiz misconceptions logged with it", () => {
    expect(recentRoughTest([attempt], [quizMisconception], now)?.fixes).toHaveLength(1);
    expect(recentRoughTest([{ ...attempt, score: 16 }], [quizMisconception], now)).toBeNull();
    expect(
      recentRoughTest([{ ...attempt, created_at: "2026-09-20T10:00:00Z" }], [quizMisconception], now),
    ).toBeNull();
    expect(
      recentRoughTest([attempt], [{ ...quizMisconception, originTool: "feynman" }], now),
    ).toBeNull();
  });
});

describe("alsoWorthDoing", () => {
  const tasks: Task[] = [
    { id: 1, user_id: "u", text: "Problem set 4", is_done: false, due_date: "2026-09-30" },
    { id: 2, user_id: "u", text: "Future", is_done: false, due_date: "2026-10-10" },
    { id: 3, user_id: "u", text: "Done", is_done: true, due_date: "2026-09-30" },
  ];

  it("lists due cards, a fading topic and due tasks, capped at three", () => {
    const rows = alsoWorthDoing({ dueCards: 18, forecast, tasks, today: "2026-09-30" });
    expect(rows.map((r) => r.label)).toEqual([
      "Review 18 flashcards",
      "Glycolysis is fading: 5-question check",
      "Problem set 4",
    ]);
    expect(rows[0]).toMatchObject({ kind: "recall", estimate: "6 min", to: "/review/daily-drill" });
    expect(rows[2]).toMatchObject({ kind: "task", estimate: "Today" });
  });

  it("leads with a rebalance prompt when the week's plan has slipped", () => {
    const rows = alsoWorthDoing({ dueCards: 18, forecast, tasks, today: "2026-09-30", planBehindMins: 90 });
    expect(rows[0]).toEqual({
      id: "plan-behind",
      kind: "task",
      label: "You're 1h 30m behind this week's plan",
      estimate: "Plan",
      action: "Rebalance",
      to: "/plan?rebalance=1",
    });
    expect(rows).toHaveLength(3);
  });

  it("says nothing about the plan when it is on track (or under 15 minutes behind)", () => {
    for (const planBehindMins of [0, 10]) {
      const rows = alsoWorthDoing({ dueCards: 0, forecast: null, tasks: [], today: "2026-09-30", planBehindMins });
      expect(rows.map((r) => r.id)).not.toContain("plan-behind");
    }
  });

  it("drops what the lead card already offers", () => {
    const rows = alsoWorthDoing({ dueCards: 18, forecast, tasks: [], today: "2026-09-30", exclude: ["cards"] });
    expect(rows.map((r) => r.id)).toEqual(["fading-d2"]);
  });
});

describe("weekDates", () => {
  it("runs Monday to Sunday around the given day", () => {
    expect(weekDates(new Date("2026-09-30T12:00:00"))).toEqual([
      "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01",
      "2026-10-02", "2026-10-03", "2026-10-04",
    ]);
  });
});
