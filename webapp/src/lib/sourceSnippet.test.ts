import { describe, expect, it } from "vitest";
import { sourceSnippet } from "./sourceSnippet";

describe("sourceSnippet", () => {
  it("keeps only the first passage and drops the page's headings and comments", () => {
    const raw =
      "Osmosis is the movement of water through a partially permeable membrane. Created by Sal Khan. [...] Mohammad 2 years ago Posted 2 years ago. ## Want to join the conversation? Log in";
    expect(sourceSnippet(raw)).toBe(
      "Osmosis is the movement of water through a partially permeable membrane. Created by Sal Khan.",
    );
  });

  it("stops at a Markdown heading", () => {
    expect(sourceSnippet("Water moves in. ## Want to keep learning? More")).toBe(
      "Water moves in.",
    );
  });

  it("cuts a long passage at a word and marks the cut", () => {
    const out = sourceSnippet("word ".repeat(100));
    expect(out.length).toBeLessThanOrEqual(221);
    expect(out.endsWith("word…")).toBe(true);
  });

  it("returns an empty string for nothing", () => {
    expect(sourceSnippet(undefined)).toBe("");
  });
});
