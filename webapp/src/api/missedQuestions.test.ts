import { describe, expect, it } from "vitest";
import { missedCardsFrom } from "./missedQuestions";

const quiz = {
  questions_json: [
    {
      question: "Which of these is an enzyme's job?",
      choices: ["Speed up a reaction", "Get used up", "Store energy", "Carry oxygen"],
      correctIndex: 0,
      topic: "Enzymes",
      feedback: "Enzymes are catalysts: they come out unchanged.",
    },
    { question: "What denatures an enzyme?", choices: ["Cold", "High heat"], correctIndex: 1, topic: "Enzymes" },
    { question: "Optimum pH of pepsin?", choices: ["2", "7"], correctIndex: 0, topic: "Enzymes" },
  ],
};

describe("missedCardsFrom", () => {
  it("makes a card for each wrong answer and each lucky guess, not for what was known", () => {
    const cards = missedCardsFrom(quiz, [
      { questionId: 0, chosenIndex: 1, correct: false, topic: "Enzymes", confidence: "certain" },
      { questionId: 1, chosenIndex: 1, correct: true, topic: "Enzymes", confidence: "guess" },
      { questionId: 2, chosenIndex: 0, correct: true, topic: "Enzymes", confidence: "certain" },
    ]);
    expect(cards).toHaveLength(2);
  });

  it("keeps the options on the front so 'which of these' stays answerable, with the answer and why on the back", () => {
    const [card] = missedCardsFrom(quiz, [{ questionId: 0, chosenIndex: 1, correct: false }]);
    expect(card.front).toContain("Which of these is an enzyme's job?");
    expect(card.front).toContain("A) Speed up a reaction");
    expect(card.back).toBe("Speed up a reaction\n\nEnzymes are catalysts: they come out unchanged.");
  });

  it("ignores answers it cannot place", () => {
    expect(missedCardsFrom(quiz, [{ questionId: 9, chosenIndex: 0, correct: false }])).toEqual([]);
    expect(missedCardsFrom(quiz, "not answers")).toEqual([]);
  });
});
