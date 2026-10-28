import { describe, expect, it } from "vitest";
import {
  candidatesFromMarking,
  MAX_BELIEFS,
  MAX_SCHEME_POINTS,
  parseMarkScheme,
  readMarking,
  schemeTotal,
  type SchemePoint,
} from "./photoMarking";

const SCHEME: SchemePoint[] = [
  { text: "Water moves by osmosis", marks: 1 },
  { text: "From a dilute to a more concentrated solution", marks: 1 },
  { text: "Through a partially permeable membrane", marks: 2 },
];

describe("parseMarkScheme", () => {
  it("takes one point per line and reads the marks at the end of each", () => {
    expect(
      parseMarkScheme(
        "Water moves by osmosis (1)\nfrom dilute to concentrated [1 mark]\n- through a partially permeable membrane 2 marks\nCell swells",
      ),
    ).toEqual([
      { text: "Water moves by osmosis", marks: 1 },
      { text: "from dilute to concentrated", marks: 1 },
      { text: "through a partially permeable membrane", marks: 2 },
      { text: "Cell swells", marks: 1 },
    ]);
  });

  it("drops headers, blank lines, bullets, numbering and bare totals", () => {
    expect(
      parseMarkScheme("Mark scheme\n\nAnswer:\n1. Osmosis (1)\n(b) Membrane [1]\n• Dilute (1)\n[3 marks]\nTotal: 3\nGuidance"),
    ).toEqual([
      { text: "Osmosis", marks: 1 },
      { text: "Membrane", marks: 1 },
      { text: "Dilute", marks: 1 },
    ]);
  });

  it("treats an impossible mark as one, and stops at a sensible length", () => {
    expect(parseMarkScheme("Point (0)")[0].marks).toBe(1);
    expect(parseMarkScheme("Point (99)")).toEqual([{ text: "Point", marks: 1 }]);
    const long = Array.from({ length: 40 }, (_, i) => `Point ${i}`).join("\n");
    expect(parseMarkScheme(long)).toHaveLength(MAX_SCHEME_POINTS);
  });

  it("totals the marks", () => {
    expect(schemeTotal(SCHEME)).toBe(4);
    expect(schemeTotal([])).toBe(0);
  });
});

describe("readMarking", () => {
  it("gives no score for unreadable handwriting", () => {
    expect(readMarking({ legible: false, unreadable: "The second line is smudged.", points: [] }, SCHEME)).toEqual({
      kind: "unreadable",
      reason: "The second line is smudged.",
    });
  });

  it("counts the score itself, from the scheme's own marks, never from the model", () => {
    const m = readMarking(
      {
        legible: true,
        total: 99,
        points: [
          { index: 0, awarded: true, evidence: "the water goes in by osmosis" },
          { index: 1, awarded: false, note: "Direction not given" },
          { index: 2, awarded: true, evidence: "through the membrane" },
        ],
      } as never,
      SCHEME,
    );
    expect(m).toMatchObject({ kind: "marked", awarded: 3, total: 4, unchecked: 0 });
  });

  it("does not award a point with nothing quoted", () => {
    const m = readMarking(
      { points: [{ index: 0, awarded: true, evidence: "" }, { index: 1, awarded: true }, { index: 2, awarded: "yes", evidence: "x" }] },
      SCHEME,
    );
    expect(m?.kind === "marked" && m.awarded).toBe(0);
    expect(m?.kind === "marked" && m.points.map((p) => p.verdict)).toEqual(["missed", "missed", "missed"]);
  });

  it("calls a point the reply skipped 'not checked', not missed, and says the score is a floor", () => {
    const m = readMarking({ points: [{ index: 0, awarded: true, evidence: "osmosis" }] }, SCHEME);
    expect(m).toMatchObject({ kind: "marked", awarded: 1, unchecked: 2 });
    expect(m?.kind === "marked" && m.points.map((p) => p.verdict)).toEqual(["awarded", "unchecked", "unchecked"]);
  });

  it("ignores points that aren't in the scheme, and a second answer for the same point", () => {
    const m = readMarking(
      {
        points: [
          { index: 7, awarded: true, evidence: "invented" },
          { index: -1, awarded: true, evidence: "x" },
          { index: 0, awarded: false, note: "no" },
          { index: 0, awarded: true, evidence: "second go" },
        ],
      },
      SCHEME,
    );
    expect(m).toMatchObject({ kind: "marked", awarded: 0, unchecked: 2 });
  });

  it("has nothing to show for a reply that marks nothing", () => {
    expect(readMarking({ points: [] }, SCHEME)).toBeNull();
    expect(readMarking(null, SCHEME)).toBeNull();
    expect(readMarking({ points: "lots" } as never, SCHEME)).toBeNull();
  });

  it("keeps only beliefs with a concept, an idea and the student's quoted words, at most three", () => {
    const m = readMarking(
      {
        points: [{ index: 0, awarded: false }],
        beliefs: [
          { concept: "Osmosis", belief: "Salt moves into the cell", quote: "the salt goes in" },
          { concept: "Osmosis", belief: "No quote here at all", quote: "" },
          { concept: "", belief: "No concept given here", quote: "x y z" },
          ...Array.from({ length: 5 }, (_, i) => ({ concept: `Concept ${i}`, belief: `A wrong idea ${i}`, quote: `words ${i}` })),
        ],
      },
      SCHEME,
    );
    expect(m?.kind === "marked" && m.beliefs).toHaveLength(MAX_BELIEFS);
    expect(m?.kind === "marked" && m.beliefs[0].quote).toBe("the salt goes in");
  });
});

describe("candidatesFromMarking", () => {
  const marked = (beliefs: { concept: string; belief: string; quote: string }[]) =>
    readMarking({ points: [{ index: 0, awarded: false }], beliefs }, SCHEME)!;

  it("files a belief the catalogue recognises as that named belief, with its re-teach", () => {
    const [c] = candidatesFromMarking(
      marked([{ concept: "Respiration", belief: "Thinks respiration is breathing", quote: "respiration is breathing in and out" }]),
      "Biology",
      "run1",
    );
    expect(c).toMatchObject({
      catalogueId: "bio-respiration-is-breathing",
      kind: "evidence",
      tool: "quiz",
      sourceId: "marked:run1",
    });
    expect(c.provisional).toBeUndefined();
    expect(c.repairText).toBeTruthy();
    expect(c.detail).toContain("respiration is breathing in and out");
  });

  it("files anything else as provisional: one model's reading, not yet a pattern", () => {
    const [c] = candidatesFromMarking(
      marked([{ concept: "Treaty of Versailles", belief: "Thinks Germany signed willingly", quote: "Germany was happy to sign" }]),
      "History",
      "run2",
    );
    expect(c).toMatchObject({ subject: "History", concept: "Treaty of Versailles", provisional: true, kind: "evidence" });
  });

  it("files nothing for an unreadable answer, no beliefs, or no subject", () => {
    expect(candidatesFromMarking({ kind: "unreadable", reason: "" }, "Biology", "r")).toEqual([]);
    expect(candidatesFromMarking(marked([]), "Biology", "r")).toEqual([]);
    expect(
      candidatesFromMarking(marked([{ concept: "Osmosis", belief: "Salt moves in", quote: "salt goes in" }]), "  ", "r"),
    ).toEqual([]);
  });
});
