/* Shape-checking for a stored quiz and a stored attempt.
 *
 * `quizzes.questions_json` and `quiz_attempts.answers_json` are both free-form
 * JSON: the questions are model output, and an attempt is whatever the runner
 * wrote at the time. `lib/aiJson.ts` validates questions on the way *in* from
 * the model, but a row already in the database predates that check — it may
 * have been written before `correctIndex` was validated, or by an older
 * version of the app. The vanilla read both optimistically
 * (`quiz.questions_json || []`, `attempt.answers_json || []`) and rendered a
 * broken quiz rather than saying anything was wrong.
 */

import type { QuizQuestion } from "../../lib/aiJson";

export interface StoredAnswer {
  questionId: string | number;
  chosenIndex: number;
  correct: boolean;
  topic?: string;
  /** Seconds the student spent on this question, stamped by QuizRunner since
   *  the Speed Demon achievement needed a real speed signal. Optional because
   *  attempts recorded before it existed don't carry it. */
  secondsSpent?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toQuestion(value: unknown): QuizQuestion | null {
  if (!isRecord(value)) return null;
  if (typeof value.question !== "string") return null;
  if (!Array.isArray(value.choices)) return null;

  const choices = value.choices.filter(
    (c): c is string => typeof c === "string",
  );
  if (choices.length < 2) return null;

  /* An out-of-range `correctIndex` is the one defect that cannot be rendered
     around: the runner grades with `i === correctIndex`, so the question would
     mark every option — including the right one — wrong, with no error
     anywhere. Dropping it is the only honest option.

     A numeric string is coerced (it grades correctly once read as a number),
     but `Number()` is not applied blindly: `Number(null)` and `Number("")` are
     both 0, which would silently declare the first choice correct. */
  const raw = value.correctIndex;
  const correctIndex =
    typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "")
      ? Number(raw)
      : NaN;
  if (
    !Number.isInteger(correctIndex) ||
    correctIndex < 0 ||
    correctIndex >= choices.length
  ) {
    return null;
  }

  return {
    id:
      typeof value.id === "string" || typeof value.id === "number"
        ? value.id
        : undefined,
    question: value.question,
    choices,
    correctIndex,
    topic: typeof value.topic === "string" ? value.topic : undefined,
    feedback: typeof value.feedback === "string" ? value.feedback : undefined,
  };
}

/** Narrow a stored `questions_json` to the questions that can actually be
 *  asked. Returns `[]` for anything unrecognisable. */
export function parseStoredQuestions(questionsJson: unknown): QuizQuestion[] {
  if (!Array.isArray(questionsJson)) return [];
  return questionsJson
    .map(toQuestion)
    .filter((q): q is QuizQuestion => q !== null);
}

function toAnswer(value: unknown): StoredAnswer | null {
  if (!isRecord(value)) return null;
  const chosenIndex = Number(value.chosenIndex);
  if (!Number.isInteger(chosenIndex)) return null;
  const id = value.questionId;
  return {
    questionId:
      typeof id === "string" || typeof id === "number" ? id : chosenIndex,
    chosenIndex,
    correct: value.correct === true,
    topic: typeof value.topic === "string" ? value.topic : undefined,
    secondsSpent:
      typeof value.secondsSpent === "number" &&
      Number.isFinite(value.secondsSpent) &&
      value.secondsSpent >= 0
        ? value.secondsSpent
        : undefined,
  };
}

export interface ProctorTerminationInfo {
  reason: "fullscreen" | "visibility";
  timestamp: string;
}

export function parseStoredAnswers(answersJson: unknown): StoredAnswer[] {
  if (Array.isArray(answersJson)) {
    return answersJson
      .map(toAnswer)
      .filter((a): a is StoredAnswer => a !== null);
  }
  if (isRecord(answersJson) && Array.isArray(answersJson.items)) {
    return answersJson.items
      .map(toAnswer)
      .filter((a): a is StoredAnswer => a !== null);
  }
  return [];
}

export function parseProctorTermination(
  answersJson: unknown,
): ProctorTerminationInfo | null {
  if (!isRecord(answersJson) || !isRecord(answersJson.proctorTermination)) {
    return null;
  }
  const term = answersJson.proctorTermination;
  if (term.reason === "fullscreen" || term.reason === "visibility") {
    return {
      reason: term.reason,
      timestamp: typeof term.timestamp === "string" ? term.timestamp : "",
    };
  }
  return null;
}

/** The vanilla's lookup (js/router.js:995-996): attempts are stored in
 *  question order, so position is the reliable link back — `questionId` falls
 *  back to the index when the model omitted an id. */
export function answerForIndex(
  answers: StoredAnswer[],
  questions: QuizQuestion[],
  index: number,
): StoredAnswer | null {
  const key = questions[index]?.id ?? index;
  return answers.find((a) => a.questionId === key) || answers[index] || null;
}

/* A question's `feedback` is written once, when the quiz is generated, and is
 * then shown to every student whatever they picked — so a model that opened it
 * with "Nice work!" (they do, and did before the generation prompt in
 * api/aiQuiz.ts started forbidding it) congratulates someone who has just got
 * the question wrong. Every quiz already in a library still carries those
 * openers, so the praise is also stripped here, at render time.
 *
 * Only a short interjection is stripped. The length cap is what keeps the
 * match to a "Nice work!"-shaped clause and off a real opening sentence that
 * happens to start with one of these words ("Exactly one of these choices
 * survives the edge case."). */
const PRAISE_OPENER =
  /^(?:nice(?: work| job| one)?|great(?: work| job)?|good(?: work| job)?|well done|excellent|perfect|exactly(?: right)?|correct|right|that's right|spot on|you (?:got it|nailed it)|yes|yep|bingo|awesome|brilliant)\b[^.!?]*[.!?]+/i;

const PRAISE_OPENER_MAX = 28;

/** Drop a leading "Nice work!"-style interjection from a question's feedback.
 *  Returns `""` when praise was the whole message — the caller then has only
 *  its own verdict to show, which is the honest result for a wrong answer. */
export function stripPraiseOpener(feedback: string): string {
  const trimmed = feedback.trim();
  const match = PRAISE_OPENER.exec(trimmed);
  if (!match || match[0].length > PRAISE_OPENER_MAX) return trimmed;
  return trimmed.slice(match[0].length).trim();
}

/** What the quiz host says once a question is answered: an explicit verdict
 *  that never depends on the model's prose, plus the question's explanation.
 *
 *  The two are kept apart so the verdict can be rendered as its own element —
 *  a wrong answer used to be handed `question.feedback` alone (which reads as
 *  praise) and told apart from a right one only by the avatar's colour. */
export function hostFeedback(
  question: QuizQuestion,
  correct: boolean,
): { verdict: string; detail: string } {
  const answer = question.choices[question.correctIndex];
  const verdict = correct
    ? "Correct!"
    : answer
      ? `Not quite — the correct answer is “${answer}”.`
      : "Not quite.";

  const feedback = question.feedback?.trim() ?? "";
  return { verdict, detail: correct ? feedback : stripPraiseOpener(feedback) };
}

/** Topics of the questions answered wrongly, deduplicated — what
 *  `fetchWeakTopics` later aggregates across attempts. */
export function weakTopicsFrom(answers: StoredAnswer[]): string[] {
  return [
    ...new Set(
      answers
        .filter((a) => !a.correct)
        .map((a) => a.topic)
        .filter(Boolean),
    ),
  ] as string[];
}
