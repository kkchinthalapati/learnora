import { describe, expect, it } from "vitest";
import {
  formatRecurrenceCleanText,
  nextTaskOccurrence,
  parseTaskRepeat,
  setTaskRepeat,
} from "./taskRepeat";
import { TASK_MAX } from "./fieldLimits";

/* Fixture weekdays: 2026-11-12 Thu, 11-13 Fri, 11-14 Sat, 11-16 Mon. */

function next(text: string, due: string | null, today: string) {
  return nextTaskOccurrence(text, due, today);
}

describe("parseTaskRepeat", () => {
  it("reads each repeat the picker writes", () => {
    expect(parseTaskRepeat("A [🔁 Daily]")?.repeat).toBe("daily");
    expect(parseTaskRepeat("A [🔁 Weekdays]")?.repeat).toBe("weekdays");
    expect(parseTaskRepeat("A [🔁 Weekly]")?.repeat).toBe("weekly");
    expect(parseTaskRepeat("A [🔁 Every 2 weeks]")?.repeat).toBe("biweekly");
    expect(parseTaskRepeat("A [🔁 Monthly]")).toEqual({
      repeat: "monthly",
      monthDay: null,
    });
    expect(parseTaskRepeat("A [🔁 Monthly 31]")).toEqual({
      repeat: "monthly",
      monthDay: 31,
    });
  });

  /* Tasks saved before the picker still have to repeat weekly. */
  it("keeps every older weekly spelling", () => {
    for (const text of [
      "Math homework [🔁 Weekly]",
      "Submit assignment [Weekly]",
      "Read chapter 4 🔁 Weekly",
      "Chemistry lab [🔁 weekly]",
      "Quiz prep [weekly]",
    ]) {
      expect(parseTaskRepeat(text)?.repeat).toBe("weekly");
    }
  });

  it("is null for ordinary titles, including ones that mention a period", () => {
    expect(parseTaskRepeat("Review physics notes")).toBeNull();
    expect(parseTaskRepeat("")).toBeNull();
    expect(parseTaskRepeat("Weekly meeting notes")).toBeNull();
    expect(parseTaskRepeat("Read the [Daily] briefing")).toBeNull();
  });
});

describe("formatRecurrenceCleanText", () => {
  it("strips any repeat tag and tidies the spacing", () => {
    expect(formatRecurrenceCleanText("Math homework [🔁 Weekly]")).toBe(
      "Math homework",
    );
    expect(formatRecurrenceCleanText("Physics problem set [Weekly]")).toBe(
      "Physics problem set",
    );
    expect(formatRecurrenceCleanText("Read literature 🔁 Weekly")).toBe(
      "Read literature",
    );
    expect(formatRecurrenceCleanText("  History essay  [🔁 Weekly]  ")).toBe(
      "History essay",
    );
    expect(formatRecurrenceCleanText("Gym [🔁 Every 2 weeks]")).toBe("Gym");
    expect(formatRecurrenceCleanText("Rent [🔁 Monthly 31]")).toBe("Rent");
  });

  it("leaves a plain title alone", () => {
    expect(formatRecurrenceCleanText("Review biology flashcards")).toBe(
      "Review biology flashcards",
    );
  });
});

describe("setTaskRepeat", () => {
  it("adds, replaces and removes the tag", () => {
    expect(setTaskRepeat("Practice calculus", "weekly")).toBe(
      "Practice calculus [🔁 Weekly]",
    );
    expect(setTaskRepeat("Practice calculus [Weekly]", "daily")).toBe(
      "Practice calculus [🔁 Daily]",
    );
    expect(setTaskRepeat("Practice calculus [🔁 Weekly]", null)).toBe(
      "Practice calculus",
    );
    expect(setTaskRepeat("", "weekdays")).toBe("[🔁 Weekdays]");
    expect(setTaskRepeat("Rent", "monthly", 31)).toBe("Rent [🔁 Monthly 31]");
  });

  /* tasksApi cuts at TASK_MAX; the tag must survive the cut. */
  it("shortens a full-length title rather than losing the tag", () => {
    const text = setTaskRepeat("x".repeat(TASK_MAX), "biweekly");
    expect(text.length).toBeLessThanOrEqual(TASK_MAX);
    expect(text.endsWith("[🔁 Every 2 weeks]")).toBe(true);
  });
});

describe("nextTaskOccurrence", () => {
  it("is null for a task that does not repeat", () => {
    expect(next("Essay", "2026-11-16", "2026-11-16")).toBeNull();
  });

  it("keeps the text as is for every type but a clamped monthly", () => {
    expect(next("Quiz [🔁 Weekly]", "2026-11-12", "2026-11-12")?.text).toBe(
      "Quiz [🔁 Weekly]",
    );
  });

  describe("daily", () => {
    it("is the day after the due date", () => {
      expect(next("Vocab [🔁 Daily]", "2026-11-16", "2026-11-16")?.dueDate).toBe(
        "2026-11-17",
      );
    });

    it("counts on from a due date that is still ahead", () => {
      expect(next("Vocab [🔁 Daily]", "2026-11-20", "2026-11-16")?.dueDate).toBe(
        "2026-11-21",
      );
    });

    it("is tomorrow, not a backlog, when ticked off late", () => {
      expect(next("Vocab [🔁 Daily]", "2026-11-01", "2026-11-16")?.dueDate).toBe(
        "2026-11-17",
      );
    });

    it("is tomorrow for a task with no due date", () => {
      expect(next("Vocab [🔁 Daily]", null, "2026-11-16")?.dueDate).toBe(
        "2026-11-17",
      );
    });
  });

  describe("weekdays", () => {
    it("goes Thursday to Friday", () => {
      expect(
        next("Standup [🔁 Weekdays]", "2026-11-12", "2026-11-12")?.dueDate,
      ).toBe("2026-11-13");
    });

    it("skips the weekend from Friday to Monday", () => {
      expect(
        next("Standup [🔁 Weekdays]", "2026-11-13", "2026-11-13")?.dueDate,
      ).toBe("2026-11-16");
    });

    it("lands on Monday when ticked off late on a Saturday", () => {
      expect(
        next("Standup [🔁 Weekdays]", "2026-11-02", "2026-11-14")?.dueDate,
      ).toBe("2026-11-16");
    });
  });

  describe("weekly", () => {
    it("is seven days after the due date", () => {
      expect(next("Quiz [🔁 Weekly]", "2026-11-12", "2026-11-12")?.dueDate).toBe(
        "2026-11-19",
      );
    });

    /* What weekly has always done: done a few days late, due date + 7. */
    it("still counts from the due date when done less than a week late", () => {
      expect(next("Quiz [🔁 Weekly]", "2026-08-20", "2026-08-22")?.dueDate).toBe(
        "2026-08-27",
      );
    });

    it("is seven days from today with no due date", () => {
      expect(next("Quiz [🔁 Weekly]", null, "2026-11-16")?.dueDate).toBe(
        "2026-11-23",
      );
    });

    it("skips missed weeks but keeps the weekday when done weeks late", () => {
      /* Due Thu Oct 22, done Mon Nov 16: the next Thursday, not Oct 29. */
      expect(next("Quiz [🔁 Weekly]", "2026-10-22", "2026-11-16")?.dueDate).toBe(
        "2026-11-19",
      );
    });

    it("never comes back due today", () => {
      expect(next("Quiz [🔁 Weekly]", "2026-11-09", "2026-11-16")?.dueDate).toBe(
        "2026-11-23",
      );
    });
  });

  describe("every two weeks", () => {
    it("is fourteen days after the due date", () => {
      expect(
        next("Gym [🔁 Every 2 weeks]", "2026-11-02", "2026-11-02")?.dueDate,
      ).toBe("2026-11-16");
    });

    it("keeps the fortnightly rhythm when done late", () => {
      expect(
        next("Gym [🔁 Every 2 weeks]", "2026-10-01", "2026-11-16")?.dueDate,
      ).toBe("2026-11-26");
    });
  });

  describe("monthly", () => {
    it("is the same day next month", () => {
      expect(next("Bill [🔁 Monthly]", "2026-01-15", "2026-01-20")).toEqual({
        text: "Bill [🔁 Monthly]",
        dueDate: "2026-02-15",
        repeat: "monthly",
      });
    });

    it("clamps Jan 31 to Feb 28 and remembers the 31st", () => {
      expect(next("Rent [🔁 Monthly]", "2026-01-31", "2026-01-31")).toEqual({
        text: "Rent [🔁 Monthly 31]",
        dueDate: "2026-02-28",
        repeat: "monthly",
      });
    });

    it("clamps to Feb 29 in a leap year", () => {
      expect(next("Rent [🔁 Monthly]", "2028-01-31", "2028-01-31")?.dueDate).toBe(
        "2028-02-29",
      );
    });

    it("does not drift after a short month", () => {
      const feb = next("Rent [🔁 Monthly 31]", "2026-02-28", "2026-02-28");
      expect(feb?.dueDate).toBe("2026-03-31");
      const mar = next(feb!.text, feb!.dueDate, "2026-03-31");
      expect(mar?.dueDate).toBe("2026-04-30");
      const apr = next(mar!.text, mar!.dueDate, "2026-04-30");
      expect(apr?.dueDate).toBe("2026-05-31");
    });

    it("follows a due date someone moved by hand", () => {
      expect(next("Rent [🔁 Monthly 31]", "2026-03-15", "2026-03-15")).toEqual({
        text: "Rent [🔁 Monthly]",
        dueDate: "2026-04-15",
        repeat: "monthly",
      });
    });

    it("crosses the year", () => {
      expect(next("Rent [🔁 Monthly]", "2026-12-31", "2026-12-31")?.dueDate).toBe(
        "2027-01-31",
      );
    });

    it("lands on this month's date when done late and it is still ahead", () => {
      expect(next("Rent [🔁 Monthly]", "2026-08-31", "2026-11-17")?.dueDate).toBe(
        "2026-11-30",
      );
    });

    it("moves to next month when this month's date has passed", () => {
      expect(next("Bill [🔁 Monthly]", "2026-08-10", "2026-11-17")?.dueDate).toBe(
        "2026-12-10",
      );
    });
  });
});
