import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  formatDateStr,
  localDateStr,
  mondayOfWeek,
  weekDates,
  parseLocalDate,
  formatRelativeTime,
  formatMonthDay,
  formatDueDate,
} from "./date";

describe("date utils", () => {
  describe("formatDateStr", () => {
    it("formats year/month/day as YYYY-MM-DD", () => {
      expect(formatDateStr(2026, 7, 3)).toBe("2026-08-03");
    });

    it("pads single-digit months", () => {
      expect(formatDateStr(2026, 0, 15)).toBe("2026-01-15");
    });

    it("pads single-digit days", () => {
      expect(formatDateStr(2026, 11, 3)).toBe("2026-12-03");
    });

    it("handles December (month 11)", () => {
      expect(formatDateStr(2026, 11, 31)).toBe("2026-12-31");
    });
  });

  describe("localDateStr", () => {
    it("converts a date to YYYY-MM-DD using local time", () => {
      const date = new Date(2026, 7, 3); // Aug 3, 2026
      expect(localDateStr(date)).toBe("2026-08-03");
    });

    it("uses current date when no argument passed", () => {
      const today = new Date();
      const result = localDateStr();
      const expected = localDateStr(today);
      expect(result).toBe(expected);
    });

    it("uses local time, not UTC", () => {
      // Create a date string and parse it back to ensure local interpretation
      const date = parseLocalDate("2026-08-03");
      expect(localDateStr(date)).toBe("2026-08-03");
    });
  });

  describe("mondayOfWeek", () => {
    it("returns Monday of the same week for a weekday", () => {
      // 2026-08-05 is a Wednesday
      const wed = new Date(2026, 7, 5);
      const monday = mondayOfWeek(wed);
      expect(localDateStr(monday)).toBe("2026-08-03"); // Monday of that week
    });

    it("returns the same day for Monday input", () => {
      // 2026-08-03 is a Monday
      const monday = new Date(2026, 7, 3);
      const result = mondayOfWeek(monday);
      expect(localDateStr(result)).toBe("2026-08-03");
    });

    it("maps Sunday to previous Monday (week starts Monday)", () => {
      // 2026-08-02 is a Sunday
      const sunday = new Date(2026, 7, 2);
      const result = mondayOfWeek(sunday);
      expect(localDateStr(result)).toBe("2026-07-27"); // Monday of previous week
    });

    it("handles week wrap across months", () => {
      // 2026-08-03 is a Monday
      // 2026-08-02 is a Sunday -> maps to 2026-07-27 (previous Monday)
      const sunday = new Date(2026, 7, 2);
      const result = mondayOfWeek(sunday);
      expect(result.getMonth()).toBe(6); // July (0-indexed)
      expect(result.getDate()).toBe(27);
    });

    it("uses current date when no argument passed", () => {
      const today = new Date();
      const result = mondayOfWeek();
      const expected = mondayOfWeek(today);
      expect(localDateStr(result)).toBe(localDateStr(expected));
    });
  });

  describe("weekDates", () => {
    it("returns 7 consecutive dates starting from Monday", () => {
      // 2026-08-05 is Wednesday
      const wed = new Date(2026, 7, 5);
      const dates = weekDates(wed);

      expect(dates.length).toBe(7);
      expect(dates[0]).toBe("2026-08-03"); // Monday
      expect(dates[1]).toBe("2026-08-04"); // Tuesday
      expect(dates[2]).toBe("2026-08-05"); // Wednesday
      expect(dates[6]).toBe("2026-08-09"); // Sunday
    });

    it("returns dates for a week starting on Monday", () => {
      const monday = new Date(2026, 7, 3);
      const dates = weekDates(monday);
      expect(dates).toEqual([
        "2026-08-03",
        "2026-08-04",
        "2026-08-05",
        "2026-08-06",
        "2026-08-07",
        "2026-08-08",
        "2026-08-09",
      ]);
    });
  });

  describe("parseLocalDate", () => {
    it("parses YYYY-MM-DD as local midnight", () => {
      const date = parseLocalDate("2026-08-03");
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(7); // August (0-indexed)
      expect(date.getDate()).toBe(3);
      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
      expect(date.getSeconds()).toBe(0);
    });

    it("interprets as local time, not UTC", () => {
      // Parse a date and ensure it represents local midnight
      const date = parseLocalDate("2026-08-03");
      const roundTrip = localDateStr(date);
      expect(roundTrip).toBe("2026-08-03");
    });

    it("handles dates at month boundaries", () => {
      const date = parseLocalDate("2026-08-31");
      expect(localDateStr(date)).toBe("2026-08-31");
    });

    it("handles leap year dates", () => {
      // 2024 is a leap year
      const date = parseLocalDate("2024-02-29");
      expect(date.getDate()).toBe(29);
      expect(date.getMonth()).toBe(1); // February (0-indexed)
    });
  });

  describe("formatRelativeTime", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns 'just now' for recent timestamps", () => {
      const now = new Date("2026-08-03T12:00:00Z");
      vi.setSystemTime(now);

      const recentTime = new Date(now.getTime() - 30 * 1000).toISOString(); // 30 seconds ago
      expect(formatRelativeTime(recentTime)).toBe("just now");
    });

    it("returns minutes for times within an hour", () => {
      const now = new Date("2026-08-03T12:00:00Z");
      vi.setSystemTime(now);

      const time5mAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      expect(formatRelativeTime(time5mAgo)).toBe("5m ago");
    });

    it("returns hours for times within a day", () => {
      const now = new Date("2026-08-03T12:00:00Z");
      vi.setSystemTime(now);

      const time2hAgo = new Date(
        now.getTime() - 2 * 60 * 60 * 1000,
      ).toISOString();
      expect(formatRelativeTime(time2hAgo)).toBe("2h ago");
    });

    it("returns days for older times", () => {
      const now = new Date("2026-08-03T12:00:00Z");
      vi.setSystemTime(now);

      const time3dAgo = new Date(
        now.getTime() - 3 * 24 * 60 * 60 * 1000,
      ).toISOString();
      expect(formatRelativeTime(time3dAgo)).toBe("3d ago");
    });

    it("rounds minutes correctly", () => {
      const now = new Date("2026-08-03T12:00:00Z");
      vi.setSystemTime(now);

      const time59sAgo = new Date(now.getTime() - 59 * 1000).toISOString();
      expect(formatRelativeTime(time59sAgo)).toBe("just now"); // rounds to 0 or 1, still "just now"

      const time1m30sAgo = new Date(now.getTime() - 90 * 1000).toISOString();
      expect(formatRelativeTime(time1m30sAgo)).toBe("2m ago"); // rounds to 2
    });
  });

  describe("formatMonthDay", () => {
    it("formats a date as 'Mon Day' (e.g., 'Aug 3')", () => {
      const date = new Date(2026, 7, 3); // August 3, 2026
      const result = formatMonthDay(date);
      expect(result).toMatch(/Aug.*3|3.*Aug/); // Uses locale, so just check both parts are present
    });

    it("works for other months", () => {
      const january = new Date(2026, 0, 15);
      const result = formatMonthDay(january);
      expect(result).toMatch(/Jan.*15|15.*Jan/);
    });

    it("handles single-digit and double-digit days", () => {
      const day1 = new Date(2026, 7, 1);
      const day31 = new Date(2026, 7, 31);

      const result1 = formatMonthDay(day1);
      const result31 = formatMonthDay(day31);

      expect(result1).toMatch(/Aug.*1|1.*Aug/);
      expect(result31).toMatch(/Aug.*31|31.*Aug/);
    });
  });
  describe("formatDueDate", () => {
    /* Anchored to an explicit "today" rather than the real clock: these are
       calendar-relative labels, and a suite that ran across midnight would
       otherwise start disagreeing with itself. */
    const TODAY = "2026-08-19";

    it("says Today, Tomorrow and Yesterday for the dates a student acts on", () => {
      expect(formatDueDate("2026-08-19", TODAY)).toBe("Today");
      expect(formatDueDate("2026-08-20", TODAY)).toBe("Tomorrow");
      expect(formatDueDate("2026-08-18", TODAY)).toBe("Yesterday");
    });

    it("falls back to a short weekday date further out", () => {
      const result = formatDueDate("2026-08-25", TODAY);
      expect(result).toMatch(/Tue/);
      expect(result).toMatch(/Aug/);
      expect(result).toMatch(/25/);
      expect(result).not.toMatch(/2026/);
    });

    it("names the year only when it is not the current one", () => {
      expect(formatDueDate("2027-01-04", TODAY)).toMatch(/2027/);
    });

    it("crosses a month boundary without reporting the wrong day", () => {
      expect(formatDueDate("2026-09-01", "2026-08-31")).toBe("Tomorrow");
      expect(formatDueDate("2026-08-31", "2026-09-01")).toBe("Yesterday");
    });

    it("crosses a year boundary too", () => {
      expect(formatDueDate("2027-01-01", "2026-12-31")).toBe("Tomorrow");
    });

    it("reads a plain date as local, not UTC", () => {
      /* parseLocalDate's whole reason for existing: `new Date("2026-08-19")`
         is UTC midnight, which is the 18th anywhere west of Greenwich. */
      expect(formatDueDate("2026-08-19", "2026-08-19")).toBe("Today");
    });
  });
});
