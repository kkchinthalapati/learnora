import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_SATURATION_QUIZZES,
  FORECAST_BAND,
  WEAK_TOPIC_PENALTY,
  calculateQuizForecast,
  daysUntil,
  formatForecastRange,
  formatWeakTopics,
} from "./quizForecast";
import { buildStudentEvidence } from "./studentEvidence";
import type { QuizAttempt } from "../api/types";

const NOW = new Date("2026-09-04T12:00:00Z");
const TODAY = "2026-09-04";

/** One attempt of `total` questions on `topic`, `correct` of them right. */
function attempt(
  id: string,
  topic: string,
  correct: number,
  total: number,
): QuizAttempt {
  return {
    id,
    user_id: "u1",
    quiz_id: `quiz-${id}`,
    score: correct,
    total,
    answers_json: Array.from({ length: total }, (_, i) => ({
      questionId: `${id}-q${i}`,
      chosenIndex: i < correct ? 0 : 1,
      correct: i < correct,
      topic,
    })),
    weak_topics: null,
    created_at: "2026-08-30T00:00:00Z",
  };
}

function evidenceFrom(attempts: QuizAttempt[]) {
  return buildStudentEvidence({ quizzes: [], attempts, now: NOW });
}

describe("daysUntil", () => {
  it("counts whole calendar days forward", () => {
    expect(daysUntil("2026-09-14", TODAY)).toBe(10);
  });

  it("is zero on the day of the exam", () => {
    expect(daysUntil(TODAY, TODAY)).toBe(0);
  });

  it("goes negative once the exam has passed", () => {
    expect(daysUntil("2026-09-01", TODAY)).toBe(-3);
  });
});

describe("calculateQuizForecast", () => {
  it("returns null rather than inventing a forecast from nothing", () => {
    const empty = buildStudentEvidence({
      quizzes: [],
      attempts: [],
      now: NOW,
    });
    expect(calculateQuizForecast(empty, "2026-09-14", TODAY)).toBeNull();
  });

  it("bands the measured accuracy when nothing is weak", () => {
    // 8/10 on each of two topics = 80%, neither below the weak threshold.
    const forecast = calculateQuizForecast(
      evidenceFrom([
        attempt("a1", "Alpha", 8, 10),
        attempt("a2", "Beta", 8, 10),
      ]),
      "2026-09-14",
      TODAY,
    );

    expect(forecast?.accuracyNow).toBe(80);
    expect(forecast?.weakTopics).toEqual([]);
    expect(forecast?.predictedMin).toBe(80 - FORECAST_BAND);
    expect(forecast?.predictedMax).toBe(80 + FORECAST_BAND);
  });

  it("docks the forecast once per measured weak topic", () => {
    /* 9/10 Alpha, 2/10 Beta, 2/10 Gamma = 13/30 ≈ 43%, two weak topics. */
    const forecast = calculateQuizForecast(
      evidenceFrom([
        attempt("a1", "Alpha", 9, 10),
        attempt("a2", "Beta", 2, 10),
        attempt("a3", "Gamma", 2, 10),
      ]),
      "2026-09-14",
      TODAY,
    )!;

    expect(forecast.weakTopics).toHaveLength(2);
    const adjusted = forecast.accuracyNow - 2 * WEAK_TOPIC_PENALTY;
    expect(forecast.predictedMin).toBe(adjusted - FORECAST_BAND);
    expect(forecast.predictedMax).toBe(adjusted + FORECAST_BAND);
  });

  it("never reports a negative or above-100 bound", () => {
    // Everything failing: the penalty would take the adjusted score below 0.
    const floor = calculateQuizForecast(
      evidenceFrom([
        attempt("a1", "Alpha", 0, 10),
        attempt("a2", "Beta", 0, 10),
        attempt("a3", "Gamma", 0, 10),
      ]),
      "2026-09-14",
      TODAY,
    )!;
    expect(floor.predictedMin).toBe(0);

    // Everything perfect: the band would push the top above 100.
    const ceiling = calculateQuizForecast(
      evidenceFrom([attempt("a1", "Alpha", 10, 10)]),
      "2026-09-14",
      TODAY,
    )!;
    expect(ceiling.predictedMax).toBe(100);
  });

  /* At 5 points each, a provisional row would let one unlucky answer move the
     forecast by a whole grade boundary. It must not count. */
  it("ignores a weak-looking topic that has too few answers to be measured", () => {
    const forecast = calculateQuizForecast(
      evidenceFrom([
        attempt("a1", "Alpha", 8, 10),
        // 0/1 on Beta — looks like 0%, is actually one question.
        attempt("a2", "Beta", 0, 1),
      ]),
      "2026-09-14",
      TODAY,
    )!;
    expect(forecast.weakTopics).toEqual([]);
    expect(forecast.predictedMax).toBe(forecast.accuracyNow + FORECAST_BAND);
  });

  it("scales confidence with quiz count and caps it at 100", () => {
    const ten = calculateQuizForecast(
      evidenceFrom(
        Array.from({ length: 10 }, (_, i) => attempt(`a${i}`, "Alpha", 7, 10)),
      ),
      "2026-09-14",
      TODAY,
    )!;
    expect(ten.confidence).toBe(20); // 10 / 50

    const many = calculateQuizForecast(
      evidenceFrom(
        Array.from({ length: CONFIDENCE_SATURATION_QUIZZES + 15 }, (_, i) =>
          attempt(`a${i}`, "Alpha", 7, 10),
        ),
      ),
      "2026-09-14",
      TODAY,
    )!;
    expect(many.confidence).toBe(100);
  });

  /* The worked example from the spec: 20 quizzes, 72% average, 1 weak topic.
   *
   * Note this does NOT produce the "67-77% (80% confidence)" the spec's own
   * TEST section states — that line is inconsistent with the FORMULA section
   * directly above it, on both numbers. Following the formula as written:
   *   adjusted   = 72 - (1 * 5) = 67
   *   range      = 62-72        (the spec's 67-77 skips the weak-topic penalty)
   *   confidence = 20/50 = 40%  (80% would need 40 quizzes, not 20)
   * The formula is the normative half, so that is what is implemented. */
  it("matches the spec's formula on its worked example", () => {
    /* 19 clean quizzes at 75% plus one failing topic, tuned so the overall
       lands on 72% with exactly one measured weak topic. */
    const attempts = [
      ...Array.from({ length: 19 }, (_, i) =>
        attempt(`good-${i}`, "Alpha", 15, 20),
      ),
      attempt("weak", "Beta", 3, 20), // 15% — one weak topic
    ];
    const forecast = calculateQuizForecast(
      evidenceFrom(attempts),
      "2026-09-14",
      TODAY,
    )!;

    expect(forecast.quizzesTaken).toBe(20);
    expect(forecast.accuracyNow).toBe(72); // (19×15 + 3) / 400 = 288/400
    expect(forecast.weakTopics).toHaveLength(1);
    expect(forecast.predictedMin).toBe(62);
    expect(forecast.predictedMax).toBe(72);
    expect(forecast.confidence).toBe(40);
    expect(forecast.daysUntilExam).toBe(10);
  });
});

describe("formatting", () => {
  it("renders the range and the weak topics the way the UI shows them", () => {
    const forecast = calculateQuizForecast(
      evidenceFrom([
        attempt("a1", "Alpha", 9, 10),
        attempt("a2", "Photosynthesis", 45, 100),
      ]),
      "2026-09-14",
      TODAY,
    )!;

    expect(formatForecastRange(forecast)).toMatch(/^\d+–\d+$/);
    expect(formatWeakTopics(forecast)).toContain("Photosynthesis (45%)");
  });
});
