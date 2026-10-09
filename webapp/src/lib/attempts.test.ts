import { describe, expect, it } from "vitest";
import type { LearningEvent, QuizAttempt } from "../api/types";
import type { QuizQuestion } from "./aiJson";
import { answerFacts, chosenMisconception, collectAttempts, storedAnswer } from "./attempts";

const q = (over: Partial<QuizQuestion> = {}): QuizQuestion => ({
  question: "Water moves across a partially permeable membrane by…",
  choices: ["osmosis", "the salt moving", "active transport", "diffusion of solute"],
  correctIndex: 0,
  topic: "Osmosis",
  ...over,
});

describe("answerFacts", () => {
  it("trusts bank questions and checked ones, not unverified ones", () => {
    expect(answerFacts(q({ ref: "bank:abc" })).verified).toBe(true);
    expect(answerFacts(q({ verified: true })).verified).toBe(true);
    expect(answerFacts(q({ verified: false })).verified).toBe(false);
    expect(answerFacts(q()).verified).toBe(true);
  });

  it("reads the kind from the wording when the question doesn't state it", () => {
    expect(answerFacts(q()).kind).toBe("recall");
    expect(answerFacts(q({ question: "Calculate the kinetic energy of a 2 kg ball at 3 m/s." })).kind).toBe("apply");
    expect(answerFacts(q({ kind: "apply" })).kind).toBe("apply");
  });
});

describe("chosenMisconception", () => {
  it("is the mapped distractor's misconception, and nothing for the key", () => {
    const mapped = q({ distractorMisconceptions: [null, "bio-osmosis-solute-moves", null, null] });
    expect(chosenMisconception(mapped, 1)).toBe("bio-osmosis-solute-moves");
    expect(chosenMisconception(mapped, 0)).toBeNull();
    expect(chosenMisconception(mapped, -1)).toBeNull();
  });
});

describe("collectAttempts", () => {
  it("reads quiz answers and event items into one oldest-first list", () => {
    const attempt = {
      id: "qa1",
      user_id: "u",
      quiz_id: "quiz1",
      created_at: "2026-10-08T10:00:00Z",
      answers_json: [storedAnswer(q({ ref: "bank:1" }), 0), storedAnswer(q({ ref: "bank:2" }), 1)],
    } as unknown as QuizAttempt;
    const event = {
      id: "e1",
      user_id: "u",
      topic_key: "osmosis",
      deck_id: null,
      folder_id: null,
      source: "quick_check",
      score: 1,
      minutes: 0,
      occurred_at: "2026-10-07T10:00:00Z",
      payload: { kind: "practice", items: [storedAnswer(q({ ref: "bank:3" }), 0, { confidence: "guess" })] },
      client_id: "c1",
    } as LearningEvent;

    const list = collectAttempts([attempt], [event]);
    expect(list.map((a) => a.ref)).toEqual(["bank:3", "bank:1", "bank:2"]);
    expect(list[0]).toMatchObject({ source: "practice", confidence: "guess", correct: true });
    expect(list[2]).toMatchObject({ correct: false, chosenIndex: 1, topicKey: "osmosis" });
  });

  it("treats a worked solution as wrong and ignores events with no items", () => {
    const attempt = {
      id: "qa2",
      user_id: "u",
      quiz_id: "quiz1",
      created_at: "2026-10-08T10:00:00Z",
      answers_json: [{ ...storedAnswer(q(), 0), hintRung: 3, correct: true }],
    } as unknown as QuizAttempt;
    const bare = { payload: { answers: [0, 1] }, occurred_at: "2026-10-08T10:00:00Z" } as unknown as LearningEvent;
    const list = collectAttempts([attempt], [bare]);
    expect(list).toHaveLength(1);
    expect(list[0].correct).toBe(false);
  });
});
