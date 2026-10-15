import { describe, expect, it } from "vitest";
import { guessCapture } from "./captureInput";

describe("guessCapture", () => {
  it("treats blank input as empty", () => {
    expect(guessCapture("   \n ")).toEqual({ kind: "empty" });
  });

  it("reads a pasted URL as a link", () => {
    expect(guessCapture(" https://youtu.be/abc123 ")).toEqual({
      kind: "link",
      url: "https://youtu.be/abc123",
    });
  });

  it("adds https to a bare www address", () => {
    expect(guessCapture("www.bbc.co.uk/bitesize")).toEqual({
      kind: "link",
      url: "https://www.bbc.co.uk/bitesize",
    });
  });

  it("does not read a dotless word or another scheme as a link", () => {
    expect(guessCapture("http://localhost").kind).toBe("topic");
    expect(guessCapture("javascript:alert(1)").kind).toBe("topic");
  });

  it("reads a short phrase as a topic", () => {
    expect(guessCapture("  photosynthesis   light reactions ")).toEqual({
      kind: "topic",
      topic: "photosynthesis light reactions",
    });
  });

  it("reads a long paragraph as pasted notes", () => {
    const para = "Mitochondria ".repeat(15);
    expect(guessCapture(para)).toEqual({ kind: "text", text: para.trim() });
  });

  it("reads several lines past the notes minimum as pasted notes", () => {
    const lines = "Newton's first law: inertia\nSecond law: F = ma\nThird: pairs";
    expect(guessCapture(lines).kind).toBe("text");
  });

  it("keeps a short two-line entry as a topic", () => {
    expect(guessCapture("Cell\nbiology")).toEqual({
      kind: "topic",
      topic: "Cell biology",
    });
  });
});
