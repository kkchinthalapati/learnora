import { describe, expect, it } from "vitest";
import type { Folder, StudySession } from "../api/types";
import type { WeeklyPlanJson } from "./aiJson";
import type { PeakFocusWindow } from "./analyticsEngine";
import { DEFAULT_LIFE_CONTEXT, type LifeContext } from "./lifeContext";
import { computeWeekAdherence } from "./planAdherence";
import { parseStoredPlan } from "./planShape";
import {
  applyRebalance,
  detectPlanDeficit,
  peakFocusHint,
  proposeRebalance,
  rebalanceDayLabel,
  rebalanceLimitsFrom,
  RebalanceError,
  resolveExamState,
  type RebalanceExam,
  type RebalanceProposal,
} from "./planRebalancer";

describe("planRebalancer", () => {
  const folders: Folder[] = [
    {
      id: "f-bio",
      user_id: "u-1",
      name: "Biology",
      color: "#10b981",
      created_at: "2026-08-01",
    },
    {
      id: "f-chem",
      user_id: "u-1",
      name: "Chemistry",
      color: "#3b82f6",
      created_at: "2026-08-01",
    },
    {
      id: "f-math",
      user_id: "u-1",
      name: "Math",
      color: "#f59e0b",
      created_at: "2026-08-01",
    },
  ];

  const samplePlan: WeeklyPlanJson = {
    summary: "Balanced week of science and math.",
    days: [
      {
        date: "2026-08-24", // Monday
        blocks: [
          { subject: "Biology", durationMins: 45, startHint: "morning" },
          { subject: "Chemistry", durationMins: 30 },
        ],
      },
      {
        date: "2026-08-25", // Tuesday
        blocks: [
          { subject: "Math", durationMins: 60 },
          { subject: "Biology", durationMins: 30 },
        ],
      },
      {
        date: "2026-08-26", // Wednesday (Today in test)
        blocks: [{ subject: "Chemistry", durationMins: 45 }],
      },
      {
        date: "2026-08-27", // Thursday
        blocks: [{ subject: "Math", durationMins: 45 }],
      },
      {
        date: "2026-08-28", // Friday
        blocks: [{ subject: "Biology", durationMins: 45 }],
      },
      {
        date: "2026-08-29", // Saturday
        blocks: [],
      },
      {
        date: "2026-08-30", // Sunday
        blocks: [],
      },
    ],
  };

  const peakWindow: PeakFocusWindow = {
    hasData: true,
    label: "Mornings (6 AM – 9 AM)",
    startHour: 6,
    endHour: 9,
    description: "Peak morning focus",
  };

  describe("detectPlanDeficit", () => {
    it("returns clean default when no plan is provided or plan is invalid", () => {
      const result = detectPlanDeficit(null, []);
      expect(result.isBehind).toBe(false);
      expect(result.totalMissedMinutes).toBe(0);
      expect(result.missedBlocks).toHaveLength(0);
    });

    it("detects no deficit when on Monday with no past days", () => {
      const nowMonday = new Date("2026-08-24T12:00:00");
      const result = detectPlanDeficit(samplePlan, [], folders, nowMonday);
      expect(result.isBehind).toBe(false);
      expect(result.totalMissedMinutes).toBe(0);
    });

    it("detects missed blocks when past days had planned blocks but zero study sessions", () => {
      const nowWednesday = new Date("2026-08-26T12:00:00");
      // No sessions logged for Mon (75m) and Tue (90m) = 165m total
      const result = detectPlanDeficit(samplePlan, [], folders, nowWednesday);

      expect(result.isBehind).toBe(true);
      expect(result.totalMissedMinutes).toBe(165);
      expect(result.missedBlocks.length).toBeGreaterThanOrEqual(4);
      expect(result.deficitBySubject["Biology"]).toBe(75); // 45m Mon + 30m Tue
      expect(result.deficitBySubject["Chemistry"]).toBe(30); // 30m Mon
      expect(result.deficitBySubject["Math"]).toBe(60); // 60m Tue
      expect(result.remainingDaysCount).toBe(5); // Wed, Thu, Fri, Sat, Sun
      expect(result.recommendation).toContain("behind. We can spread that out");
    });

    it("accounts for partial study sessions matched by folder ID or task name", () => {
      const nowWednesday = new Date("2026-08-26T12:00:00");
      const sessions: StudySession[] = [
        // Monday: 45m planned Bio -> studied 45m (0 deficit)
        {
          id: "s1",
          user_id: "u-1",
          folder_id: "f-bio",
          task: null,
          minutes: 45,
          timer_type: "focus",
          started_at: "2026-08-24T10:00:00Z",
          created_at: "2026-08-24T10:00:00Z",
        },
        // Monday: 30m planned Chem -> studied 10m Chem (20m deficit)
        {
          id: "s2",
          user_id: "u-1",
          folder_id: "f-chem",
          task: null,
          minutes: 10,
          timer_type: "focus",
          started_at: "2026-08-24T14:00:00Z",
          created_at: "2026-08-24T14:00:00Z",
        },
        // Tuesday: 60m planned Math -> studied 60m matched by task text (0 deficit)
        {
          id: "s3",
          user_id: "u-1",
          folder_id: null,
          task: "Math algebra problem set",
          minutes: 60,
          timer_type: "focus",
          started_at: "2026-08-25T11:00:00Z",
          created_at: "2026-08-25T11:00:00Z",
        },
        // Tuesday: 30m planned Bio -> studied 0m (30m deficit)
      ];

      const result = detectPlanDeficit(samplePlan, sessions, folders, nowWednesday);

      expect(result.isBehind).toBe(true);
      expect(result.totalMissedMinutes).toBe(50); // 20m Chem + 30m Bio
      expect(result.deficitBySubject["Chemistry"]).toBe(20);
      expect(result.deficitBySubject["Biology"]).toBe(30);
      expect(result.deficitBySubject["Math"]).toBeUndefined();
    });

    it("returns isBehind: false when all past study obligations were completed or exceeded", () => {
      const nowWednesday = new Date("2026-08-26T12:00:00");
      const sessions: StudySession[] = [
        {
          id: "s1",
          user_id: "u-1",
          folder_id: "f-bio",
          task: null,
          minutes: 50,
          timer_type: "focus",
          started_at: "2026-08-24T10:00:00Z",
          created_at: "2026-08-24T10:00:00Z",
        },
        {
          id: "s2",
          user_id: "u-1",
          folder_id: "f-chem",
          task: null,
          minutes: 35,
          timer_type: "focus",
          started_at: "2026-08-24T14:00:00Z",
          created_at: "2026-08-24T14:00:00Z",
        },
        {
          id: "s3",
          user_id: "u-1",
          folder_id: "f-math",
          task: null,
          minutes: 60,
          timer_type: "focus",
          started_at: "2026-08-25T11:00:00Z",
          created_at: "2026-08-25T11:00:00Z",
        },
        {
          id: "s4",
          user_id: "u-1",
          folder_id: "f-bio",
          task: null,
          minutes: 30,
          timer_type: "focus",
          started_at: "2026-08-25T15:00:00Z",
          created_at: "2026-08-25T15:00:00Z",
        },
      ];

      const result = detectPlanDeficit(samplePlan, sessions, folders, nowWednesday);
      expect(result.isBehind).toBe(false);
      expect(result.totalMissedMinutes).toBe(0);
    });
  });


  /* ── Rebalance ─────────────────────────────────────────────────────────
   * Fixed local clocks throughout; nothing here reads the real date. With
   * no sessions, samplePlan on Wednesday owes Mon Bio 45 + Mon Chem 30 +
   * Tue Math 60 + Tue Bio 30 = 165m. */
  const WEEK = "2026-08-24";
  const WED_NOON = new Date("2026-08-26T12:00:00");
  const flat = (mins: number) => () => mins;

  function exam(patch: Partial<RebalanceExam> = {}): RebalanceExam {
    return {
      exam_name: "Biology Final",
      exam_date: "2026-08-28",
      status: "Upcoming",
      ...patch,
    };
  }

  function minutesOn(proposal: RebalanceProposal, date: string): number {
    return proposal.moves
      .filter((m) => m.toDate === date)
      .reduce((sum, m) => sum + m.minutes, 0);
  }

  function plannedOn(plan: WeeklyPlanJson, date: string): number {
    const day = plan.days.find((d) => d.date === date);
    return (day?.blocks ?? []).reduce((s, b) => s + (b.durationMins ?? 25), 0);
  }

  describe("resolveExamState", () => {
    it("is none with no exams", () => {
      expect(resolveExamState([], "2026-08-26")).toEqual({ state: "none" });
    });

    it("picks the nearest open upcoming exam and ignores completed ones", () => {
      const state = resolveExamState(
        [
          exam({ exam_name: "Far", exam_date: "2026-09-10" }),
          exam({ exam_name: "Done", exam_date: "2026-08-27", status: "Completed" }),
          exam({ exam_name: "Near", exam_date: "2026-08-29" }),
        ],
        "2026-08-26",
      );
      expect(state).toEqual({
        state: "upcoming",
        name: "Near",
        date: "2026-08-29",
        daysLeft: 3,
      });
    });

    it("counts an exam today as upcoming with zero days left", () => {
      expect(
        resolveExamState([exam({ exam_date: "2026-08-26" })], "2026-08-26"),
      ).toMatchObject({ state: "upcoming", daysLeft: 0 });
    });

    it("reports an exam that passed within the last week", () => {
      expect(
        resolveExamState([exam({ exam_date: "2026-08-22" })], "2026-08-26"),
      ).toEqual({ state: "passed", name: "Biology Final", date: "2026-08-22" });
    });

    it("treats a long-gone exam as none rather than nagging about it", () => {
      expect(
        resolveExamState([exam({ exam_date: "2026-03-01" })], "2026-08-26"),
      ).toEqual({ state: "none" });
    });

    it("tolerates a timestamp-shaped exam_date", () => {
      expect(
        resolveExamState(
          [exam({ exam_date: "2026-08-28T00:00:00+00:00" })],
          "2026-08-26",
        ),
      ).toMatchObject({ state: "upcoming", date: "2026-08-28", daysLeft: 2 });
    });
  });

  describe("proposeRebalance", () => {
    it("reports no-plan for a missing or unreadable plan", () => {
      expect(proposeRebalance(null).status).toBe("no-plan");
      expect(proposeRebalance({ days: "nope" }).status).toBe("no-plan");
    });

    it("reports on-track, with nothing to move, when nothing was missed", () => {
      const p = proposeRebalance(samplePlan, [], {
        now: new Date("2026-08-24T12:00:00"),
        weekStartISO: WEEK,
      });
      expect(p.status).toBe("on-track");
      expect(p.moves).toEqual([]);
      expect(p.sources).toEqual([]);
    });

    it("ignores a sub-15-minute shortfall as noise", () => {
      const plan: WeeklyPlanJson = {
        days: [
          { date: "2026-08-25", blocks: [{ subject: "Math", durationMins: 10 }] },
          { date: "2026-08-26", blocks: [] },
        ],
      };
      expect(
        proposeRebalance(plan, [], { now: WED_NOON, weekStartISO: WEEK }).status,
      ).toBe("on-track");
    });

    it("places every missed minute on today-or-later when there is room", () => {
      const p = proposeRebalance(samplePlan, [], {
        folders,
        now: WED_NOON,
        weekStartISO: WEEK,
        capacityFor: flat(150),
      });
      expect(p.status).toBe("ready");
      expect(p.placedMinutes).toBe(165);
      expect(p.shortfallMinutes).toBe(0);
      expect(p.moves.every((m) => m.toDate >= "2026-08-26")).toBe(true);
      expect(p.moves.every((m) => m.fromDate < "2026-08-26")).toBe(true);
      expect(p.headline).toBe("You're 2h 45m behind this week's plan.");
      expect(p.detail).toMatch(/^All of it fits into \d days? without going over/);
      expect(p.detail).toContain("No upcoming exam is set");
    });

    it("never pushes a day past its capacity minus what is already planned", () => {
      const p = proposeRebalance(samplePlan, [], {
        now: WED_NOON,
        weekStartISO: WEEK,
        capacityFor: flat(90),
      });
      for (const date of ["2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30"]) {
        expect(plannedOn(samplePlan, date) + minutesOn(p, date)).toBeLessThanOrEqual(90);
      }
    });

    it("keeps each catch-up block within the max block length", () => {
      const p = proposeRebalance(samplePlan, [], {
        now: WED_NOON,
        weekStartISO: WEEK,
        capacityFor: flat(300),
        maxChunkMins: 40,
      });
      expect(p.moves.every((m) => m.minutes <= 40)).toBe(true);
      expect(p.placedMinutes).toBe(165);
    });

    it("uses week days the plan has no entry for", () => {
      const plan: WeeklyPlanJson = {
        days: [
          { date: "2026-08-24", blocks: [{ subject: "Math", durationMins: 60 }] },
          { date: "2026-08-25", blocks: [] },
        ],
      };
      const p = proposeRebalance(plan, [], {
        now: new Date("2026-08-28T09:00:00"), // Friday
        weekStartISO: WEEK,
        capacityFor: flat(150),
      });
      expect(p.status).toBe("ready");
      expect(p.moves.map((m) => m.toDate).every((d) => ["2026-08-28", "2026-08-29", "2026-08-30"].includes(d))).toBe(true);
    });

    it("spreads load to the emptiest day first", () => {
      const plan: WeeklyPlanJson = {
        days: [
          { date: "2026-08-25", blocks: [{ subject: "Math", durationMins: 30 }] },
          { date: "2026-08-26", blocks: [{ subject: "Art", durationMins: 100 }] },
          { date: "2026-08-27", blocks: [] },
        ],
      };
      const p = proposeRebalance(plan, [], {
        now: new Date("2026-08-26T08:00:00"),
        weekStartISO: WEEK,
        capacityFor: (d) => (d === "2026-08-26" || d === "2026-08-27" ? 150 : 0),
      });
      expect(p.moves).toEqual([
        { subject: "Math", fromDate: "2026-08-25", toDate: "2026-08-27", minutes: 30 },
      ]);
    });

    it("lands exam-subject catch-up strictly before that exam", () => {
      const p = proposeRebalance(samplePlan, [], {
        folders,
        exams: [exam({ exam_date: "2026-08-28" })], // Friday
        now: WED_NOON,
        weekStartISO: WEEK,
        capacityFor: flat(150),
      });
      const bio = p.moves.filter((m) => m.subject === "Biology");
      expect(bio.length).toBeGreaterThan(0);
      expect(bio.every((m) => m.toDate < "2026-08-28")).toBe(true);
      expect(bio.every((m) => m.examName === "Biology Final")).toBe(true);
      expect(p.headline).toContain("Biology Final is in 2 days.");
      expect(p.detail).toContain("before Biology Final");
    });

    it("matches an exam to its subject through the exam's folder", () => {
      const p = proposeRebalance(samplePlan, [], {
        folders,
        exams: [exam({ exam_name: "Paper 2", folder_id: "f-chem", exam_date: "2026-08-27" })],
        now: WED_NOON,
        weekStartISO: WEEK,
        capacityFor: flat(150),
      });
      const chem = p.moves.filter((m) => m.subject === "Chemistry");
      expect(chem.every((m) => m.toDate === "2026-08-26")).toBe(true);
      expect(chem[0]?.examName).toBe("Paper 2");
      expect(p.priorities[0]).toBe("Chemistry");
    });

    it("does not treat a subject named inside another word as the exam's", () => {
      const p = proposeRebalance(samplePlan, [], {
        exams: [exam({ exam_name: "Mathematics Final", exam_date: "2026-08-27" })],
        now: WED_NOON,
        weekStartISO: WEEK,
        capacityFor: flat(150),
      });
      expect(p.moves.some((m) => m.subject === "Math" && m.examName)).toBe(false);
    });

    it("protects the exam subject first when time is short", () => {
      const p = proposeRebalance(samplePlan, [], {
        folders,
        exams: [exam({ exam_date: "2026-08-28" })],
        now: WED_NOON,
        weekStartISO: WEEK,
        // Only Thursday has any spare room: 150 − 45 planned = 105.
        capacityFor: (d) => (d === "2026-08-27" ? 150 : 0),
      });
      expect(p.status).toBe("partial");
      expect(minutesOn(p, "2026-08-27")).toBe(105);
      // Biology's 75m goes in first; 30m of the rest fits after it.
      expect(p.moves.filter((m) => m.subject === "Biology").reduce((s, m) => s + m.minutes, 0)).toBe(75);
      expect(p.priorities[0]).toBe("Biology");
      expect(p.placedMinutes + p.shortfallMinutes).toBe(165);
      expect(p.detail).toContain("Only 1h 45m fits");
      expect(p.detail).toMatch(/Put Biology, .* first and let the other 1h go/);
    });

    it("is honest when the exam is today: nothing for it can be made up", () => {
      const p = proposeRebalance(samplePlan, [], {
        folders,
        exams: [exam({ exam_date: "2026-08-26" })],
        now: WED_NOON,
        weekStartISO: WEEK,
        capacityFor: flat(150),
      });
      expect(p.moves.some((m) => m.subject === "Biology")).toBe(false);
      expect(p.shortfall.filter((s) => s.subject === "Biology").reduce((s, x) => s + x.minutes, 0)).toBe(75);
      expect(p.status).toBe("partial");
      expect(p.headline).toContain("Biology Final is today.");
      expect(p.detail).toContain("Biology Final is today, so there's no time left to make up Biology");
    });

    it("says so when an exam has already passed, and ranks its subject last", () => {
      const p = proposeRebalance(samplePlan, [], {
        folders,
        exams: [exam({ exam_date: "2026-08-25" })],
        now: WED_NOON,
        weekStartISO: WEEK,
        capacityFor: flat(150),
      });
      expect(p.exam).toEqual({ state: "passed", name: "Biology Final", date: "2026-08-25" });
      expect(p.detail).toContain("Biology Final (Tue");
      expect(p.detail).toContain("has already passed");
      expect(p.priorities[p.priorities.length - 1]).toBe("Biology");
    });

    it("offers priorities, not moves, when there is no room at all", () => {
      const p = proposeRebalance(samplePlan, [], {
        now: WED_NOON,
        weekStartISO: WEEK,
        capacityFor: flat(0),
      });
      expect(p.status).toBe("no-room");
      expect(p.moves).toEqual([]);
      expect(p.shortfallMinutes).toBe(165);
      expect(p.priorities).toHaveLength(3);
      expect(p.detail).toContain("There's no free time left this week");
      expect(p.detail).toContain("let the other 2h 45m go");
      // Everything missed is still accounted for, so it can be let go.
      expect(p.sources).toHaveLength(4);
    });

    it("says there are no days left once the plan's week is over", () => {
      const p = proposeRebalance(samplePlan, [], {
        now: new Date("2026-08-31T10:00:00"), // next Monday
        weekStartISO: WEEK,
        capacityFor: flat(150),
      });
      expect(p.status).toBe("no-room");
      expect(p.detail).toContain("There are no days left in this week's plan");
    });

    it("only gives today what is left before bedtime", () => {
      const plan: WeeklyPlanJson = {
        days: [
          { date: "2026-08-29", blocks: [{ subject: "Math", durationMins: 60 }] },
          { date: "2026-08-30", blocks: [] },
        ],
      };
      const p = proposeRebalance(plan, [], {
        now: new Date("2026-08-30T22:30:00"), // Sunday night
        weekStartISO: WEEK,
        capacityFor: flat(150),
        dayEndMinute: 23 * 60,
        minChunkMins: 15,
      });
      expect(p.placedMinutes).toBe(30);
      expect(p.shortfallMinutes).toBe(30);
    });

    it("never leaves a sliver below the minimum block length", () => {
      const plan: WeeklyPlanJson = {
        days: [
          { date: "2026-08-25", blocks: [{ subject: "Math", durationMins: 40 }] },
          { date: "2026-08-26", blocks: [] },
        ],
      };
      const p = proposeRebalance(plan, [], {
        now: new Date("2026-08-26T08:00:00"),
        weekStartISO: WEEK,
        capacityFor: (d) => (d === "2026-08-26" ? 10 : 0),
        minChunkMins: 15,
      });
      expect(p.moves).toEqual([]);
      expect(p.status).toBe("no-room");
    });

    it("splits so no leftover piece is shorter than the minimum block", () => {
      const plan: WeeklyPlanJson = {
        days: [
          { date: "2026-08-25", blocks: [{ subject: "Math", durationMins: 60 }] },
          { date: "2026-08-26", blocks: [] },
        ],
      };
      const p = proposeRebalance(plan, [], {
        now: new Date("2026-08-26T08:00:00"),
        weekStartISO: WEEK,
        capacityFor: flat(150),
        maxChunkMins: 55,
        minChunkMins: 25,
      });
      expect(p.moves.map((m) => m.minutes).sort((a, b) => a - b)).toEqual([25, 35]);
    });

    it("still places a small remainder smaller than the minimum block", () => {
      const plan: WeeklyPlanJson = {
        days: [
          { date: "2026-08-25", blocks: [{ subject: "Math", durationMins: 20 }] },
          { date: "2026-08-26", blocks: [] },
        ],
      };
      const p = proposeRebalance(plan, [], {
        now: new Date("2026-08-26T08:00:00"),
        weekStartISO: WEEK,
        capacityFor: flat(20),
        minChunkMins: 25,
      });
      expect(p.moves).toEqual([
        { subject: "Math", fromDate: "2026-08-25", toDate: "2026-08-26", minutes: 20 },
      ]);
    });

    it("moves only the unfinished part of a partly-done block", () => {
      const sessions: StudySession[] = [
        {
          id: "s1",
          user_id: "u-1",
          folder_id: "f-math",
          task: null,
          minutes: 40,
          timer_type: "focus",
          started_at: "2026-08-25T11:00:00",
          created_at: "2026-08-25T11:00:00",
        },
      ];
      const p = proposeRebalance(samplePlan, sessions, {
        folders,
        now: WED_NOON,
        weekStartISO: WEEK,
        capacityFor: flat(150),
      });
      expect(
        p.moves.filter((m) => m.subject === "Math").reduce((s, m) => s + m.minutes, 0),
      ).toBe(20);
    });

    it("breaks ties toward the subject with cards actually due", () => {
      const plan: WeeklyPlanJson = {
        days: [
          {
            date: "2026-08-25",
            blocks: [
              { subject: "Art", durationMins: 30 },
              { subject: "Music", durationMins: 30 },
            ],
          },
          { date: "2026-08-26", blocks: [] },
        ],
      };
      const p = proposeRebalance(plan, [], {
        now: new Date("2026-08-26T08:00:00"),
        weekStartISO: WEEK,
        capacityFor: (d) => (d === "2026-08-26" ? 30 : 0),
        dueCountBySubject: { Music: 12 },
      });
      expect(p.moves.map((m) => m.subject)).toEqual(["Music"]);
      expect(p.priorities).toEqual(["Music", "Art"]);
    });

    it("is deterministic", () => {
      const opts = {
        folders,
        exams: [exam()],
        now: WED_NOON,
        weekStartISO: WEEK,
        capacityFor: flat(120),
      };
      expect(proposeRebalance(samplePlan, [], opts)).toEqual(
        proposeRebalance(samplePlan, [], opts),
      );
    });

    it("defaults to a real ceiling rather than unlimited hours", () => {
      const huge: WeeklyPlanJson = {
        days: [
          { date: "2026-08-24", blocks: [{ subject: "Math", durationMins: 600 }] },
          { date: "2026-08-25", blocks: [{ subject: "Bio", durationMins: 600 }] },
        ],
      };
      const p = proposeRebalance(huge, [], { now: WED_NOON, weekStartISO: WEEK });
      expect(p.status).toBe("partial");
      for (const date of ["2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30"]) {
        expect(minutesOn(p, date)).toBeLessThanOrEqual(150);
      }
    });
  });

  describe("rebalanceLimitsFrom", () => {
    const ctx = (patch: Partial<LifeContext> = {}): LifeContext => ({
      ...DEFAULT_LIFE_CONTEXT,
      ...patch,
    });

    it("gives a protected day zero capacity", () => {
      const limits = rebalanceLimitsFrom(ctx({ protectedDays: [6] }), WEEK);
      expect(limits.capacityFor("2026-08-29")).toBe(0); // Saturday
      expect(limits.capacityFor("2026-08-27")).toBe(150);
    });

    it("uses the weekend capacity at the weekend", () => {
      const limits = rebalanceLimitsFrom(ctx(), WEEK);
      expect(limits.capacityFor("2026-08-30")).toBe(210);
    });

    it("shrinks a day around a commitment", () => {
      const limits = rebalanceLimitsFrom(
        ctx({
          wakeTime: "08:00",
          sleepTime: "12:00",
          bufferMins: 0,
          commitments: [
            {
              id: "c1",
              label: "Class",
              kind: "class",
              days: [4],
              start: "08:00",
              end: "11:00",
            } as LifeContext["commitments"][number],
          ],
        }),
        WEEK,
      );
      expect(limits.capacityFor("2026-08-27")).toBe(60); // Thursday: 11–12
    });

    it("reads a past-midnight bedtime as the end of today", () => {
      expect(rebalanceLimitsFrom(ctx({ sleepTime: "01:00" }), WEEK).dayEndMinute).toBe(25 * 60);
      expect(rebalanceLimitsFrom(ctx({ sleepTime: "22:30" }), WEEK).dayEndMinute).toBe(22 * 60 + 30);
    });

    it("carries the student's block lengths", () => {
      const limits = rebalanceLimitsFrom(ctx({ maxBlockMins: 40, minBlockMins: 20 }), WEEK);
      expect(limits.maxChunkMins).toBe(40);
      expect(limits.minChunkMins).toBe(20);
    });
  });

  describe("peakFocusHint", () => {
    it("formats a real window and skips a missing one", () => {
      expect(peakFocusHint(peakWindow)).toBe("6 AM – 9 AM (Peak Focus)");
      expect(peakFocusHint(null)).toBeUndefined();
      expect(peakFocusHint({ ...peakWindow, hasData: false })).toBeUndefined();
    });
  });

  describe("applyRebalance", () => {
    const options = { folders, now: WED_NOON, weekStartISO: WEEK, capacityFor: flat(150) };

    it("marks the missed blocks and adds catch-up blocks with the subject verbatim", () => {
      const proposal = proposeRebalance(samplePlan, [], options);
      const next = applyRebalance(samplePlan, proposal) as unknown as WeeklyPlanJson;

      const monday = next.days.find((d) => d.date === "2026-08-24")!;
      expect(monday.blocks!.every((b) => b.rebalanced === true)).toBe(true);
      const catchUps = next.days.flatMap((d) => (d.blocks ?? []).filter((b) => (b as { catchUpFrom?: string }).catchUpFrom));
      expect(catchUps.reduce((s, b) => s + (b.durationMins ?? 0), 0)).toBe(165);
      expect(new Set(catchUps.map((b) => b.subject))).toEqual(new Set(["Biology", "Chemistry", "Math"]));
      expect(catchUps[0].reason).toMatch(/^Catch-up from (Mon|Tue) /);
    });

    it("clears the deficit so the same minutes are never offered twice", () => {
      const first = proposeRebalance(samplePlan, [], options);
      const applied = applyRebalance(samplePlan, first);
      const again = proposeRebalance(applied, [], options);
      expect(again.status).toBe("on-track");
      expect(detectPlanDeficit(applied, [], folders, WED_NOON).isBehind).toBe(false);
      // Idempotent: re-applying a stale proposal marks nothing new.
      const twice = applyRebalance(applied, { moves: [], sources: first.sources });
      expect(twice.days).toEqual(applied.days);
    });

    it("lets a no-room proposal clear the backlog without adding hours", () => {
      const proposal = proposeRebalance(samplePlan, [], { ...options, capacityFor: flat(0) });
      const next = applyRebalance(samplePlan, proposal);
      const parsed = parseStoredPlan(next)!;
      const total = parsed.days.reduce((s, d) => s + (d.blocks ?? []).length, 0);
      expect(total).toBe(7); // same seven blocks, none added
      expect(detectPlanDeficit(next, [], folders, WED_NOON).isBehind).toBe(false);
    });

    it("inserts a missing day in date order", () => {
      const plan = {
        days: [
          { date: "2026-08-25", blocks: [{ subject: "Math", durationMins: 30 }] },
          { date: "2026-08-30", blocks: [] },
        ],
      };
      const next = applyRebalance(plan, {
        sources: [{ date: "2026-08-25", subject: "Math" }],
        moves: [{ subject: "Math", fromDate: "2026-08-25", toDate: "2026-08-27", minutes: 30 }],
      });
      expect((next.days as Array<{ date: string }>).map((d) => d.date)).toEqual([
        "2026-08-25",
        "2026-08-27",
        "2026-08-30",
      ]);
    });

    it("keeps fields it does not know about", () => {
      const plan = {
        generatedBy: "provider-x",
        days: [
          {
            date: "2026-08-25",
            extra: 1,
            blocks: [{ subject: "Math", durationMins: 30, providerNote: "keep" }],
          },
          { date: "2026-08-26", blocks: [] },
        ],
      };
      const next = applyRebalance(plan, {
        sources: [{ date: "2026-08-25", subject: "Math" }],
        moves: [{ subject: "Math", fromDate: "2026-08-25", toDate: "2026-08-26", minutes: 30 }],
      }) as typeof plan;
      expect(next.generatedBy).toBe("provider-x");
      expect(next.days[0]).toMatchObject({ extra: 1 });
      expect(next.days[0].blocks[0]).toEqual({
        subject: "Math",
        durationMins: 30,
        providerNote: "keep",
        rebalanced: true,
      });
    });

    it("adds the peak-focus hint to catch-up blocks when given one", () => {
      const next = applyRebalance(
        samplePlan,
        {
          sources: [],
          moves: [{ subject: "Math", fromDate: "2026-08-25", toDate: "2026-08-29", minutes: 30, examName: "Maths Final" }],
        },
        { startHint: peakFocusHint(peakWindow) },
      ) as unknown as WeeklyPlanJson;
      const saturday = next.days.find((d) => d.date === "2026-08-29")!;
      expect(saturday.blocks).toEqual([
        {
          subject: "Math",
          durationMins: 30,
          /* The day label follows the runtime locale ("Tue Aug 25" in
             en-US, "Tue 25 Aug" in en-GB), so build it the same way. */
          reason: `Catch-up from ${rebalanceDayLabel("2026-08-25")} · before Maths Final`,
          catchUpFrom: "2026-08-25",
          startHint: "6 AM – 9 AM (Peak Focus)",
        },
      ]);
    });

    it("throws a friendly error on an unreadable plan", () => {
      expect(() => applyRebalance(null, { moves: [], sources: [] })).toThrow(RebalanceError);
      expect(() => applyRebalance({ days: 3 }, { moves: [], sources: [] })).toThrow(
        /changed before the rebalance/,
      );
    });

    it("survives a round-trip through parseStoredPlan", () => {
      const next = applyRebalance(samplePlan, proposeRebalance(samplePlan, [], options));
      const parsed = parseStoredPlan(next)!;
      expect(parsed.days[0].blocks![0].rebalanced).toBe(true);
      const catchUp = parsed.days.flatMap((d) => d.blocks ?? []).find((b) => b.catchUpFrom);
      expect(catchUp?.catchUpFrom).toMatch(/^2026-08-2[45]$/);
    });

    it("keeps last-week adherence from counting moved minutes twice", () => {
      const next = parseStoredPlan(
        applyRebalance(samplePlan, proposeRebalance(samplePlan, [], options)),
      )!;
      const before = computeWeekAdherence(samplePlan.days, [], folders, WEEK);
      const after = computeWeekAdherence(next.days, [], folders, WEEK);
      expect(after.plannedTotal).toBe(before.plannedTotal);
    });
  });
});
