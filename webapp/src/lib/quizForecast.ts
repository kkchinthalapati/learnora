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
 *  - The band is fixed at ±5, which is a floor on uncertainty rather than a
 *    measurement of it. Real uncertainty here is wider; a band this narrow is
 *    defensible only because the confidence figure sits next to it.
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

/** Half-width of the reported range, in points. */
export const FORECAST_BAND = 5;

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
  /** Measured accuracy before any adjustment, 0-100. */
  accuracyNow: number;
  /** The measured weak topics the penalty was drawn from. */
  weakTopics: TopicEvidence[];
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

  const adjusted = Math.max(accuracyNow - weak.length * WEAK_TOPIC_PENALTY, 0);

  return {
    predictedMin: clampPercent(adjusted - FORECAST_BAND),
    predictedMax: clampPercent(adjusted + FORECAST_BAND),
    confidence: Math.round(
      Math.min(evidence.quizzesTaken / CONFIDENCE_SATURATION_QUIZZES, 1) * 100,
    ),
    accuracyNow,
    weakTopics: weak,
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
