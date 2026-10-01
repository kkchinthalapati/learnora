import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "../../lib/aiJson";
import { conceptKey, type Misconception } from "../../lib/misconceptions";
import type { StoredAnswer } from "./quizMeta";
import {
  byConcept,
  compareAttempts,
  confidentButWrong,
  markOf,
  resultsHeadline,
} from "./testResults";

const q = (id: number, topic: string): QuizQuestion => ({
  id,
  question: `Q${id}`,
  choices: ["a", "b", "c", "d"],
  correctIndex: 0,
  topic,
});

const a = (
  id: number,
  correct: boolean,
  confidence: StoredAnswer["confidence"] = null,
): StoredAnswer => ({ questionId: id, chosenIndex: correct ? 0 : 1, correct, confidence });

const questions = [
  q(1, "Glycolysis"),
  q(2, "Glycolysis"),
  q(3, "Membranes"),
  q(4, "Membranes"),
  q(5, "Yield table"),
];

describe("markOf", () => {
  it("separates knowing from guessing", () => {
    expect(markOf(a(1, true, "certain"))).toBe("right");
    expect(markOf(a(1, true, "guess"))).toBe("guessed");
    expect(markOf(a(1, false, "guess"))).toBe("wrong");
    expect(markOf(null)).toBe("blank");
  });
});

describe("byConcept", () => {
  it("rows each concept with its marks and an honest status", () => {
    const rows = byConcept(questions, [
      a(1, true, "certain"),
      a(2, true, "guess"),
      a(3, false, "certain"),
      a(4, false, "fairly"),
      a(5, false, "guess"),
    ]);
    expect(rows.map((r) => [r.concept, r.note])).toEqual([
      ["Glycolysis", "1 lucky guess"],
      ["Membranes", "Misconception"],
      ["Yield table", "1 to review"],
    ]);
    expect(rows[1].marks).toEqual([
      { number: 3, mark: "wrong" },
      { number: 4, mark: "wrong" },
    ]);
  });
});

describe("confidentButWrong", () => {
  it("groups sure-but-wrong answers by concept and attaches the ledger's diagnosis", () => {
    const ledger = [
      {
        id: "m1",
        concept: "membranes",
        conceptKey: conceptKey("Membranes"),
        summary: "Puts ATP synthase in the outer membrane.",
        status: "open",
      } as Misconception,
    ];
    const groups = confidentButWrong(
      questions,
      [a(3, false, "certain"), a(4, false, "fairly"), a(5, false, "guess")],
      ledger,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ concept: "Membranes", questions: [3, 4] });
    expect(groups[0].misconception?.id).toBe("m1");
  });
});

describe("resultsHeadline", () => {
  it("states the finding, not the score", () => {
    const answers = [
      a(1, true, "certain"),
      a(2, true, "certain"),
      a(3, false, "certain"),
      a(4, false, "certain"),
      a(5, true),
    ];
    const rows = byConcept(questions, answers);
    expect(resultsHeadline(rows, confidentButWrong(questions, answers, []))).toBe(
      "Glycolysis and Yield table are solid. One idea about Membranes is costing you marks.",
    );
  });

  it("says there is nothing to fix on a clean sheet", () => {
    const answers = questions.map((x) => a(x.id as number, true, "certain"));
    expect(resultsHeadline(byConcept(questions, answers), [])).toBe("Nothing to fix.");
  });
});

describe("compareAttempts", () => {
  it("compares correct answers, and guesses when both attempts rated confidence", () => {
    expect(
      compareAttempts([a(1, true, "guess"), a(2, false, "guess")], [a(1, true, "certain"), a(2, true, "guess")]),
    ).toEqual({ before: 1, after: 2, guessesBefore: 2, guessesAfter: 1 });
    expect(compareAttempts([a(1, false)], [a(1, true)])).toEqual({ before: 0, after: 1 });
    expect(compareAttempts(null, [a(1, true)])).toBeNull();
  });
});
