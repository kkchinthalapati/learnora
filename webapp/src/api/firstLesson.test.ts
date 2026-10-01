import { describe, expect, it } from "vitest";
import { parseFirstLesson } from "./firstLesson";

const q = (question: string) => ({ question, choices: ["a", "b", "c", "d"], correctIndex: 2, feedback: "why" });

describe("parseFirstLesson", () => {
  it("needs a hook, an explanation and a different check", () => {
    const ok = JSON.stringify({ concept: "x", hook: q("Guess?"), explanation: "Teach.", check: q("Check?") });
    expect(parseFirstLesson(ok, "T")).not.toBeNull();
    expect(parseFirstLesson(JSON.stringify({ hook: q("Guess?"), check: q("Check?") }), "T")).toBeNull();
    expect(parseFirstLesson(JSON.stringify({ hook: q("Guess?"), explanation: "Teach." }), "T")).toBeNull();
    /* The old flow re-asked the hook as the check, answer already shown. */
    expect(parseFirstLesson(JSON.stringify({ hook: q("Same?"), explanation: "T.", check: q("same?") }), "T")).toBeNull();
  });

  it("shuffles options but keeps the key on the right answer", () => {
    const lesson = parseFirstLesson(
      JSON.stringify({ hook: q("Guess?"), explanation: "Teach.", check: q("Check?") }),
      "T",
      () => 0,
    )!;
    expect(lesson.hook.choices[lesson.hook.correctIndex]).toBe("c");
    expect(lesson.check.choices[lesson.check.correctIndex]).toBe("c");
    expect(lesson.hook.correctIndex).not.toBe(2);
  });
});
