import { describe, expect, it } from "vitest";
import { computeWeekAdherence, formatAdherenceNote } from "./planAdherence";
import type { Folder, StudySession } from "../api/types";
import type { PlanDay } from "./aiJson";

const WEEK_START = "2026-08-03"; // a Monday

function folder(id: string, name: string): Folder {
  return {
    id,
    user_id: "user-1",
    name,
    color: "#123456",
    created_at: "2026-01-01T00:00:00Z",
  };
}

function session(
  minutes: number,
  folderId: string | null,
  startedAt: string,
): StudySession {
  return {
    id: `s-${startedAt}-${minutes}`,
    user_id: "user-1",
    minutes,
    folder_id: folderId,
    started_at: startedAt,
    created_at: startedAt,
    task: null,
    timer_type: null,
  };
}

const days: PlanDay[] = [
  {
    date: "2026-08-03",
    blocks: [
      { subject: "Chemistry", durationMins: 90 },
      { subject: "Biology", durationMins: 30 },
    ],
  },
  {
    date: "2026-08-04",
    blocks: [{ subject: "Chemistry", durationMins: 30 }],
  },
];

const folders = [folder("f-chem", "Chemistry"), folder("f-bio", "Biology")];

describe("computeWeekAdherence", () => {
  it("sums planned minutes per subject across every day of the week", () => {
    const result = computeWeekAdherence(days, [], folders, WEEK_START);
    expect(result.plannedTotal).toBe(150);
    expect(result.bySubject).toEqual([
      { subject: "Chemistry", plannedMins: 120, actualMins: 0 },
      { subject: "Biology", plannedMins: 30, actualMins: 0 },
    ]);
  });

  it("matches actual minutes to a subject via an exact-name folder", () => {
    const sessions = [
      session(100, "f-chem", "2026-08-05T10:00:00Z"),
      session(20, "f-bio", "2026-08-05T12:00:00Z"),
    ];
    const result = computeWeekAdherence(days, sessions, folders, WEEK_START);
    expect(result.bySubject).toContainEqual({
      subject: "Chemistry",
      plannedMins: 120,
      actualMins: 100,
    });
    expect(result.bySubject).toContainEqual({
      subject: "Biology",
      plannedMins: 30,
      actualMins: 20,
    });
  });

  it("does not attribute a session to a subject whose name only partially matches", () => {
    // "Chem Ch.4" is not "Chemistry" — a substring match would have
    // wrongly attributed this session, which is exactly the false-positive
    // this function is written to avoid.
    const looseFolders = [folder("f-chem", "Chem Ch.4")];
    const sessions = [session(60, "f-chem", "2026-08-05T10:00:00Z")];
    const result = computeWeekAdherence(
      days,
      sessions,
      looseFolders,
      WEEK_START,
    );
    expect(
      result.bySubject.find((s) => s.subject === "Chemistry")?.actualMins,
    ).toBe(0);
  });

  it("ignores sessions outside the given week", () => {
    const sessions = [
      session(60, "f-chem", "2026-07-27T10:00:00Z"), // previous week
      session(60, "f-chem", "2026-08-11T10:00:00Z"), // next week
    ];
    const result = computeWeekAdherence(days, sessions, folders, WEEK_START);
    expect(result.actualTotal).toBe(0);
  });

  it("flags a subject as neglected only below a third of its planned time, and above a noise floor", () => {
    const sessions = [session(30, "f-chem", "2026-08-05T10:00:00Z")]; // 30 of 120 planned
    const result = computeWeekAdherence(days, sessions, folders, WEEK_START);
    // Chemistry: 30 of 120 planned (below a third). Biology: 30 planned, 0
    // actual — also below a third, and above the 20m noise floor, so it
    // qualifies too; the separate test below covers the floor itself.
    expect(result.neglectedSubjects).toEqual(["Chemistry", "Biology"]);
  });

  it("does not flag a tiny filler block (<20m planned) as neglected", () => {
    const tinyDays: PlanDay[] = [
      {
        date: "2026-08-03",
        blocks: [{ subject: "Light review", durationMins: 10 }],
      },
    ];
    const result = computeWeekAdherence(tinyDays, [], folders, WEEK_START);
    expect(result.neglectedSubjects).toEqual([]);
  });

  it("caps completion at 100% when the student over-delivered", () => {
    const sessions = [session(500, "f-chem", "2026-08-05T10:00:00Z")];
    const result = computeWeekAdherence(days, sessions, folders, WEEK_START);
    expect(result.completionPct).toBe(100);
  });

  it("reports 0% completion for an empty plan rather than dividing by zero", () => {
    const result = computeWeekAdherence([], [], folders, WEEK_START);
    expect(result.completionPct).toBe(0);
    expect(result.plannedTotal).toBe(0);
  });
});

describe("formatAdherenceNote", () => {
  it("says None when there was no plan to compare against", () => {
    expect(
      formatAdherenceNote({
        plannedTotal: 0,
        actualTotal: 0,
        completionPct: 0,
        bySubject: [],
        neglectedSubjects: [],
      }),
    ).toBe("None");
  });

  it("names neglected subjects when there are any", () => {
    const note = formatAdherenceNote({
      plannedTotal: 150,
      actualTotal: 60,
      completionPct: 40,
      bySubject: [],
      neglectedSubjects: ["Chemistry"],
    });
    expect(note).toBe(
      "Followed about 40% of last week's planned study time. Under-studied relative to plan: Chemistry.",
    );
  });

  it("omits the neglected clause when nothing was neglected", () => {
    const note = formatAdherenceNote({
      plannedTotal: 150,
      actualTotal: 150,
      completionPct: 100,
      bySubject: [],
      neglectedSubjects: [],
    });
    expect(note).toBe("Followed about 100% of last week's planned study time.");
  });
});
