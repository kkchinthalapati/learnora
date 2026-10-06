/* What a generated quiz may show, after the server's checker
 * (supabase/functions/_shared/quizQuality.js) has been over it.
 *
 *   Seeded subject (a spec in lib/syllabus): only questions the checker
 *   verified. Anything else is held back and the gap is filled from the
 *   practice bank — written and checked by people — rather than served
 *   unverified.
 *   Unseeded subject: verified and unchecked questions are both served, all
 *   labelled unverified, since there's no built-in syllabus to stand behind
 *   them (the same generic mode the rest of the app uses).
 * Rejected questions never reach the client at all.
 *
 * Questions from a server that predates the checker's verdicts carry no
 * `verified` field; they are served as before, so a deploy order mismatch
 * never empties a quiz. */

import type { QuizQuestion } from "./aiJson";
import { SYLLABUS_SPECS, topicMatchScore, type SyllabusSpec, type SyllabusTopic } from "./syllabus";
import { questionKey } from "./questionKey";

/** A topic counts as seeded when it names a spec topic's title or a
 *  multi-word keyword strongly enough — a single shared word ("cell",
 *  "energy") is not enough to claim a syllabus. */
export const SEEDED_MIN_SCORE = 4;

export interface SeededMatch {
  spec: SyllabusSpec;
  topic: SyllabusTopic;
}

export function seededMatch(label: string): SeededMatch | null {
  let best: SeededMatch | null = null;
  let bestScore = 0;
  for (const spec of SYLLABUS_SPECS) {
    for (const topic of spec.topics) {
      const score = topicMatchScore(label, topic);
      if (score > bestScore) {
        best = { spec, topic };
        bestScore = score;
      }
    }
  }
  return bestScore >= SEEDED_MIN_SCORE ? best : null;
}

export interface Vetted {
  serve: QuizQuestion[];
  /** How many more are needed to reach the requested count. */
  shortBy: number;
}

export function vetGeneratedQuestions(
  questions: QuizQuestion[],
  { seeded, wanted }: { seeded: boolean; wanted: number },
): Vetted {
  const checkerRan = questions.some((q) => typeof q.verified === "boolean");
  let serve: QuizQuestion[];
  if (!checkerRan) serve = questions;
  else if (seeded) serve = questions.filter((q) => q.verified === true);
  else serve = questions;
  if (!seeded) serve = serve.map((q) => ({ ...q, generic: true }));
  return { serve, shortBy: Math.max(0, wanted - serve.length) };
}

/** The ref reports and flags are keyed by: a bank question's own, else the
 *  saved quiz's id and the question's wording, else just the wording. */
export function questionRef(q: Pick<QuizQuestion, "question" | "ref">, quizId?: string | null): string {
  if (q.ref) return q.ref;
  const key = questionKey(q.question);
  return quizId ? `quiz:${quizId.replace(/[^A-Za-z0-9_-]/g, "")}:${key}` : `gen:${key}`;
}

/** Drop questions pulled after reports. */
export function withoutFlagged<T extends Pick<QuizQuestion, "question" | "ref">>(
  questions: T[],
  flagged: ReadonlySet<string>,
  quizId?: string | null,
): T[] {
  if (flagged.size === 0) return questions;
  return questions.filter((q) => !flagged.has(questionRef(q, quizId)));
}

/** Whether a question shows the "unverified" label. */
export function isUnverified(q: Pick<QuizQuestion, "verified" | "generic">): boolean {
  return q.verified === false || q.generic === true;
}
