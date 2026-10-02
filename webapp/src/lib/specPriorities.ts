/* Which spec topics are worth the student's next hour, in exam marks.
 *
 * The app already measures accuracy per quiz topic (studentEvidence) and
 * records what the student currently believes wrongly (the misconception
 * ledger). Neither knows what the exam weighs. This joins them to the spec:
 * every topic gets its share of the paper, the evidence that maps onto it,
 * and a priority — weight × how much the student still needs it — so a weak
 * topic worth a tenth of the paper outranks a weak topic worth a fiftieth.
 *
 * Honest about what is unmeasured: a topic no quiz has touched is "untested",
 * never folded in as a low or a high score, and gets a middling need so the
 * plan reaches it without pretending to know how it will go. */

import { topicMatches } from "./topicKey";
import {
  matchSpecTopic,
  weightedTopics,
  type SyllabusSpec,
  type SyllabusTier,
  type WeightedTopic,
} from "./syllabus";
import {
  MIN_TOPIC_ANSWERS,
  STRONG_TOPIC_THRESHOLD,
  WEAK_TOPIC_THRESHOLD,
  type TopicEvidence,
} from "./studentEvidence";

export type SpecTopicStatus = "untested" | "weak" | "developing" | "secure";

export interface SpecTopicPriority {
  topic: WeightedTopic;
  /** The quiz topics that map onto this spec topic. */
  evidence: TopicEvidence[];
  answered: number;
  correct: number;
  /** 0-100 across the mapped evidence, or null when nothing was answered. */
  accuracy: number | null;
  /** Too few answers for the accuracy to be a measurement. */
  provisional: boolean;
  /** Open (not resolved) misconceptions recorded on this topic. */
  openMisconceptions: number;
  status: SpecTopicStatus;
  /** 0-1: how much revising this topic is still worth to the student. */
  need: number;
  /** weightPercent × need — the share of the exam still on the table. */
  priority: number;
}

/** A misconception as this module needs it: its concept and whether open. */
export interface MisconceptionLike {
  concept: string;
  status: "open" | "improving" | "resolved";
}

/* Need for a topic nothing has measured: enough to be scheduled, below a
   measured weakness. */
const UNTESTED_NEED = 0.6;
const MIN_NEED = 0.05;
const MISCONCEPTION_NEED = 0.15;
const MAX_MISCONCEPTION_NEED = 0.3;

function needFor(
  accuracy: number | null,
  provisional: boolean,
  openMisconceptions: number,
): number {
  let need: number;
  if (accuracy === null) need = UNTESTED_NEED;
  else {
    const measured = Math.max(MIN_NEED, 1 - accuracy / 100);
    /* A couple of answers move the estimate, they do not set it. */
    need = provisional ? (measured + UNTESTED_NEED) / 2 : measured;
  }
  need += Math.min(MAX_MISCONCEPTION_NEED, openMisconceptions * MISCONCEPTION_NEED);
  return Math.min(1, need);
}

function statusFor(
  accuracy: number | null,
  provisional: boolean,
  openMisconceptions: number,
): SpecTopicStatus {
  if (accuracy === null) return openMisconceptions > 0 ? "weak" : "untested";
  if (!provisional && accuracy < WEAK_TOPIC_THRESHOLD) return "weak";
  if (openMisconceptions > 0) return "weak";
  if (!provisional && accuracy >= STRONG_TOPIC_THRESHOLD) return "secure";
  return "developing";
}

/**
 * Every spec topic at this tier, highest priority first (spec order on a
 * tie, so prerequisites — which come earlier in every spec here — lead).
 */
export function prioritiseSpecTopics(
  spec: SyllabusSpec,
  tier: SyllabusTier,
  evidence: TopicEvidence[],
  misconceptions: MisconceptionLike[] = [],
): SpecTopicPriority[] {
  const topics = weightedTopics(spec, tier);
  const byRef = new Map<string, TopicEvidence[]>();
  for (const ev of evidence) {
    const matched = matchSpecTopic(spec, ev.topic, tier);
    if (!matched) continue;
    byRef.set(matched.ref, [...(byRef.get(matched.ref) ?? []), ev]);
  }

  const open = misconceptions.filter((m) => m.status !== "resolved");

  const rows = topics.map((topic, index) => {
    const mapped = byRef.get(topic.ref) ?? [];
    const answered = mapped.reduce((s, e) => s + e.answered, 0);
    const correct = mapped.reduce((s, e) => s + e.correct, 0);
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : null;
    const provisional = answered < MIN_TOPIC_ANSWERS;
    const openMisconceptions = open.filter((m) => {
      const hit = matchSpecTopic(spec, m.concept, tier);
      return hit ? hit.ref === topic.ref : topicMatches(m.concept, topic.title);
    }).length;
    const need = needFor(accuracy, provisional, openMisconceptions);
    return {
      index,
      row: {
        topic,
        evidence: mapped,
        answered,
        correct,
        accuracy,
        provisional,
        openMisconceptions,
        status: statusFor(accuracy, provisional, openMisconceptions),
        need,
        priority: topic.weightPercent * need,
      } satisfies SpecTopicPriority,
    };
  });

  return rows
    .sort((a, b) => b.row.priority - a.row.priority || a.index - b.index)
    .map((r) => r.row);
}

/** Share of the spec's topics that some evidence has touched, 0-100. */
export function specCoverage(priorities: SpecTopicPriority[]): number {
  if (priorities.length === 0) return 0;
  const touched = priorities.filter((p) => p.answered > 0).length;
  return Math.round((touched / priorities.length) * 100);
}

/** The topics to put in front of the student next: anything not yet secure,
 *  by priority. */
export function nextSpecTopics(priorities: SpecTopicPriority[], limit: number): SpecTopicPriority[] {
  return priorities.filter((p) => p.status !== "secure").slice(0, limit);
}
