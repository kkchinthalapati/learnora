import { describe, expect, it } from "vitest";
import {
  decodeBase64UTF8,
  extractFlashcardJSON,
  extractPlanJSON,
  extractQuizJSON,
} from "./aiJson";

/* The extractors exist because the edge function walks a chain of providers
 * with different response-format support, so the same request comes back in
 * several shapes. Each block below is one shape actually seen in the wild. */

describe("extractQuizJSON", () => {
  const question = {
    question: "What is 2 + 2?",
    choices: ["3", "4", "5"],
    correctIndex: 1,
  };

  it("reads a bare array (Gemini — no response_format sent)", () => {
    expect(extractQuizJSON(JSON.stringify([question]))).toEqual([question]);
  });

  it('unwraps {"questions": [...]} (providers on response_format:json_object)', () => {
    expect(extractQuizJSON(JSON.stringify({ questions: [question] }))).toEqual([
      question,
    ]);
  });

  it("unwraps the other keys providers have used", () => {
    for (const key of ["quiz", "items", "data"]) {
      expect(extractQuizJSON(JSON.stringify({ [key]: [question] }))).toEqual([
        question,
      ]);
    }
  });

  it("strips markdown code fences", () => {
    expect(
      extractQuizJSON("```json\n" + JSON.stringify([question]) + "\n```"),
    ).toEqual([question]);
  });

  it("finds the array inside surrounding prose", () => {
    expect(
      extractQuizJSON(
        `Sure! Here you go:\n${JSON.stringify([question])}\nGood luck.`,
      ),
    ).toEqual([question]);
  });

  it("forgives trailing commas", () => {
    expect(
      extractQuizJSON(
        '[{"question":"q","choices":["a","b"],"correctIndex":0,}]',
      ),
    ).toEqual([{ question: "q", choices: ["a", "b"], correctIndex: 0 }]);
  });

  /* The reason correctIndex is validated at all: the runner grades with
     `i === q.correctIndex`, so a reply carrying `answer` instead would produce
     a quiz where every option — including the right one — is marked wrong,
     silently. Rejecting it here surfaces a retryable failure instead. */
  it("rejects a question that names its answer field something else", () => {
    expect(
      extractQuizJSON('[{"question":"q","choices":["a","b"],"answer":0}]'),
    ).toEqual([]);
  });

  it("rejects a correctIndex outside the choices", () => {
    expect(
      extractQuizJSON(
        '[{"question":"q","choices":["a","b"],"correctIndex":5}]',
      ),
    ).toEqual([]);
  });

  it("rejects a question with fewer than two choices", () => {
    expect(
      extractQuizJSON('[{"question":"q","choices":["a"],"correctIndex":0}]'),
    ).toEqual([]);
  });

  it("returns [] for empty or unparseable text", () => {
    expect(extractQuizJSON("")).toEqual([]);
    expect(extractQuizJSON(null)).toEqual([]);
    expect(extractQuizJSON("I'd rather not.")).toEqual([]);
  });
});

describe("extractFlashcardJSON", () => {
  const cards = [{ front: "Mitochondria", back: "Powerhouse of the cell" }];

  it("reads a bare array", () => {
    expect(extractFlashcardJSON(JSON.stringify(cards))).toEqual(cards);
  });

  it('unwraps {"cards": [...]}', () => {
    expect(extractFlashcardJSON(JSON.stringify({ cards }))).toEqual(cards);
  });

  it("strips markdown code fences", () => {
    expect(
      extractFlashcardJSON("```json\n" + JSON.stringify(cards) + "\n```"),
    ).toEqual(cards);
  });

  it("falls back to a per-card regex when the structure is unsalvageable", () => {
    const mangled =
      'here are cards {"front": "A", "back": "B"} and {"front": "C", "back": "D"} ok';
    expect(extractFlashcardJSON(mangled)).toEqual([
      { front: "A", back: "B" },
      { front: "C", back: "D" },
    ]);
  });

  it("returns [] when nothing card-shaped is present", () => {
    expect(extractFlashcardJSON('{"notes":"no cards here"}')).toEqual([]);
    expect(extractFlashcardJSON("")).toEqual([]);
  });
});

describe("extractPlanJSON", () => {
  const plan = {
    summary: "Busy week",
    days: [{ date: "2026-08-03", blocks: [] }],
  };

  it("reads a plain object", () => {
    expect(extractPlanJSON(JSON.stringify(plan))).toEqual(plan);
  });

  it("strips markdown code fences", () => {
    expect(
      extractPlanJSON("```json\n" + JSON.stringify(plan) + "\n```"),
    ).toEqual(plan);
  });

  it("finds the object inside surrounding prose", () => {
    expect(
      extractPlanJSON(`Here's your week:\n${JSON.stringify(plan)}\nEnjoy!`),
    ).toEqual(plan);
  });

  it("returns null without a days array — the grid has nothing to draw", () => {
    expect(extractPlanJSON('{"summary":"nice week"}')).toBeNull();
    expect(extractPlanJSON("not json at all")).toBeNull();
    expect(extractPlanJSON("")).toBeNull();
  });
});

describe("decodeBase64UTF8", () => {
  it("decodes multi-byte characters atob alone would mangle", () => {
    const text = "café — naïve — 日本語";
    const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
    expect(decodeBase64UTF8(base64)).toBe(text);
  });
});
