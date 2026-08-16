import { describe, expect, it } from "vitest";
import {
  answerForIndex,
  parseProctorTermination,
  parseStoredAnswers,
  parseStoredQuestions,
  weakTopicsFrom,
  type StoredAnswer,
} from "./quizMeta";

/* `questions_json` and `answers_json` are free-form JSON. lib/aiJson validates
 * questions on the way *in* from the model, but a row already in the database
 * predates that check. */

describe("parseStoredQuestions", () => {
  const good = {
    id: "q1",
    question: "What is 2 + 2?",
    choices: ["3", "4", "5"],
    correctIndex: 1,
    topic: "Arithmetic",
    feedback: "Two twos.",
  };

  it("keeps a well-formed question intact", () => {
    expect(parseStoredQuestions([good])).toEqual([good]);
  });

  it("returns [] for anything that isn't an array", () => {
    expect(parseStoredQuestions(null)).toEqual([]);
    expect(parseStoredQuestions({ questions: [good] })).toEqual([]);
    expect(parseStoredQuestions("[]")).toEqual([]);
  });

  /* The one defect the runner cannot render around: it grades with
     `i === correctIndex`, so an out-of-range index marks every option —
     including the right one — wrong, with no error anywhere. */
  it("drops a question whose correctIndex is out of range", () => {
    expect(
      parseStoredQuestions([{ ...good, correctIndex: 7 }, good]),
    ).toHaveLength(1);
    expect(parseStoredQuestions([{ ...good, correctIndex: -1 }])).toEqual([]);
    expect(parseStoredQuestions([{ ...good, correctIndex: 1.5 }])).toEqual([]);
  });

  /* `Number(null)` and `Number("")` are both 0, so a blind coercion would
     silently declare the first choice correct on a row that never named one. */
  it("does not coerce a missing correctIndex into 0", () => {
    expect(parseStoredQuestions([{ ...good, correctIndex: null }])).toEqual([]);
    expect(parseStoredQuestions([{ ...good, correctIndex: "" }])).toEqual([]);
    const { correctIndex: _omitted, ...noIndex } = good;
    expect(parseStoredQuestions([noIndex])).toEqual([]);
  });

  /* A numeric string is in range once coerced, so it grades correctly — no
     reason to throw the question away over its JSON type. `extractQuizJSON`
     is stricter on the way *in* from the model; this is a stored row that
     already exists. */
  it("coerces a numeric-string correctIndex rather than dropping the question", () => {
    expect(parseStoredQuestions([{ ...good, correctIndex: "1" }])[0]).toEqual(
      good,
    );
  });

  it("drops a question with fewer than two usable choices", () => {
    expect(parseStoredQuestions([{ ...good, choices: ["only"] }])).toEqual([]);
    expect(parseStoredQuestions([{ ...good, choices: "a, b" }])).toEqual([]);
  });

  it("drops non-string choices rather than rendering [object Object]", () => {
    const parsed = parseStoredQuestions([
      { ...good, choices: ["a", { x: 1 }, "b"], correctIndex: 1 },
    ]);
    expect(parsed[0]?.choices).toEqual(["a", "b"]);
  });

  it("tolerates a question with no id, topic or feedback", () => {
    const parsed = parseStoredQuestions([
      { question: "q", choices: ["a", "b"], correctIndex: 0 },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBeUndefined();
    expect(parsed[0].topic).toBeUndefined();
  });
});

describe("parseStoredAnswers", () => {
  it("keeps a well-formed answer", () => {
    const answer = {
      questionId: "q1",
      chosenIndex: 2,
      correct: true,
      topic: "T",
    };
    expect(parseStoredAnswers([answer])).toEqual([answer]);
  });

  it("treats a missing `correct` as wrong rather than truthy", () => {
    expect(
      parseStoredAnswers([{ questionId: 0, chosenIndex: 1 }])[0].correct,
    ).toBe(false);
  });

  it("drops an answer with no usable chosenIndex", () => {
    expect(parseStoredAnswers([{ questionId: 0 }])).toEqual([]);
    expect(parseStoredAnswers(null)).toEqual([]);
  });
});

describe("answerForIndex", () => {
  const questions = parseStoredQuestions([
    { id: "q1", question: "a", choices: ["1", "2"], correctIndex: 0 },
    { id: "q2", question: "b", choices: ["1", "2"], correctIndex: 1 },
  ]);

  it("matches on questionId when the model gave the question an id", () => {
    const answers: StoredAnswer[] = [
      { questionId: "q2", chosenIndex: 1, correct: true },
      { questionId: "q1", chosenIndex: 0, correct: true },
    ];
    expect(answerForIndex(answers, questions, 0)?.questionId).toBe("q1");
    expect(answerForIndex(answers, questions, 1)?.questionId).toBe("q2");
  });

  /* Attempts are stored in question order, so position is the reliable link
     back when the model omitted ids. */
  it("falls back to position when ids are absent", () => {
    const idless = parseStoredQuestions([
      { question: "a", choices: ["1", "2"], correctIndex: 0 },
      { question: "b", choices: ["1", "2"], correctIndex: 1 },
    ]);
    const answers: StoredAnswer[] = [
      { questionId: 0, chosenIndex: 1, correct: false },
      { questionId: 1, chosenIndex: 1, correct: true },
    ];
    expect(answerForIndex(answers, idless, 1)?.correct).toBe(true);
  });

  it("returns null when the question was never answered", () => {
    expect(answerForIndex([], questions, 0)).toBeNull();
  });
});

describe("weakTopicsFrom", () => {
  it("collects the topics of wrong answers, deduplicated", () => {
    expect(
      weakTopicsFrom([
        { questionId: 0, chosenIndex: 0, correct: false, topic: "Mitosis" },
        { questionId: 1, chosenIndex: 0, correct: false, topic: "Mitosis" },
        { questionId: 2, chosenIndex: 0, correct: true, topic: "Osmosis" },
        { questionId: 3, chosenIndex: 0, correct: false, topic: "Meiosis" },
      ]),
    ).toEqual(["Mitosis", "Meiosis"]);
  });

  it("skips wrong answers with no topic", () => {
    expect(
      weakTopicsFrom([{ questionId: 0, chosenIndex: 0, correct: false }]),
    ).toEqual([]);
  });

  it("handles empty answers", () => {
    expect(weakTopicsFrom([])).toEqual([]);
  });

  it("is empty on a perfect score", () => {
    expect(
      weakTopicsFrom([
        { questionId: 0, chosenIndex: 0, correct: true, topic: "Mitosis" },
      ]),
    ).toEqual([]);
  });
});

describe("parseProctorTermination", () => {
  it("extracts proctor termination details from attempt payload", () => {
    const payload = {
      items: [{ questionId: 0, chosenIndex: 1, correct: true }],
      proctorTermination: {
        reason: "fullscreen",
        timestamp: "2026-08-16T12:00:00.000Z",
      },
    };
    expect(parseStoredAnswers(payload)).toHaveLength(1);
    expect(parseProctorTermination(payload)).toEqual({
      reason: "fullscreen",
      timestamp: "2026-08-16T12:00:00.000Z",
    });
  });

  it("returns null for plain array answers without proctor termination", () => {
    expect(parseProctorTermination([{ questionId: 0, chosenIndex: 1, correct: true }])).toBeNull();
    expect(parseProctorTermination(null)).toBeNull();
  });
});
