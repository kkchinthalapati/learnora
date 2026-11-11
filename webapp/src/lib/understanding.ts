/* What a student knows, by subject, in words (Progress > What you know).
 *
 * The knowledge model (lib/knowledgeModel.ts) already works out, for every
 * topic with answered questions, whether it is secure, right so far, or
 * still being learned, and whether it is starting to slip. The tutor has
 * been reading that for a while; the student only ever saw it as "what's
 * fading". This lays it out for them, grouped by the subject the answers
 * came from.
 *
 * Nothing here is a percentage or a grade, and a topic with no answered
 * question is not listed at all: there is nothing to say about it.
 *
 * Pure. A topic's subject is where most of its answers came from: the quiz's
 * subject (or its lesson's), or the subject a Learn or practice answer was
 * recorded under. Topics that can't be placed are listed last, on their own. */

import type { Folder, LearningEvent, Material, Quiz, QuizAttempt } from "../api/types";
import { collectAttempts } from "./attempts";
import { buildKnowledge, evidenceLine, type TopicKnowledge } from "./knowledgeModel";
import { normaliseTopicKey } from "./topicKey";
import { parseStoredAnswers } from "../views/quiz/quizMeta";

export type UnderstandingState = "slipping" | "learning" | "sofar" | "secure";

export interface UnderstandingTopic {
  key: string;
  /** The topic as the student saw it written. */
  label: string;
  state: UnderstandingState;
  /** "Secure", "Starting to slip"… */
  stateLabel: string;
  /** What that rests on: "4 questions right over 2 days". */
  evidence: string;
}

export interface SubjectUnderstanding {
  /** Null for topics that could not be placed in a subject. */
  subjectId: string | null;
  subject: string;
  topics: UnderstandingTopic[];
  /** One sentence, counts only: "2 secure, 1 starting to slip." */
  summary: string;
}

export const STATE_LABELS: Record<UnderstandingState, string> = {
  slipping: "Starting to slip",
  learning: "Still learning",
  sofar: "Right so far",
  secure: "Secure",
};

/** What needs attention first. */
const STATE_ORDER: UnderstandingState[] = ["slipping", "learning", "sofar", "secure"];

export function understandingState(k: TopicKnowledge): UnderstandingState | null {
  if (k.status === "unmeasured" || k.counted === 0) return null;
  if (k.fading) return "slipping";
  if (k.status === "secure") return "secure";
  return k.status === "fragile" ? "sofar" : "learning";
}

const count = (n: number, word: string) => `${n} ${word}`;

export function understandingSummary(topics: readonly UnderstandingTopic[]): string {
  const parts = STATE_ORDER.slice()
    .reverse()
    .map((state) => {
      const n = topics.filter((t) => t.state === state).length;
      return n > 0 ? count(n, STATE_LABELS[state].toLowerCase()) : "";
    })
    .filter(Boolean);
  if (parts.length === 0) return "";
  const sentence = parts.join(", ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

const titleCase = (key: string) => (key ? key.charAt(0).toUpperCase() + key.slice(1) : key);

export function buildUnderstanding(input: {
  quizAttempts: readonly QuizAttempt[];
  quizzes: readonly Pick<Quiz, "id" | "folder_id" | "material_id">[];
  events: readonly LearningEvent[];
  materials: readonly Pick<Material, "id" | "folder_id">[];
  folders: readonly Pick<Folder, "id" | "name">[];
  now?: Date;
}): SubjectUnderstanding[] {
  const { quizAttempts, quizzes, events, materials, folders, now = new Date() } = input;
  const knowledge = buildKnowledge(collectAttempts(quizAttempts, events), now);

  /* Where each topic's answers came from, and how it was written. */
  const folderOfMaterial = new Map(materials.map((m) => [m.id, m.folder_id]));
  const folderOfQuiz = new Map(
    quizzes.map((q) => [q.id, q.folder_id ?? (q.material_id ? (folderOfMaterial.get(q.material_id) ?? null) : null)]),
  );
  const votes = new Map<string, Map<string, number>>();
  const labels = new Map<string, string>();
  const note = (key: string, label: string | undefined, folderId: string | null | undefined) => {
    if (!key) return;
    if (label?.trim() && !labels.has(key)) labels.set(key, label.trim());
    if (!folderId) return;
    const tally = votes.get(key) ?? new Map<string, number>();
    tally.set(folderId, (tally.get(folderId) ?? 0) + 1);
    votes.set(key, tally);
  };
  for (const attempt of quizAttempts) {
    const folderId = folderOfQuiz.get(attempt.quiz_id) ?? null;
    for (const a of parseStoredAnswers(attempt.answers_json)) {
      note(a.skill ?? (a.topic ? normaliseTopicKey(a.topic) : ""), a.topic, folderId);
    }
  }
  for (const e of events) {
    const items = (e.payload as { items?: unknown })?.items;
    if (!Array.isArray(items)) continue;
    const materialId = (e.payload as { materialId?: unknown }).materialId;
    const folderId =
      e.folder_id ?? (typeof materialId === "string" ? (folderOfMaterial.get(materialId) ?? null) : null);
    for (const a of parseStoredAnswers(items)) {
      const label = a.topic ?? e.topic_key;
      note(a.skill ?? (label ? normaliseTopicKey(label) : ""), label, folderId);
    }
  }

  const folderName = new Map(folders.map((f) => [f.id, f.name]));
  const bySubject = new Map<string | null, UnderstandingTopic[]>();
  for (const k of knowledge.values()) {
    const state = understandingState(k);
    if (!state) continue;
    const tally = votes.get(k.key);
    const top = tally ? [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] : undefined;
    /* A subject that has since been deleted is not a place to file it. */
    const subjectId = top && folderName.has(top) ? top : null;
    const list = bySubject.get(subjectId) ?? [];
    list.push({
      key: k.key,
      label: labels.get(k.key) ?? titleCase(k.key),
      state,
      stateLabel: STATE_LABELS[state],
      /* Answered, but never right: "0 questions right over 0 days" is true
         and reads like a fault report. */
      evidence: k.rightItems === 0 ? "None right yet" : evidenceLine(k),
    });
    bySubject.set(subjectId, list);
  }

  const rank = (t: UnderstandingTopic) => STATE_ORDER.indexOf(t.state);
  return [...bySubject.entries()]
    .map(([subjectId, topics]) => {
      const sorted = [...topics].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
      return {
        subjectId,
        subject: subjectId ? (folderName.get(subjectId) ?? "Other topics") : "Other topics",
        topics: sorted,
        summary: understandingSummary(sorted),
      };
    })
    .sort((a, b) =>
      a.subjectId === null ? 1 : b.subjectId === null ? -1 : a.subject.localeCompare(b.subject),
    );
}
