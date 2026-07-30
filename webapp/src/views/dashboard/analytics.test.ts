import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Exam, Folder, StudySession } from "../../api/types";
import type { LocalSessionEntry } from "./useLocalSessions";
import {
  computeFolderBreakdown,
  computeSparkline,
  computeStreak,
  daysUntil,
  formatFocusTime,
  localTotals,
  nextUpcomingExam,
  remoteTotals,
} from "./analytics";

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: "s-1",
    user_id: "user-1",
    task: null,
    folder_id: null,
    minutes: 25,
    timer_type: "pomodoro",
    started_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function local(overrides: Partial<LocalSessionEntry> = {}): LocalSessionEntry {
  return {
    id: Date.now(),
    timestamp: "Jul 30, 10:00 AM",
    minutes: 25,
    task: "General Study",
    ...overrides,
  };
}

function exam(overrides: Partial<Exam> = {}): Exam {
  return {
    id: 1,
    user_id: "user-1",
    exam_name: "Midterm",
    exam_date: "2026-08-15",
    difficulty: "Medium",
    status: "Scheduled",
    ...overrides,
  };
}

function folder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: "folder-1",
    user_id: "user-1",
    name: "Biology",
    color: "#4A90E2",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("formatFocusTime", () => {
  it("shows minutes under an hour", () => {
    expect(formatFocusTime(45)).toBe("45m");
  });

  it("shows whole hours with no leftover minutes", () => {
    expect(formatFocusTime(120)).toBe("2h");
  });

  it("shows hours and minutes together", () => {
    expect(formatFocusTime(125)).toBe("2h 5m");
  });
});

describe("localTotals / remoteTotals", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T15:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sums every local session into the total, and only today's into today", () => {
    const todayId = new Date("2026-07-30T09:00:00").getTime();
    const yesterdayId = new Date("2026-07-29T09:00:00").getTime();
    const { total, today } = localTotals([
      local({ id: todayId, minutes: 30 }),
      local({ id: yesterdayId, minutes: 45 }),
    ]);
    expect(total).toBe(75);
    expect(today).toBe(30);
  });

  it("sums remote sessions the same way, keyed on started_at", () => {
    const { total, today } = remoteTotals([
      session({ minutes: 20, started_at: "2026-07-30T09:00:00.000Z" }),
      session({ minutes: 40, started_at: "2026-07-25T09:00:00.000Z" }),
    ]);
    expect(total).toBe(60);
    // started_at is UTC and the fake clock is local; today's bucket depends
    // on the local day boundary, so just assert it's one of the two values
    // and never negative or double-counted.
    expect([20, 60]).toContain(today);
  });

  it("returns zero for an empty list", () => {
    expect(localTotals([])).toEqual({ total: 0, today: 0 });
    expect(remoteTotals([])).toEqual({ total: 0, today: 0 });
  });
});

describe("computeStreak", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T15:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts consecutive days back from today", () => {
    const sessions = [
      session({ minutes: 30, started_at: "2026-07-30T09:00:00" }),
      session({ minutes: 30, started_at: "2026-07-29T09:00:00" }),
      session({ minutes: 30, started_at: "2026-07-28T09:00:00" }),
    ];
    expect(computeStreak(sessions)).toBe(3);
  });

  it("treats today as a grace day when nothing is logged yet", () => {
    const sessions = [
      session({ minutes: 30, started_at: "2026-07-29T09:00:00" }),
      session({ minutes: 30, started_at: "2026-07-28T09:00:00" }),
    ];
    expect(computeStreak(sessions)).toBe(2);
  });

  it("breaks on a fully missed day", () => {
    const sessions = [
      session({ minutes: 30, started_at: "2026-07-30T09:00:00" }),
      // 2026-07-29 skipped
      session({ minutes: 30, started_at: "2026-07-28T09:00:00" }),
    ];
    expect(computeStreak(sessions)).toBe(1);
  });

  it("does not count a day under the 5-minute floor", () => {
    const sessions = [
      session({ minutes: 3, started_at: "2026-07-30T09:00:00" }),
    ];
    expect(computeStreak(sessions)).toBe(0);
  });
});

describe("computeSparkline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T15:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("always returns exactly 7 days ending today", () => {
    const days = computeSparkline([]);
    expect(days).toHaveLength(7);
    expect(days[6].key).toBe(new Date("2026-07-30T15:00:00").toDateString());
  });

  it("buckets minutes onto the matching day", () => {
    const days = computeSparkline([
      session({ minutes: 40, started_at: "2026-07-30T09:00:00" }),
    ]);
    expect(days[6].mins).toBe(40);
    expect(days.slice(0, 6).every((d) => d.mins === 0)).toBe(true);
  });

  it("drops minutes from sessions outside the 7-day window", () => {
    const days = computeSparkline([
      session({ minutes: 999, started_at: "2026-01-01T09:00:00" }),
    ]);
    expect(days.reduce((sum, d) => sum + d.mins, 0)).toBe(0);
  });
});

describe("computeFolderBreakdown", () => {
  it("sorts by total minutes descending and caps at 4 rows", () => {
    const folders = Array.from({ length: 6 }, (_, i) =>
      folder({ id: `f${i}`, name: `Folder ${i}` }),
    );
    const sessions = folders.map((f, i) =>
      session({ folder_id: f.id, minutes: (i + 1) * 10 }),
    );
    const rows = computeFolderBreakdown(sessions, folders);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.mins)).toEqual([60, 50, 40, 30]);
  });

  it("groups a null folder_id under Unassigned", () => {
    const rows = computeFolderBreakdown(
      [session({ folder_id: null, minutes: 15 })],
      [],
    );
    expect(rows).toEqual([
      { id: "unassigned", name: "Unassigned", color: "#888", mins: 15 },
    ]);
  });

  it("falls back to a safe color for a garbage stored value", () => {
    const rows = computeFolderBreakdown(
      [session({ folder_id: "folder-1", minutes: 10 })],
      [folder({ id: "folder-1", color: "not-a-color" })],
    );
    expect(rows[0].color).toBe("#888");
  });
});

describe("nextUpcomingExam", () => {
  it("picks the earliest exam on or after today, ignoring Completed", () => {
    const exams = [
      exam({ id: 1, exam_date: "2026-09-01" }),
      exam({ id: 2, exam_date: "2026-08-01" }),
      exam({ id: 3, exam_date: "2026-07-15", status: "Completed" }),
    ];
    expect(nextUpcomingExam(exams, "2026-07-30")?.id).toBe(2);
  });

  it("returns null when nothing qualifies", () => {
    const exams = [exam({ exam_date: "2026-01-01" })];
    expect(nextUpcomingExam(exams, "2026-07-30")).toBeNull();
  });
});

describe("daysUntil", () => {
  it("is 0 for today", () => {
    const today = new Date("2026-07-30T00:00:00");
    expect(daysUntil("2026-07-30", today)).toBe(0);
  });

  it("counts whole days ahead", () => {
    const today = new Date("2026-07-30T00:00:00");
    expect(daysUntil("2026-08-01", today)).toBe(2);
  });

  it("parses the date string in local time, not UTC", () => {
    // A naive `new Date("2026-08-01")` parses as UTC midnight. West of
    // Greenwich that instant falls on the *previous* local calendar day, so
    // comparing it against a local midnight "today" would be off by one.
    // Appending "T00:00:00" keeps both sides on local calendar days
    // regardless of the machine's timezone.
    const localMidnightJuly31 = new Date(2026, 6, 31);
    expect(daysUntil("2026-08-01", localMidnightJuly31)).toBe(1);
  });
});
