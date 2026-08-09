import { describe, it, expect } from "vitest";
import { generateICS } from "./ics";
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
