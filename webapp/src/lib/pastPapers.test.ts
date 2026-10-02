import { describe, expect, it } from "vitest";
import { percent, summarisePastPapers, type PastPaperAttempt } from "./pastPapers";

function a(sat_on: string, marks: number, max_marks = 100): PastPaperAttempt {
  return { id: sat_on, exam_id: 1, paper: "Paper 1", series: null, marks, max_marks, sat_on, notes: null, created_at: `${sat_on}T00:00:00Z` };
}

describe("past paper summary", () => {
  it("is empty with no papers", () => {
    expect(summarisePastPapers([])).toEqual({ count: 0, average: null, latest: null, trendPerPaper: null });
  });

  it("averages, takes the latest by date, and only trends from three papers", () => {
    expect(summarisePastPapers([a("2026-09-10", 60), a("2026-09-01", 50)])).toEqual({
      count: 2,
      average: 55,
      latest: 60,
      trendPerPaper: null,
    });
    const s = summarisePastPapers([a("2026-09-20", 70), a("2026-09-01", 50), a("2026-09-10", 60)]);
    expect(s.trendPerPaper).toBe(10);
    expect(s.latest).toBe(70);
  });

  it("works in percentages whatever the paper's total", () => {
    expect(percent({ marks: 40, max_marks: 80 })).toBe(50);
    expect(summarisePastPapers([a("2026-09-01", 40, 80), a("2026-09-02", 75, 100)]).average).toBe(63);
  });
});
