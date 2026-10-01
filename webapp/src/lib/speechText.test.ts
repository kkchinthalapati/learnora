import { describe, expect, it } from "vitest";
import { MAX_SPOKEN_CHARS, toSpeakableText } from "./speechText";

describe("toSpeakableText", () => {
  it("keeps the words and drops the markdown", () => {
    expect(
      toSpeakableText("**Where it went wrong**\n\n- You *squared* each term\n1. Check `x`"),
    ).toBe("Where it went wrong You squared each term Check x");
  });

  it("points at diagrams, code and display maths instead of reading them out", () => {
    const spoken = toSpeakableText(
      "Look:\n```mermaid\nflowchart LR\n A-->B\n```\nand\n```python\nprint(1)\n```\n$$\\frac{1}{2}$$",
    );
    expect(spoken).toBe(
      "Look: (See the diagram on screen.) and (See the code on screen.) (See the working on screen.)",
    );
    expect(spoken).not.toMatch(/flowchart|print|frac/);
  });

  it("reads easy inline maths in words and points at the rest", () => {
    expect(toSpeakableText("So $x^2 = 9$.")).toBe("So x squared equals 9 .");
    expect(toSpeakableText("Use $\\frac{a}{b}$ here")).toBe(
      "Use (see the maths on screen) here",
    );
  });

  it("reads a link's label and skips citation numbers", () => {
    expect(
      toSpeakableText("See [BBC Bitesize](https://bbc.co.uk/x) [1] or https://example.com/a"),
    ).toBe("See BBC Bitesize or the link on screen");
  });

  it("stops a long reply at a sentence and says the rest is on screen", () => {
    const long = "This is one sentence. ".repeat(100);
    const spoken = toSpeakableText(long);
    expect(spoken.length).toBeLessThanOrEqual(MAX_SPOKEN_CHARS + 30);
    expect(spoken).toMatch(/sentence\. The rest is on screen\.$/);
  });
});
