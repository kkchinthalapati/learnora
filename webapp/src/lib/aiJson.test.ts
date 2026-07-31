import { describe, expect, it } from "vitest";
import { extractFlashcardJSON, extractPlanJSON, extractQuizJSON } from "./aiJson";

describe("extractFlashcardJSON", () => {
  it("parses a bare array (Gemini's shape)", () => {
    const text = '[{"front":"Q1","back":"A1"},{"front":"Q2","back":"A2"}]';
    expect(extractFlashcardJSON(text)).toEqual([
      { front: "Q1", back: "A1" },
      { front: "Q2", back: "A2" },
    ]);
  });

  it("unwraps {cards:[...]} (JSON-mode providers)", () => {
    const text = '{"cards":[{"front":"Q1","back":"A1"}]}';
    expect(extractFlashcardJSON(text)).toEqual([{ front: "Q1", back: "A1" }]);
  });

  it("unwraps {flashcards:[...]} / {items:[...]} / {data:[...]} the same way", () => {
    for (const key of ["flashcards", "items", "data"]) {
      const text = JSON.stringify({ [key]: [{ front: "Q", back: "A" }] });
      expect(extractFlashcardJSON(text)).toEqual([{ front: "Q", back: "A" }]);
    }
  });

  it("strips ```json code fences", () => {
    const text = '```json\n[{"front":"Q1","back":"A1"}]\n```';
    expect(extractFlashcardJSON(text)).toEqual([{ front: "Q1", back: "A1" }]);
  });

  it("tolerates trailing commas", () => {
    const text = '[{"front":"Q1","back":"A1",},]';
    expect(extractFlashcardJSON(text)).toEqual([{ front: "Q1", back: "A1" }]);
  });

  it("finds an object block surrounded by prose", () => {
    const text = 'Sure, here you go:\n{"cards":[{"front":"Q","back":"A"}]}\nHope that helps!';
    expect(extractFlashcardJSON(text)).toEqual([{ front: "Q", back: "A" }]);
  });

  it("finds an array block surrounded by prose when no object wraps it", () => {
    const text = 'Here:\n[{"front":"Q","back":"A"}]\nEnjoy.';
    expect(extractFlashcardJSON(text)).toEqual([{ front: "Q", back: "A" }]);
  });

  it("falls back to regex-extracting individual card objects as a last resort", () => {
    const text = 'garbage {"front": "Q1", "back": "A1"} more garbage {"front": "Q2", "back": "A2"} trailing junk ]]]';
    expect(extractFlashcardJSON(text)).toEqual([
      { front: "Q1", back: "A1" },
      { front: "Q2", back: "A2" },
    ]);
  });

  it("returns an empty array for text with nothing card-shaped in it", () => {
    expect(extractFlashcardJSON("Sorry, I can't help with that.")).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(extractFlashcardJSON("")).toEqual([]);
    expect(extractFlashcardJSON(null)).toEqual([]);
  });

  it("rejects a well-formed array whose items aren't card-shaped", () => {
    expect(extractFlashcardJSON('[{"question":"Q","answer":"A"}]')).toEqual([]);
  });
});

describe("extractPlanJSON", () => {
  it("parses a plan object with a days array", () => {
    const text = '{"days":[{"date":"2026-08-03","blocks":[]}]}';
    expect(extractPlanJSON(text)).toEqual({
      days: [{ date: "2026-08-03", blocks: [] }],
    });
  });

  it("strips code fences", () => {
    const text = '```json\n{"days":[]}\n```';
    expect(extractPlanJSON(text)).toEqual({ days: [] });
  });

  it("finds an object block surrounded by prose", () => {
    const text = 'Here is your plan:\n{"days":[]}\nGood luck!';
    expect(extractPlanJSON(text)).toEqual({ days: [] });
  });

  it("tolerates trailing commas", () => {
    expect(extractPlanJSON('{"days":[],}')).toEqual({ days: [] });
  });

  it("returns null when there is no days array", () => {
    expect(extractPlanJSON('{"schedule":[]}')).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(extractPlanJSON("")).toBeNull();
    expect(extractPlanJSON(null)).toBeNull();
  });

  it("returns null for unparseable garbage", () => {
    expect(extractPlanJSON("not json at all")).toBeNull();
  });
});

describe("extractQuizJSON", () => {
  const validQuestion = {
    question: "What is 2+2?",
    choices: ["3", "4", "5"],
    correctIndex: 1,
  };

  it("parses a bare array", () => {
    expect(extractQuizJSON(JSON.stringify([validQuestion]))).toEqual([validQuestion]);
  });

  it("unwraps {questions:[...]} / {quiz:[...]} / {items:[...]} / {data:[...]}", () => {
    for (const key of ["questions", "quiz", "items", "data"]) {
      const text = JSON.stringify({ [key]: [validQuestion] });
      expect(extractQuizJSON(text)).toEqual([validQuestion]);
    }
  });

  it("strips code fences", () => {
    const text = "```json\n" + JSON.stringify({ questions: [validQuestion] }) + "\n```";
    expect(extractQuizJSON(text)).toEqual([validQuestion]);
  });

  it("finds an array block via bracket matching", () => {
    const text = `Here's your quiz: ${JSON.stringify([validQuestion])} enjoy!`;
    expect(extractQuizJSON(text)).toEqual([validQuestion]);
  });

  /* The load-bearing rule: a model that emits `answer`/`correct_index`
   * instead of `correctIndex` must not silently produce a quiz where every
   * answer grades wrong. */
  it("rejects a question missing correctIndex", () => {
    const bad = { question: "Q", choices: ["a", "b"], answer: 0 };
    expect(extractQuizJSON(JSON.stringify([bad]))).toEqual([]);
  });

  it("rejects correctIndex out of range", () => {
    const bad = { ...validQuestion, correctIndex: 5 };
    expect(extractQuizJSON(JSON.stringify([bad]))).toEqual([]);
  });

  it("rejects correctIndex that isn't an integer", () => {
    const bad = { ...validQuestion, correctIndex: 1.5 };
    expect(extractQuizJSON(JSON.stringify([bad]))).toEqual([]);
  });

  it("rejects a question with fewer than 2 choices", () => {
    const bad = { question: "Q", choices: ["only one"], correctIndex: 0 };
    expect(extractQuizJSON(JSON.stringify([bad]))).toEqual([]);
  });

  it("rejects the whole array if any single question is malformed", () => {
    const bad = { question: "Q2", choices: ["a", "b"], correctIndex: 9 };
    expect(extractQuizJSON(JSON.stringify([validQuestion, bad]))).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(extractQuizJSON("")).toEqual([]);
    expect(extractQuizJSON(null)).toEqual([]);
  });
});
