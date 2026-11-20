import { describe, it, expect } from "vitest";
import {
  calendarPlanBlocks,
  escapeIcsText,
  generateICS,
  generatePlanICS,
  generateScheduleICS,
  parseClockHint,
} from "./ics";
import type { ScheduledBlock } from "./autoSchedule";
import type { Exam, WeeklyPlan } from "../api/types";
import type { PlanDay, WeeklyPlanJson } from "./aiJson";

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

const uidsOf = (ics: string) => [...ics.matchAll(/UID:(.+)/g)].map((m) => m[1]);
const eventsOf = (ics: string) => ics.split("BEGIN:VEVENT").slice(1);

describe("generateScheduleICS — re-importing", () => {
  it("gives the same block the same UID on every export", () => {
    /* A student adds their week again next Sunday, or twice by accident. A
       calendar keeps one event per UID, so a stable one updates the event
       instead of doubling the week. */
    const week = [block(), block({ id: "b2", date: "2026-09-02" })];
    const first = uidsOf(generateScheduleICS(week));
    const second = uidsOf(
      generateScheduleICS(week.map((b) => ({ ...b, id: `${b.id}-rerun` }))),
    );
    expect(first).toHaveLength(2);
    expect(second).toEqual(first);
    expect(first[0]).not.toBe(first[1]);
  });

  it("keeps the UID when the scheduler moves a block, so it moves in the calendar too", () => {
    const [before] = uidsOf(generateScheduleICS([block()]));
    const [after] = uidsOf(
      generateScheduleICS([block({ startMin: 900, endMin: 945 })]),
    );
    expect(after).toBe(before);
  });

  it("tells two same-named blocks on one day apart", () => {
    const uids = uidsOf(
      generateScheduleICS([
        block(),
        block({ id: "b2", startMin: 800, endMin: 845 }),
      ]),
    );
    expect(new Set(uids).size).toBe(2);
  });
});

describe("parseClockHint", () => {
  it("reads the clock times a block's hint can carry", () => {
    expect(parseClockHint("9:30 AM")).toBe(570);
    expect(parseClockHint("14:00")).toBe(840);
    expect(parseClockHint("7pm")).toBe(1140);
    expect(parseClockHint("12 AM")).toBe(0);
    expect(parseClockHint("9:30 p. m.")).toBe(1290);
    expect(parseClockHint("9 AM – 11 AM (Peak Focus)")).toBe(540);
  });

  it("leaves a loose hint, or a bare number, untimed", () => {
    expect(parseClockHint("morning")).toBeNull();
    expect(parseClockHint("after dinner")).toBeNull();
    expect(parseClockHint("2 past papers")).toBeNull();
    expect(parseClockHint("25:00")).toBeNull();
    expect(parseClockHint(undefined)).toBeNull();
  });
});

describe("generatePlanICS", () => {
  const WEEK: PlanDay[] = [
    {
      date: "2026-09-01",
      blocks: [
        {
          subject: "Chemistry: kinetics, part 2",
          durationMins: 45,
          startHint: "9:30 AM",
          reason: "Exam on Friday; rates first",
        },
        { subject: "Biology", durationMins: 30, startHint: "morning" },
      ],
    },
    {
      date: "2026-09-02",
      blocks: [{ subject: "Maths", startHint: "18:00" }],
    },
    { date: "2026-09-03", blocks: [] },
  ];

  it("returns a valid empty calendar for an empty week", () => {
    const ics = generatePlanICS([{ date: "2026-09-01", blocks: [] }]);
    expect(ics).toMatch(/^BEGIN:VCALENDAR/);
    expect(ics).toMatch(/END:VCALENDAR$/);
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(calendarPlanBlocks([{ date: "2026-09-01", blocks: [] }])).toEqual(
      [],
    );
  });

  it("times a block whose hint is a clock time, in floating local time", () => {
    const [chem] = eventsOf(generatePlanICS(WEEK));
    expect(chem).toContain("DTSTART:20260901T093000\r\n");
    expect(chem).toContain("DTEND:20260901T101500\r\n");
    expect(chem).not.toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(chem).toContain("TRANSP:OPAQUE");
  });

  it("falls back to the default block length when a block has none", () => {
    const maths = eventsOf(generatePlanICS(WEEK))[2];
    expect(maths).toContain("DTSTART:20260902T180000");
    expect(maths).toContain("DTEND:20260902T182500");
  });

  it("puts a block with only a loose hint on its day, all-day, without booking the day", () => {
    const bio = eventsOf(generatePlanICS(WEEK))[1];
    expect(bio).toContain("DTSTART;VALUE=DATE:20260901");
    expect(bio).not.toContain("DTEND");
    expect(bio).toContain("TRANSP:TRANSPARENT");
    expect(bio).toContain("When: morning.");
  });

  it("escapes the subject and reason", () => {
    const [chem] = eventsOf(generatePlanICS(WEEK));
    expect(chem).toContain("SUMMARY:Study: Chemistry: kinetics\\, part 2\r\n");
    expect(chem).toContain("Exam on Friday\\; rates first");
  });

  it("uses CRLF line endings throughout", () => {
    const ics = generatePlanICS(WEEK);
    expect(ics.split("\r\n").every((line) => !line.includes("\n"))).toBe(
      true,
    );
    expect(ics).toContain("DTSTAMP:");
  });

  it("gives each block a stable UID across exports, and distinct ones within", () => {
    const first = uidsOf(generatePlanICS(WEEK));
    const second = uidsOf(generatePlanICS(structuredClone(WEEK)));
    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(3);
  });

  it("leaves out a block a rebalance already let go", () => {
    const ics = generatePlanICS([
      {
        date: "2026-09-01",
        blocks: [
          { subject: "Physics", durationMins: 30, rebalanced: true },
          { subject: "Physics", durationMins: 30, catchUpFrom: "2026-08-31" },
        ],
      },
    ]);
    expect(eventsOf(ics)).toHaveLength(1);
  });
});
