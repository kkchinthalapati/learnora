/* The 2-minute check (NEW in the 2026-10 revamp). At most 12 questions from
 * the question bank, spread across the spec's units so it samples the whole
 * course, then a starting point rather than a score:
 *
 *   You know this · Worth a look first · Not learnt yet, and that's fine
 *
 * "I haven't learnt this yet" is recorded as untested, never as wrong — the
 * honest-uncertainty rule (P4). Partly-ready boards have no bank, so they
 * answer per chapter instead ("How sure are you?"); that is self-report and
 * is never written to the evidence ledger. */

import type { BankQuestion } from "../../lib/questionBank";
import type { SyllabusSpec } from "../../lib/syllabus";

export const PLACEMENT_MAX = 12;
/** "How long have you got today?" on the starting-point screen. */
export const TODAY_MINUTES = [10, 20, 30] as const;
/** Fewer bank questions than this and the chapter check is used instead. */
export const PLACEMENT_MIN = 4;

export interface PlacementQuestion {
  question: string;
  choices: string[];
  correctIndex: number;
  /** The spec topic (`ref`) and its title, for grouping and evidence. */
  topicRef: string;
  topicTitle: string;
  unit: string;
}

/** Round-robin across units so 12 questions sample the course, not one
 *  chapter. Multiple choice only: no typing in a placement check. */
export function pickPlacement(
  spec: SyllabusSpec,
  rows: readonly BankQuestion[],
  max = PLACEMENT_MAX,
): PlacementQuestion[] {
  const topicByRef = new Map(spec.topics.map((t) => [t.ref, t]));
  const byUnit = new Map<string, PlacementQuestion[]>();
  const seenTopics = new Set<string>();
  for (const r of rows) {
    if (
      r.answer_type === "numeric" ||
      !Array.isArray(r.choices) ||
      r.choices.length < 2
    )
      continue;
    const topic = topicByRef.get(r.topic_ref);
    if (!topic) continue;
    /* One question per topic, so the result names more of the course. */
    if (seenTopics.has(topic.ref)) continue;
    seenTopics.add(topic.ref);
    const list = byUnit.get(topic.unit) ?? [];
    list.push({
      question: r.question,
      choices: r.choices,
      correctIndex: r.correct_index,
      topicRef: topic.ref,
      topicTitle: topic.title,
      unit: topic.unit,
    });
    byUnit.set(topic.unit, list);
  }
  const queues = spec.units
    .map((u) => byUnit.get(u.code) ?? [])
    .filter((q) => q.length > 0);
  const out: PlacementQuestion[] = [];
  for (let round = 0; out.length < max; round++) {
    let added = false;
    for (const q of queues) {
      if (q[round] && out.length < max) {
        out.push(q[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

/** One answer in the check. `null` = "I haven't learnt this yet". */
export type PlacementAnswer = { topicTitle: string; correct: boolean | null };

/** A chapter's self-report, for partly-ready boards. */
export type ChapterSure = "know" | "unsure" | "not_learnt";

export interface StartingPoint {
  know: string[];
  look: string[];
  notLearnt: string[];
}

export function startingPointFromAnswers(
  answers: readonly PlacementAnswer[],
): StartingPoint {
  const sp: StartingPoint = { know: [], look: [], notLearnt: [] };
  for (const a of answers) {
    const list =
      a.correct === null ? sp.notLearnt : a.correct ? sp.know : sp.look;
    if (!list.includes(a.topicTitle)) list.push(a.topicTitle);
  }
  return sp;
}

export function startingPointFromChapters(
  spec: SyllabusSpec,
  sure: Readonly<Record<string, ChapterSure>>,
): StartingPoint {
  const sp: StartingPoint = { know: [], look: [], notLearnt: [] };
  for (const unit of spec.units) {
    const s = sure[unit.code];
    if (s === "know") sp.know.push(unit.title);
    else if (s === "unsure") sp.look.push(unit.title);
    else if (s === "not_learnt") sp.notLearnt.push(unit.title);
  }
  return sp;
}

/** What the first practice is on: the first thing worth a look, else
 *  something known (to bank a win), else the first thing not learnt. */
export function firstPractice(sp: StartingPoint, fallback: string): string {
  return sp.look[0] ?? sp.know[0] ?? sp.notLearnt[0] ?? fallback;
}
