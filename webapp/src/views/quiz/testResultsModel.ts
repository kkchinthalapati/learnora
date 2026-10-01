/* What a finished test says — pure, so the reading of a result is testable
 * without rendering one.
 *
 * The score is a caption, not the headline. The headline is the finding:
 * which ideas held and which one is costing marks. Confidence is what makes
 * that possible: a wrong answer the student was sure of points at a belief
 * (a misconception), a wrong answer they guessed is a gap, and a right answer
 * they guessed is luck, not knowledge. */

import type { QuizQuestion } from "../../lib/aiJson";
import { conceptKey, type Misconception } from "../../lib/misconceptions";
import { answerForIndex, type StoredAnswer } from "./quizMeta";

export type Mark = "right" | "guessed" | "wrong" | "blank";

export function markOf(answer: StoredAnswer | null | undefined): Mark {
  if (!answer) return "blank";
  if (!answer.correct) return "wrong";
  return answer.confidence === "guess" ? "guessed" : "right";
}

export type ConceptStatus = "secure" | "lucky" | "misconception" | "review";

export interface ConceptRow {
  concept: string;
  /** 1-based question numbers with their marks, in test order. */
  marks: Array<{ number: number; mark: Mark }>;
  status: ConceptStatus;
  note: string;
}

const GENERAL = "General";

function conceptOf(question: QuizQuestion, answer: StoredAnswer | null): string {
  return (question.topic || answer?.topic || GENERAL).trim() || GENERAL;
}

function isConfident(answer: StoredAnswer | null): boolean {
  return answer?.confidence === "fairly" || answer?.confidence === "certain";
}

export function byConcept(
  questions: QuizQuestion[],
  answers: StoredAnswer[],
): ConceptRow[] {
  const rows = new Map<string, ConceptRow & { confidentWrong: number }>();
  questions.forEach((q, i) => {
    const answer = answerForIndex(answers, questions, i);
    const concept = conceptOf(q, answer);
    const row =
      rows.get(concept) ??
      { concept, marks: [], status: "secure", note: "", confidentWrong: 0 };
    const mark = markOf(answer);
    row.marks.push({ number: i + 1, mark });
    if (mark === "wrong" && isConfident(answer)) row.confidentWrong++;
    rows.set(concept, row);
  });

  return [...rows.values()].map(({ confidentWrong, ...row }) => {
    const wrong = row.marks.filter((m) => m.mark === "wrong" || m.mark === "blank").length;
    const guessed = row.marks.filter((m) => m.mark === "guessed").length;
    if (confidentWrong > 0) {
      return { ...row, status: "misconception", note: "Misconception" };
    }
    if (wrong > 0) {
      return { ...row, status: "review", note: `${wrong} to review` };
    }
    if (guessed > 0) {
      return {
        ...row,
        status: "lucky",
        note: `${guessed} lucky ${guessed === 1 ? "guess" : "guesses"}`,
      };
    }
    return { ...row, status: "secure", note: "Secure" };
  });
}

export interface ConfidentWrongGroup {
  concept: string;
  /** 1-based question numbers, for "Q4, Q9, Q13". */
  questions: number[];
  /** The ledger's diagnosis for this concept, when it has one. */
  misconception?: Misconception;
}

/** Wrong answers the student was sure of, grouped by concept — one idea, not
 *  several separate mistakes — with the ledger's diagnosis attached. */
export function confidentButWrong(
  questions: QuizQuestion[],
  answers: StoredAnswer[],
  ledger: Misconception[],
): ConfidentWrongGroup[] {
  const groups = new Map<string, ConfidentWrongGroup>();
  questions.forEach((q, i) => {
    const answer = answerForIndex(answers, questions, i);
    if (!answer || answer.correct || !isConfident(answer)) return;
    const concept = conceptOf(q, answer);
    const group = groups.get(concept) ?? { concept, questions: [] };
    group.questions.push(i + 1);
    groups.set(concept, group);
  });
  return [...groups.values()]
    .map((g) => ({
      ...g,
      misconception: ledger.find(
        (m) => m.status !== "resolved" && m.conceptKey === conceptKey(g.concept),
      ),
    }))
    .sort((a, b) => b.questions.length - a.questions.length);
}

/** The finding, in one sentence. */
export function resultsHeadline(
  rows: ConceptRow[],
  groups: ConfidentWrongGroup[],
): string {
  const secure = rows.filter((r) => r.status === "secure").map((r) => r.concept);
  const toFix = rows.filter((r) => r.status === "misconception" || r.status === "review");
  if (toFix.length === 0) {
    const lucky = rows.filter((r) => r.status === "lucky").length;
    return lucky > 0
      ? "Every answer was right. A few were guesses, so they'll come back sooner."
      : "Nothing to fix.";
  }
  const held = secure.length
    ? `${secure.length === 1 ? secure[0] : `${secure.slice(0, -1).join(", ")} and ${secure[secure.length - 1]}`} ${secure.length === 1 ? "is" : "are"} solid. `
    : "";
  if (groups.length === 1) {
    return `${held}One idea about ${groups[0].concept} is costing you marks.`;
  }
  if (groups.length > 1) {
    return `${held}${groups.length} ideas you were sure of need fixing.`;
  }
  return `${held}${toFix.length === 1 ? toFix[0].concept : `${toFix.length} topics`} need${toFix.length === 1 ? "s" : ""} another look.`;
}

export interface AttemptComparison {
  before: number;
  after: number;
  /** Present only when both attempts carried confidence. */
  guessesBefore?: number;
  guessesAfter?: number;
}

export function compareAttempts(
  previous: StoredAnswer[] | null,
  current: StoredAnswer[],
  /** The earlier attempt's stored score. Used when its answers can't be
   *  read (an older row shape): recounting nothing showed a made-up
   *  "0 → N" improvement. */
  previousScore?: number | null,
): AttemptComparison | null {
  if (!previous) return null;
  const correct = (a: StoredAnswer[]) => a.filter((x) => x.correct).length;
  if (previous.length === 0) {
    if (typeof previousScore !== "number") return null;
    return { before: previousScore, after: correct(current) };
  }
  const guesses = (a: StoredAnswer[]) => a.filter((x) => x.confidence === "guess").length;
  const hadConfidence = (a: StoredAnswer[]) => a.some((x) => x.confidence != null);
  return {
    before: correct(previous),
    after: correct(current),
    ...(hadConfidence(previous) && hadConfidence(current)
      ? { guessesBefore: guesses(previous), guessesAfter: guesses(current) }
      : {}),
  };
}
