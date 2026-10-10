/* The practice-question bank: shapes, the Learnora-written seed, and turning
 * bank rows into the quiz runner's questions.
 *
 * Rows live in public.question_bank (20261002010000_question_bank.sql) and
 * come from two sources, each carrying its licence and attribution:
 *   - 'learnora': written for Learnora against each spec section (the seed
 *     files beside this module).
 *   - 'oak': Oak National Academy lesson quizzes, Open Government Licence
 *     v3.0 (scripts/question-bank/import-oak.mjs).
 * Exam-board past papers are never stored: see docs/QUESTION_SOURCES.md. */

import type { QuizQuestion } from "../aiJson";
import type { NumericKey } from "../numericAnswer";

export type BankSource = "learnora" | "oak";

/** A row of public.question_bank. */
export interface BankQuestion {
  id: string;
  source: BankSource;
  source_ref: string | null;
  licence: "learnora" | "OGL-3.0";
  attribution: string | null;
  spec_key: string;
  topic_ref: string;
  tier: string | null;
  question: string;
  choices: string[];
  correct_index: number;
  explanation: string | null;
  /** What the question asks for (migration 20261009020000). */
  kind?: "recall" | "apply" | "explain" | null;
  /** Per choice: a misconception catalogue id, or null. */
  distractor_misconceptions?: (string | null)[] | null;
  /** "numeric": a typed-in number marked against `numeric_answer`
   *  (migration 20261010000000). `choices` then holds the key as shown. */
  answer_type?: "mcq" | "numeric" | null;
  numeric_answer?: NumericKey | null;
}

/** A seed entry as written in the JSON files. */
export interface SeedEntry {
  ref: string;
  q: string;
  c: string[];
  a: number;
  why: string;
  tier?: string;
  /** recall | apply | explain. */
  kind?: "recall" | "apply" | "explain";
  /** Per choice: the misconception that option is, or null. */
  mis?: (string | null)[];
  /** A typed-in numeric answer: `c` is then just the key as shown and `a` 0. */
  num?: NumericKey;
}

/** Question-bank keys that have questions today (the Learnora seed covers
 *  these; the Oak import adds to the same keys). */
export const BANKED_SPEC_KEYS: ReadonlySet<string> = new Set([
  "aqa-gcse-biology-8461",
  "aqa-gcse-chemistry-8462",
  "aqa-gcse-physics-8463",
  "gcse-maths",
  "cbse-10-science-086",
  "cbse-10-maths-041",
]);

export const OAK_ATTRIBUTION =
  "Oak National Academy. Contains public sector information licensed under the Open Government Licence v3.0.";

/** The line shown under a quiz drawn from the bank, one per source used. */
export function attributionLines(rows: Pick<BankQuestion, "source" | "attribution">[]): string[] {
  const lines = new Set<string>();
  for (const row of rows) {
    if (row.source === "oak") lines.add(row.attribution || OAK_ATTRIBUTION);
  }
  return [...lines];
}

/** Bank rows as quiz-runner questions. `topicTitle` names the spec section,
 *  so the attempt's per-topic evidence maps straight back onto the spec. */
export function toQuizQuestions(
  rows: BankQuestion[],
  topicTitle: (ref: string) => string,
): QuizQuestion[] {
  return rows.map((row) => ({
    id: row.id,
    question: row.question,
    choices: row.choices,
    correctIndex: row.correct_index,
    topic: topicTitle(row.topic_ref),
    feedback: row.explanation ?? undefined,
    /* Written and checked by people, not generated: verified, and reported
       or pulled by its bank ref. */
    verified: true,
    ref: `bank:${row.id}`,
    ...(row.kind ? { kind: row.kind } : {}),
    ...(row.answer_type === "numeric" && row.numeric_answer
      ? { answerType: "numeric" as const, numeric: row.numeric_answer }
      : {}),
    ...(Array.isArray(row.distractor_misconceptions) && row.distractor_misconceptions.length === row.choices.length
      ? { distractorMisconceptions: row.distractor_misconceptions }
      : {}),
  }));
}

/** Up to `count` rows, spread across topics in the order given (the
 *  highest-priority topic first), shuffled within each topic. `random` is
 *  injectable for tests. */
export function pickPractice(
  rows: BankQuestion[],
  topicOrder: string[],
  count: number,
  random: () => number = Math.random,
): BankQuestion[] {
  const byTopic = new Map<string, BankQuestion[]>();
  for (const row of rows) {
    const list = byTopic.get(row.topic_ref) ?? [];
    list.push(row);
    byTopic.set(row.topic_ref, list);
  }
  for (const list of byTopic.values()) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  const order = [...topicOrder, ...[...byTopic.keys()].filter((t) => !topicOrder.includes(t))];
  const out: BankQuestion[] = [];
  /* Round-robin over the topics, so a short quiz still covers several. */
  for (let round = 0; out.length < count; round++) {
    let added = false;
    for (const ref of order) {
      const next = byTopic.get(ref)?.[round];
      if (!next) continue;
      out.push(next);
      added = true;
      if (out.length >= count) break;
    }
    if (!added) break;
  }
  return out;
}
