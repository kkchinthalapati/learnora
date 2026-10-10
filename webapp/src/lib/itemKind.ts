/* What a question asks a student to do: recall, apply, or explain.
 *
 * The mastery ladder's rungs are named for kinds of evidence (Recalled,
 * Applied, Explained), and used to be reached by score alone, so five right
 * answers to "what is the powerhouse of the cell?" read as "Applied". A rung
 * now needs a question of its kind (lib/knowledgeModel.ts), which needs the
 * kind of every question.
 *
 * Bank and catalogue questions state it; a generated question carries the
 * kind the model was asked for when it has one; otherwise this reads it from
 * the wording. The rules are deliberately conservative toward "recall": a
 * question wrongly called "apply" would hand out a rung the student has not
 * earned, while one wrongly called "recall" only delays it. */

import type { ItemKind } from "../views/quiz/quizMeta";

export type { ItemKind };

/* Calculating, predicting, choosing for a new situation, reading data. */
const APPLY = [
  /\bcalculate\b/i,
  /\bwork out\b/i,
  /\bhow (many|much|long|far|fast)\b/i,
  /\bwhat (is|would be) the (value|mass|volume|speed|current|resistance|energy|power|pressure|force|area|probability|concentration|rate)\b/i,
  /\b(predict|estimate|determine|deduce|suggest)\b/i,
  /\bwhat (would|will) happen\b/i,
  /\bwhich (graph|table|result|reading|value|observation)\b/i,
  /\b(a|the) student\b/i,
  /\bin (an|the) experiment\b/i,
  /\bif .{3,80}, (what|which|how)\b/i,
  /\d+(\.\d+)?\s*(kg|g|m|cm|mm|km|s|ms|j|kj|w|kw|v|a|n|pa|mol|°c|%)\b/i,
  /[=×÷^]|\d\s*[+*/-]\s*\d/,
];

/* Asking for the reason itself. A multiple-choice "why" whose options are
   reasons is close to recall, so this stays narrow: only open "explain" or
   "why … wrong" prompts count. */
const EXPLAIN = [/^\s*explain\b/i, /\bwhy is .{1,80} (wrong|incorrect)\b/i, /\bjustify\b/i];

export function classifyItemKind(
  question: string,
  { open = false }: { open?: boolean } = {},
): ItemKind {
  const text = question ?? "";
  if (open && EXPLAIN.some((re) => re.test(text))) return "explain";
  if (APPLY.some((re) => re.test(text))) return "apply";
  return "recall";
}

/** The question's own kind when it states one, else read from its wording. */
export function itemKindOf(q: { question: string; kind?: ItemKind | null }): ItemKind {
  return q.kind ?? classifyItemKind(q.question);
}
