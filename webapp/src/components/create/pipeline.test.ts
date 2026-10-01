import { describe, expect, it } from "vitest";
import { pipelineSteps } from "./pipeline";

const all = { notes: true, flashcards: true, quiz: true };

describe("pipelineSteps", () => {
  it("marks what is done, what is running and what is next", () => {
    const steps = pipelineSteps({ message: "Building 20 flashcards…", outputs: all, failed: [] });
    expect(steps.map((s) => [s.label, s.status])).toEqual([
      ["Reading text and writing notes", "done"],
      ["Writing recall questions", "current"],
      ["Writing a practice quiz", "upcoming"],
    ]);
    expect(steps[1].detail).toBe("Building 20 flashcards…");
  });

  it("only lists the stages the student asked for", () => {
    const steps = pipelineSteps({
      message: "Reading your material and writing notes…",
      outputs: { notes: false, flashcards: true, quiz: false },
      failed: [],
    });
    expect(steps.map((s) => s.label)).toEqual(["Reading text", "Writing recall questions"]);
    expect(steps[0].status).toBe("current");
  });

  it("says a failed stage is safe to retry", () => {
    const steps = pipelineSteps({ message: null, outputs: all, failed: ["quiz"] });
    expect(steps[2]).toMatchObject({ status: "upcoming", detail: expect.stringMatching(/Retrying is safe/) });
    expect(steps[0].status).toBe("done");
  });
});
