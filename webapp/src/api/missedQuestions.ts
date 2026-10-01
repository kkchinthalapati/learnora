/* Missed and guessed quiz questions become Recall cards.
 *
 * The results screen promised "Wrong and guessed questions come back in
 * Recall, sooner than the ones you knew. Today will put them in front of
 * you." Nothing did that: Recall draws only from due flashcards and no quiz
 * code created any. A wrong answer was shown once and never again.
 *
 * Now each finished attempt files its wrong and guessed questions as cards
 * in a "Missed questions" deck for the quiz's subject. New cards are due at
 * once, so they reach Recall and Today's memory row with no further wiring,
 * and the spaced-repetition schedule takes over from there. */
import { decksApi } from "./decks";
import { flashcardsApi } from "./flashcards";
import { parseStoredAnswers, parseStoredQuestions } from "../views/quiz/quizMeta";
import type { Quiz } from "./types";

export const MISSED_DECK_TITLE = "Missed questions";

const KEYS = ["A", "B", "C", "D", "E", "F"];

export interface MissedCard {
  front: string;
  back: string;
}

/** The cards an attempt earns: one per wrong answer, and one per right
 *  answer the student marked as a guess. The options travel with the
 *  question, because a stem like "Which of these…" is unanswerable alone. */
export function missedCardsFrom(
  quiz: Pick<Quiz, "questions_json">,
  answersJson: unknown,
): MissedCard[] {
  const questions = parseStoredQuestions(quiz.questions_json);
  const cards: MissedCard[] = [];
  parseStoredAnswers(answersJson).forEach((answer, position) => {
    if (answer.correct && answer.confidence !== "guess") return;
    const index = typeof answer.questionId === "number" ? answer.questionId : position;
    const q = questions[index];
    if (!q) return;
    const options = q.choices.map((c, i) => `${KEYS[i] ?? i + 1}) ${c}`).join("\n");
    const right = q.choices[q.correctIndex];
    cards.push({
      front: `${q.question}\n\n${options}`,
      back: q.feedback?.trim() ? `${right}\n\n${q.feedback.trim()}` : right,
    });
  });
  return cards;
}

/** File the cards, skipping any question already in the deck. Returns how
 *  many were added. */
export async function addMissedQuestionCards(
  quiz: Pick<Quiz, "questions_json" | "folder_id">,
  answersJson: unknown,
): Promise<number> {
  const cards = missedCardsFrom(quiz, answersJson);
  if (cards.length === 0) return 0;

  const folderId = quiz.folder_id ?? null;
  const decks = await decksApi.fetchAll();
  const deck =
    decks.find((d) => d.title === MISSED_DECK_TITLE && (d.folder_id ?? null) === folderId) ??
    (await decksApi.add(folderId, MISSED_DECK_TITLE));

  const existing = new Set((await flashcardsApi.fetchByDeck(deck.id)).map((c) => c.front.trim()));
  const fresh = cards.filter((c) => !existing.has(c.front.trim()));
  if (fresh.length === 0) return 0;
  await flashcardsApi.addBatch(deck.id, fresh);
  return fresh.length;
}
