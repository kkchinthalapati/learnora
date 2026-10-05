/* The mistake memory loop: match → repair → delayed retest → resolved.
 *
 * lib/misconceptions.ts records what a student gets wrong; this decides when
 * a mistake counts as fixed. The rule:
 *
 *   A misconception is resolved only by a correct answer on a NEW question at
 *   least RESOLVE_AFTER_DAYS after its repair. An immediate correct check
 *   moves it to "improving" at most.
 *
 * Right after a re-teach, the student can usually repeat what they were just
 * told; that proves short-term memory, not a corrected belief. Two days and a
 * different question is the smallest test that tells them apart.
 *
 * `applyObservation` is the TypeScript copy of the database trigger in
 * supabase/migrations/20261005010000_mistake_loop.sql. The trigger is what
 * actually sets status; this copy exists so the rule is tested without a
 * database, and so the client can predict a row's state while offline. Change
 * both together.
 *
 * Matching order for a wrong answer: the misconception catalogue (named,
 * teacher-recognisable beliefs), then a provisional AI label (unverified,
 * shown as a pattern only after two sightings), then a generic error type.
 * Nothing here calls an AI; api/mistakeLabel.ts does, and passes its result
 * in. */

import { computeFsrsCardState } from "../views/review/srs";
import {
  detectFromWrongAnswer,
  type CatalogueCheck,
  type KnownMisconception,
} from "./misconceptionCatalogue";
import type { Misconception, MisconceptionStatus } from "./misconceptions";
import { questionKey } from "./questionKey";

export { observationKey, questionKey } from "./questionKey";

export const RESOLVE_AFTER_DAYS = 2;
const DAY_MS = 86_400_000;

export type ErrorType = "concept" | "misread" | "calculation" | "time";
export type LoopKind = "evidence" | "correction" | "repair";

/* ── The resolution rule ─────────────────────────────────────────────────── */

export interface LoopState {
  status: MisconceptionStatus;
  timesObserved: number;
  timesCorrected: number;
  repairedAt: string | null;
  retestDueAt: string | null;
  resolvedAt: string | null;
  excludedQuestionKeys: string[];
}

export const EMPTY_LOOP_STATE: LoopState = Object.freeze({
  status: "open",
  timesObserved: 0,
  timesCorrected: 0,
  repairedAt: null,
  retestDueAt: null,
  resolvedAt: null,
  excludedQuestionKeys: [],
}) as LoopState;

export interface LoopObservation {
  kind: LoopKind;
  occurredAt: string;
  /** Which question this was about (`questionKey`). Null for a tool's
   *  judgement with no question behind it. */
  questionKey?: string | null;
  /** On a repair: when the retest should come, from `retestDueAt`. */
  dueAt?: string | null;
}

function withKey(keys: string[], key: string | null | undefined): string[] {
  return key && !keys.includes(key) ? [...keys, key] : keys;
}

/** The state after one observation. Mirrors `apply_misconception_observation`. */
export function applyObservation(state: LoopState, obs: LoopObservation): LoopState {
  const t = new Date(obs.occurredAt).getTime();

  if (obs.kind === "evidence") {
    /* Seen again: reopen, and void any repair — it didn't hold, so the next
       one has to be earned from scratch. The question joins the excluded
       set: getting the same question right later proves recall of it. */
    return {
      ...state,
      status: "open",
      timesObserved: state.timesObserved + 1,
      repairedAt: null,
      retestDueAt: null,
      resolvedAt: null,
      excludedQuestionKeys: withKey(state.excludedQuestionKeys, obs.questionKey),
    };
  }

  if (obs.kind === "repair") {
    const floor = t + RESOLVE_AFTER_DAYS * DAY_MS;
    const due = obs.dueAt ? Math.max(new Date(obs.dueAt).getTime(), floor) : floor;
    return {
      ...state,
      repairedAt: obs.occurredAt,
      retestDueAt: state.status === "resolved" ? null : new Date(due).toISOString(),
      excludedQuestionKeys: withKey(state.excludedQuestionKeys, obs.questionKey),
    };
  }

  const timesCorrected = state.timesCorrected + 1;
  if (state.status === "resolved") return { ...state, timesCorrected };

  const eligible =
    state.repairedAt !== null &&
    t >= new Date(state.repairedAt).getTime() + RESOLVE_AFTER_DAYS * DAY_MS &&
    !!obs.questionKey &&
    !state.excludedQuestionKeys.includes(obs.questionKey);

  return eligible
    ? { ...state, timesCorrected, status: "resolved", resolvedAt: obs.occurredAt, retestDueAt: null }
    : { ...state, timesCorrected, status: "improving" };
}

/* ── Scheduling the retest ───────────────────────────────────────────────── */

/**
 * When to retest a repaired mistake, from the same FSRS model flashcards use.
 *
 * The repair is treated as a first review of a new card: a mistake seen once
 * grades "Hard" (got there, with help), a recurring one "Again". FSRS then
 * gives its interval, floored at RESOLVE_AFTER_DAYS because a retest sooner
 * than that can't resolve anything.
 */
export function retestDueAt(repairedAt: Date, timesObserved: number): string {
  const fsrs = computeFsrsCardState({ quality: timesObserved > 1 ? 1 : 2, now: repairedAt });
  const floor = repairedAt.getTime() + RESOLVE_AFTER_DAYS * DAY_MS;
  return new Date(Math.max(new Date(fsrs.nextReviewDate).getTime(), floor)).toISOString();
}

/* ── Identity, for idempotency ───────────────────────────────────────────── */

/** A question for the retest that isn't one already tied to this mistake. */
export function pickRetestQuestion<T extends { question: string }>(
  pool: readonly T[],
  excluded: readonly string[],
): T | null {
  return pool.find((q) => !excluded.includes(questionKey(q.question))) ?? null;
}

/* ── Matching a wrong answer ─────────────────────────────────────────────── */

export interface WrongAnswerFacts {
  question: string;
  chosen?: string | null;
  correct: string;
  topic?: string | null;
  timedOut?: boolean;
}

/** What an AI labeller said about a wrong answer it couldn't find in the
 *  catalogue. Unverified by definition. */
export interface ProvisionalLabel {
  concept: string;
  belief: string;
  reteach: string;
  contrast: string;
}

export type MistakeMatch =
  | { kind: "catalogue"; entry: KnownMisconception }
  | { kind: "provisional"; label: ProvisionalLabel }
  | { kind: "generic"; errorType: ErrorType };

const NUMBER_RE = /^[-+−]?\d[\d,]*(\.\d+)?\s*[a-zA-Z%°/²³]*$/;
/* Words that flip what a question asks for. Choosing the answer to the
   un-flipped question is a misreading, not a gap in knowledge. */
const FLIP_RE = /\b(NOT|EXCEPT|LEAST|FALSE|INCORRECT)\b/;

/** The kind of slip, when no named belief explains it. */
export function classifyError(a: WrongAnswerFacts): ErrorType {
  const chosen = (a.chosen ?? "").trim();
  if (a.timedOut || chosen === "") return "time";
  if (FLIP_RE.test(a.question)) return "misread";
  if (NUMBER_RE.test(chosen) && NUMBER_RE.test(a.correct.trim())) return "calculation";
  return "concept";
}

export function matchWrongAnswer(
  a: WrongAnswerFacts,
  provisional?: ProvisionalLabel | null,
): MistakeMatch {
  const entry = detectFromWrongAnswer({
    question: a.question,
    topic: a.topic ?? null,
    chosen: a.chosen ?? "",
    correct: a.correct,
  });
  if (entry) return { kind: "catalogue", entry };
  if (provisional && provisional.concept.trim() && provisional.reteach.trim()) {
    return { kind: "provisional", label: provisional };
  }
  return { kind: "generic", errorType: classifyError(a) };
}

/* ── The repair ──────────────────────────────────────────────────────────── */

export interface Repair {
  /** The idea, said again a different way. */
  reteach: string;
  /** The wrong version beside the right one. */
  contrast: string;
  /** Catalogue entries carry a fixed check question. */
  check?: CatalogueCheck;
  /** True unless it came from the catalogue: the UI says so. */
  unverified: boolean;
}

/* Generic repairs are guidance about a kind of slip, not a diagnosis. They
   say what kind of mistake it looks like and how to catch it, and they are
   labelled as general advice wherever they are shown. */
const GENERIC_RETEACH: Record<ErrorType, string> = {
  concept:
    "This looks like a gap in the idea itself rather than a slip. Go back to the definition, then explain in one sentence why the right answer follows from it.",
  misread:
    "The question asked for the opposite of what was answered. Before choosing, underline the word that flips the question (NOT, EXCEPT, LEAST) and restate it in your own words.",
  calculation:
    "The method may be right but a step went wrong. Redo it one line at a time, writing each intermediate value, and check units and signs at every line.",
  time:
    "This one ran out of time or was left blank. Next time, mark it, move on, and come back: a first guess you can revisit beats an empty answer.",
};

function genericContrast(type: ErrorType, a: WrongAnswerFacts): string {
  const chosen = (a.chosen ?? "").trim();
  switch (type) {
    case "time":
      return `Left unanswered — the answer was "${a.correct}".`;
    case "misread":
      return `"${chosen}" answers the question without its flip word; "${a.correct}" answers the question as written.`;
    default:
      return `You chose "${chosen || "nothing"}"; the answer is "${a.correct}". Find the first step where the two part ways.`;
  }
}

export function repairFor(match: MistakeMatch, a: WrongAnswerFacts): Repair {
  if (match.kind === "catalogue") {
    const e = match.entry;
    return {
      reteach: e.remediation,
      contrast: `Not: "${e.belief}" ${e.whyWrong}`,
      check: e.check,
      unverified: false,
    };
  }
  if (match.kind === "provisional") {
    return { reteach: match.label.reteach, contrast: match.label.contrast, unverified: true };
  }
  return {
    reteach: GENERIC_RETEACH[match.errorType],
    contrast: genericContrast(match.errorType, a),
    unverified: true,
  };
}

/* ── What Today shows ────────────────────────────────────────────────────── */

/** A provisional label is one sighting's guess. It is shown as a named
 *  pattern only once the same label has been seen twice. */
export function isNamedPattern(m: { provisional?: boolean; timesObserved: number }): boolean {
  return !m.provisional || m.timesObserved >= 2;
}

/** Open and never repaired: Today offers the repair. */
export function needsRepair(m: Misconception): boolean {
  return m.status !== "resolved" && !m.repairedAt;
}

/** Repaired, not yet confirmed, and the retest date has come. */
export function retestsDue(ms: readonly Misconception[], now: Date): Misconception[] {
  return ms.filter(
    (m) =>
      m.status !== "resolved" &&
      !!m.repairedAt &&
      !!m.retestDueAt &&
      new Date(m.retestDueAt).getTime() <= now.getTime(),
  );
}

const ERROR_TYPE_LABEL: Record<string, string> = {
  concept: "Gap in the idea",
  misread: "Misread question",
  calculation: "Calculation slip",
  time: "Ran out of time",
};

/** What a row is called. A provisional AI label seen once is a guess, so it
 *  isn't presented as a named pattern until it has been seen twice. */
export function mistakeTitle(m: Misconception): string {
  if (!isNamedPattern(m)) return m.subject ? `A ${m.subject} question you missed` : "A question you missed";
  if (m.errorType) return `${ERROR_TYPE_LABEL[m.errorType] ?? "Mistake"}: ${m.concept}`;
  return m.concept;
}
