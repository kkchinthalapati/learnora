import { describe, expect, it } from "vitest";
import { answeredQuestions, quizLoopCandidates, unmatchedWrong } from "./quizMistakes";
import { questionKey } from "./questionKey";
import type { QuizQuestion } from "./aiJson";
import type { StoredAnswer } from "../views/quiz/quizMeta";

const QUESTIONS: QuizQuestion[] = [
  {
    id: "q1",
    question: "When do plant cells carry out respiration?",
    choices: ["Only at night", "All the time"],
    correctIndex: 1,
    topic: "Respiration",
  },
  {
    id: "q2",
    question: "Why did the Weimar Republic collapse?",
    choices: ["One single cause", "Several interacting causes"],
    correctIndex: 1,
    topic: "Weimar Germany",
  },
  { id: "q3", question: "Compute 12 × 4", choices: ["46", "48"], correctIndex: 1, topic: "Arithmetic" },
  { id: "q4", question: "Capital of France?", choices: ["Paris", "Lyon"], correctIndex: 0, topic: "Geography" },
];
const ANSWERS: StoredAnswer[] = [
  { questionId: "q1", chosenIndex: 0, correct: false, topic: "Respiration" },
  { questionId: "q2", chosenIndex: 0, correct: false, topic: "Weimar Germany" },
  { questionId: "q3", chosenIndex: 0, correct: false, topic: "Arithmetic" },
  { questionId: "q4", chosenIndex: 0, correct: true, topic: "Geography" },
];

describe("quiz answers → the mistake loop", () => {
  const answered = answeredQuestions(QUESTIONS, ANSWERS);

  it("joins each answer to its question's text and choices", () => {
    expect(answered[2]).toMatchObject({ question: "Compute 12 × 4", chosen: "46", correct: "48", isCorrect: false });
  });

  it("only uncatalogued wrong answers go to the AI labeller", () => {
    expect(unmatchedWrong(answered).map((a) => a.questionId)).toEqual(["q2", "q3"]);
  });

  it("matches every wrong answer: catalogue, provisional AI, or generic", () => {
    const labels = new Map([
      [
        questionKey(QUESTIONS[1].question),
        { concept: "Single-cause explanations", belief: "Big events have one cause.", reteach: "Causes interact.", contrast: "One cause vs several." },
      ],
    ]);
    const cs = quizLoopCandidates(answered, { subject: "Mixed", attemptKey: "att-1", labels });
    const wrong = cs.filter((c) => c.kind === "evidence");
    expect(wrong).toHaveLength(3);

    const catalogue = wrong.find((c) => c.catalogueId);
    expect(catalogue).toMatchObject({ catalogueId: "bio-plants-dont-respire", provisional: false });
    expect(catalogue?.sourceId).toBe("att-1:q1");

    const ai = wrong.find((c) => c.provisional);
    expect(ai).toMatchObject({ concept: "Single-cause explanations", repairText: "Causes interact." });

    const generic = wrong.find((c) => c.errorType === "calculation");
    expect(generic).toMatchObject({ concept: "Arithmetic", provisional: false });
    expect(generic?.repairText).toBeTruthy();
    expect(generic?.contrastText).toContain("48");
  });

  it("every write carries the question and an idempotency key", () => {
    const cs = quizLoopCandidates(answered, { subject: "", attemptKey: "att-1", labels: new Map() });
    for (const c of cs) {
      expect(c.questionKey).toMatch(/^q[0-9a-z]+$/);
      expect(c.idempotencyKey).toContain("att-1");
    }
    const again = quizLoopCandidates(answered, { subject: "", attemptKey: "att-1", labels: new Map() });
    expect(again.map((c) => c.idempotencyKey)).toEqual(cs.map((c) => c.idempotencyKey));
  });

  it("a correct answer marked as a guess is not a correction", () => {
    const guessed = answeredQuestions(QUESTIONS, [
      { questionId: "q4", chosenIndex: 0, correct: true, confidence: "guess", topic: "Geography" },
    ]);
    expect(quizLoopCandidates(guessed, { subject: "", attemptKey: "a", labels: new Map() })).toEqual([]);
  });
});
