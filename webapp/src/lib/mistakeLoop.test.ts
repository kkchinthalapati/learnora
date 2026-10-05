import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EMPTY_LOOP_STATE,
  RESOLVE_AFTER_DAYS,
  applyObservation,
  classifyError,
  isNamedPattern,
  matchWrongAnswer,
  needsRepair,
  observationKey,
  pickRetestQuestion,
  questionKey,
  repairFor,
  retestDueAt,
  retestsDue,
  type LoopState,
} from "./mistakeLoop";
import { MISCONCEPTION_CATALOGUE } from "./misconceptionCatalogue";
import { computeExamReadiness } from "./examReadiness";
import type { Misconception } from "./misconceptions";
import type { Exam, QuizAttempt } from "../api/types";

const DAY = 86_400_000;
const T0 = new Date("2026-10-05T09:00:00Z");
const at = (days: number) => new Date(T0.getTime() + days * DAY).toISOString();

function run(events: Parameters<typeof applyObservation>[1][]): LoopState {
  return events.reduce(applyObservation, EMPTY_LOOP_STATE);
}

describe("resolution needs a delayed pass on a new question", () => {
  const wrong = { kind: "evidence" as const, occurredAt: at(0), questionKey: "q:failed" };
  const repair = { kind: "repair" as const, occurredAt: at(0), questionKey: "q:check" };

  it("an immediate correct check moves it to improving, no further", () => {
    const s = run([
      wrong,
      repair,
      { kind: "correction", occurredAt: at(0), questionKey: "q:check" },
    ]);
    expect(s.status).toBe("improving");
    expect(s.resolvedAt).toBeNull();
  });

  it("a correct answer on a new question before two days is still only improving", () => {
    const s = run([
      wrong,
      repair,
      { kind: "correction", occurredAt: at(1.9), questionKey: "q:new" },
    ]);
    expect(s.status).toBe("improving");
  });

  it("resolves on a new question at least two days after the repair", () => {
    const s = run([
      wrong,
      repair,
      { kind: "correction", occurredAt: at(0), questionKey: "q:check" },
      { kind: "correction", occurredAt: at(RESOLVE_AFTER_DAYS), questionKey: "q:new" },
    ]);
    expect(s.status).toBe("resolved");
    expect(s.resolvedAt).toBe(at(RESOLVE_AFTER_DAYS));
    expect(s.retestDueAt).toBeNull();
  });

  it("the question that was failed, or the check, never counts as new", () => {
    for (const key of ["q:failed", "q:check"]) {
      const s = run([wrong, repair, { kind: "correction", occurredAt: at(5), questionKey: key }]);
      expect(s.status).toBe("improving");
    }
  });

  it("a correction with no question (a tool's judgement) can't resolve", () => {
    const s = run([wrong, repair, { kind: "correction", occurredAt: at(5), questionKey: null }]);
    expect(s.status).toBe("improving");
  });

  it("without a repair, no amount of correct answers resolves", () => {
    const s = run([
      wrong,
      { kind: "correction", occurredAt: at(3), questionKey: "q:a" },
      { kind: "correction", occurredAt: at(6), questionKey: "q:b" },
    ]);
    expect(s.status).toBe("improving");
  });

  it("a fresh mistake reopens it and voids the old repair", () => {
    const s = run([
      wrong,
      repair,
      { kind: "evidence", occurredAt: at(1), questionKey: "q:other" },
      { kind: "correction", occurredAt: at(4), questionKey: "q:new" },
    ]);
    expect(s.status).toBe("improving");
    expect(s.repairedAt).toBeNull();
    expect(s.excludedQuestionKeys).toEqual(expect.arrayContaining(["q:failed", "q:other"]));
  });

  it("a relapse after resolution reopens it", () => {
    const s = run([
      wrong,
      repair,
      { kind: "correction", occurredAt: at(3), questionKey: "q:new" },
      { kind: "evidence", occurredAt: at(10), questionKey: "q:later" },
    ]);
    expect(s.status).toBe("open");
    expect(s.resolvedAt).toBeNull();
  });

  it("schedules the retest at least two days out", () => {
    const s = run([wrong, repair]);
    expect(new Date(s.retestDueAt!).getTime()).toBeGreaterThanOrEqual(
      new Date(at(RESOLVE_AFTER_DAYS)).getTime(),
    );
  });

  it("the database trigger encodes the same delay", () => {
    const sql = readFileSync(
      resolve(__dirname, "../../../supabase/migrations/20261005010000_mistake_loop.sql"),
      "utf8",
    );
    expect(sql).toContain(`interval '${RESOLVE_AFTER_DAYS} days'`);
  });
});

describe("retest scheduling uses FSRS", () => {
  it("is never sooner than two days", () => {
    const due = new Date(retestDueAt(T0, 1));
    expect(due.getTime() - T0.getTime()).toBeGreaterThanOrEqual(RESOLVE_AFTER_DAYS * DAY);
  });

  it("does not push a recurring mistake further out than a first one", () => {
    expect(new Date(retestDueAt(T0, 4)).getTime()).toBeLessThanOrEqual(
      new Date(retestDueAt(T0, 1)).getTime(),
    );
  });
});

describe("retests are idempotent", () => {
  it("the same retest answer always produces the same key", () => {
    const q = questionKey("What is 2 + 2?");
    expect(observationKey("retest", "m1", q)).toBe(observationKey("retest", "m1", q));
    expect(observationKey("retest", "m1", q)).not.toBe(observationKey("retest", "m2", q));
  });

  it("question keys ignore case, spacing and punctuation", () => {
    expect(questionKey("What is  2+2 ?")).toBe(questionKey("what is 2 + 2"));
    expect(questionKey("What is 2+3?")).not.toBe(questionKey("What is 2+2?"));
  });

  it("keys fit the column's format", () => {
    const k = observationKey("quiz", "attempt-abc", questionKey("x".repeat(500)), "evidence");
    expect(k).toMatch(/^[A-Za-z0-9:_-]{6,200}$/);
  });

  it("replaying the same observation twice changes nothing", () => {
    /* The database collapses a replay on (user_id, idempotency_key), so the
       trigger never sees it; this checks the state the client predicts. */
    const events = [
      { kind: "evidence" as const, occurredAt: at(0), questionKey: "q:f" },
      { kind: "repair" as const, occurredAt: at(0), questionKey: "q:c" },
    ];
    expect(run(events)).toEqual(run([...events, ...events].slice(0, 2)));
  });

  it("picks a retest question the student hasn't seen for this mistake", () => {
    const pool = [{ question: "Q one" }, { question: "Q two" }];
    const picked = pickRetestQuestion(pool, [questionKey("Q one")]);
    expect(picked?.question).toBe("Q two");
    expect(pickRetestQuestion(pool, pool.map((p) => questionKey(p.question)))).toBeNull();
  });
});

describe("matching a wrong answer", () => {
  const entry = MISCONCEPTION_CATALOGUE.find((e) => e.id === "bio-plants-dont-respire")!;

  it("prefers the catalogue", () => {
    const m = matchWrongAnswer({
      question: "When do plant cells carry out respiration?",
      chosen: "Only at night",
      correct: "All the time",
      topic: "Respiration",
    });
    expect(m).toMatchObject({ kind: "catalogue", entry: { id: entry.id } });
  });

  it("falls back to a provisional AI label", () => {
    const m = matchWrongAnswer(
      { question: "Why did the Weimar Republic collapse?", chosen: "The war", correct: "Several causes" },
      { concept: "Single-cause history", belief: "Events have one cause", reteach: "r", contrast: "c" },
    );
    expect(m.kind).toBe("provisional");
  });

  it("otherwise gives a generic error type", () => {
    expect(
      matchWrongAnswer({ question: "Compute 12 × 4", chosen: "46", correct: "48" }),
    ).toEqual({ kind: "generic", errorType: "calculation" });
  });

  it.each([
    [{ question: "Which is NOT a mammal?", chosen: "Whale", correct: "Shark" }, "misread"],
    [{ question: "Name the capital", chosen: "", correct: "Paris" }, "time"],
    [{ question: "Name the capital", chosen: "Lyon", correct: "Paris", timedOut: true }, "time"],
    [{ question: "Which gas do plants take in?", chosen: "Oxygen", correct: "Carbon dioxide" }, "concept"],
    [{ question: "Solve x", chosen: "3.5 cm", correct: "3.2 cm" }, "calculation"],
  ] as const)("classifies %o as %s", (answer, type) => {
    expect(classifyError(answer)).toBe(type);
  });
});

describe("every match produces a repair with a contrast", () => {
  it.each([
    matchWrongAnswer({
      question: "When do plant cells carry out respiration?",
      chosen: "Only at night",
      correct: "All the time",
    }),
    matchWrongAnswer(
      { question: "q", chosen: "a", correct: "b" },
      { concept: "c", belief: "b", reteach: "Re-teach it this way.", contrast: "Wrong version beside the right one." },
    ),
    { kind: "generic" as const, errorType: "concept" as const },
    { kind: "generic" as const, errorType: "misread" as const },
    { kind: "generic" as const, errorType: "calculation" as const },
    { kind: "generic" as const, errorType: "time" as const },
  ])("%#", (match) => {
    const r = repairFor(match, { question: "q", chosen: "a", correct: "b" });
    expect(r.reteach.length).toBeGreaterThan(10);
    expect(r.contrast.length).toBeGreaterThan(10);
    expect(r.unverified).toBe(match.kind !== "catalogue");
  });
});

describe("provisional misconceptions", () => {
  it("are shown as a named pattern only after two observations", () => {
    expect(isNamedPattern({ provisional: true, timesObserved: 1 })).toBe(false);
    expect(isNamedPattern({ provisional: true, timesObserved: 2 })).toBe(true);
    expect(isNamedPattern({ provisional: false, timesObserved: 1 })).toBe(true);
  });
});

function ledgerRow(patch: Partial<Misconception>): Misconception {
  return {
    id: "m1",
    subject: "Biology",
    concept: "Respiration",
    conceptKey: "respiration",
    summary: "Thinks plants only respire at night",
    status: "open",
    severity: "critical",
    originTool: "quiz",
    timesObserved: 1,
    timesCorrected: 0,
    firstSeenAt: at(0),
    lastSeenAt: at(0),
    resolvedAt: null,
    ...patch,
  };
}

describe("Today surfaces", () => {
  it("open mistakes without a repair need one", () => {
    expect(needsRepair(ledgerRow({}))).toBe(true);
    expect(needsRepair(ledgerRow({ repairedAt: at(0) }))).toBe(false);
    expect(needsRepair(ledgerRow({ status: "resolved" }))).toBe(false);
  });

  it("retests show once due, and not after resolution", () => {
    const due = ledgerRow({ status: "improving", repairedAt: at(0), retestDueAt: at(2) });
    expect(retestsDue([due], new Date(at(1)))).toEqual([]);
    expect(retestsDue([due], new Date(at(2)))).toEqual([due]);
    expect(retestsDue([{ ...due, status: "resolved" }], new Date(at(3)))).toEqual([]);
  });
});

describe("readiness follows the loop", () => {
  const exam = {
    id: "e1",
    exam_name: "Biology",
    exam_date: "2026-12-01",
    difficulty: "Medium",
    folder_id: null,
  } as unknown as Exam;
  const attempts = [{ score: 8, total: 10 }] as unknown as QuizAttempt[];
  const score = (ms: Misconception[]) =>
    computeExamReadiness(exam, null, [], [], attempts, [], T0, ms).breakdown.mastery;

  it("falls while a mistake is open, stays down while improving, rises once confirmed", () => {
    const base = score([]);
    const open = score([ledgerRow({ status: "open" })]);
    const improving = score([ledgerRow({ status: "improving" })]);
    const fixed = score([ledgerRow({ status: "resolved" })]);
    expect(open).toBeLessThan(base);
    expect(improving).toBe(open);
    expect(fixed).toBeGreaterThanOrEqual(improving);
    expect(fixed).toBe(base);
  });
});

describe("provisional labels in AI prompts", () => {
  it("leave out a one-off AI label and mark a repeated one unverified", async () => {
    const { formatMisconceptionsForPrompt } = await import("./misconceptions");
    const once = ledgerRow({ id: "a", concept: "One-off guess", provisional: true, timesObserved: 1 });
    const twice = ledgerRow({ id: "b", concept: "Repeated pattern", provisional: true, timesObserved: 2 });
    const prompt = formatMisconceptionsForPrompt([once, twice], { now: new Date(at(1)) });
    expect(prompt).not.toContain("One-off guess");
    expect(prompt).toMatch(/Repeated pattern.*unverified AI reading/);
  });
});
