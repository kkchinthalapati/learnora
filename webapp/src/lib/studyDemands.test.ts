import { describe, expect, it } from "vitest";
import {
  buildDemands,
  cleanDemandLabel,
  parseDurationHint,
} from "./studyDemands";
import type { Exam, Task } from "../api/types";

const TODAY = "2026-09-01";

function task(patch: Partial<Task> & { id: number }): Task {
  return {
    user_id: "u1",
    text: `Task ${patch.id}`,
    is_done: false,
    due_date: null,
    ...patch,
  };
}

function exam(patch: Partial<Exam> & { id: number }): Exam {
  return {
    user_id: "u1",
    exam_name: `Exam ${patch.id}`,
    exam_date: "2026-09-10",
    difficulty: "Medium",
    status: "Upcoming",
    ...patch,
  };
}

const EMPTY = {
  tasks: [],
  exams: [],
  dueCardCount: 0,
  today: TODAY,
  horizonDays: 7,
};

describe("parseDurationHint", () => {
  it("reads the forms a student would actually type", () => {
    expect(parseDurationHint("Read chapter 4 ~45m")).toBe(45);
    expect(parseDurationHint("Essay plan ~2h")).toBe(120);
    expect(parseDurationHint("Notes ~90 mins")).toBe(90);
  });

  it("returns null when there is no hint", () => {
    expect(parseDurationHint("Read chapter 4")).toBeNull();
    expect(parseDurationHint("Chapter ~ four")).toBeNull();
  });

  it("caps an implausible hint rather than booking the whole week", () => {
    expect(parseDurationHint("Revise everything ~99h")).toBe(240);
  });
});

describe("cleanDemandLabel", () => {
  it("strips the recurrence tag and the duration hint", () => {
    expect(cleanDemandLabel("Gym log [🔁 Weekly] ~30m")).toBe("Gym log");
  });

  it("leaves an ordinary label alone", () => {
    expect(cleanDemandLabel("Read chapter 4")).toBe("Read chapter 4");
  });
});

describe("buildDemands — reviews", () => {
  it("asks for due cards today and links to the review screen", () => {
    const [d] = buildDemands({ ...EMPTY, dueCardCount: 40 });
    expect(d).toMatchObject({
      kind: "review",
      load: 1,
      dueDate: TODAY,
      href: "/library/flashcards",
    });
    expect(d.label).toBe("Review 40 due cards");
  });

  it("says one card in the singular", () => {
    expect(buildDemands({ ...EMPTY, dueCardCount: 1 })[0].label).toBe(
      "Review 1 due card",
    );
  });

  it("caps a huge backlog instead of booking a two-hour sitting", () => {
    /* 300 cards is a bad evening, not a 150-minute block. The rest comes back
       tomorrow, which is what the SRS scheduler wants anyway. */
    expect(buildDemands({ ...EMPTY, dueCardCount: 300 })[0].estMins).toBe(40);
    expect(buildDemands({ ...EMPTY, dueCardCount: 2 })[0].estMins).toBe(10);
  });

  it("asks for nothing when nothing is due", () => {
    expect(buildDemands(EMPTY)).toEqual([]);
  });
});

describe("buildDemands — tasks", () => {
  it("skips completed tasks", () => {
    const demands = buildDemands({
      ...EMPTY,
      tasks: [task({ id: 1, is_done: true, due_date: TODAY })],
    });
    expect(demands).toEqual([]);
  });

  it("uses a duration hint when the student gave one", () => {
    const demands = buildDemands({
      ...EMPTY,
      tasks: [task({ id: 1, text: "Essay plan ~90m", due_date: TODAY })],
    });
    expect(demands[0]).toMatchObject({ estMins: 90, label: "Essay plan" });
  });

  it("falls back to a default estimate", () => {
    const demands = buildDemands({
      ...EMPTY,
      tasks: [task({ id: 1, due_date: TODAY })],
    });
    expect(demands[0].estMins).toBe(30);
  });

  it("pulls an overdue deadline to today so it can still be scheduled", () => {
    /* Left in the past there is no window on or before it, and the task comes
       straight back as unplaced — technically true, completely unhelpful. */
    const demands = buildDemands({
      ...EMPTY,
      tasks: [task({ id: 1, due_date: "2026-08-20" })],
    });
    expect(demands[0].dueDate).toBe(TODAY);
  });

  it("ignores a deadline past the horizon", () => {
    const demands = buildDemands({
      ...EMPTY,
      tasks: [task({ id: 1, due_date: "2026-12-01" })],
    });
    expect(demands).toEqual([]);
  });

  it("takes only a few undated tasks so they cannot bury the dated ones", () => {
    const demands = buildDemands({
      ...EMPTY,
      tasks: [1, 2, 3, 4, 5, 6].map((id) => task({ id })),
    });
    expect(demands).toHaveLength(3);
    expect(demands.every((d) => d.dueDate === null)).toBe(true);
  });

  it("drops a task whose text is nothing but tags", () => {
    const demands = buildDemands({
      ...EMPTY,
      tasks: [task({ id: 1, text: "[🔁 Weekly]", due_date: TODAY })],
    });
    expect(demands).toEqual([]);
  });
});

describe("buildDemands — exams", () => {
  it("spreads prep across the days before the exam, one sitting per day", () => {
    const demands = buildDemands({
      ...EMPTY,
      exams: [exam({ id: 1, exam_date: "2026-09-04" })],
    });
    expect(demands.map((d) => d.dueDate)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
    expect(demands.every((d) => d.kind === "exam" && d.load === 3)).toBe(true);
  });

  it("never proposes prep past the exam itself", () => {
    const demands = buildDemands({
      ...EMPTY,
      exams: [exam({ id: 1, exam_date: "2026-09-02" })],
      horizonDays: 14,
    });
    expect(demands).toHaveLength(2);
  });

  it("stops at the horizon for a distant exam", () => {
    const demands = buildDemands({
      ...EMPTY,
      exams: [exam({ id: 1, exam_date: "2026-12-01" })],
      horizonDays: 7,
    });
    expect(demands).toHaveLength(7);
  });

  it("gives a harder exam a longer sitting", () => {
    const hard = buildDemands({
      ...EMPTY,
      exams: [exam({ id: 1, difficulty: "Hard" })],
    });
    const easy = buildDemands({
      ...EMPTY,
      exams: [exam({ id: 2, difficulty: "Easy" })],
    });
    expect(hard[0].estMins).toBeGreaterThan(easy[0].estMins);
  });

  it("treats an unknown difficulty as medium", () => {
    const unknown = buildDemands({
      ...EMPTY,
      exams: [exam({ id: 1, difficulty: null })],
    });
    const medium = buildDemands({
      ...EMPTY,
      exams: [exam({ id: 2, difficulty: "Medium" })],
    });
    expect(unknown[0].estMins).toBe(medium[0].estMins);
  });

  it("boosts a near exam above a distant one", () => {
    const near = buildDemands({
      ...EMPTY,
      exams: [exam({ id: 1, exam_date: "2026-09-02" })],
    });
    const far = buildDemands({
      ...EMPTY,
      exams: [exam({ id: 2, exam_date: "2026-09-30" })],
    });
    expect(near[0].boost ?? 0).toBeGreaterThan(far[0].boost ?? 0);
  });

  it("ignores completed and past exams", () => {
    const demands = buildDemands({
      ...EMPTY,
      exams: [
        exam({ id: 1, status: "Completed" }),
        exam({ id: 2, exam_date: "2026-08-01" }),
      ],
    });
    expect(demands).toEqual([]);
  });
});

describe("buildDemands — weak topics", () => {
  it("books deep work on the two worst topics, with no deadline", () => {
    const demands = buildDemands({
      ...EMPTY,
      weakTopics: [
        { topic: "Titration", count: 5 },
        { topic: "Moles", count: 3 },
        { topic: "Bonding", count: 2 },
      ],
    });
    expect(demands.map((d) => d.label)).toEqual([
      "Rebuild: Titration",
      "Rebuild: Moles",
    ]);
    expect(demands.every((d) => d.load === 3 && !d.dueDate)).toBe(true);
  });
});

describe("buildDemands — together", () => {
  it("produces one comparable queue from every source", () => {
    const demands = buildDemands({
      today: TODAY,
      horizonDays: 7,
      dueCardCount: 20,
      tasks: [task({ id: 1, text: "Lab report ~45m", due_date: "2026-09-03" })],
      exams: [exam({ id: 1, exam_date: "2026-09-03" })],
      weakTopics: [{ topic: "Moles", count: 4 }],
    });
    expect(new Set(demands.map((d) => d.kind))).toEqual(
      new Set(["review", "task", "exam", "subject"]),
    );
    expect(demands.every((d) => d.estMins > 0 && d.id && d.label)).toBe(true);
    expect(new Set(demands.map((d) => d.id)).size).toBe(demands.length);
  });
});
