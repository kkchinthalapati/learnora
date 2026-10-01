import type { Flashcard } from "../../../api/types";

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

