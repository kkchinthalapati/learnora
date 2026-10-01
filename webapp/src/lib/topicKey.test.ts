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

describe("topicMatches — whole words", () => {
  it("does not match a short topic hidden inside a longer word", () => {
    expect(topicMatches("pH", "Photosynthesis")).toBe(false);
    expect(topicMatches("art", "Heart")).toBe(false);
  });
  it("still matches plurals and longer titles that contain the topic", () => {
    expect(topicMatches("Cells", "cell structure")).toBe(true);
    expect(topicMatches("Enzymes", "Enzymes and rates of reaction")).toBe(true);
  });
});
