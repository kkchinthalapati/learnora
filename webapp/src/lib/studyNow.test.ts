import { describe, expect, it } from "vitest";
import {
  daysBetween,
  dependentsBySubject,
  nextUpcomingExam,
  pickStudyNow,
  STUDY_NOW_MINUTES,
} from "./studyNow";
import type { Misconception } from "./misconceptions";

const NOW = new Date("2026-09-22T18:00:00Z");

function misconception(over: Partial<Misconception> = {}): Misconception {
  return {
    id: "m-1",
    subject: "Physics",
    concept: "Momentum in 2D collisions",
    conceptKey: "momentum 2d collisions",
    summary: "Treats momentum as a scalar, so direction is dropped.",
    status: "open",
    severity: "moderate",
    originTool: "quiz",
    timesObserved: 1,
    timesCorrected: 0,
    firstSeenAt: "2026-09-01T10:00:00Z",
    lastSeenAt: "2026-09-20T10:00:00Z",
    resolvedAt: null,
    ...over,
  };
}

const physicsExam = {
  exam_name: "Physics Paper 1",
  exam_date: "2026-09-26",
  folder_id: "f-physics",
};
const folders = [{ id: "f-physics", name: "Physics" }];

describe("daysBetween", () => {
  it("counts whole days, not elapsed hours", () => {
    // 6pm today to 9am tomorrow is 15 hours, but it is still one day away.
    expect(
      daysBetween(new Date("2026-09-22T18:00:00Z"), new Date("2026-09-23T09:00:00Z")),
    ).toBe(1);
  });
});

describe("nextUpcomingExam", () => {
  it("returns the soonest exam that has not happened", () => {
    const exam = nextUpcomingExam(
      [
        { exam_name: "Late", exam_date: "2026-10-30" },
        { exam_name: "Soon", exam_date: "2026-09-26" },
        { exam_name: "Past", exam_date: "2026-09-01" },
      ],
      NOW,
    );
    expect(exam?.exam_name).toBe("Soon");
  });

  it("still counts an exam dated today", () => {
    const exam = nextUpcomingExam(
      [{ exam_name: "Today", exam_date: "2026-09-22" }],
      NOW,
    );
    expect(exam?.exam_name).toBe("Today");
  });

  it("ignores an unparseable date rather than throwing", () => {
    const exam = nextUpcomingExam(
      [
        { exam_name: "Broken", exam_date: "not a date" },
        { exam_name: "Real", exam_date: "2026-09-26" },
      ],
      NOW,
    );
    expect(exam?.exam_name).toBe("Real");
  });

  it("returns null with no exams at all", () => {
    expect(nextUpcomingExam([], NOW)).toBeNull();
    expect(nextUpcomingExam(null, NOW)).toBeNull();
  });
});

describe("pickStudyNow", () => {
  it("picks the concept that has resurfaced most often", () => {
    const pick = pickStudyNow({
      exams: [physicsExam],
      folders,
      misconceptions: [
        misconception({ id: "once", concept: "Units", timesObserved: 1 }),
        misconception({ id: "thrice", concept: "Vector addition", timesObserved: 3 }),
        misconception({ id: "twice", concept: "Free body diagrams", timesObserved: 2 }),
      ],
      now: NOW,
    });

    expect(pick?.misconceptionId).toBe("thrice");
    expect(pick?.concept).toBe("Vector addition");
    expect(pick?.timesObserved).toBe(3);
    expect(pick?.otherOpenOnPaper).toBe(2);
    expect(pick?.daysUntilExam).toBe(4);
    expect(pick?.estimatedMinutes).toBe(STUDY_NOW_MINUTES);
  });

  it("breaks a tie on severity, then on which was seen first", () => {
    const pick = pickStudyNow({
      exams: [physicsExam],
      folders,
      misconceptions: [
        misconception({ id: "minor", timesObserved: 2, severity: "minor" }),
        misconception({ id: "critical", timesObserved: 2, severity: "critical" }),
      ],
      now: NOW,
    });
    expect(pick?.misconceptionId).toBe("critical");

    const olderWins = pickStudyNow({
      exams: [physicsExam],
      folders,
      misconceptions: [
        misconception({
          id: "newer",
          timesObserved: 2,
          firstSeenAt: "2026-09-15T10:00:00Z",
        }),
        misconception({
          id: "older",
          timesObserved: 2,
          firstSeenAt: "2026-08-02T10:00:00Z",
        }),
      ],
      now: NOW,
    });
    expect(olderWins?.misconceptionId).toBe("older");
  });

  it("scopes to the exam's own subject, not the whole ledger", () => {
    const pick = pickStudyNow({
      exams: [physicsExam],
      folders,
      misconceptions: [
        misconception({
          id: "chem",
          subject: "Chemistry",
          concept: "Buffers",
          timesObserved: 9,
        }),
        misconception({ id: "phys", subject: "Physics", timesObserved: 1 }),
      ],
      now: NOW,
    });

    expect(pick?.misconceptionId).toBe("phys");
    expect(pick?.otherOpenOnPaper).toBe(0);
  });

  it("reads the subject out of a realistically named exam", () => {
    /* "Physics Paper 1" is what students actually type. Without the name
       heuristic nothing in the ledger would ever match it. */
    const pick = pickStudyNow({
      exams: [{ exam_name: "Physics Paper 1", exam_date: "2026-09-26" }],
      folders: [{ id: "f-physics", name: "Physics" }],
      misconceptions: [misconception({ subject: "Physics" })],
      now: NOW,
    });
    expect(pick?.subject).toBe("Physics");
    expect(pick?.examName).toBe("Physics Paper 1");
  });

  it("falls back to the exam name when it names no subject folder", () => {
    const pick = pickStudyNow({
      exams: [{ exam_name: "Physics", exam_date: "2026-09-26" }],
      folders: [],
      misconceptions: [misconception({ subject: "Physics" })],
      now: NOW,
    });
    expect(pick?.subject).toBe("Physics");
  });

  it("ignores a concept the student has already resolved", () => {
    const pick = pickStudyNow({
      exams: [physicsExam],
      folders,
      misconceptions: [
        misconception({
          id: "done",
          timesObserved: 9,
          status: "resolved",
          resolvedAt: "2026-09-19T10:00:00Z",
        }),
        misconception({ id: "still-open", timesObserved: 1 }),
      ],
      now: NOW,
    });
    expect(pick?.misconceptionId).toBe("still-open");
  });

  /* The two cases the card must not fabricate its way through. */
  it("returns null when there is no upcoming exam", () => {
    expect(
      pickStudyNow({
        exams: [{ exam_name: "Gone", exam_date: "2026-09-01" }],
        folders,
        misconceptions: [misconception({ timesObserved: 5 })],
        now: NOW,
      }),
    ).toBeNull();

    expect(
      pickStudyNow({
        exams: [],
        folders,
        misconceptions: [misconception()],
        now: NOW,
      }),
    ).toBeNull();
  });

  it("returns null when nothing is open for that exam's subject", () => {
    expect(
      pickStudyNow({
        exams: [physicsExam],
        folders,
        misconceptions: [],
        now: NOW,
      }),
    ).toBeNull();

    expect(
      pickStudyNow({
        exams: [physicsExam],
        folders,
        misconceptions: [
          misconception({ subject: "Chemistry", timesObserved: 7 }),
        ],
        now: NOW,
      }),
    ).toBeNull();

    expect(
      pickStudyNow({
        exams: [physicsExam],
        folders,
        misconceptions: [misconception({ status: "resolved" })],
        now: NOW,
      }),
    ).toBeNull();
  });
});

const trace = (
  layers: [number, string][],
  over: { subject?: string; degraded?: unknown } = {},
) => ({
  subject: over.subject ?? "Physics",
  degraded: over.degraded,
  layers: layers.map(([level, concept]) => ({ level, concept })),
});

describe("dependentsBySubject", () => {
  it("links every layer to the layers that sit above it", () => {
    const g = dependentsBySubject(
      [trace([[1, "Vectors"], [2, "Momentum"], [3, "2D collisions"]])],
      "Physics",
    );
    expect(g.get("vectors")?.size).toBe(2);
    expect(g.get("momentum")?.size).toBe(1);
    expect(g.get("2d collisions")).toBeUndefined();
  });

  it("merges traces and counts each dependent once", () => {
    const g = dependentsBySubject(
      [
        trace([[1, "Vectors"], [2, "Momentum"]]),
        trace([[1, "Vectors"], [2, "Momentum"], [3, "Projectiles"]]),
        trace([[1, "the vectors"], [2, "Forces"]]),
      ],
      "physics",
    );
    // Momentum, Projectiles, Forces — "the vectors" keys to the same node.
    expect(g.get("vectors")?.size).toBe(3);
  });

  it("ignores stand-in traces and other subjects", () => {
    const g = dependentsBySubject(
      [
        trace([[1, "Vectors"], [2, "Momentum"]], { degraded: { reason: "x" } }),
        trace([[1, "Vectors"], [2, "Buffers"]], { subject: "Chemistry" }),
      ],
      "Physics",
    );
    expect(g.size).toBe(0);
  });
});

describe("pickStudyNow with traces", () => {
  it("puts the concept with the most dependents first, over one seen more often", () => {
    const pick = pickStudyNow({
      exams: [physicsExam],
      folders,
      misconceptions: [
        misconception({ id: "leaf", concept: "2D collisions", conceptKey: "2d collisions", timesObserved: 6 }),
        misconception({ id: "root", concept: "Vectors", conceptKey: "vectors", timesObserved: 1 }),
      ],
      traces: [trace([[1, "Vectors"], [2, "Momentum"], [3, "2D collisions"]])],
      now: NOW,
    });

    expect(pick?.misconceptionId).toBe("root");
    expect(pick?.dependents).toBe(2);
  });

  it("falls back to evidence when no trace links anything", () => {
    const pick = pickStudyNow({
      exams: [physicsExam],
      folders,
      misconceptions: [
        misconception({ id: "a", concept: "Units", conceptKey: "units", timesObserved: 1 }),
        misconception({ id: "b", concept: "Friction", conceptKey: "friction", timesObserved: 4 }),
      ],
      traces: [],
      now: NOW,
    });
    expect(pick?.misconceptionId).toBe("b");
    expect(pick?.dependents).toBe(0);
  });
});
