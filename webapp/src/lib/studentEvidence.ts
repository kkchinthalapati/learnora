/* What the app actually knows about how this student is performing.
 *
 * Every AI surface in Learnora could already see what the student *has*
 * (tasks, exams, notes, sources). None of them could see how they were
 * actually *doing* — so a question like "am I ready for this?" was answered
 * from vibes, and the model was free to invent an encouraging number.
 *
 * This module is the evidence layer that closes that hole. It reduces the
 * quiz rows the student already accumulated into a small, honest summary:
 * accuracy per topic, what has never been tested at all, and — the part that
 * matters most — how much of the result is actually supported by data.
 *
 * Two rules shape everything below.
 *
 *  1. Absence is a fact, not a zero. A topic the student has never been
 *     quizzed on is not "0% mastered", it is unknown, and it is reported in
 *     its own list (`unquizzedTopics`) rather than sorted in among the weak
 *     ones. The same reasoning as lib/trajectory.ts's treatment of a topic
 *     with no cards.
 *
 *  2. A percentage from three questions is not a percentage. Topic rows carry
 *     `provisional`, and the whole summary carries a `confidence` tier, so the
 *     prompt can tell the model to hedge instead of leaving it to guess how
 *     much weight a number deserves. A forecast stated to the point off five
 *     answered questions is the exact failure this exists to prevent.
 *
 * The formatter at the bottom is the only thing that should ever reach a
 * prompt. Topic strings are model-authored text that came back out of the
 * database, so they are fenced on the way in — the same hole
 * lib/actionTags.ts exists to close.
 */

import { fenceUntrusted } from "./actionTags";
import {
  parseStoredAnswers,
  parseStoredQuestions,
} from "../views/quiz/quizMeta";
import type { Quiz, QuizAttempt } from "../api/types";

/** Answers on one topic below this and the accuracy is noise, not a
 *  measurement. The row is still reported — "2 of 3" is genuinely useful — but
 *  it is marked provisional so the model hedges rather than pronouncing. */
export const MIN_TOPIC_ANSWERS = 4;

/** Sample-size gates for the overall confidence tier. Deliberately strict:
 *  the cost of overstating confidence here is a student who under-revises. */
export const LOW_CONFIDENCE_QUIZZES = 3;
export const MODERATE_CONFIDENCE_QUIZZES = 8;
export const LOW_CONFIDENCE_ANSWERS = 15;
export const MODERATE_CONFIDENCE_ANSWERS = 40;

/** How many topic rows reach the prompt. The weakest are what a study
 *  decision turns on, and an unbounded list would crowd out the rest of the
 *  context on an account with a large library. */
export const MAX_PROMPT_TOPICS = 12;
export const MAX_PROMPT_UNQUIZZED = 10;

/** A topic is "weak" below this. Matches the threshold the recommendation
 *  copy in lib/adaptiveLearning.ts already treats as needing work. */
export const WEAK_TOPIC_THRESHOLD = 60;

export interface TopicEvidence {
  topic: string;
  /** Questions answered on this topic, across every attempt. */
  answered: number;
  correct: number;
  /** 0-100, rounded. Meaningless on its own when `provisional` is set. */
  accuracy: number;
  /** Too few answers to treat the accuracy as a measurement. */
  provisional: boolean;
}

/**
 * How much the summary as a whole can be leaned on.
 *
 * - `none`     — no attempts at all. The model must not forecast anything.
 * - `low`      — a handful of attempts. State the number and hedge hard.
 * - `moderate` — enough for direction, not for a point estimate.
 * - `good`     — enough to make specific claims about specific topics.
 */
export type EvidenceConfidence = "none" | "low" | "moderate" | "good";

export interface StudentEvidence {
  quizzesTaken: number;
  questionsAnswered: number;
  /** 0-100, or null when nothing has been attempted. */
  overallAccuracy: number | null;
  /** Weakest first — the order a revision decision is made in. */
  topics: TopicEvidence[];
  /** Topics present in the student's quizzes that no attempt has ever
   *  covered. Unknown, explicitly — never folded in as a low score. */
  unquizzedTopics: string[];
  confidence: EvidenceConfidence;
  /** ISO timestamp of the most recent attempt, or null. */
  lastAttemptAt: string | null;
}

export const EMPTY_EVIDENCE: StudentEvidence = {
  quizzesTaken: 0,
  questionsAnswered: 0,
  overallAccuracy: null,
  topics: [],
  unquizzedTopics: [],
  confidence: "none",
  lastAttemptAt: null,
};

function normaliseTopic(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Case-insensitive grouping key. The same topic comes back from the model as
 *  "Photosynthesis" and "photosynthesis" across two generations, and reporting
 *  those as two independent scores would double-count the weakness. */
function topicKey(topic: string): string {
  return topic.toLowerCase();
}

function tierFor(quizzes: number, answers: number): EvidenceConfidence {
  if (quizzes === 0 || answers === 0) return "none";
  if (quizzes < LOW_CONFIDENCE_QUIZZES || answers < LOW_CONFIDENCE_ANSWERS) {
    return "low";
  }
  if (
    quizzes < MODERATE_CONFIDENCE_QUIZZES ||
    answers < MODERATE_CONFIDENCE_ANSWERS
  ) {
    return "moderate";
  }
  return "good";
}

/**
 * Reduce raw quiz and attempt rows to the evidence summary.
 *
 * Both inputs are read defensively: `questions_json` and `answers_json` are
 * free-form JSON that may predate the current shape checks, so both go through
 * the `quizMeta` parsers that already handle that (an unreadable row
 * contributes nothing rather than throwing).
 */
export function buildStudentEvidence({
  quizzes,
  attempts,
}: {
  quizzes: Quiz[];
  attempts: QuizAttempt[];
}): StudentEvidence {
  if (attempts.length === 0 && quizzes.length === 0) return EMPTY_EVIDENCE;

  const byTopic = new Map<
    string,
    { topic: string; answered: number; correct: number }
  >();

  let questionsAnswered = 0;
  let totalCorrect = 0;
  let lastAttemptAt: string | null = null;

  const attemptedQuizIds = new Set<string>();

  for (const attempt of attempts) {
    attemptedQuizIds.add(attempt.quiz_id);

    if (
      attempt.created_at &&
      (!lastAttemptAt || attempt.created_at > lastAttemptAt)
    ) {
      lastAttemptAt = attempt.created_at;
    }

    for (const answer of parseStoredAnswers(attempt.answers_json)) {
      questionsAnswered += 1;
      if (answer.correct) totalCorrect += 1;

      /* An answer with no topic still counts toward the overall accuracy —
         it was a real question — but it cannot be attributed to a topic, so
         it is deliberately not bucketed under a placeholder. A fake
         "Uncategorised" row would read as a real weakness. */
      if (!answer.topic) continue;
      const topic = normaliseTopic(answer.topic);
      if (!topic) continue;

      const key = topicKey(topic);
      const row = byTopic.get(key) ?? { topic, answered: 0, correct: 0 };
      row.answered += 1;
      if (answer.correct) row.correct += 1;
      byTopic.set(key, row);
    }
  }

  const topics: TopicEvidence[] = [...byTopic.values()]
    .map((row) => ({
      topic: row.topic,
      answered: row.answered,
      correct: row.correct,
      accuracy: Math.round((row.correct / row.answered) * 100),
      provisional: row.answered < MIN_TOPIC_ANSWERS,
    }))
    /* Weakest first, and a well-evidenced row outranks a provisional one at
       the same score — the student should be sent at the weakness we are
       actually sure about. Alphabetical last so the order is stable. */
    .sort(
      (a, b) =>
        a.accuracy - b.accuracy ||
        Number(a.provisional) - Number(b.provisional) ||
        b.answered - a.answered ||
        a.topic.localeCompare(b.topic),
    );

  /* Never-tested topics: everything a quiz in the library asks about that no
     answer has ever covered. A quiz that was generated and then never sat is
     the common case, and it is precisely the thing a student forgets. */
  const coveredKeys = new Set(byTopic.keys());
  const unquizzed = new Map<string, string>();

  for (const quiz of quizzes) {
    for (const question of parseStoredQuestions(quiz.questions_json)) {
      if (!question.topic) continue;
      const topic = normaliseTopic(question.topic);
      if (!topic) continue;
      const key = topicKey(topic);
      if (coveredKeys.has(key) || unquizzed.has(key)) continue;
      unquizzed.set(key, topic);
    }
  }

  const quizzesTaken = attemptedQuizIds.size;

  return {
    quizzesTaken,
    questionsAnswered,
    overallAccuracy:
      questionsAnswered > 0
        ? Math.round((totalCorrect / questionsAnswered) * 100)
        : null,
    topics,
    unquizzedTopics: [...unquizzed.values()].sort((a, b) => a.localeCompare(b)),
    confidence: tierFor(quizzesTaken, questionsAnswered),
    lastAttemptAt,
  };
}

/** The weak topics worth naming — evidenced, and below the threshold. */
export function weakTopics(evidence: StudentEvidence): TopicEvidence[] {
  return evidence.topics.filter(
    (t) => !t.provisional && t.accuracy < WEAK_TOPIC_THRESHOLD,
  );
}

/* Which surface owns "what grade will I get?".
 *
 * Two engines in this app can answer that, and they answer it from different
 * evidence: Trajectory projects an exam score forward from SRS memory state
 * (lib/trajectory.ts), while this module measures quiz accuracy that has
 * already happened. Both are legitimate; neither is a strict refinement of the
 * other, so left alone they will disagree — and a student told "you're at 72%"
 * in chat and "projected 64%" on Trajectory learns to trust neither.
 *
 * The split is by *kind of claim* rather than by merging the two models, which
 * would mean rebuilding one on top of the other and recomputing an SRS
 * projection on every chat message:
 *
 *   - Measurement — what has already been answered, per topic. This module.
 *     Chat may state these freely; they are facts, not projections.
 *   - Projection — where the student lands on exam day. Trajectory only, with
 *     its confidence band. Chat quotes it or points at it; it never derives a
 *     competing one from the accuracy numbers above.
 *
 * A percentage correct is not a predicted grade, and the rule below exists to
 * stop the model quietly treating one as the other. */
const FORECAST_AUTHORITY =
  "FORECAST AUTHORITY: the accuracy figures above are measurements of what the student has already answered — not a predicted grade. Grade projections are produced only by Learnora's Trajectory screen, which models memory decay and the time left before the exam and states its own confidence band. Never convert the accuracy above into a predicted exam grade, and never present it as one. If the student asks what grade they will get, give the measured facts above, say plainly that the projection lives on Trajectory, and point them there.";

const CONFIDENCE_GUIDANCE: Record<EvidenceConfidence, string> = {
  none: "NO performance data exists. You must not estimate a grade, a percentage, or a readiness level. Say plainly that you have not seen any quiz results yet, and offer to generate a quiz so there is something to measure.",
  low: "The evidence is thin. Say how thin, in the student's own numbers ('this is off 2 quizzes'), and keep to direction rather than precision. Do not characterise overall readiness from this little.",
  moderate:
    "There is enough evidence for direction but not for precision. Describe strengths and weaknesses as tendencies, and say the picture is still forming rather than settled.",
  good: "There is enough evidence to make specific claims about specific topics — name them and quote their measured numbers. Still refuse to score any topic listed under NEVER TESTED.",
};

/**
 * Render the evidence for injection into a system prompt.
 *
 * Returns a block that is safe to interpolate: every topic string is fenced,
 * and the absence of data is stated as loudly as its presence. The wording is
 * deliberately imperative — this section exists to *remove* the model's
 * licence to guess, so the rules are stated as prohibitions, not preferences.
 */
export function formatEvidenceForPrompt(evidence: StudentEvidence): string {
  const lines: string[] = [
    "PERFORMANCE EVIDENCE (from the student's actual quiz results):",
  ];

  if (evidence.confidence === "none") {
    lines.push(
      "- Quizzes taken: 0. There is no performance data for this student at all.",
    );
    if (evidence.unquizzedTopics.length > 0) {
      const names = evidence.unquizzedTopics
        .slice(0, MAX_PROMPT_UNQUIZZED)
        .map((t) => fenceUntrusted(t))
        .join(", ");
      lines.push(
        `- They have quizzes in their library covering: ${names}. None have been attempted.`,
      );
    }
    lines.push(`- HONESTY RULE: ${CONFIDENCE_GUIDANCE.none}`);
    lines.push(`- ${FORECAST_AUTHORITY}`);
    return lines.join("\n");
  }

  lines.push(
    `- Quizzes taken: ${evidence.quizzesTaken}. Questions answered: ${evidence.questionsAnswered}. Overall accuracy: ${evidence.overallAccuracy}%.`,
  );
  if (evidence.lastAttemptAt) {
    lines.push(
      `- Most recent attempt: ${evidence.lastAttemptAt.slice(0, 10)}.`,
    );
  }
  lines.push(`- Evidence strength: ${evidence.confidence.toUpperCase()}.`);

  const shown = evidence.topics.slice(0, MAX_PROMPT_TOPICS);
  if (shown.length > 0) {
    lines.push("- Accuracy per topic (weakest first):");
    for (const t of shown) {
      const flag = t.provisional
        ? " [PROVISIONAL — too few questions to be a real measurement; do not quote this percentage as fact]"
        : "";
      lines.push(
        `  · ${fenceUntrusted(t.topic)}: ${t.accuracy}% (${t.correct}/${t.answered} correct)${flag}`,
      );
    }
    if (evidence.topics.length > shown.length) {
      lines.push(
        `  · …and ${evidence.topics.length - shown.length} further topics not listed here. Do not claim this list is complete.`,
      );
    }
  } else {
    lines.push(
      "- No per-topic breakdown is available: the questions answered carried no topic labels. Do not invent per-topic scores.",
    );
  }

  if (evidence.unquizzedTopics.length > 0) {
    const names = evidence.unquizzedTopics
      .slice(0, MAX_PROMPT_UNQUIZZED)
      .map((t) => fenceUntrusted(t))
      .join(", ");
    const more =
      evidence.unquizzedTopics.length > MAX_PROMPT_UNQUIZZED
        ? `, and ${evidence.unquizzedTopics.length - MAX_PROMPT_UNQUIZZED} more`
        : "";
    lines.push(
      `- NEVER TESTED (no quiz data at all — these are UNKNOWN, not weak): ${names}${more}.`,
    );
  }

  lines.push(`- HONESTY RULE: ${CONFIDENCE_GUIDANCE[evidence.confidence]}`);
  lines.push(`- ${FORECAST_AUTHORITY}`);
  lines.push(
    "- Never state a performance number that does not appear above. If the student asks how they are doing on something not listed, say you have no quiz data on it yet and offer to generate a quiz — do not estimate.",
  );

  return lines.join("\n");
}
