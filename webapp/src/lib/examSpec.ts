/* Which of the student's exams a piece of work is for, and so which
 * specification it should be pitched at.
 *
 * A student with a Biology and a Maths exam asking about "photosynthesis" is
 * working towards Biology. The topic decides; when no topic is known (the
 * open chat), the specs only speak if every upcoming exam agrees on the
 * qualification, so a Maths question is never marked against Biology. */

import type { Exam } from "../api/types";
import {
  getSpec,
  isTier,
  matchSpecTopic,
  topicMatchScore,
  type SyllabusSpec,
  type SyllabusTier,
  type SyllabusTopic,
} from "./syllabus";

export interface ExamSpecMatch {
  exam: Exam;
  spec: SyllabusSpec;
  tier: SyllabusTier | null;
  /** The spec section the topic maps to, when a topic was given and matched. */
  topic: SyllabusTopic | null;
}

/** Upcoming exams that name a spec the catalogue knows, soonest first. */
export function upcomingSpecExams(exams: Exam[], today: string): ExamSpecMatch[] {
  return exams
    .filter((e) => e.status !== "Completed" && e.exam_date >= today)
    .map((exam) => {
      const spec = getSpec(exam.syllabus_id);
      if (!spec) return null;
      const tier = isTier(spec, exam.syllabus_tier) ? exam.syllabus_tier : null;
      return { exam, spec, tier, topic: null } as ExamSpecMatch;
    })
    .filter((m): m is ExamSpecMatch => m !== null)
    .sort((a, b) => a.exam.exam_date.localeCompare(b.exam.exam_date));
}

/**
 * The exam a topic belongs to. With a topic: the upcoming spec exam whose
 * spec matches it best (soonest on a tie), and null when none does — a topic
 * outside every spec is not pinned to one. Without a topic: the soonest, but
 * only when it is the only upcoming spec exam.
 */
export function pickExamSpec(
  exams: Exam[],
  today: string,
  topic?: string | null,
): ExamSpecMatch | null {
  const upcoming = upcomingSpecExams(exams, today);
  if (upcoming.length === 0) return null;
  const label = topic?.trim();
  if (!label) return upcoming.length === 1 ? upcoming[0] : null;

  let best: ExamSpecMatch | null = null;
  let bestScore = 0;
  for (const candidate of upcoming) {
    const matched = matchSpecTopic(candidate.spec, label, candidate.tier);
    if (!matched) continue;
    /* The exam's own name counts too: "Chemistry" in "Chemistry mock" is
       evidence that a shared topic like "rates" is that exam's. */
    const score =
      topicMatchScore(label, matched) +
      (label.toLowerCase().includes(candidate.spec.subject.toLowerCase()) ? 2 : 0);
    if (score > bestScore) {
      best = { ...candidate, topic: matched };
      bestScore = score;
    }
  }
  return best;
}
