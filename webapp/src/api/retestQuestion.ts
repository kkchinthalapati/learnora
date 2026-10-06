/* A question to retest a repaired mistake with: never one already tied to it
 * (the question that was failed, or the repair's own check).
 *
 * From the practice bank when the mistake falls in a spec the student is
 * sitting, since bank questions are free and work offline-ish. Otherwise one
 * AI-written question, only when the student asks for it (it is billed to
 * their quiz allowance). There is no stand-in: if neither source has a
 * question, the retest says so and offers to try again, because a template
 * question passed would resolve a real mistake. */

import type { Exam } from "./types";
import type { Misconception } from "../lib/misconceptions";
import type { Settings } from "../lib/settings";
import { pickExamSpec } from "../lib/examSpec";
import { matchSpecTopic } from "../lib/syllabus";
import { pickRetestQuestion } from "../lib/mistakeLoop";
import { fetchBankQuestions } from "./questionBank";
import { generateQuizQuestions } from "./aiQuiz";
import { fenceUntrusted } from "../lib/actionTags";

export interface RetestQuestion {
  question: string;
  choices: string[];
  correctIndex: number;
  source: "bank" | "ai";
  attribution?: string | null;
  /** Why the right answer is right: the bank's explanation or the AI's
   *  feedback, shown on a miss. */
  explanation?: string | null;
  /** "bank:<uuid>" for a bank question, for reports and flags. */
  ref?: string;
}

type Row = Pick<Misconception, "concept" | "summary" | "excludedQuestionKeys">;

export async function bankRetestQuestion(
  m: Row,
  exams: Exam[],
  today: string,
): Promise<RetestQuestion | null> {
  const match = pickExamSpec(exams, today, m.concept);
  if (!match) return null;
  const topic = match.topic ?? matchSpecTopic(match.spec, m.concept, match.tier);
  if (!topic) return null;
  const rows = await fetchBankQuestions(match.spec, [topic.ref], match.tier);
  const picked = pickRetestQuestion(rows, m.excludedQuestionKeys ?? []);
  if (!picked) return null;
  return {
    question: picked.question,
    choices: picked.choices,
    correctIndex: picked.correct_index,
    source: "bank",
    attribution: picked.attribution ?? null,
    explanation: picked.explanation ?? null,
    ref: `bank:${picked.id}`,
  };
}

export async function aiRetestQuestion(m: Row, settings: Settings): Promise<RetestQuestion | null> {
  const questions = await generateQuizQuestions({
    sourceText: `Topic: ${fenceUntrusted(m.concept)}\nCheck whether the student still believes: ${fenceUntrusted(m.summary)}`,
    topic: fenceUntrusted(m.concept),
    settings,
    options: { questionCount: 3 },
  });
  const picked = pickRetestQuestion(questions, m.excludedQuestionKeys ?? []);
  return picked
    ? {
        question: picked.question,
        choices: picked.choices,
        correctIndex: picked.correctIndex,
        source: "ai",
        explanation: picked.feedback ?? null,
      }
    : null;
}
