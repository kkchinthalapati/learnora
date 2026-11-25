import { describe, expect, it } from "vitest";
import { MODES, modeShowsOpinions, openTarget } from "./prompt";
import { TASK_MODES } from "./types";

/* What a prompt contains is built and tested in the database
 * (boardroom.integrity.sql.test.ts, which also checks these labels and texts
 * match the database's word for word). */

describe("task types", () => {
  it("has a distinct instruction and a non-empty answer format for every type", () => {
    const tasks = new Set(TASK_MODES.map((m) => MODES[m].task));
    expect(tasks.size).toBe(TASK_MODES.length);
    const labels = new Set(TASK_MODES.map((m) => MODES[m].label));
    expect(labels.size).toBe(TASK_MODES.length);
    for (const m of TASK_MODES) expect(MODES[m].format.length).toBeGreaterThan(2);
  });

  it("shows other AI answers only in the types that are meant to see them", () => {
    expect(modeShowsOpinions("independent")).toBe(false);
    expect(modeShowsOpinions("code_review")).toBe(false);
    for (const m of ["cross_examination", "response_to_agent", "final_synthesis", "decision_review"] as const) {
      expect(modeShowsOpinions(m), m).toBe(true);
    }
  });
});

describe("openTarget", () => {
  it("uses a valid https URL", () => {
    expect(openTarget({ provider: "claude", native_url: "https://claude.ai/new" })).toBe("https://claude.ai/new");
  });
  it("falls back for a non-https or malformed URL", () => {
    expect(openTarget({ provider: "chatgpt", native_url: "javascript:alert(1)" })).toBe("https://chatgpt.com/");
    expect(openTarget({ provider: "claude", native_url: "not a url" })).toBe("https://claude.ai/new");
  });
});
