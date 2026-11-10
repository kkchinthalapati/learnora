import { describe, expect, it } from "vitest";
import { guessCapture, notesTitle, topicTitle } from "./captureInput";

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

describe("topicTitle", () => {
  it("drops the request's lead-in so the title names the topic", () => {
    expect(topicTitle("i want to learn photosynthesis")).toBe("Photosynthesis");
    expect(topicTitle("Teach me about the French Revolution?")).toBe("The French Revolution");
    expect(topicTitle("can you explain how osmosis works")).toBe("How osmosis works");
    expect(topicTitle("please help me understand quadratic equations.")).toBe("Quadratic equations");
    expect(topicTitle("mitochondria")).toBe("Mitochondria");
  });

  it("keeps the words when the lead-in is all there is", () => {
    expect(topicTitle("learn")).toBe("Learn");
  });
});

describe("notesTitle", () => {
  it("uses a short first line, without its heading marker", () => {
    expect(notesTitle("# Cell division\n\nMitosis has four phases.")).toBe("Cell division");
    expect(notesTitle("\n\n- newton's laws\n- inertia")).toBe("Newton's laws");
  });

  it("cuts a long opening paragraph at its first sentence", () => {
    expect(
      notesTitle(
        "Mitosis is how a cell divides. It has four phases: prophase, metaphase, anaphase and telophase.",
      ),
    ).toBe("Mitosis is how a cell divides");
  });

  it("cuts at a word when there is no sentence to stop at", () => {
    const title = notesTitle(
      "Mitosis is the process where a cell divides into two identical daughter cells and it has four phases",
    );
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith("…")).toBe(true);
    expect(title).toMatch(/^Mitosis is the process where a cell divides/);
  });

  it("never comes back empty", () => {
    expect(notesTitle("***\n---")).toBe("Pasted notes");
  });
});
