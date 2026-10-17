import { describe, expect, it } from "vitest";
import { headingsOf, markedPhrases, recalledIdeas, sentenceAt, wordCount } from "./noteReading";

describe("markedPhrases", () => {
  it("joins runs of one mark split by another format and finds the sentence", () => {
    const ops = [
      { insert: "Enzymes lower the " },
      { insert: "activation", attributes: { mark: "learn" } },
      { insert: " energy", attributes: { mark: "learn", bold: true } },
      { insert: " of a reaction. They are proteins.\n" },
    ];
    expect(markedPhrases(ops)).toEqual([
      {
        kind: "learn",
        text: "activation energy",
        index: 18,
        sentence: "Enzymes lower the activation energy of a reaction.",
      },
    ]);
  });

  it("filters by kind and drops whitespace-only marks", () => {
    const ops = [
      { insert: "A ", attributes: { mark: "key" } },
      { insert: "b ", attributes: { mark: "wrong" } },
      { insert: "  ", attributes: { mark: "learn" } },
      { insert: "\n" },
    ];
    expect(markedPhrases(ops, "wrong").map((p) => p.text)).toEqual(["b"]);
    expect(markedPhrases(ops).map((p) => p.kind)).toEqual(["key", "wrong"]);
  });
});

describe("headingsOf", () => {
  it("reads the header format from each line's closing newline", () => {
    const ops = [
      { insert: "Enzymes" },
      { insert: "\n", attributes: { header: 1 } },
      { insert: "Body text\nRate factors" },
      { insert: "\n", attributes: { header: 2 } },
    ];
    expect(headingsOf(ops)).toEqual([
      { text: "Enzymes", level: 1, index: 0 },
      { text: "Rate factors", level: 2, index: 18 },
    ]);
  });
});

describe("sentenceAt", () => {
  it("returns the sentence on the line, not the whole line", () => {
    const text = "First one. Second has the word here. Third.\nNext line";
    expect(sentenceAt(text, text.indexOf("word"), 4)).toBe("Second has the word here.");
  });
});

describe("recalledIdeas", () => {
  it("counts an idea when half its long words appear, by their first five letters", () => {
    const { recalled, missed } = recalledIdeas(
      ["activation energy", "optimum temperature", "pH"],
      "Enzymes cut the activation barrier. They denature when hot.",
    );
    expect(recalled).toEqual(["activation energy"]);
    expect(missed).toEqual(["optimum temperature", "pH"]);
  });
});

describe("wordCount", () => {
  it("counts words and ignores embeds", () => {
    expect(wordCount("Two words\uFFFC and three")).toBe(4);
  });
});
