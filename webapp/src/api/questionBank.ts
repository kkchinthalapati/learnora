/* Reading the practice-question bank, and turning a selection into a quiz.
 *
 * The bank is reference data (public.question_bank): any signed-in student
 * may read it, nobody but the importer writes it. */

import { supabase } from "../lib/supabase";
import { queryClient } from "../lib/queryClient";
import { localDateStr } from "../lib/date";
import { pickExamSpec } from "../lib/examSpec";
import {
  SYLLABUS_SPECS,
  bankKey,
  matchSpecTopic,
  topicInTier,
  topicMatchScore,
  type SyllabusSpec,
  type SyllabusTier,
  type SyllabusTopic,
} from "../lib/syllabus";
import {
  BANKED_SPEC_KEYS,
  attributionLines,
  pickPractice,
  toQuizQuestions,
  type BankQuestion,
} from "../lib/questionBank";
import type { QuizQuestion } from "../lib/aiJson";
import { examsApi } from "./exams";
import { examsKeys } from "../hooks/useExams";
import { quizzesApi } from "./quizzes";

const COLUMNS =
  "id, source, source_ref, licence, attribution, spec_key, topic_ref, tier, question, choices, correct_index, explanation";

/** Bank rows for a spec's topics, at a tier (rows for every tier included). */
export async function fetchBankQuestions(
  spec: SyllabusSpec,
  topicRefs: string[],
  tier: SyllabusTier | null,
): Promise<BankQuestion[]> {
  if (topicRefs.length === 0) return [];
  let query = supabase
    .from("question_bank")
    .select(COLUMNS)
    .eq("spec_key", bankKey(spec))
    .in("topic_ref", topicRefs)
    .limit(500);
  if (tier) query = query.or(`tier.is.null,tier.eq.${tier}`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as BankQuestion[];
}

/** Quiz-runner questions from bank rows, each carrying its attribution. */
export function bankToQuiz(spec: SyllabusSpec, rows: BankQuestion[]): QuizQuestion[] {
  const titles = new Map(spec.topics.map((t) => [t.ref, t.title]));
  const quiz = toQuizQuestions(rows, (ref) => titles.get(ref) ?? ref);
  return quiz.map((q, i) => {
    const [line] = attributionLines([rows[i]]);
    return line ? { ...q, attribution: line } : q;
  });
}

/** Save a bank selection as a quiz in the student's library and return its
 *  id, so the full quiz flow (attempts, evidence, repair) runs on it. */
export async function createBankQuiz(args: {
  spec: SyllabusSpec;
  tier: SyllabusTier | null;
  /** Topic refs, highest priority first. */
  topicOrder: string[];
  count: number;
  title: string;
}): Promise<{ quizId: string; questions: number } | null> {
  const rows = await fetchBankQuestions(args.spec, args.topicOrder, args.tier);
  const picked = pickPractice(rows, args.topicOrder, args.count);
  if (picked.length === 0) return null;
  const quiz = await quizzesApi.add(null, null, args.title, bankToQuiz(args.spec, picked));
  return { quizId: quiz.id, questions: picked.length };
}

const BANKED = BANKED_SPEC_KEYS;

/** Whether a spec has practice questions in the bank. */
export function hasBank(spec: SyllabusSpec): boolean {
  return BANKED.has(bankKey(spec));
}

/** The spec and topic a free-text label is about: the student's own exam
 *  spec when one matches, otherwise the best match among banked specs. */
async function resolveTopic(
  label: string,
): Promise<{ spec: SyllabusSpec; tier: SyllabusTier | null; topic: SyllabusTopic } | null> {
  try {
    const exams = await queryClient.fetchQuery({
      queryKey: examsKeys.all,
      queryFn: examsApi.fetch,
      staleTime: 5 * 60_000,
    });
    const own = pickExamSpec(exams, localDateStr(), label);
    if (own?.topic && BANKED.has(bankKey(own.spec))) return { spec: own.spec, tier: own.tier, topic: own.topic };
  } catch {
    /* No exams to read: fall through to the catalogue. */
  }
  let best: { spec: SyllabusSpec; topic: SyllabusTopic; score: number } | null = null;
  for (const spec of SYLLABUS_SPECS) {
    if (!BANKED.has(bankKey(spec))) continue;
    const topic = matchSpecTopic(spec, label);
    if (!topic) continue;
    const score = topicMatchScore(label, topic);
    if (!best || score > best.score) best = { spec, topic, score };
  }
  return best ? { spec: best.spec, tier: null, topic: best.topic } : null;
}

/**
 * Practice questions from the bank for a topic label — the fallback when the
 * AI cannot write any. The topic's own questions first, topped up from the
 * other topics in its unit. Null when the topic is in no banked spec.
 */
export async function bankPracticeFor(label: string, count: number): Promise<QuizQuestion[] | null> {
  const resolved = await resolveTopic(label);
  if (!resolved) return null;
  const { spec, tier, topic } = resolved;
  const siblings = spec.topics
    .filter((t) => t.unit === topic.unit && t.ref !== topic.ref && (!tier || topicInTier(t, tier)))
    .map((t) => t.ref);
  const order = [topic.ref, ...siblings];
  const rows = await fetchBankQuestions(spec, order, tier);
  /* The topic's own questions take every slot they can fill. */
  const own = pickPractice(rows.filter((r) => r.topic_ref === topic.ref), [topic.ref], count);
  const rest = pickPractice(rows.filter((r) => r.topic_ref !== topic.ref), siblings, count - own.length);
  const picked = [...own, ...rest];
  return picked.length ? bankToQuiz(spec, picked) : null;
}
