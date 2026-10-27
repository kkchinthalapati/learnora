/* "Talk past you out of it" — the pure half.
 *
 * The ledger knows the day a student believed something wrong, in what words
 * and on which question. This turns that row into an opponent: the AI plays
 * the student as they were that day, still holding the belief, and the
 * student has to argue them out of it. Explaining why a belief fails, to
 * someone who holds it, is a stronger re-teach than reading a correction
 * (the protégé effect, with refutation built in), and no other app can stage
 * it, because no other app kept the student's own wrong answer.
 *
 * What is decided here, and tested without a model: which rows can be argued
 * with, how far one message can move past you, and when it counts as
 * convinced. The model proposes how sure past you still is; these rules
 * decide how much of that proposal to believe, the same way Teach mode caps
 * score gains per turn (MAX_SCORE_GAIN_PER_TURN in api/aiFeynman.ts). */

import { getKnownMisconception } from "./misconceptionCatalogue";
import { isPlaceholderSummary, type Misconception } from "./misconceptions";
import { isNamedPattern } from "./mistakeLoop";

/** How sure past you is at the start: completely. */
export const START_BELIEF = 100;
/** At or below this, past you has conceded. */
export const CONVINCED_AT = 15;
/** The most one message can move past you. From 100 that is two good
 *  arguments at the least, so a single pasted textbook line can't win. */
export const MAX_DROP_PER_TURN = 45;
/** Past you can get surer, but only a little at a time: a muddled argument
 *  should cost something, not erase the progress before it. */
export const MAX_RISE_PER_TURN = 15;
/** Messages the student gets before past you calls it a day. */
export const MAX_TURNS = 6;
/** Below this a message can't carry an argument ("no", "ur wrong"), so it
 *  can't move past you whatever the model says. */
export const MIN_ARGUMENT_WORDS = 4;

/** routes.tsx `/past-you/:misconceptionId`. */
export function pastYouHref(id: string): string {
  return `/past-you/${encodeURIComponent(id)}`;
}

/**
 * Whether a row holds a belief there is anything to argue with. A slip
 * (misread, calculation, time) is not a belief; "A question you missed" and
 * a quiz's "Missed: …" stand-in have no belief written down; a provisional
 * AI label seen once may not be what the student thinks at all. Fixed rows
 * are done.
 */
export function canArguePastYou(m: Misconception): boolean {
  return (
    m.status !== "resolved" &&
    isNamedPattern(m) &&
    !m.errorType &&
    !!m.summary?.trim() &&
    !isPlaceholderSummary(m.summary)
  );
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * How sure past you is after a message, from the model's proposal. A
 * proposal that isn't a number, or a message too short to argue anything,
 * changes nothing. Otherwise the move is capped both ways.
 */
export function nextBelief(previous: number, proposed: unknown, argument: string): number {
  /* Not `Number(proposed)` on anything: Number(null) and Number("") are 0,
     which would read a missing score as "fully convinced". */
  const n =
    typeof proposed === "number"
      ? proposed
      : typeof proposed === "string" && proposed.trim()
        ? Number(proposed)
        : NaN;
  if (!Number.isFinite(n) || wordCount(argument) < MIN_ARGUMENT_WORDS) return previous;
  const target = Math.round(Math.min(100, Math.max(0, n)));
  return Math.min(previous + MAX_RISE_PER_TURN, Math.max(previous - MAX_DROP_PER_TURN, target));
}

export function isConvinced(belief: number): boolean {
  return belief <= CONVINCED_AT;
}

/**
 * The right idea, for the model to judge arguments against — never to say.
 * A catalogue entry's own why-it's-wrong and re-teach when the row has one,
 * then the repair the ledger stored, or "" to let the model judge from its
 * subject knowledge.
 */
export function correctIdeaFor(m: Misconception): string {
  const entry = m.catalogueId ? getKnownMisconception(m.catalogueId) : null;
  if (entry) return `${entry.whyWrong} ${entry.remediation}`;
  return [m.repairText, m.contrastText].filter((t) => t?.trim()).join(" ");
}

/** The belief as it reads inside a sentence: "you thought <belief>. Past
 *  you still does." Ledger summaries are sentences, so their own closing
 *  stop would double up. */
export function beliefClause(summary: string): string {
  return summary.trim().replace(/[.!?]+$/, "");
}

/** "12 Oct": the day past you is from. The first sighting, since that is
 *  the day the belief was first on record. */
export function pastYouDate(m: Misconception): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(m.firstSeenAt),
  );
}
