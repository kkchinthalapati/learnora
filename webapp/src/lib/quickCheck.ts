import type { Flashcard, FlashcardDeck, Material } from "../api/types";
import type { QuizQuestion } from "./aiJson";
import { normaliseTopicKey, topicMatches } from "./topicKey";

export const QUICK_CHECK_QUESTIONS = 4;

export function buildQuickCheckSource({ topic, cards, decks, materials, deckId, folderId }: {
  topic: string; cards: Flashcard[]; decks: FlashcardDeck[]; materials: Material[];
  deckId?: string | null; folderId?: string | null;
}) {
  const candidates = decks.filter(d => !folderId || d.folder_id === folderId);
  const deck = deckId ? decks.find(d => d.id === deckId) :
    candidates.find(d => normaliseTopicKey(d.title) === normaliseTopicKey(topic)) ?? candidates.find(d => topicMatches(d.title, topic));
  const parts: string[] = [];
  if (deck) {
    const selected = cards.filter(c => c.deck_id === deck.id).slice(0, 30);
    if (selected.length) parts.push(`Flashcards for ${deck.title}:\n${selected.map(c => `Q: ${c.front}\nA: ${c.back}`).join("\n\n")}`);
  }
  const scope = deck?.folder_id ?? folderId;
  const material = materials.filter(m => (!scope || m.folder_id === scope) &&
    m.type === "text" && m.raw_content?.trim() && topicMatches(m.title, deck?.title ?? topic))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (material) parts.push(`Notes — ${material.title}:\n${material.raw_content!.slice(0, 2000)}`);
  return { sourceText: parts.length ? parts.join("\n\n") : `Topic: ${topic}`, deckId: deck?.id ?? null, grounded: parts.length > 0 };
}

export function scoreQuickCheck(questions: Pick<QuizQuestion, "correctIndex">[], answers: Array<number | null>) {
  const total = questions.length;
  const correct = questions.reduce((n, q, i) => n + (answers[i] != null && answers[i] === q.correctIndex ? 1 : 0), 0);
  return { correct, total, score: total ? correct / total : 0 };
}

/* Which topics the student actually got wrong, most-missed first.
 *
 * The result panel knew the score and nothing else, so a 1/4 ended on a
 * number and a "Done" button — the same dead end the quiz results screen had
 * before it learned to lead with "Work on <topic>". The score is the part the
 * student can do least with; the name of the thing they missed is the part
 * that routes them somewhere.
 *
 * A question carries its own `topic` when the generator split the check
 * across subtopics; when it does not, the session's topic is the honest
 * label. Ties keep the order the questions came in, so the list reads as the
 * check did. */
export function missedTopics(
  questions: Pick<QuizQuestion, "correctIndex" | "topic">[],
  answers: Array<number | null>,
  fallback: string,
): string[] {
  const counts = new Map<string, number>();
  questions.forEach((q, i) => {
    if (answers[i] != null && answers[i] === q.correctIndex) return;
    const label = q.topic?.trim() || fallback.trim();
    if (!label) return;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!);
}
