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
  };
}

export function parseStoredAnswers(answersJson: unknown): StoredAnswer[] {
  if (!Array.isArray(answersJson)) return [];
  return answersJson.map(toAnswer).filter((a): a is StoredAnswer => a !== null);
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
