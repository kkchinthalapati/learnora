import { describe, expect, it } from "vitest";
import { buildSocraticPrompt } from "./ReviewView";
import type { Flashcard } from "../../api/types";

/* COACH_STYLE is sent as the *user* message, so it is the last formatting
 * instruction the model reads and it outweighs the edge function's house style
 * for this surface. When it listed every formatting rule except maths, the
 * model read the list as complete and wrote "2√3·√2" as plain characters —
 * unreadable, and the thing the typesetter exists to prevent. These tests pin
 * the rule in place, and pin the escaping: COACH_STYLE is a template literal,
 * so `\sqrt` written with one backslash would reach the model as "sqrt". */
const card = {
  id: "c1",
  front: "Simplify (√3 + √2)².",
  back: "5 + 2√6",
} as unknown as Flashcard;

describe("buildSocraticPrompt", () => {
  it("asks for TeX, with the backslashes intact", () => {
    const prompt = buildSocraticPrompt("why_missed", card);
    expect(prompt).toContain("\\sqrt{12}");
    expect(prompt).toContain("\\boxed{}");
    // The single-backslash form would arrive as a bare word.
    expect(prompt).not.toContain("sqrt{12} = 2sqrt{3}");
  });

  it("carries the maths rule in every mode, not just the default one", () => {
    for (const mode of [
      "why_missed",
      "concept",
      "mnemonic",
      "socratic_question",
    ] as const) {
      expect(buildSocraticPrompt(mode, card)).toContain("Write maths as TeX");
    }
  });

  it("still forbids the syntax the drawer cannot render", () => {
    const prompt = buildSocraticPrompt("concept", card);
    expect(prompt).toContain("Never use markdown headings");
  });
});
