import { describe, expect, it } from "vitest";
import {
  EMPTY_PROFILE,
  aiContext,
  buildFirstPlan,
  canBuildPlan,
  countryName,
  equalWeights,
  examSystemsFor,
  isSupportedSubject,
  missingRequired,
  regionForCountry,
  specFor,
  supportedBoards,
  toLifeContext,
  type StudyProfile,
} from "./studyProfile";
import { toMinutes } from "./lifeContext";
import { normaliseTopicKey } from "./topicKey";

const TODAY = "2026-10-05"; // a Monday

function profile(patch: Partial<StudyProfile>): StudyProfile {
  return {
    ...EMPTY_PROFILE,
    ageBand: "16-17",
    weekdayMins: 60,
    weekendMins: 120,
    busyFrom: "08:00",
    busyUntil: "16:00",
    bestTime: "night",
    sessionLength: "medium",
    target: "Grade 7s",
    ...patch,
  };
}

describe("country first, then exam systems", () => {
  it("offers a UK student GCSE and A-Level, and IB everywhere", () => {
    const ids = examSystemsFor("GB").map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["gcse", "a_level", "ib"]));
    expect(ids).not.toContain("cbse");
  });

  it("offers an Indian student CBSE and ICSE", () => {
    expect(examSystemsFor("IN").map((s) => s.id)).toEqual(expect.arrayContaining(["cbse", "icse", "ib"]));
  });

  it("a country no preset covers still gets the international options", () => {
    expect(regionForCountry("NG")).toBe("INTL");
    expect(examSystemsFor("NG").map((s) => s.id)).toEqual(expect.arrayContaining(["gcse", "ib"]));
    expect(countryName("NG")).toBe("Nigeria");
  });
});

describe("seeded boards are supported; everything else is generic", () => {
  it("GCSE lists AQA, Edexcel and OCR as supported, with their seeded subjects", () => {
    const boards = supportedBoards("gcse");
    expect(boards.map((b) => b.board)).toEqual(expect.arrayContaining(["AQA", "Pearson Edexcel", "OCR"]));
    expect(boards.find((b) => b.board === "AQA")?.subjects).toEqual(
      expect.arrayContaining(["Biology", "Chemistry", "Physics", "Mathematics"]),
    );
  });

  it("finds the spec for a seeded board and subject, and none otherwise", () => {
    expect(specFor("gcse", "AQA", "Biology")?.id).toBe("aqa-gcse-biology-8461");
    expect(specFor("gcse", "OCR", "maths")?.id).toBe("ocr-gcse-maths-j560");
    expect(specFor("gcse", "OCR", "Biology")).toBeNull();
    expect(specFor("other", "WAEC", "Biology")).toBeNull();
    expect(supportedBoards("cbse")).toEqual([]);
  });
});

describe("five answers build a plan; 'go deeper' is optional", () => {
  it("lists what's missing", () => {
    const p = { ...EMPTY_PROFILE, subjects: [{ name: "History", specId: null, examDate: null, confidence: null }] };
    expect(missingRequired(p)).toEqual(["availability", "bestTime", "sessionLength", "confidence", "target"]);
    expect(canBuildPlan(p)).toBe(false);
  });

  it("a skipped 'go deeper' doesn't block the plan", () => {
    const p = profile({
      subjects: [{ name: "History", specId: null, examDate: null, confidence: 2 }],
      deeperSkipped: true,
    });
    expect(canBuildPlan(p)).toBe(true);
  });

  it("an under-13 student gets no plan", () => {
    const p = profile({ ageBand: "under13", subjects: [{ name: "Maths", specId: null, examDate: null, confidence: 2 }] });
    expect(canBuildPlan(p)).toBe(false);
  });
});

describe("onboarding end to end, as data", () => {
  it("a seeded board: AQA GCSE Biology with an exam date gets spec-weighted exam prep", () => {
    const p = profile({
      country: "GB",
      system: "gcse",
      board: "AQA",
      level: "Year 11",
      subjects: [{ name: "Biology", specId: "aqa-gcse-biology-8461", examDate: "2026-10-20", confidence: 1 }],
    });
    expect(isSupportedSubject(p, "Biology")).toBe(true);
    const plan = buildFirstPlan(p, {}, TODAY);
    expect(plan.blocks.length).toBeGreaterThan(0);
    expect(plan.unverifiedSubjects).toEqual([]);
    expect(plan.blocks.every((b) => b.reason.length > 10)).toBe(true);
    expect(plan.blocks.some((b) => /Biology exam in \d+ days, on the topic worth the most marks left/.test(b.reason))).toBe(true);
  });

  it("a non-seeded board: WAEC History runs on the draft outline, marked unverified", () => {
    const p = profile({
      country: "NG",
      system: "other",
      board: "WAEC",
      level: "SS3",
      subjects: [{ name: "History", specId: null, examDate: null, confidence: 1 }],
    });
    expect(isSupportedSubject(p, "History")).toBe(false);
    const outline = equalWeights(["Pre-colonial states", "Colonial rule", "Independence"]);
    expect(outline.every((t) => t.weight === outline[0].weight)).toBe(true);
    const plan = buildFirstPlan(p, { [normaliseTopicKey("History")]: outline }, TODAY);
    expect(plan.unverifiedSubjects).toEqual(["History"]);
    expect(plan.blocks[0].label).toMatch(/^History: /);
    expect(plan.blocks[0].reason).toMatch(/draft History outline \(unverified, equal weights\)/);
  });
});

describe("the plan respects stated availability", () => {
  const p = profile({
    weekdayMins: 45,
    weekendMins: 90,
    busyFrom: "08:00",
    busyUntil: "16:00",
    protectedDays: [0],
    subjects: [
      { name: "Physics", specId: null, examDate: "2026-10-09", confidence: 1 },
      { name: "French", specId: null, examDate: null, confidence: 1 },
    ],
  });
  const plan = buildFirstPlan(p, {}, TODAY);
  const life = toLifeContext(p);

  it("never books a weekday block inside the fixed commitment", () => {
    for (const b of plan.blocks) {
      const weekday = new Date(`${b.date}T12:00:00`).getDay();
      if (weekday === 0 || weekday === 6) continue;
      const overlaps = b.startMin < toMinutes("16:00")! && b.endMin > toMinutes("08:00")!;
      expect(overlaps, `${b.date} ${b.startMin}`).toBe(false);
    }
  });

  it("stays within each day's stated minutes", () => {
    const perDay = new Map<string, number>();
    for (const b of plan.blocks) perDay.set(b.date, (perDay.get(b.date) ?? 0) + b.endMin - b.startMin);
    for (const [date, mins] of perDay) {
      const weekend = [0, 6].includes(new Date(`${date}T12:00:00`).getDay());
      expect(mins, date).toBeLessThanOrEqual(weekend ? 90 : 45);
    }
  });

  it("leaves protected days empty and nothing after the exam", () => {
    expect(plan.blocks.filter((b) => new Date(`${b.date}T12:00:00`).getDay() === 0)).toEqual([]);
    expect(plan.blocks.filter((b) => b.label.includes("Physics") && b.date > "2026-10-09")).toEqual([]);
  });

  it("uses their session length as the block size", () => {
    expect(life.maxBlockMins).toBe(30);
    /* autoSchedule's own rule: a tail shorter than a minimum block joins the
       sitting before it rather than becoming a session of its own. */
    for (const b of plan.blocks) {
      expect(b.endMin - b.startMin).toBeLessThan(life.maxBlockMins + life.minBlockMins);
    }
  });
});

describe("young-user safety", () => {
  it("only subject, level and board can reach an AI prompt", () => {
    const p = profile({ country: "GB", ageBand: "13-15", level: "Year 9", board: "AQA", pastProblems: "My dad…" });
    expect(Object.keys(aiContext(p, "Biology")).sort()).toEqual(["board", "level", "subject"]);
  });
});

describe("the plan respects their best time of day", () => {
  const base = profile({
    busyFrom: null,
    busyUntil: null,
    subjects: [{ name: "Chemistry", specId: null, examDate: null, confidence: 2 }],
  });

  it("a night owl's sessions land in the evening, a morning person's before noon", () => {
    const night = buildFirstPlan({ ...base, bestTime: "night" }, {}, TODAY);
    const early = buildFirstPlan({ ...base, bestTime: "early" }, {}, TODAY);
    expect(night.blocks.length).toBeGreaterThan(0);
    for (const b of night.blocks) expect(b.startMin).toBeGreaterThanOrEqual(17 * 60);
    for (const b of early.blocks) expect(b.endMin).toBeLessThanOrEqual(12 * 60);
    expect(night.blocks[0].reason).toContain("you focus best later in the day");
  });
});
