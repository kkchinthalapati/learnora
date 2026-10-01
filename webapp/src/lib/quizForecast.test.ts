import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_SATURATION_QUIZZES,
  FORECAST_BAND,
  MIN_FORECAST_QUIZZES,
  confidenceFor,
  MAX_WEAK_TOPIC_PENALTY,
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

/* Most cases below care about a ratio (80% overall, two weak topics), not
   about how many sittings produced it — but a forecast is only offered above
   MIN_FORECAST_QUIZZES. Repeating the whole set preserves every accuracy in
   it exactly while clearing that floor. */
function repeatToFloor(attempts: QuizAttempt[]): QuizAttempt[] {
  const rounds = Math.ceil(MIN_FORECAST_QUIZZES / attempts.length);
  return Array.from({ length: rounds }, (_, round) =>
    attempts.map((a) => ({
      ...a,
      id: `${a.id}-r${round}`,
      quiz_id: `${a.quiz_id}-r${round}`,
    })),
  ).flat();
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
      evidenceFrom(
        repeatToFloor([
          attempt("a1", "Alpha", 8, 10),
          attempt("a2", "Beta", 8, 10),
        ]),
      ),
      "2026-09-14",
      TODAY,
    );

    expect(forecast?.accuracyNow).toBe(80);
    expect(forecast?.weakTopics).toEqual([]);
    expect(forecast?.predictedMin).toBe(80 - forecast!.band);
    expect(forecast?.predictedMax).toBe(80 + forecast!.band);
  });

  it("docks the forecast once per measured weak topic", () => {
    /* 9/10 Alpha, 2/10 Beta, 2/10 Gamma = 13/30 ≈ 43%, two weak topics. */
    const forecast = calculateQuizForecast(
      evidenceFrom(
        repeatToFloor([
          attempt("a1", "Alpha", 9, 10),
          attempt("a2", "Beta", 2, 10),
          attempt("a3", "Gamma", 2, 10),
        ]),
      ),
      "2026-09-14",
      TODAY,
    )!;

    expect(forecast.weakTopics).toHaveLength(2);
    const adjusted = forecast.accuracyNow - 2 * WEAK_TOPIC_PENALTY;
    expect(forecast.penalty).toBe(2 * WEAK_TOPIC_PENALTY);
    expect(forecast.predictedMin).toBe(adjusted - forecast.band);
    expect(forecast.predictedMax).toBe(adjusted + forecast.band);
  });

  /* Uncapped, eight weak topics would deduct 40 points and forecast a student
     measured at ~47% into the teens — a number nothing in the app supports. */
  it("caps the total weak-topic penalty however many holes there are", () => {
    const forecast = calculateQuizForecast(
      evidenceFrom([
        attempt("a0", "Strong", 10, 10),
        ...Array.from({ length: 8 }, (_, i) =>
          attempt(`w${i}`, `Weak ${i}`, 2, 10),
        ),
      ]),
      "2026-09-14",
      TODAY,
    )!;

    expect(forecast.weakTopics).toHaveLength(8);
    expect(forecast.penalty).toBe(MAX_WEAK_TOPIC_PENALTY);
    expect(forecast.accuracyNow - forecast.penalty).toBeGreaterThan(0);
  });

  it("never reports a negative or above-100 bound", () => {
    // Everything failing: the penalty would take the adjusted score below 0.
    const floor = calculateQuizForecast(
      evidenceFrom(
        repeatToFloor([
          attempt("a1", "Alpha", 0, 10),
          attempt("a2", "Beta", 0, 10),
          attempt("a3", "Gamma", 0, 10),
        ]),
      ),
      "2026-09-14",
      TODAY,
    )!;
    expect(floor.predictedMin).toBe(0);

    // Everything perfect: the band would push the top above 100.
    const ceiling = calculateQuizForecast(
      evidenceFrom(repeatToFloor([attempt("a1", "Alpha", 10, 10)])),
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
        /* Padded with Alpha rather than repeated, so Beta keeps its single
           answer and stays provisional — repeating would give it five. */
        ...Array.from({ length: MIN_FORECAST_QUIZZES }, (_, i) =>
          attempt(`a${i}`, "Alpha", 8, 10),
        ),
        // 0/1 on Beta — looks like 0%, is actually one question.
        attempt("beta", "Beta", 0, 1),
      ]),
      "2026-09-14",
      TODAY,
    )!;
    expect(forecast.weakTopics).toEqual([]);
    expect(forecast.predictedMax).toBe(forecast.accuracyNow + forecast.band);
  });

  it("scales confidence with quiz count and caps it at 100", () => {
    const ten = calculateQuizForecast(
      evidenceFrom(
        Array.from({ length: 10 }, (_, i) => attempt(`a${i}`, "Alpha", 7, 10)),
      ),
      "2026-09-14",
      TODAY,
    )!;
    expect(ten.confidence).toBe(67); // interpolated between the 5 and 20 anchors

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
   * The spec's own FORMULA and TEST sections disagree, on both numbers:
   *   formula  -> adjusted = 72 - (1 * 5) = 67, so 62-72 at a flat ±5
   *   examples -> "67-77 (80% confidence)"
   * The formula is the normative half for the range, so the range follows it.
   * The confidence anchors follow the examples, which is the half that says
   * when a student should feel able to act on the number. */
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
    expect(forecast.band).toBe(FORECAST_BAND);
    expect(forecast.predictedMin).toBe(62);
    expect(forecast.predictedMax).toBe(72);
    expect(forecast.confidence).toBe(80);
    expect(forecast.daysUntilExam).toBe(10);
  });

  /* The floor replaced the widening band. A one-quiz forecast used to be
     shown at ±20 — "60-100", which is not a range anyone can plan around and
     which invites reading the top of it. Refusing is the honest output. */
  describe(`the ${MIN_FORECAST_QUIZZES}-quiz floor`, () => {
    const thin = (count: number) =>
      calculateQuizForecast(
        evidenceFrom(
          Array.from({ length: count }, (_, i) =>
            attempt(`q${i}`, "Alpha", 8, 10),
          ),
        ),
        "2026-09-14",
        TODAY,
      );

    it("declines to forecast below the floor", () => {
      for (let count = 1; count < MIN_FORECAST_QUIZZES; count++) {
        expect(thin(count)).toBeNull();
      }
    });

    it("forecasts as soon as the floor is reached", () => {
      const forecast = thin(MIN_FORECAST_QUIZZES)!;
      expect(forecast).not.toBeNull();
      expect(forecast.quizzesTaken).toBe(MIN_FORECAST_QUIZZES);
      expect(forecast.band).toBe(FORECAST_BAND);
    });

    it("states every forecast to the same precision, since all of them clear the floor", () => {
      const atFloor = thin(MIN_FORECAST_QUIZZES)!;
      const saturated = thin(50)!;
      expect(atFloor.band).toBe(saturated.band);
      /* Confidence, not the range, is what now separates them. */
      expect(atFloor.confidence).toBeLessThan(saturated.confidence);
    });
  });

  describe("confidence anchors", () => {
    it("hits the points the spec names", () => {
      expect(confidenceFor(MIN_FORECAST_QUIZZES)).toBe(60);
      expect(confidenceFor(20)).toBe(80);
      expect(confidenceFor(50)).toBe(100);
    });

    it("interpolates between them and never exceeds 100", () => {
      expect(confidenceFor(12)).toBeGreaterThan(confidenceFor(8));
      expect(confidenceFor(35)).toBeGreaterThan(confidenceFor(20));
      expect(confidenceFor(35)).toBeLessThan(100);
      expect(confidenceFor(500)).toBe(100);
      expect(confidenceFor(0)).toBe(0);
      expect(confidenceFor(-3)).toBe(0);
    });

    it("rises monotonically across the whole range", () => {
      for (let q = 1; q <= 60; q++) {
        expect(confidenceFor(q)).toBeGreaterThanOrEqual(confidenceFor(q - 1));
      }
    });
  });
});

describe("formatting", () => {
  it("renders the range and the weak topics the way the UI shows them", () => {
    const forecast = calculateQuizForecast(
      evidenceFrom(
        repeatToFloor([
          attempt("a1", "Alpha", 9, 10),
          attempt("a2", "Photosynthesis", 45, 100),
        ]),
      ),
      "2026-09-14",
      TODAY,
    )!;

    expect(formatForecastRange(forecast)).toMatch(/^\d+–\d+$/);
    expect(formatWeakTopics(forecast)).toContain("Photosynthesis (45%)");
  });
});
