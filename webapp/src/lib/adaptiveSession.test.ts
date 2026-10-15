import { beforeEach, describe, expect, it } from "vitest";
import {
  activityHref,
  advanceRun,
  examContext,
  loadRun,
  pickNextActivity,
  pickTeachRow,
  planSession,
  resolveFocus,
  startRun,
  type ExamContext,
  type PickInput,
} from "./adaptiveSession";
import type { Misconception } from "./misconceptions";

function row(patch: Partial<Misconception> = {}): Misconception {
  return {
    id: "m1",
    subject: "Chemistry",
    concept: "Hydrolysis",
    conceptKey: "hydrolysis",
    summary: "Believes water is consumed rather than added.",
    status: "open",
    severity: "critical",
    originTool: "quiz",
    timesObserved: 1,
    timesCorrected: 0,
    firstSeenAt: "2026-09-01T00:00:00Z",
    lastSeenAt: "2026-09-05T00:00:00Z",
    resolvedAt: null,
    ...patch,
  };
}

const exam = (patch: Partial<ExamContext> = {}): ExamContext => ({
  name: "Chemistry Paper 1",
  subject: "Chemistry",
  daysUntil: 10,
  ...patch,
});

function input(patch: Partial<PickInput> = {}): PickInput {
  return {
    focus: { topic: "Hydrolysis", subject: "Chemistry", misconceptionId: "m1" },
    ranked: [row()],
    dueCards: 12,
    exam: exam(),
    done: [],
    ...patch,
  };
}

describe("resolveFocus", () => {
  it("uses what the student typed over anything in the ledger", () => {
    expect(
      resolveFocus({ topic: "  Osmosis ", ranked: [row()], exam: exam() }),
    ).toEqual({
      topic: "Osmosis",
    });
  });

  it("takes the most urgent row on the next exam's paper", () => {
    const physics = row({ id: "p", subject: "Physics", concept: "Momentum" });
    const chem = row({ id: "c", subject: "Chemistry", concept: "Moles" });
    expect(resolveFocus({ ranked: [physics, chem], exam: exam() })).toEqual({
      topic: "Moles",
      subject: "Chemistry",
      misconceptionId: "c",
    });
  });

  it("falls back to the top row, then the exam's subject, then nothing", () => {
    const physics = row({ id: "p", subject: "Physics", concept: "Momentum" });
    expect(
      resolveFocus({ ranked: [physics], exam: exam() })?.misconceptionId,
    ).toBe("p");
    expect(resolveFocus({ ranked: [], exam: exam() })).toEqual({
      topic: "Chemistry",
      subject: "Chemistry",
    });
    /* A new account: nothing to go on, so the student is asked. */
    expect(resolveFocus({ ranked: [], exam: null })).toBeNull();
  });
});

describe("pickNextActivity", () => {
  it("runs check → flashcards → teach → traps when everything applies", () => {
    expect(planSession(input()).map((a) => a.kind)).toEqual([
      "check",
      "flashcards",
      "teach",
      "traps",
    ]);
  });

  it("maps each activity onto an existing Session mode", () => {
    const plan = planSession(input());
    expect(plan.map((a) => [a.mode, a.preset])).toEqual([
      ["practice", undefined],
      ["recall", undefined],
      ["teach", undefined],
      ["practice", "traps"],
    ]);
    expect(plan[2].misconceptionId).toBe("m1");
  });

  it("skips flashcards when nothing is due", () => {
    expect(planSession(input({ dueCards: 0 })).map((a) => a.kind)).toEqual([
      "check",
      "teach",
      "traps",
    ]);
  });

  it("skips the teach-back when the ledger has nothing on this focus", () => {
    const plan = planSession(
      input({
        focus: { topic: "Osmosis" },
        ranked: [row({ subject: "History", concept: "Treaty of Versailles" })],
      }),
    );
    expect(plan.map((a) => a.kind)).toEqual(["check", "flashcards", "traps"]);
  });

  it("does not teach back a slip, only a belief", () => {
    expect(
      pickTeachRow(input({ ranked: [row({ errorType: "calculation" })] })),
    ).toBeNull();
  });

  it("teaches what this run's check just found, over an older recurring row", () => {
    const old = row({ id: "old", timesObserved: 5 });
    const fresh = row({
      id: "fresh",
      concept: "Ester hydrolysis",
      lastSeenAt: "2026-10-15T10:05:00+00:00",
    });
    const next = pickNextActivity(
      input({
        ranked: [old, fresh],
        done: ["check", "flashcards"],
        startedAt: "2026-10-15T10:00:00.000Z",
      }),
    );
    expect(next).toMatchObject({ kind: "teach", misconceptionId: "fresh" });
    expect(next?.why).toMatch(/The check just caught this/);
  });

  it("prefers a row that came back after correction, and says so", () => {
    const once = row({ id: "once" });
    const back = row({ id: "back", timesObserved: 3 });
    const next = pickNextActivity(
      input({ ranked: [once, back], done: ["check", "flashcards"] }),
    );
    expect(next).toMatchObject({ kind: "teach", misconceptionId: "back" });
    expect(next?.why).toMatch(/come back 3 times/);
  });

  it("teaches a row found this run even off the typed topic", () => {
    const found = row({
      id: "f",
      subject: "Biology",
      concept: "Diffusion",
      lastSeenAt: "2026-10-15T11:00:00Z",
    });
    const next = pickNextActivity(
      input({
        focus: { topic: "Osmosis" },
        ranked: [found],
        done: ["check", "flashcards"],
        startedAt: "2026-10-15T10:00:00Z",
      }),
    );
    expect(next?.misconceptionId).toBe("f");
  });

  it("never teaches the same row twice in a run", () => {
    expect(
      pickNextActivity(input({ done: ["check", "flashcards"], taught: ["m1"] }))
        ?.kind,
    ).toBe("traps");
  });

  describe("exam date", () => {
    it("adds traps for a close exam even with an empty ledger", () => {
      const plan = planSession(
        input({
          focus: { topic: "Chemistry", subject: "Chemistry" },
          ranked: [],
          dueCards: 0,
        }),
      );
      expect(plan.map((a) => a.kind)).toEqual(["check", "traps"]);
      expect(plan[1].why).toMatch(/Chemistry Paper 1 exam is in 10 days/);
    });

    it("leaves traps out with no exam and nothing to trap", () => {
      expect(
        planSession(
          input({
            focus: { topic: "Osmosis" },
            ranked: [],
            exam: null,
            dueCards: 0,
          }),
        ).map((a) => a.kind),
      ).toEqual(["check"]);
    });

    it("leaves traps out for a far-off exam with nothing to trap", () => {
      expect(
        planSession(
          input({
            focus: { topic: "Osmosis" },
            ranked: [],
            exam: exam({ daysUntil: 90 }),
            dueCards: 0,
          }),
        ).map((a) => a.kind),
      ).toEqual(["check"]);
    });

    it("keeps traps for a far-off exam when the ledger has something here", () => {
      const plan = planSession(input({ exam: exam({ daysUntil: 90 }) }));
      expect(plan.at(-1)?.kind).toBe("traps");
      expect(plan.at(-1)?.why).not.toMatch(/exam is in/);
    });

    it("says today and tomorrow plainly", () => {
      const done = ["check", "flashcards", "teach"] as const;
      expect(
        pickNextActivity(input({ done, exam: exam({ daysUntil: 0 }) }))?.why,
      ).toMatch(/exam is today/);
      expect(
        pickNextActivity(input({ done, exam: exam({ daysUntil: 1 }) }))?.why,
      ).toMatch(/exam is tomorrow/);
    });
  });

  it("ends the run once every activity is done", () => {
    expect(
      pickNextActivity(
        input({ done: ["check", "flashcards", "teach", "traps"] }),
      ),
    ).toBeNull();
  });
});

describe("examContext", () => {
  it("names the nearest upcoming exam and counts whole days to it", () => {
    const now = new Date(2026, 9, 15, 18, 0);
    expect(
      examContext(
        [
          { exam_name: "Old", exam_date: "2026-10-01" },
          { exam_name: "Physics Paper 2", exam_date: "2026-10-20" },
          { exam_name: "Chemistry Paper 1", exam_date: "2026-10-16" },
        ],
        [{ id: "f", name: "Chemistry" }],
        now,
      ),
    ).toEqual({
      name: "Chemistry Paper 1",
      subject: "Chemistry",
      daysUntil: 1,
    });
    expect(examContext([], [], now)).toBeNull();
  });
});

describe("runs", () => {
  beforeEach(() => localStorage.clear());

  it("tags each activity's Session with its run", () => {
    const [first] = planSession(input());
    expect(activityHref(first, "r-1")).toBe(
      "/study/new?mode=practice&topic=Hydrolysis&misconception=m1&run=r-1",
    );
    const traps = planSession(input()).at(-1)!;
    expect(activityHref(traps, "r-1")).toBe(
      "/study/new?mode=practice&topic=Hydrolysis&preset=traps&run=r-1",
    );
  });

  it("remembers what is done and what was taught", () => {
    const plan = planSession(input());
    let run = startRun(input().focus, plan[0]);
    run = advanceRun(run, plan[1]);
    run = advanceRun(run, plan[2]);
    run = advanceRun(run, plan[3]);
    expect(loadRun(run.id)).toMatchObject({
      done: ["check", "flashcards", "teach"],
      taught: ["m1"],
      current: { kind: "traps" },
    });
    run = advanceRun(run, null);
    expect(loadRun(run.id)?.current).toBeNull();
    expect(loadRun(run.id)?.finishedAt).toBeTruthy();
  });
});
