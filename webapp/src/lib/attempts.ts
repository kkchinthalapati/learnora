/* Every answered question, from wherever it was answered, in one shape.
 *
 * Answers live in two places: `quiz_attempts.answers_json` (the quiz runner)
 * and `learning_events.payload.answers` (Quick Check, Practice, retests and
 * placement, which record one event per sitting). The knowledge model
 * (lib/knowledgeModel.ts) reads this list and nothing else, so a question
 * answered in Practice counts exactly like one answered in a quiz.
 *
 * Pure: no Supabase, so the fold is testable on its own. */

import type { LearningEvent, QuizAttempt } from "../api/types";
import type { QuizQuestion } from "./aiJson";
import { itemKindOf, type ItemKind } from "./itemKind";
import { questionRef } from "./questionVetting";
import { normaliseTopicKey } from "./topicKey";
import { parseStoredAnswers, type StoredAnswer } from "../views/quiz/quizMeta";
import type { Confidence } from "../components/learning/options";

export interface Attempt {
  /** Stable per answer, for de-duplication. */
  id: string;
  /** Normalised topic label (`normaliseTopicKey`), as the forecast keys topics. */
  topicKey: string;
  /** "<bank key>:<topic ref>" when the question names its syllabus skill. */
  skill: string | null;
  /** Which question (`questionRef`), or null on old answers. */
  ref: string | null;
  correct: boolean;
  /** Chosen option, -1 when the worked solution was used instead. */
  chosenIndex: number;
  options: number;
  kind: ItemKind;
  /** False when the key was not checked; such answers do not move mastery. */
  verified: boolean;
  confidence: Confidence | null;
  secondsSpent: number | null;
  /** 0 none, 1-2 hints, 3 worked solution. */
  hintRung: number;
  /** Catalogue id of the misconception the chosen distractor is mapped to. */
  misconception: string | null;
  occurredAt: string;
  source: "quiz" | "quick_check" | "practice" | "retest" | "placement";
}

/** The facts about a question that travel with each answer to it. */
export function answerFacts(
  q: QuizQuestion,
  quizId?: string | null,
): Required<Pick<StoredAnswer, "ref" | "options" | "kind">> & {
  verified: boolean;
  skill?: string;
} {
  return {
    ref: questionRef(q, quizId),
    /* A bank question was written and checked by people; a generated one is
       trusted only when the server's checker agreed. Questions from before
       the checker (no field) are trusted as they always were. */
    verified: q.ref?.startsWith("bank:") ? true : q.verified !== false,
    /* A typed-in number has no options to guess between (lib/knowledgeModel
       then uses its small open-answer guess chance). */
    options: q.answerType === "numeric" ? 1 : Array.isArray(q.choices) && q.choices.length >= 2 ? q.choices.length : 4,
    kind: itemKindOf(q),
    ...(q.skill ? { skill: q.skill } : {}),
  };
}

/** One answer, as stored on a quiz attempt or in an event's `items`. */
export function storedAnswer(
  q: QuizQuestion,
  chosenIndex: number | null,
  extras: {
    quizId?: string | null;
    topic?: string;
    confidence?: Confidence | null;
    secondsSpent?: number;
    hintRung?: number;
    /** What was typed, for a numeric question. */
    response?: string;
  } = {},
): StoredAnswer {
  const picked = chosenIndex ?? -1;
  const misconception = chosenMisconception(q, picked);
  return {
    questionId: q.id ?? q.question.slice(0, 40),
    chosenIndex: picked,
    correct: picked === q.correctIndex && (extras.hintRung ?? 0) < 3,
    topic: q.topic || extras.topic,
    ...answerFacts(q, extras.quizId),
    ...(misconception ? { misconception } : {}),
    ...(extras.confidence ? { confidence: extras.confidence } : {}),
    ...(typeof extras.secondsSpent === "number" ? { secondsSpent: extras.secondsSpent } : {}),
    ...(extras.hintRung ? { hintRung: extras.hintRung } : {}),
    ...(extras.response !== undefined ? { response: extras.response.slice(0, 80) } : {}),
  };
}

/** The misconception a chosen option is mapped to, if any. */
export function chosenMisconception(q: QuizQuestion, chosenIndex: number): string | null {
  if (chosenIndex < 0 || chosenIndex === q.correctIndex) return null;
  return q.distractorMisconceptions?.[chosenIndex] ?? null;
}

function fromStored(
  a: StoredAnswer,
  base: { id: string; occurredAt: string; source: Attempt["source"]; fallbackTopic?: string },
): Attempt | null {
  const label = a.topic ?? base.fallbackTopic;
  const topicKey = label ? normaliseTopicKey(label) : "";
  if (!topicKey && !a.skill) return null;
  return {
    id: base.id,
    topicKey,
    skill: a.skill ?? null,
    ref: a.ref ?? null,
    correct: a.correct === true && (a.hintRung ?? 0) < 3,
    chosenIndex: a.chosenIndex,
    options: a.options ?? 4,
    kind: a.kind ?? "recall",
    verified: a.verified !== false,
    confidence: a.confidence ?? null,
    secondsSpent: typeof a.secondsSpent === "number" ? a.secondsSpent : null,
    hintRung: a.hintRung ?? 0,
    misconception: a.misconception ?? null,
    occurredAt: base.occurredAt,
    source: base.source,
  };
}

const EVENT_SOURCES: Record<string, Attempt["source"]> = {
  quick_check: "quick_check",
  practice: "practice",
  retest: "retest",
  placement: "placement",
};

/** Every answer in the student's quiz attempts and learning events, oldest
 *  first. Events without per-answer detail (a bare score) are left to the
 *  forecast's score fold; they carry no item to reason about. */
export function collectAttempts(
  quizAttempts: readonly QuizAttempt[],
  events: readonly LearningEvent[] = [],
): Attempt[] {
  const out: Attempt[] = [];
  for (const attempt of quizAttempts) {
    parseStoredAnswers(attempt.answers_json).forEach((a, i) => {
      const row = fromStored(a, {
        id: `quiz:${attempt.id}:${i}`,
        occurredAt: attempt.created_at,
        source: "quiz",
      });
      if (row) out.push(row);
    });
  }
  for (const e of events) {
    /* `items` holds per-answer records; `answers` on older Quick Check
       events is bare chosen indices and carries no item to reason about. */
    const answers = (e.payload as { items?: unknown })?.items;
    if (!Array.isArray(answers)) continue;
    const source =
      EVENT_SOURCES[String((e.payload as { kind?: unknown }).kind ?? e.source)] ?? "quick_check";
    parseStoredAnswers(answers).forEach((a, i) => {
      const row = fromStored(a, {
        id: `event:${e.client_id ?? e.id}:${i}`,
        occurredAt: e.occurred_at,
        source,
        fallbackTopic: e.topic_key,
      });
      if (row) out.push(row);
    });
  }
  return out.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}
