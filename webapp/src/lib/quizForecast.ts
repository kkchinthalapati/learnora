/* A forecast for the student Trajectory cannot forecast.
 *
 * Trajectory (lib/trajectory.ts) is the app's projection engine and stays so:
 * it models memory decay per card, the learning gain of the hours actually
 * free before the exam, and it is strictly better than anything here whenever
 * it can run. But it can only run on flashcard decks — `buildTopicStates`
 * opens with `if (decks.length === 0) return []`, because a deck is what
 * carries memory state and "a topic with no cards has nothing to project".
 *
 * So a student who quizzes but has never built a deck gets no forecast at all
 * — just "Not enough to go on", on a screen whose whole job is to answer "am I
 * going to be ready?". They are not short of evidence; they are short of the
 * *kind* of evidence Trajectory reads. This module reads the kind they have.
 *
 * It is deliberately a simpler model, and the honesty rules that follow from
 * that are the point rather than a caveat:
 *
 *  - It projects from measured accuracy and nothing else. No decay, no time
 *    budget, no notion of what revising between now and the exam would buy —
 *    so it must never be presented as equivalent to Trajectory, and callers
 *    must prefer Trajectory whenever it can run.
 *  - Its confidence is a sample-size statement, not a probability. It says how
 *    much quizzing is behind the number, not how likely the number is.
 *  - The band widens as the sample shrinks: ±5 once there is enough quizzing
 *    behind it, up to ±20 off a single quiz. It is still a floor on real
 *    uncertainty rather than a measurement of it — nothing here models the
 *    exam, only the student's own scores — but it no longer prints a guess and
 *    a well-evidenced estimate to the same precision.
 */

import { parseLocalDate, localDateStr } from "./date";
import {
  WEAK_TOPIC_THRESHOLD,
  weakTopics,
  type StudentEvidence,
  type TopicEvidence,
} from "./studentEvidence";

/** Points knocked off the headline accuracy per measured weak topic. A weak
 *  topic is not merely absent from the average — it is a known hole that an
 *  exam is likely to probe, so it costs more than its share. */
export const WEAK_TOPIC_PENALTY = 5;

/** Ceiling on the total weak-topic penalty, in points.
 *
 *  The penalty double-counts by design — a weak topic is already dragging the
 *  measured accuracy down before it is charged again here — and that is
 *  defensible for two or three holes. Uncapped it stops being: a student
 *  measured at 60% with eight weak topics was being forecast 15–25, a number
 *  no evidence in the app supports and which reads as the model having given
 *  up on them. The cap keeps the adjustment a weighting rather than a verdict.
 */
export const MAX_WEAK_TOPIC_PENALTY = 20;

/** Half-width of the reported range at full confidence, in points. */
export const FORECAST_BAND = 5;

/** Extra half-width added when there is no evidence at all, tapering to zero
 *  as the sample reaches `CONFIDENCE_SATURATION_QUIZZES`.
 *
 *  The band used to be a flat ±5 whatever it was built on, so a forecast off
 *  one quiz was printed exactly as precisely as one off fifty — and the
 *  confidence figure beside it was the only thing distinguishing them. A
 *  student reads the range, not the footnote. Widening the range *is* the
 *  hedge, stated in the units they are already reading. */
export const MAX_UNCERTAINTY_BAND = 15;

/** Quizzes at which confidence reaches 100%. Higher than the evidence
 *  module's own saturation point (20) on purpose: that one gates how boldly
 *  the assistant *talks*, this one gates a number a student may plan around,
 *  and the bar for the second should be higher. */
export const CONFIDENCE_SATURATION_QUIZZES = 50;

export interface QuizForecast {
  /** Low end of the predicted range, 0-100. */
  predictedMin: number;
  /** High end of the predicted range, 0-100. */
  predictedMax: number;
  /** 0-100. A statement about sample size, not probability. */
  confidence: number;
  /** Half-width of the reported range, in points. Wider on thin evidence. */
  band: number;
  /** Measured accuracy before any adjustment, 0-100. */
  accuracyNow: number;
  /** The measured weak topics the penalty was drawn from. */
  weakTopics: TopicEvidence[];
  /** Points actually deducted for those topics, after the cap. */
  penalty: number;
  /** Whole days from today to the exam. Negative if the exam has passed. */
  daysUntilExam: number;
  /** Quizzes the forecast is built on. */
  quizzesTaken: number;
}

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Whole days between two ISO `YYYY-MM-DD` dates, local-calendar based so it
 *  matches how a student counts ("the exam is in 3 days"), not how many
 *  24-hour periods have elapsed. */
export function daysUntil(examDate: string, today: string): number {
  const from = parseLocalDate(today).getTime();
  const to = parseLocalDate(examDate).getTime();
  return Math.round((to - from) / 86400000);
}

/**
 * Project an exam score from quiz accuracy alone.
 *
 * Returns `null` when there is nothing measured to project from — no quizzes
 * answered, or none carrying a score. A forecast off zero evidence is not a
 * cautious forecast, it is a made-up one, and the caller has a real empty
 * state to show instead.
 */
export function calculateQuizForecast(
  evidence: StudentEvidence,
  examDate: string,
  today: string = localDateStr(),
): QuizForecast | null {
  if (evidence.questionsAnswered === 0 || evidence.overallAccuracy === null) {
    return null;
  }

  const accuracyNow = evidence.overallAccuracy;

  /* Only *measured* weak topics count toward the penalty. A provisional row
     is excluded by `weakTopics` already, which matters here more than
     anywhere else in the app: at 5 points each, letting "0% on the one
     question you saw" through would let a single unlucky answer move a
     student's forecast by a whole grade boundary. */
  const weak = weakTopics(evidence);

  const penalty = Math.min(
    weak.length * WEAK_TOPIC_PENALTY,
    MAX_WEAK_TOPIC_PENALTY,
  );
  const adjusted = Math.max(accuracyNow - penalty, 0);

  /* How much of the saturation sample is actually behind this, 0-1. The same
     fraction drives both the confidence figure and the width of the range, so
     the two can never tell the student different stories about how much is
     known. */
  const evidenceFraction = Math.min(
    evidence.quizzesTaken / CONFIDENCE_SATURATION_QUIZZES,
    1,
  );

  const band = Math.round(
    FORECAST_BAND + (1 - evidenceFraction) * MAX_UNCERTAINTY_BAND,
  );

  return {
    predictedMin: clampPercent(adjusted - band),
    predictedMax: clampPercent(adjusted + band),
    confidence: Math.round(evidenceFraction * 100),
    band,
    accuracyNow,
    weakTopics: weak,
    penalty,
    daysUntilExam: daysUntil(examDate, today),
    quizzesTaken: evidence.quizzesTaken,
  };
}

/** "67–77" — the range as a student reads it. */
export function formatForecastRange(forecast: QuizForecast): string {
  return `${forecast.predictedMin}–${forecast.predictedMax}`;
}

/** "Photosynthesis (45%)" for each measured weak topic, worst first. */
export function formatWeakTopics(forecast: QuizForecast): string[] {
  return forecast.weakTopics.map((t) => `${t.topic} (${t.accuracy}%)`);
}

export { WEAK_TOPIC_THRESHOLD };
