import { describe, expect, it } from "vitest";
import type { Folder, StudySession } from "../api/types";
import type { WeeklyPlanJson } from "./aiJson";
import type { PeakFocusWindow } from "./analyticsEngine";
import {
  detectPlanDeficit,
  rebalanceWeeklyPlan,
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
    label: "Early Bird Focus (6 AM – 9 AM)",
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

  describe("rebalanceWeeklyPlan", () => {
    it("returns unchanged plan if no rebalancing is needed", () => {
      const nowMonday = new Date("2026-08-24T12:00:00");
      const result = rebalanceWeeklyPlan(samplePlan, [], {
        folders,
        now: nowMonday,
      });

      expect(result.isRebalanced).toBe(false);
      expect(result.redistributedMinutes).toBe(0);
      expect(result.rebalancedPlan.days).toEqual(samplePlan.days);
    });

    it("redistributes missed minutes intelligently across remaining days with chronotype peak window", () => {
      const nowWednesday = new Date("2026-08-26T12:00:00");
      // Missed 50 minutes: 20m Chem, 30m Bio
      const sessions: StudySession[] = [
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
      ];

      const result = rebalanceWeeklyPlan(samplePlan, sessions, {
        folders,
        now: nowWednesday,
        peakFocusWindow: peakWindow,
      });

      expect(result.isRebalanced).toBe(true);
      expect(result.redistributedMinutes).toBe(50);
      expect(result.summary).toContain("Moved");

      // Verify that past days (Mon, Tue) remain untouched
      expect(result.rebalancedPlan.days[0].blocks).toEqual(samplePlan.days[0].blocks);
      expect(result.rebalancedPlan.days[1].blocks).toEqual(samplePlan.days[1].blocks);

      // Verify that remaining days received catch-up time
      const remainingDays = result.rebalancedPlan.days.filter((d) => d.date >= "2026-08-26");
      const totalRemainingMinutes = remainingDays.reduce(
        (acc, d) =>
          acc +
          (d.blocks || []).reduce((sum, b) => sum + (b.durationMins || 25), 0),
        0,
      );

      const originalRemainingMinutes = samplePlan.days
        .filter((d) => d.date >= "2026-08-26")
        .reduce(
          (acc, d) =>
            acc +
            (d.blocks || []).reduce((sum, b) => sum + (b.durationMins || 25), 0),
          0,
        );

      expect(totalRemainingMinutes).toBe(originalRemainingMinutes + 50);

      // Check chronotype peak focus hint integration
      const rebalancedBlocks = remainingDays.flatMap((d) => d.blocks || []);
      const hasPeakHint = rebalancedBlocks.some(
        (b) => b && (b.startHint?.includes("Peak Focus") || b.reason?.includes("Rebalanced")),
      );
      expect(hasPeakHint).toBe(true);
    });

    it("handles heavy deficit by spreading across available light days (Saturday/Sunday)", () => {
      const nowWednesday = new Date("2026-08-26T12:00:00");
      // 0 study on Mon (75m) & Tue (90m) = 165m deficit
      const result = rebalanceWeeklyPlan(samplePlan, [], {
        folders,
        now: nowWednesday,
        peakFocusWindow: peakWindow,
      });

      expect(result.isRebalanced).toBe(true);
      expect(result.redistributedMinutes).toBe(165);

      // Saturday (index 5) or Sunday (index 6) which had 0 blocks should now have scheduled blocks
      const saturday = result.rebalancedPlan.days[5];
      const sunday = result.rebalancedPlan.days[6];
      expect((saturday.blocks || []).length + (sunday.blocks || []).length).toBeGreaterThan(0);
    });
  });
});
