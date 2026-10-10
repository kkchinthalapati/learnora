import { describe, expect, it } from "vitest";
import { answeredQuestions, quizLoopCandidates, unmatchedWrong, type AnsweredQuestion } from "./quizMistakes";
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

describe("hints and the worked solution", () => {
  const Q: QuizQuestion[] = [
    { id: "h1", question: "Capital of Peru?", choices: ["Lima", "Quito"], correctIndex: 0, topic: "Geography" },
    { id: "h2", question: "What is 7 × 8?", choices: ["54", "56"], correctIndex: 1, topic: "Arithmetic" },
  ];

  it("a right answer after a hint earns no ledger correction", () => {
    const answered = answeredQuestions(Q, [{ questionId: "h1", chosenIndex: 0, correct: true, topic: "Geography", hintRung: 2 }]);
    expect(quizLoopCandidates(answered, { subject: "", attemptKey: "a", labels: new Map() })).toEqual([]);
  });

  it("the worked solution counts as a miss, filed as a concept gap and handed to the loop", () => {
    const answered = answeredQuestions(Q, [
      { questionId: "h2", chosenIndex: -1, correct: false, topic: "Arithmetic", hintRung: 3 },
    ]);
    expect(answered[0]).toMatchObject({ isCorrect: false, workedSolution: true });
    const [c] = quizLoopCandidates(answered, { subject: "Maths", attemptKey: "a", labels: new Map() });
    expect(c).toMatchObject({
      kind: "evidence",
      concept: "Arithmetic",
      errorType: "concept",
      workedSolution: true,
      detail: expect.stringContaining("worked solution"),
    });
  });

  it("even a stored 'correct' with the full ladder counts as wrong", () => {
    const answered = answeredQuestions(Q, [{ questionId: "h1", chosenIndex: 0, correct: true, topic: "Geography", hintRung: 3 }]);
    expect(answered[0].isCorrect).toBe(false);
  });
});

describe("quizLoopCandidates reads the answer's signals (lib/diagnosis.ts)", () => {
  const wrong = (over: Partial<AnsweredQuestion> = {}): AnsweredQuestion => ({
    questionId: "q1",
    question: "What does a fuse do?",
    topic: "Magnetic Effects of Electric Current",
    chosen: "Stores charge",
    correct: "Melts and breaks the circuit",
    isCorrect: false,
    guessed: false,
    workedSolution: false,
    confidence: null,
    secondsSpent: 10,
    ...over,
  });
  const ctx = { subject: "Science", attemptKey: "att1", labels: new Map() };

  it("writes nothing for a quick miss on a topic already secure", () => {
    const secureTopics = new Set(["magnetic effects of electric current"]);
    expect(quizLoopCandidates([wrong()], { ...ctx, secureTopics })).toEqual([]);
    expect(quizLoopCandidates([wrong()], ctx)).toHaveLength(1);
  });

  it("makes a confidently held catalogue belief critical", () => {
    const mapped = wrong({
      question: "Which lens corrects myopia?",
      topic: "The Human Eye and the Colourful World",
      chosen: "A convex lens",
      correct: "A concave lens",
      confidence: "certain",
      misconceptionId: "phys-myopia-convex",
    });
    const [c] = quizLoopCandidates([mapped], ctx);
    expect(c.catalogueId).toBe("phys-myopia-convex");
    expect(c.severity).toBe("critical");
  });
});
