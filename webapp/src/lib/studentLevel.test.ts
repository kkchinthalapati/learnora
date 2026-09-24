import { afterEach, describe, expect, it, vi } from "vitest";
import { supabase } from "./supabase";
import { fakeSession } from "../test/auth";
import { getFramework } from "./region";
import { levelRules, studentLevel } from "./studentLevel";

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

  it("falls back to the region's exam system when nothing was picked", async () => {
    signedInWith(undefined);
    expect(await studentLevel()).toBe(getFramework().boardLabel);
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
