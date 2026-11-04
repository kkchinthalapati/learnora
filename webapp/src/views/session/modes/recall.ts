import type { Flashcard } from "../../../api/types";
import { terms } from "../../../lib/grounding";
import { normaliseTopicKey } from "../../../lib/topicKey";

/** Cards in one Recall session — about ten minutes. */
export const RECALL_CARDS = 18;

/* Forgot / Hard / Got it, onto the FSRS grades the review screen uses
   (1 = Again, 2 = Hard, 3 = Good). */
export const RECALL_RATINGS = [
  { key: "1", label: "Forgot", quality: 1 },
  { key: "2", label: "Hard", quality: 2 },
  { key: "3", label: "Got it", quality: 3 },
] as const;

/** The session's cards: ones about the objective first, then the rest of
 *  what is due, mixed — switching topics is what makes recall hold. */
export function pickRecallCards(
  due: Flashcard[],
  objective: string,
  deckTitle: (deckId: string | null) => string,
): Flashcard[] {
  const needle = objective.trim().toLowerCase();
  const matches = (c: Flashcard) =>
    Boolean(needle) &&
    `${deckTitle(c.deck_id)} ${c.front} ${c.back}`.toLowerCase().includes(needle);
  const onTopic = due.filter(matches);
  const rest = due.filter((c) => !matches(c));
  return [...onTopic, ...rest].slice(0, RECALL_CARDS);
}


/* ---------------------------------------------------------------------------
   Checking a typed answer against the card.

   A self-rating is a feeling of knowing, and the feeling runs ahead of the
   knowing: "Got it" after reading the back is often recognition, not recall.
   When the student types an answer first, the app can hold the rating up
   against what they actually produced. This is deliberately not a grade:
   it is a word-level comparison with no model behind it, so it cannot tell
   a synonym from a gap. It only suggests a rating and asks once when the
   student rates higher than their answer shows; the student's call stands.
   --------------------------------------------------------------------------- */

export interface RecallCheck {
  /** Key words of the card's back, in the student-readable form. */
  keyTerms: string[];
  /** Key words the typed answer did not contain. */
  missed: string[];
  /** Share of key words present, 0–1. */
  coverage: number;
  /** The rating the typed answer supports, on the RECALL_RATINGS scale. */
  suggested: 1 | 2 | 3;
}

/* Linking words a card's back uses that are not what the card tests, and
   answers too small to compare ("Yes", "True"). */
const RECALL_FILLER = new Set(
  "across through between within using used called given process way thing type kind yes no true false".split(" "),
);

/** Key words of a text, each with the stem it is matched by. */
function keyWords(text: string): { word: string; stem: string }[] {
  const seen = new Set<string>(RECALL_FILLER);
  const out: { word: string; stem: string }[] = [];
  for (const word of normaliseTopicKey(text).split(" ")) {
    const stem = terms(word)[0];
    if (!stem || seen.has(stem)) continue;
    seen.add(stem);
    out.push({ word, stem });
  }
  return out;
}

/* "evaporate" for "evaporation", "photosynthes" for "photosynthesis": a
   shared start of five letters and most of the shorter word counts. Short
   words and numbers must match exactly. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  if (shorter < 5 || /\d/.test(a) || /\d/.test(b)) return false;
  let common = 0;
  while (common < shorter && a[common] === b[common]) common++;
  return common >= 5 && common >= shorter * 0.75;
}

/** Null when there is nothing to check: no typed answer, or a back with no
 *  key words ("Yes", "True"). */
export function checkRecall(typed: string | undefined, back: string): RecallCheck | null {
  if (!typed?.trim()) return null;
  const key = keyWords(back);
  if (!key.length) return null;
  const said = keyWords(typed).map((w) => w.stem);
  const missed = key.filter((k) => !said.some((s) => sameWord(s, k.stem))).map((k) => k.word);
  const coverage = (key.length - missed.length) / key.length;
  return {
    keyTerms: key.map((k) => k.word),
    missed,
    coverage,
    suggested: coverage >= 0.7 ? 3 : coverage >= 0.35 ? 2 : 1,
  };
}

/** A "Got it" that the typed answer doesn't support: worth one question
 *  before it is saved, because it pushes the card weeks out. */
export function isOverrated(check: RecallCheck | null, quality: number): boolean {
  return Boolean(check) && quality === 3 && check!.suggested === 1;
}
