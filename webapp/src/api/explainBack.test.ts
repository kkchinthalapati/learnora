import { beforeEach, describe, expect, it, vi } from "vitest";

const callEdge = vi.fn();
vi.mock("./ai", async (orig) => ({
  ...(await orig<typeof import("./ai")>()),
  callEdge: (...a: unknown[]) => callEdge(...a),
}));
vi.mock("../lib/studentLevel", async (orig) => ({
  ...(await orig<typeof import("../lib/studentLevel")>()),
  studentStandard: async () => ({ level: "GCSE" }),
}));

import {
  buildExplainBackPrompt,
  checkExplanation,
  copiedFromNotes,
  explainBackScore,
  explainParts,
  MAX_EXPLAIN_PARTS,
  wordCount,
} from "./explainBack";
import type { LearnSection } from "../lib/learnSections";

const section = (key: string, title: string, body: string) => ({ key, title, body }) as LearnSection;
const SECTIONS = [
  section("a", "What osmosis is", "Osmosis is the movement of water across a partially permeable membrane."),
  section("b", "Which way water moves", "Water moves from a dilute solution to a more concentrated solution."),
];
const PARTS = explainParts(SECTIONS, { a: "Osmosis", b: undefined });
const ANSWER =
  "Osmosis is when water crosses a membrane that only lets some things through, and it goes from the weak solution to the strong one.";

const reply = (raw: unknown) => callEdge.mockResolvedValueOnce({ text: JSON.stringify(raw) });

describe("explainParts", () => {
  it("names each part by the concept Learn taught it as, else its title", () => {
    expect(PARTS.map((p) => p.text)).toEqual(["Osmosis", "Which way water moves"]);
    expect(PARTS.map((p) => p.key)).toEqual(["a", "b"]);
  });

  it("reads a long lesson on its first parts only", () => {
    const many = Array.from({ length: 12 }, (_, i) => section(`s${i}`, `Part ${i}`, "notes"));
    expect(explainParts(many)).toHaveLength(MAX_EXPLAIN_PARTS);
  });
});

describe("copiedFromNotes", () => {
  const notes = SECTIONS.map((s) => s.body).join("\n");

  it("catches a long run lifted from the notes, whatever the punctuation", () => {
    expect(
      copiedFromNotes(
        "So: osmosis is the movement of water across a partially permeable membrane, water moves and that is it.",
        notes,
      ),
    ).toBe(true);
  });

  it("lets through an explanation that only shares short phrases", () => {
    expect(copiedFromNotes(ANSWER, notes)).toBe(false);
    expect(copiedFromNotes("a partially permeable membrane", notes)).toBe(false);
  });

  it("counts words, not characters", () => {
    expect(wordCount("  Water moves, slowly!  ")).toBe(3);
  });
});

describe("buildExplainBackPrompt", () => {
  it("grounds the reading in the lesson's own notes and fences what the student wrote", () => {
    const prompt = buildExplainBackPrompt({ lesson: "Osmosis", parts: PARTS, answer: ANSWER, level: "GCSE" });
    expect(prompt).toContain("Water moves from a dilute solution");
    expect(prompt).toContain("[0]");
    expect(prompt).toContain("[1]");
    expect(prompt).toContain(ANSWER);
    expect(prompt).toMatch(/Never invent one/);
  });
});

describe("checkExplanation", () => {
  beforeEach(() => callEdge.mockReset());

  const run = () =>
    checkExplanation({ materialId: "m1", lesson: "Osmosis", subject: "Biology", parts: PARTS, answer: ANSWER });

  it("covers a part only on the student's own quoted words", async () => {
    reply({
      legible: true,
      points: [
        { index: 0, awarded: true, evidence: "water crosses a membrane that only lets some things through" },
        { index: 1, awarded: true, evidence: "words the student never wrote" },
      ],
      beliefs: [],
    });
    const marking = await run();
    expect(marking.kind).toBe("marked");
    if (marking.kind !== "marked") return;
    expect(marking.points.map((p) => p.verdict)).toEqual(["awarded", "missed"]);
    expect(marking.awarded).toBe(1);
  });

  it("drops a wrong idea the student never wrote", async () => {
    reply({
      legible: true,
      points: [{ index: 0, awarded: false, note: "What a membrane lets through" }, { index: 1, awarded: false }],
      beliefs: [
        { concept: "Osmosis", belief: "Water moves towards the dilute side", quote: "water goes to the dilute side" },
        { concept: "Osmosis", belief: "It goes weak to strong", quote: "it goes from the weak solution to the strong one" },
      ],
    });
    const marking = await run();
    if (marking.kind !== "marked") throw new Error("expected a marking");
    expect(marking.beliefs.map((b) => b.quote)).toEqual(["it goes from the weak solution to the strong one"]);
  });

  it("rides on the lesson's own session key, so it costs no more allowance", async () => {
    reply({ legible: true, points: [{ index: 0, awarded: false }, { index: 1, awarded: false }] });
    await run();
    expect(callEdge.mock.calls[0][0]).toMatchObject({ tool: "learn", sessionKey: "learn-m1" });
  });

  it("has no stand-in: an unreadable reply is an error, not a result", async () => {
    callEdge.mockResolvedValueOnce({ text: "Sorry, I can't do that." });
    await expect(run()).rejects.toThrow(/not in a way I could read/);
    callEdge.mockRejectedValueOnce(new Error("offline"));
    await expect(run()).rejects.toThrow("offline");
  });
});

describe("explainBackScore", () => {
  const marked = (awarded: number, total: number, unchecked = 0) =>
    ({ kind: "marked", points: [], awarded, total, unchecked, beliefs: [] }) as never;

  it("records knowing the lesson only when every part came across", () => {
    expect(explainBackScore(marked(3, 3))).toBe(1);
  });

  it("records nothing for parts left out, or when some were not read", () => {
    expect(explainBackScore(marked(1, 3))).toBeNull();
    expect(explainBackScore(marked(0, 3))).toBeNull();
    expect(explainBackScore(marked(2, 3, 1))).toBeNull();
    expect(explainBackScore({ kind: "unreadable", reason: "" })).toBeNull();
  });
});
