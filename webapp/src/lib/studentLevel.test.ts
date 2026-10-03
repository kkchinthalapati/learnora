import { afterEach, describe, expect, it, vi } from "vitest";
import { supabase } from "./supabase";
import { fakeSession } from "../test/auth";
import { getFramework } from "./region";
import { levelRules, studentLevel, studentStandard } from "./studentLevel";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "./supabase";
import { queryClient } from "./queryClient";
import { localDateStr } from "./date";
import type { Exam } from "../api/types";

function signedInWith(onboarding: Record<string, unknown> | undefined) {
  const session = fakeSession({
    user_metadata: onboarding ? { onboarding } : {},
  });
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session },
    error: null,
  } as Awaited<ReturnType<typeof supabase.auth.getSession>>);
}

describe("studentLevel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the exam the student picked in the wizard", async () => {
    signedInWith({ goal: "school", examType: "gcse" });
    expect(await studentLevel()).toBe("GCSE");
  });

  it("says university for a university student with no board", async () => {
    signedInWith({ goal: "university" });
    expect(await studentLevel()).toBe("university");
  });

  it("falls back to the region's exam system, marked as unconfirmed, when nothing was picked", async () => {
    signedInWith(undefined);
    const level = await studentLevel();
    expect(level.startsWith(getFramework().boardLabel)).toBe(true);
    expect(level).toMatch(/not confirmed by the student/);
  });
});

describe("levelRules", () => {
  it("tells the model not to ask for, or mark down for, higher-level detail", () => {
    const rules = levelRules("GCSE");
    expect(rules).toContain("STUDENT LEVEL: GCSE");
    expect(rules).toMatch(/never list higher-level detail as missing/);
    expect(levelRules("GCSE / A-Level")).toContain("aim at the first (the lower)");
  });
});

describe("studentStandard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  const future = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return localDateStr(d);
  };

  function withExams(exams: Partial<Exam>[]) {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/exams`, () =>
        HttpResponse.json(
          exams.map((e, i) => ({
            id: i + 1,
            user_id: "user-1",
            exam_name: "Exam",
            exam_date: future(30),
            difficulty: "Medium",
            status: "Scheduled",
            ...e,
          })),
        ),
      ),
    );
  }

  it("pitches a topic at the exam spec it belongs to, with its section", async () => {
    signedInWith({ goal: "school", examType: "gcse" });
    withExams([
      { syllabus_id: "aqa-gcse-maths-8300", syllabus_tier: "Foundation" },
      { syllabus_id: "aqa-gcse-biology-8461", syllabus_tier: "Higher" },
    ]);
    const { level, specLine } = await studentStandard("Limiting factors in photosynthesis");
    expect(level).toBe("AQA GCSE Biology (8461), Higher tier");
    expect(specLine).toContain('4.4.1 "Photosynthesis"');
    expect(levelRules(level, specLine)).toContain(specLine);
  });

  it("falls back to the general level when the topic is in no spec", async () => {
    signedInWith({ goal: "school", examType: "gcse" });
    withExams([{ syllabus_id: "aqa-gcse-biology-8461" }]);
    expect(await studentStandard("The Tudors")).toEqual({ level: "GCSE", specLine: "" });
  });

  it("falls back when exams cannot be read", async () => {
    signedInWith({ goal: "school", examType: "gcse" });
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/exams`, () => HttpResponse.json({}, { status: 500 })),
    );
    expect(await studentStandard("Photosynthesis")).toEqual({ level: "GCSE", specLine: "" });
  });
});
