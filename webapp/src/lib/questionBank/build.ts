/* Building question_bank rows: the Learnora seed, and Oak National Academy
 * quizzes from its Open Curriculum API.
 *
 * Pure apart from hashing (Web Crypto, available in browsers and Node), so the
 * rules that decide what enters the bank are unit-tested. The runners in
 * webapp/scripts/question-bank/ do the fetching and writing.
 *
 * What an Oak question must be to enter the bank:
 *   - from a KS4 programme we have a spec for: AQA biology / chemistry /
 *     physics, or maths (one DfE content for every board);
 *   - multiple choice, text only, exactly one correct answer, 2–6 answers;
 *   - not dependent on an image, diagram or table the app will not show;
 *   - about a spec topic: the lesson title (or failing that, the question)
 *     must map onto a section of the spec.
 * Everything else is skipped and counted by reason, so an import reports what
 * it left out rather than silently shrinking. */

import {
  bankKey,
  getSpec,
  matchSpecTopic,
  type SyllabusSpec,
  type SyllabusTier,
} from "../syllabus";
import { OAK_ATTRIBUTION, type SeedEntry } from ".";

/** A row as inserted (the database assigns id and created_at). */
export interface BankRowInsert {
  source: "learnora" | "oak";
  source_ref: string | null;
  licence: "learnora" | "OGL-3.0";
  attribution: string | null;
  spec_key: string;
  topic_ref: string;
  tier: SyllabusTier | null;
  question: string;
  choices: string[];
  correct_index: number;
  explanation: string | null;
  content_hash: string;
  /** Optional on Oak rows; the seed states it. */
  kind?: "recall" | "apply" | "explain" | null;
  distractor_misconceptions?: (string | null)[] | null;
  answer_type?: "mcq" | "numeric";
  numeric_answer?: SeedEntry["num"] | null;
}

export function normaliseText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** sha-256 of the normalised question and its choices, order-independent,
 *  so the same question re-imported (or shuffled) is recognised. */
export async function contentHash(question: string, choices: string[]): Promise<string> {
  const material = [normaliseText(question), ...choices.map(normaliseText).sort()].join("␞");
  const bytes = new TextEncoder().encode(material);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ── The Learnora seed ─────────────────────────────────────────────────── */

export async function seedRows(seed: Readonly<Record<string, SeedEntry[]>>): Promise<BankRowInsert[]> {
  const rows: BankRowInsert[] = [];
  for (const [key, entries] of Object.entries(seed)) {
    for (const e of entries) {
      rows.push({
        source: "learnora",
        source_ref: null,
        licence: "learnora",
        attribution: null,
        spec_key: key,
        topic_ref: e.ref,
        tier: (e.tier as SyllabusTier | undefined) ?? null,
        question: e.q,
        choices: e.c,
        correct_index: e.a,
        explanation: e.why,
        content_hash: await contentHash(e.q, e.c),
        kind: e.kind ?? null,
        distractor_misconceptions: e.mis && e.mis.length === e.c.length ? e.mis : null,
        answer_type: e.num ? "numeric" : "mcq",
        numeric_answer: e.num ?? null,
      });
    }
  }
  return rows;
}

/* ── Oak National Academy ──────────────────────────────────────────────── */

/** GET /programmes/{programme} — the fields the import reads. */
export interface OakProgramme {
  keystageSlug: string | null;
  subjectSlug: string | null;
  examboardSlug: string | null;
  tierSlug: string | null;
}

export interface OakAnswer {
  type: "text" | "image";
  content: unknown;
  distractor?: boolean;
}

export interface OakQuestion {
  question: string;
  questionType: string;
  questionImage?: unknown;
  answers: OakAnswer[];
}

/** One lesson of GET /programmes/{programme}/questions. */
export interface OakLessonQuiz {
  lessonSlug: string;
  lessonTitle: string;
  starterQuiz: OakQuestion[];
  exitQuiz: OakQuestion[];
}

/** Spec ids for Oak's KS4 programmes. Science only for AQA, the board we
 *  have specs for; maths for every board (one DfE subject content). */
const OAK_SCIENCE_SPECS: Record<string, string> = {
  biology: "aqa-gcse-biology-8461",
  chemistry: "aqa-gcse-chemistry-8462",
  physics: "aqa-gcse-physics-8463",
};

/** The spec an Oak programme feeds, or null when we have none for it. */
export function specForOakProgramme(p: OakProgramme): SyllabusSpec | null {
  if (p.keystageSlug !== "ks4" || !p.subjectSlug) return null;
  if (p.subjectSlug === "maths") return getSpec("aqa-gcse-maths-8300");
  const id = OAK_SCIENCE_SPECS[p.subjectSlug];
  if (!id || p.examboardSlug !== "aqa") return null;
  return getSpec(id);
}

/* The same rule the server's quiz checker uses (supabase/functions/_shared/
   quizQuality.js): a figure that is pointed at, not a word like "periodic
   table" in passing. */
const VISUAL =
  /\b(?:(?:diagram|figure|graph|image|picture|chart|table|photo|illustration)s?\s+(?:below|above|shown|provided|given)|(?:shown|pictured|illustrated)\s+(?:below|above)|in\s+the\s+(?:diagram|figure|image|picture|illustration|photo)\b|(?:see|refer\s+to)\s+(?:the\s+)?(?:diagram|figure|graph|image|picture|chart))/i;
const MARKUP = /\{\{|\}\}|<[a-z][^>]*>/i;

export type SkipReason =
  | "not multiple choice"
  | "uses an image"
  | "not exactly one correct answer"
  | "too few or too many answers"
  | "refers to a visual"
  | "contains markup"
  | "no matching spec topic"
  | "too long";

export type OakConversion =
  | { ok: true; row: BankRowInsert }
  | { ok: false; reason: SkipReason };

function oakAttribution(lessonTitle: string): string {
  return `From the Oak National Academy lesson "${lessonTitle}". ${OAK_ATTRIBUTION.replace(/^Oak National Academy\. /, "")}`.slice(0, 300);
}

/** One Oak quiz question as a bank row, or why it was left out. */
export async function convertOakQuestion(
  q: OakQuestion,
  lesson: Pick<OakLessonQuiz, "lessonSlug" | "lessonTitle">,
  spec: SyllabusSpec,
): Promise<OakConversion> {
  if (q.questionType !== "multiple-choice") return { ok: false, reason: "not multiple choice" };
  if (q.questionImage || q.answers.some((a) => a.type !== "text" || typeof a.content !== "string")) {
    return { ok: false, reason: "uses an image" };
  }
  if (q.answers.length < 2 || q.answers.length > 6) return { ok: false, reason: "too few or too many answers" };
  const correct = q.answers.filter((a) => a.distractor === false);
  if (correct.length !== 1) return { ok: false, reason: "not exactly one correct answer" };
  const question = q.question.trim();
  const choices = q.answers.map((a) => String(a.content).trim());
  if (question.length > 1000 || choices.some((c) => c.length > 300)) return { ok: false, reason: "too long" };
  if (VISUAL.test(question)) return { ok: false, reason: "refers to a visual" };
  if (MARKUP.test(question) || choices.some((c) => MARKUP.test(c))) return { ok: false, reason: "contains markup" };

  const topic =
    matchSpecTopic(spec, lesson.lessonTitle) ??
    matchSpecTopic(spec, `${question} ${choices[q.answers.indexOf(correct[0])]}`);
  if (!topic) return { ok: false, reason: "no matching spec topic" };

  return {
    ok: true,
    row: {
      source: "oak",
      source_ref: lesson.lessonSlug,
      licence: "OGL-3.0",
      attribution: oakAttribution(lesson.lessonTitle),
      spec_key: bankKey(spec),
      topic_ref: topic.ref,
      // Only a topic examined at one tier pins the question to it.
      tier: topic.tierOnly ?? null,
      question,
      choices,
      correct_index: q.answers.indexOf(correct[0]),
      explanation: null,
      content_hash: await contentHash(question, choices),
    },
  };
}

export interface ImportReport {
  rows: BankRowInsert[];
  skipped: Partial<Record<SkipReason | "duplicate", number>>;
}

/** Every usable question in a programme's lessons, de-duplicated. Exit
 *  quizzes first: they test the lesson itself, starter quizzes test what
 *  came before it. */
export async function convertOakLessons(
  lessons: OakLessonQuiz[],
  spec: SyllabusSpec,
  seen: Set<string> = new Set(),
): Promise<ImportReport> {
  const report: ImportReport = { rows: [], skipped: {} };
  const skip = (reason: SkipReason | "duplicate") => {
    report.skipped[reason] = (report.skipped[reason] ?? 0) + 1;
  };
  for (const lesson of lessons) {
    for (const q of [...(lesson.exitQuiz ?? []), ...(lesson.starterQuiz ?? [])]) {
      const result = await convertOakQuestion(q, lesson, spec);
      if (!result.ok) {
        skip(result.reason);
        continue;
      }
      if (seen.has(result.row.content_hash)) {
        skip("duplicate");
        continue;
      }
      seen.add(result.row.content_hash);
      report.rows.push(result.row);
    }
  }
  return report;
}

/* ── Writing ───────────────────────────────────────────────────────────── */

function sqlString(value: string | null): string {
  return value === null ? "null" : `'${value.replace(/'/g, "''")}'`;
}

/** An idempotent INSERT for the rows (for the SQL editor or the MCP). */
export function toSqlInsert(rows: BankRowInsert[]): string {
  if (rows.length === 0) return "";
  const values = rows
    .map(
      (r) =>
        `(${[
          sqlString(r.source),
          sqlString(r.source_ref),
          sqlString(r.licence),
          sqlString(r.attribution),
          sqlString(r.spec_key),
          sqlString(r.topic_ref),
          sqlString(r.tier),
          sqlString(r.question),
          `${sqlString(JSON.stringify(r.choices))}::jsonb`,
          String(r.correct_index),
          sqlString(r.explanation),
          sqlString(r.content_hash),
          sqlString(r.kind ?? null),
          r.distractor_misconceptions ? `${sqlString(JSON.stringify(r.distractor_misconceptions))}::jsonb` : "null",
          sqlString(r.answer_type ?? "mcq"),
          r.numeric_answer ? `${sqlString(JSON.stringify(r.numeric_answer))}::jsonb` : "null",
        ].join(", ")})`,
    )
    .join(",\n");
  return `insert into public.question_bank
  (source, source_ref, licence, attribution, spec_key, topic_ref, tier, question, choices, correct_index, explanation, content_hash, kind, distractor_misconceptions, answer_type, numeric_answer)
values
${values}
on conflict (source, content_hash) do nothing;`;
}
