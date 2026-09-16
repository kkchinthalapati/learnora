import { describe, expect, it } from "vitest";
import { normaliseTopicKey, topicMatches } from "./topicKey";

describe("normaliseTopicKey", () => {
  it("lowercases, trims, collapses whitespace and strips punctuation", () => {
    expect(normaliseTopicKey("  Enzymes &  Kinetics! ")).toBe("enzymes kinetics");
    expect(normaliseTopicKey("Titration (acids/bases)")).toBe("titration acids bases");
  });
  it("returns an empty string for nothing useful", () => {
    expect(normaliseTopicKey("  --  ")).toBe("");
  });
});

describe("topicMatches", () => {
  it("matches equal keys and containment either way", () => {
    expect(topicMatches("Enzymes", "enzymes")).toBe(true);
    expect(topicMatches("AP Bio: Enzymes", "Enzymes")).toBe(true);
    expect(topicMatches("Enzymes", "Bio: enzymes and rates")).toBe(true);
    expect(topicMatches("Enzyme", "Enzymes")).toBe(true);
  });
  it("does not match unrelated or empty topics", () => {
    expect(topicMatches("Enzymes", "Titration")).toBe(false);
    expect(topicMatches("", "Titration")).toBe(false);
  });
});
