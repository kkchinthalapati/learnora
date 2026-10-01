import { describe, it, expect } from "vitest";
import { escapeIcsText, generateICS, generateScheduleICS } from "./ics";
import type { ScheduledBlock } from "./autoSchedule";
import type { Exam, WeeklyPlan } from "../api/types";
import type { WeeklyPlanJson } from "./aiJson";

describe("ics utils", () => {
  describe("generateICS", () => {
    it("returns a valid VCALENDAR structure with BEGIN/END bracketing", () => {
      const ics = generateICS([], []);
      expect(ics).toMatch(/^BEGIN:VCALENDAR/);
      expect(ics).toMatch(/END:VCALENDAR$/);
    });

    it("uses CRLF (\\r\\n) line endings as per ICS spec", () => {
      const ics = generateICS([], []);
      expect(ics).toContain("\r\n");
      // Verify no bare \n at line breaks (would be \r\n only)
      const lines = ics.split("\r\n");
      expect(lines.length).toBeGreaterThan(1);
    });

    it("includes calendar metadata (VERSION, PRODID, CALSCALE)", () => {
      const ics = generateICS([], []);
      expect(ics).toContain("VERSION:2.0");
      expect(ics).toContain("PRODID:-//Learnora//Learnora Calendar Export//EN");
      expect(ics).toContain("CALSCALE:GREGORIAN");
    });

    it("includes exams as VEVENT entries", () => {
      const exams: Exam[] = [
        {
          id: "exam-1",
          user_id: "user-1",
          exam_date: "2026-08-15",
          exam_name: "Math Midterm",
          difficulty: "medium",
          status: "Scheduled",
        } as unknown as Exam,
      ];

      const ics = generateICS(exams, []);
      expect(ics).toContain("BEGIN:VEVENT");
      expect(ics).toContain("END:VEVENT");
      expect(ics).toContain("SUMMARY:Exam: Math Midterm");
      expect(ics).toContain("DTSTART;VALUE=DATE:20260815");
      expect(ics).toContain("DESCRIPTION:Difficulty: medium");
    });

    it("excludes completed exams", () => {
      const exams: Exam[] = [
        {
          id: "exam-1",
          user_id: "user-1",
          exam_date: "2026-08-15",
          exam_name: "Math Midterm",
          difficulty: "medium",
          status: "Completed",
        } as unknown as Exam,
      ];

      const ics = generateICS(exams, []);
      expect(ics).not.toContain("Math Midterm");
    });

    it("excludes exams without exam_date", () => {
      const exams: Exam[] = [
        {
          id: "exam-1",
          user_id: "user-1",
          exam_date: null,
          exam_name: "Math Midterm",
          difficulty: "medium",
          status: "Scheduled",
        } as unknown as Exam,
      ];

      const ics = generateICS(exams, []);
      expect(ics).not.toContain("Math Midterm");
    });

    it("converts YYYY-MM-DD to YYYYMMDD in DTSTART", () => {
      const exams: Exam[] = [
        {
          id: "exam-1",
          user_id: "user-1",
          exam_date: "2026-08-03",
          exam_name: "Test",
          difficulty: "medium",
          status: "Scheduled",
        } as unknown as Exam,
      ];

      const ics = generateICS(exams, []);
      expect(ics).toContain("DTSTART;VALUE=DATE:20260803");
      expect(ics).not.toContain("2026-08-03");
    });

    it("includes study plan blocks as VEVENT entries", () => {
      const plans: WeeklyPlan[] = [
        {
          id: "plan-1",
          plan_json: {
            days: [
              {
                date: "2026-08-03",
                blocks: [
                  {
                    subject: "Math",
                    durationMins: 60,
                    reason: "Chapter 1-3 review",
                  },
                ],
              },
            ],
          } as WeeklyPlanJson,
        } as WeeklyPlan,
      ];

      const ics = generateICS([], plans);
      expect(ics).toContain("BEGIN:VEVENT");
      expect(ics).toContain("SUMMARY:Study: Math");
      expect(ics).toContain("DTSTART;VALUE=DATE:20260803");
      expect(ics).toContain("60 mins");
      expect(ics).toContain("Chapter 1-3 review");
    });

    it("skips plan days without blocks", () => {
      const plans: WeeklyPlan[] = [
        {
          id: "plan-1",
          plan_json: {
            days: [
              {
                date: "2026-08-03",
                blocks: undefined,
              },
            ],
          } as WeeklyPlanJson,
        } as WeeklyPlan,
      ];

      const ics = generateICS([], plans);
      // Calendar structure still present, but no Study event
      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).not.toContain("Study:");
    });

    it("skips plans with no plan_json", () => {
      const plans: WeeklyPlan[] = [
        {
          id: "plan-1",
          plan_json: null,
        } as WeeklyPlan,
      ];

      const ics = generateICS([], plans);
      expect(ics).toContain("BEGIN:VCALENDAR");
      // No study events should be generated
      const eventCount = (ics.match(/SUMMARY:Study:/g) || []).length;
      expect(eventCount).toBe(0);
    });

    it("handles study blocks without optional fields", () => {
      const plans: WeeklyPlan[] = [
        {
          id: "plan-1",
          plan_json: {
            days: [
              {
                date: "2026-08-10",
                blocks: [
                  {
                    subject: "History",
                    durationMins: undefined,
                    reason: undefined,
                  },
                ],
              },
            ],
          } as WeeklyPlanJson,
        } as WeeklyPlan,
      ];

      const ics = generateICS([], plans);
      expect(ics).toContain("SUMMARY:Study: History");
      // Description should be empty or minimal
      expect(ics).toMatch(/DESCRIPTION:\s*(History|\r|\n)/);
    });

    it("includes multiple exams and plans", () => {
      const exams: Exam[] = [
        {
          id: "exam-1",
          user_id: "user-1",
          exam_date: "2026-08-15",
          exam_name: "Math Midterm",
          difficulty: "medium",
          status: "Scheduled",
        } as unknown as Exam,
        {
          id: "exam-2",
          exam_date: "2026-08-20",
          exam_name: "History Final",
          status: "Scheduled",
        } as unknown as Exam,
      ];

      const plans: WeeklyPlan[] = [
        {
          id: "plan-1",
          plan_json: {
            days: [
              {
                date: "2026-08-03",
                blocks: [{ subject: "Math", durationMins: 60 }],
              },
            ],
          } as WeeklyPlanJson,
        } as WeeklyPlan,
      ];

      const ics = generateICS(exams, plans);
      expect(ics).toContain("Math Midterm");
      expect(ics).toContain("History Final");
      expect(ics).toContain("Study: Math");

      const eventCounts = {
        exam: (ics.match(/SUMMARY:Exam:/g) || []).length,
        study: (ics.match(/SUMMARY:Study:/g) || []).length,
      };
      expect(eventCounts.exam).toBe(2);
      expect(eventCounts.study).toBe(1);
    });

    it("generates a unique UID for each event", () => {
      const exams: Exam[] = [
        {
          id: "exam-1",
          user_id: "user-1",
          exam_date: "2026-08-15",
          exam_name: "Test 1",
          difficulty: "medium",
          status: "Scheduled",
        } as unknown as Exam,
        {
          id: "exam-2",
          user_id: "user-1",
          exam_date: "2026-08-20",
          exam_name: "Test 2",
          difficulty: "medium",
          status: "Scheduled",
        } as unknown as Exam,
      ];

      const ics = generateICS(exams, []);
      const uids = ics.match(/UID:[^:]*@learnora\.app/g) || [];
      expect(uids.length).toBe(2);
      // UIDs should be different (with high probability)
      expect(uids[0]).not.toBe(uids[1]);
    });

    it("includes DTSTAMP in UTC format", () => {
      const exams: Exam[] = [
        {
          id: "exam-1",
          user_id: "user-1",
          exam_date: "2026-08-15",
          exam_name: "Test",
          difficulty: "medium",
          status: "Scheduled",
        } as unknown as Exam,
      ];

      const ics = generateICS(exams, []);
      expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
    });
  });
});

function block(patch: Partial<ScheduledBlock> = {}): ScheduledBlock {
  return {
    id: "b1",
    demandId: "d1",
    date: "2026-09-01",
    startMin: 570,
    endMin: 615,
    label: "Kinetics, part 2",
    kind: "task",
    load: 2,
    subject: null,
    folderId: null,
    energy: 0.6,
    ...patch,
  };
}

describe("escapeIcsText", () => {
  it("escapes the characters that would split a property in two", () => {
    /* A block called "Revise: kinetics, part 2" would otherwise import
       truncated at the comma, because an unescaped comma starts a new value. */
    expect(escapeIcsText("kinetics, part 2; lab")).toBe(
      "kinetics\\, part 2\\; lab",
    );
    expect(escapeIcsText("line\nbreak")).toBe("line\\nbreak");
  });
});

describe("generateScheduleICS", () => {
  it("returns a valid empty calendar for an empty schedule", () => {
    const ics = generateScheduleICS([]);
    expect(ics).toMatch(/^BEGIN:VCALENDAR/);
    expect(ics).toMatch(/END:VCALENDAR$/);
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("writes timed events rather than all-day ones", () => {
    /* The whole point of this export: an all-day entry lands in the strip at
       the top of a calendar where it reads as a note, while a timed event
       lands in the day's column next to the lecture it has to fit around. */
    const ics = generateScheduleICS([block()]);
    expect(ics).toContain("DTSTART:20260901T093000");
    expect(ics).toContain("DTEND:20260901T101500");
    expect(ics).not.toContain("VALUE=DATE");
  });

  it("uses floating local time so a block does not follow the student abroad", () => {
    expect(generateScheduleICS([block()])).not.toMatch(/DTSTART:\d{8}T\d{6}Z/);
  });

  it("names a block by its kind", () => {
    expect(generateScheduleICS([block({ kind: "review" })])).toContain(
      "SUMMARY:Review:",
    );
    expect(generateScheduleICS([block({ kind: "exam" })])).toContain(
      "SUMMARY:Exam prep:",
    );
  });

  it("escapes a label that would otherwise split the SUMMARY", () => {
    expect(generateScheduleICS([block()])).toContain("Kinetics\\, part 2");
  });

  it("says which part of a split demand a block is", () => {
    expect(
      generateScheduleICS([block({ part: { index: 2, total: 3 } })]),
    ).toContain("(2/3)");
  });

  it("attaches a reminder alarm by default", () => {
    const ics = generateScheduleICS([block()]);
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT10M");
  });

  it("honours a custom lead, and omits the alarm entirely at zero", () => {
    expect(generateScheduleICS([block()], { reminderMins: 30 })).toContain(
      "TRIGGER:-PT30M",
    );
    expect(generateScheduleICS([block()], { reminderMins: 0 })).not.toContain(
      "BEGIN:VALARM",
    );
  });

  it("marks blocks busy so the rest of the student's life routes around them", () => {
    expect(generateScheduleICS([block()])).toContain("TRANSP:OPAQUE");
  });

  it("calls out a block that landed in one of the day's best hours", () => {
    expect(generateScheduleICS([block({ energy: 0.9 })])).toContain(
      "best hours",
    );
    expect(generateScheduleICS([block({ energy: 0.4 })])).not.toContain(
      "best hours",
    );
  });

  it("gives every event a distinct UID", () => {
    /* A calendar client treats a duplicate UID as an update to the same
       event, so a collision silently replaces one study block with another. */
    const ics = generateScheduleICS([
      block({ id: "a" }),
      block({ id: "b", startMin: 700, endMin: 740 }),
    ]);
    const uids = [...ics.matchAll(/UID:(.+)/g)].map((m) => m[1]);
    expect(uids).toHaveLength(2);
    expect(uids[0]).not.toBe(uids[1]);
  });
});
