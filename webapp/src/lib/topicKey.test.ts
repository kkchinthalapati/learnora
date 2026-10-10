import { describe, expect, it } from "vitest";
import { bestTopicMatch, normaliseTopicKey, topicMatches } from "./topicKey";

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

describe("bestTopicMatch", () => {
  const decks = ["Cell division", "Cell transport", "Specialised cells", "Enzymes and rates"];

  it("never lets one label feed several topics: a tie attributes nothing", () => {
    expect(bestTopicMatch("Cells", decks)).toBe(-1);
  });

  it("keeps the loose match when only one topic fits", () => {
    expect(bestTopicMatch("Enzymes", decks)).toBe(3);
  });

  it("prefers an exact title, then the closest overlap", () => {
    expect(bestTopicMatch("cell division!", decks)).toBe(0);
    expect(bestTopicMatch("Cell division", ["Cell division and mitosis", "Cell division"])).toBe(1);
    expect(bestTopicMatch("Specialised cell", decks)).toBe(2);
  });

  it("returns -1 for nothing or no match", () => {
    expect(bestTopicMatch("", decks)).toBe(-1);
    expect(bestTopicMatch("Photosynthesis", decks)).toBe(-1);
  });
});
