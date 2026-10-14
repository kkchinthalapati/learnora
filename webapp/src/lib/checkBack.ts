/* The student-facing side of the mistake loop (design_handoff → Screens
 * "Session end + mistake loop"): what state a mix-up is in, and what a
 * check-back answer will do to it.
 *
 * Nothing here decides status. `applyObservation` is the client copy of the
 * database trigger (lib/mistakeLoop.ts); this only runs it ahead of the
 * server, so the Fixed moment can be shown the instant the answer is in and
 * is never shown for an answer the rule would not count. */

import { applyObservation, retestsDue, type LoopState } from "./mistakeLoop";
import type { Misconception } from "./misconceptions";
import { questionKey } from "./questionKey";

/** The check-back screen for one mix-up (routes.tsx `/check-back/:id`). */
export function checkBackHref(id: string): string {
  return `/check-back/${encodeURIComponent(id)}`;
}

/** How the loop reads to the student. "Fixing" covers open and improving:
 *  re-taught or not, it is still being worked on. */
export type MixUpState = "fixed" | "check_back_ready" | "fixing";

export function mixUpState(m: Misconception, now: Date): MixUpState {
  if (m.status === "resolved") return "fixed";
  return retestsDue([m], now).length > 0 ? "check_back_ready" : "fixing";
}

/** The check-back Today should lead with: the one that has waited longest. */
export function nextCheckBack(
  ms: readonly Misconception[],
  now: Date,
): Misconception | null {
  const due = retestsDue(ms, now);
  if (due.length === 0) return null;
  return [...due].sort(
    (a, b) =>
      new Date(a.retestDueAt!).getTime() - new Date(b.retestDueAt!).getTime(),
  )[0];
}

function loopStateOf(m: Misconception): LoopState {
  return {
    status: m.status,
    timesObserved: m.timesObserved,
    timesCorrected: m.timesCorrected,
    repairedAt: m.repairedAt ?? null,
    retestDueAt: m.retestDueAt ?? null,
    resolvedAt: m.resolvedAt,
    excludedQuestionKeys: m.excludedQuestionKeys ?? [],
  };
}

/** What answering a check-back will do, by the loop's own rule:
 *  - "fixed": right, on a new question, at least two days after the re-teach
 *  - "improving": right, but the rule can't count it yet
 *  - "not_yet": wrong — it reopens and needs a fresh re-teach */
export type CheckBackOutcome = "fixed" | "improving" | "not_yet";

export function checkBackOutcome(
  m: Misconception,
  question: string,
  correct: boolean,
  now: Date,
): CheckBackOutcome {
  if (!correct) return "not_yet";
  const next = applyObservation(loopStateOf(m), {
    kind: "correction",
    occurredAt: now.toISOString(),
    questionKey: questionKey(question),
  });
  return next.status === "resolved" ? "fixed" : "improving";
}

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long" });
const SHORT_DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "On Monday" within the last week, "On Mon 3 Nov" before that. */
export function onDay(iso: string, now: Date): string {
  const d = new Date(iso);
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  return `On ${days < 7 ? WEEKDAY.format(d) : SHORT_DATE.format(d)}`;
}

export function shortDate(iso: string): string {
  return SHORT_DATE.format(new Date(iso));
}
