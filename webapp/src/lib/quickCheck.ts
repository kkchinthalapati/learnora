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
