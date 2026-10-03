import { describe, expect, it } from "vitest";
import type { Quiz, QuizAttempt } from "../api/types";
import { getSpec } from "./syllabus";
import { attemptTimeline, buildCalibration, quizBelongsToSpec, scopeToSpec } from "./examEvidence";

const bio = getSpec("aqa-gcse-biology-8461")!;

function quiz(id: string, title: string, topics: string[]): Quiz {
  return {
    id,
    user_id: "u",
    material_id: null,
    folder_id: null,
    title,
    created_at: "2026-09-01T00:00:00Z",
    questions_json: topics.map((topic, i) => ({
      id: i,
      question: `Q${i}`,
      choices: ["a", "b"],
      correctIndex: 0,
      topic,
    })),
  };
}

function attempt(
  quizId: string,
  answers: { correct: boolean; confidence?: string }[],
  createdAt = "2026-09-10T10:00:00Z",
): QuizAttempt {
  return {
    id: `${quizId}-${createdAt}`,
    user_id: "u",
    quiz_id: quizId,
    score: answers.filter((a) => a.correct).length,
    total: answers.length,
    weak_topics: null,
    created_at: createdAt,
    answers_json: answers.map((a, i) => ({ questionId: i, chosenIndex: 0, ...a })),
  } as QuizAttempt;
}

describe("quizBelongsToSpec", () => {
  it("counts a quiz whose question topics are mostly in the spec", () => {
    expect(quizBelongsToSpec(quiz("1", "Mixed", ["Osmosis", "Photosynthesis", "Tudors"]), bio)).toBe(true);
    expect(quizBelongsToSpec(quiz("2", "History", ["Tudors", "Stuarts", "Osmosis"]), bio)).toBe(false);
  });

  it("falls back to the title when questions carry no topics", () => {
    expect(quizBelongsToSpec(quiz("3", "Photosynthesis quiz", []), bio)).toBe(true);
    expect(quizBelongsToSpec(quiz("4", "French verbs", []), bio)).toBe(false);
  });

  it("scopes attempts to the scoped quizzes", () => {
    const q1 = quiz("1", "Cells", ["Osmosis"]);
    const q2 = quiz("2", "History", ["Tudors"]);
    const scoped = scopeToSpec([q1, q2], [attempt("1", [{ correct: true }]), attempt("2", [{ correct: false }])], bio);
    expect(scoped.quizzes.map((q) => q.id)).toEqual(["1"]);
    expect(scoped.attempts.map((a) => a.quiz_id)).toEqual(["1"]);
  });
});

describe("buildCalibration", () => {
  it("says nothing without confidence ratings", () => {
    const c = buildCalibration([attempt("1", [{ correct: true }])]);
    expect(c.rated).toBe(0);
    expect(c.verdict).toBeNull();
  });

  it("calls out certain-but-wrong first", () => {
    const answers = [
      ...Array.from({ length: 6 }, (_, i) => ({ correct: i < 3, confidence: "certain" })),
      ...Array.from({ length: 6 }, () => ({ correct: true, confidence: "guess" })),
    ];
    const c = buildCalibration([attempt("1", answers)]);
    const certain = c.rows.find((r) => r.level === "certain")!;
    expect(certain).toMatchObject({ answered: 6, correct: 3, accuracy: 50 });
    expect(c.verdict).toMatch(/certain you're right 50%/);
  });

  it("notices good guesses when certainty holds up", () => {
    const answers = [
      ...Array.from({ length: 5 }, () => ({ correct: true, confidence: "certain" })),
      ...Array.from({ length: 5 }, (_, i) => ({ correct: i < 4, confidence: "guess" })),
    ];
    expect(buildCalibration([attempt("1", answers)]).verdict).toMatch(/guesses are right 80%/);
  });

  it("does not judge a level on too few answers", () => {
    const c = buildCalibration([attempt("1", [{ correct: false, confidence: "certain" }])]);
    expect(c.verdict).toBeNull();
  });
});

describe("attemptTimeline", () => {
  it("lists scored attempts oldest first with their quiz titles", () => {
    const q = quiz("1", "Cells", ["Osmosis"]);
    const points = attemptTimeline(
      [q],
      [
        attempt("1", [{ correct: true }, { correct: false }], "2026-09-12T10:00:00Z"),
        attempt("1", [{ correct: false }, { correct: false }], "2026-09-10T10:00:00Z"),
      ],
    );
    expect(points).toEqual([
      { date: "2026-09-10", title: "Cells", percent: 0 },
      { date: "2026-09-12", title: "Cells", percent: 50 },
    ]);
  });
});
