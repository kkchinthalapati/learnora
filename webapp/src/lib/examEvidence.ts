/* The evidence behind an exam's numbers, for the exam's own page.
 *
 * A forecast a student cannot inspect is a forecast they will not trust. These
 * are the pure pieces the page shows: which quizzes count towards this exam,
 * how the student's scores have moved, and how well their confidence matches
 * their results. */

import type { Quiz, QuizAttempt } from "../api/types";
import { parseStoredAnswers, parseStoredQuestions } from "../views/quiz/quizMeta";
import { matchSpecTopic, type SyllabusSpec, type SyllabusTier } from "./syllabus";

/**
 * Whether a quiz is about this spec: at least half of its topic-labelled
 * questions map onto a spec topic, or — when its questions carry no topics —
 * its title does. A quiz on "The Tudors" never counts towards Biology.
 */
export function quizBelongsToSpec(quiz: Quiz, spec: SyllabusSpec, tier?: SyllabusTier | null): boolean {
  const topics = parseStoredQuestions(quiz.questions_json)
    .map((q) => q.topic)
    .filter((t): t is string => typeof t === "string" && t.trim() !== "");
  if (topics.length === 0) return matchSpecTopic(spec, quiz.title, tier) !== null;
  const matched = topics.filter((t) => matchSpecTopic(spec, t, tier) !== null).length;
  return matched * 2 >= topics.length;
}

/** The quizzes and attempts that count towards this spec. */
export function scopeToSpec(
  quizzes: Quiz[],
  attempts: QuizAttempt[],
  spec: SyllabusSpec,
  tier?: SyllabusTier | null,
): { quizzes: Quiz[]; attempts: QuizAttempt[] } {
  const scoped = quizzes.filter((q) => quizBelongsToSpec(q, spec, tier));
  const ids = new Set(scoped.map((q) => q.id));
  return { quizzes: scoped, attempts: attempts.filter((a) => ids.has(a.quiz_id)) };
}

export type ConfidenceLevel = "guess" | "fairly" | "certain";

export interface CalibrationRow {
  level: ConfidenceLevel;
  label: string;
  answered: number;
  correct: number;
  /** 0-100, or null when nothing was answered at this confidence. */
  accuracy: number | null;
}

export interface Calibration {
  rows: CalibrationRow[];
  /** Answers that carried a confidence rating at all. */
  rated: number;
  /** One plain sentence, or null when there is too little to say anything. */
  verdict: string | null;
}

const LEVEL_LABEL: Record<ConfidenceLevel, string> = {
  guess: "When you guessed",
  fairly: "When you were fairly sure",
  certain: "When you were certain",
};

/** Ratings below which a level's accuracy is not worth a sentence. */
export const MIN_CALIBRATION_ANSWERS = 5;

/**
 * How the student's confidence lines up with being right, from the ratings
 * they give while quizzing. Being certain and wrong is the expensive case in
 * an exam — it is the answer nobody goes back to check — so that is the one
 * the verdict calls out first.
 */
export function buildCalibration(attempts: QuizAttempt[]): Calibration {
  const tally: Record<ConfidenceLevel, { answered: number; correct: number }> = {
    guess: { answered: 0, correct: 0 },
    fairly: { answered: 0, correct: 0 },
    certain: { answered: 0, correct: 0 },
  };
  for (const attempt of attempts) {
    for (const answer of parseStoredAnswers(attempt.answers_json)) {
      if (!answer.confidence) continue;
      tally[answer.confidence].answered += 1;
      if (answer.correct) tally[answer.confidence].correct += 1;
    }
  }
  const rows = (Object.keys(tally) as ConfidenceLevel[]).map((level) => {
    const { answered, correct } = tally[level];
    return {
      level,
      label: LEVEL_LABEL[level],
      answered,
      correct,
      accuracy: answered > 0 ? Math.round((correct / answered) * 100) : null,
    };
  });
  const rated = rows.reduce((s, r) => s + r.answered, 0);
  const at = (level: ConfidenceLevel) => rows.find((r) => r.level === level)!;
  const enough = (r: CalibrationRow) => r.answered >= MIN_CALIBRATION_ANSWERS && r.accuracy !== null;

  let verdict: string | null = null;
  const certain = at("certain");
  const guess = at("guess");
  if (enough(certain) && certain.accuracy! < 80) {
    verdict = `When you're certain you're right ${certain.accuracy}% of the time. Those are the answers you won't re-check in the exam, so slow down on them.`;
  } else if (enough(guess) && guess.accuracy! >= 60) {
    verdict = `Your guesses are right ${guess.accuracy}% of the time. You know more than you think, so trust your first instinct a little more.`;
  } else if (enough(certain)) {
    verdict = `When you're certain you're right ${certain.accuracy}% of the time. Your confidence is a good guide.`;
  }
  return { rows, rated, verdict };
}

export interface TimelinePoint {
  date: string;
  title: string;
  /** 0-100. */
  percent: number;
}

/** Each scored attempt, oldest first, newest `limit` kept. */
export function attemptTimeline(quizzes: Quiz[], attempts: QuizAttempt[], limit = 12): TimelinePoint[] {
  const titles = new Map(quizzes.map((q) => [q.id, q.title]));
  return attempts
    .filter((a) => a.total > 0 && a.created_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-limit)
    .map((a) => ({
      date: a.created_at.slice(0, 10),
      title: titles.get(a.quiz_id) ?? "Quiz",
      percent: Math.round((a.score / a.total) * 100),
    }));
}
