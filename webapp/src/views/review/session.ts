import type { Flashcard } from "../../api/types";

export type ReviewLength = 5 | 10 | 20 | "all";
export type ReviewOrder = "due" | "difficult" | "quiz-weak";

export interface ReviewResult {
  card: Flashcard;
  quality: number;
}

export interface WeakTopic {
  topic: string;
  count: number;
}

const SESSION_LENGTHS = [5, 10, 20] as const;

export function availableReviewLengths(totalCards: number): ReviewLength[] {
  return [
    ...SESSION_LENGTHS.filter((length) => length < totalCards),
    "all" as const,
  ];
}

export function defaultReviewLength(totalCards: number): ReviewLength {
  return totalCards > 5 ? 5 : "all";
}

function dueTime(card: Flashcard): number {
  return card.next_review_date
    ? new Date(card.next_review_date).getTime()
    : Number.NEGATIVE_INFINITY;
}

/* Quizzes and decks were measuring the same student and never comparing
 * notes: `quiz_attempts.weak_topics` recorded exactly which topics were being
 * failed, and it reached the study schedule and the forecast — but never the
 * review queue, the one place the student can actually do something about it.
 * A topic missed on three quizzes running still waited its turn behind
 * whatever happened to be due.
 *
 * There is no join to make here. A quiz topic is a free-text label the model
 * wrote; a flashcard has no topic column. So the link is textual: a card
 * counts against a weak topic when the topic's words appear in the card's
 * text or in the title of the material it came from. That is a heuristic and
 * is treated as one — it only ever reorders cards the student was already
 * going to see, never filters any out. */
function cardHaystack(card: Flashcard): string {
  return [card.front, card.back, card.source_material_title]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** How strongly a card is implicated by the student's failed quiz topics:
 *  the summed attempt-count of every weak topic the card mentions. */
export function weakTopicScore(
  card: Flashcard,
  weakTopics: WeakTopic[],
): number {
  if (weakTopics.length === 0) return 0;
  const haystack = cardHaystack(card);
  return weakTopics.reduce((score, { topic, count }) => {
    const needle = topic.trim().toLowerCase();
    if (!needle) return score;
    return haystack.includes(needle) ? score + Math.max(1, count) : score;
  }, 0);
}

/**
 * Creates the immutable card order used for one review session. The explicit
 * source index makes ties stable even if the runtime's Array#sort behaviour
 * changes, so a background query refresh cannot reorder an active session.
 */
export function createReviewSnapshot(
  cards: Flashcard[],
  length: ReviewLength,
  order: ReviewOrder,
  weakTopics: WeakTopic[] = [],
): Flashcard[] {
  const ordered = cards.map((card, sourceIndex) => ({
    card,
    sourceIndex,
    weakScore:
      order === "quiz-weak" ? weakTopicScore(card, weakTopics) : 0,
  }));

  ordered.sort((left, right) => {
    if (order === "quiz-weak") {
      /* Highest-scoring first. Cards matching nothing score 0 and fall
         through to the usual due ordering below, so a session is never
         short of cards just because the quizzes have not named a topic
         that appears in this deck. */
      const scoreDifference = right.weakScore - left.weakScore;
      if (scoreDifference !== 0) return scoreDifference;
    }

    if (order === "difficult") {
      const easeDifference =
        (left.card.ease_factor || 2.5) - (right.card.ease_factor || 2.5);
      if (easeDifference !== 0) return easeDifference;

      const intervalDifference =
        (left.card.srs_interval || 0) - (right.card.srs_interval || 0);
      if (intervalDifference !== 0) return intervalDifference;
    }

    const dueDifference = dueTime(left.card) - dueTime(right.card);
    if (dueDifference !== 0) return dueDifference;
    return left.sourceIndex - right.sourceIndex;
  });

  const limit = length === "all" ? ordered.length : length;
  return ordered.slice(0, limit).map(({ card }) => card);
}

export interface CardsByGrade {
  again: Flashcard[];
  hard: Flashcard[];
  good: Flashcard[];
  easy: Flashcard[];
}

export interface SessionRecap {
  counts: { again: number; hard: number; good: number; easy: number };
  confident: number;
  difficult: number;
  recallPercent: number;
  cardsByGrade: CardsByGrade;
  estimatedRetention: number;
  retentionLabel: string;
  weakTopics: WeakTopic[];
  difficultCards: Flashcard[];
}

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
  "below", "between", "both", "but", "by", "can", "can't", "cannot", "could",
  "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down",
  "during", "each", "few", "for", "from", "further", "had", "hadn't", "has",
  "hasn't", "have", "haven't", "having", "he", "her", "here", "hers", "herself",
  "him", "himself", "his", "how", "i", "if", "in", "into", "is", "isn't", "it",
  "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my",
  "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other",
  "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "shan't",
  "she", "should", "shouldn't", "so", "some", "such", "than", "that", "the",
  "their", "theirs", "them", "themselves", "then", "there", "these", "they",
  "this", "those", "through", "to", "too", "under", "until", "up", "very", "was",
  "wasn't", "we", "were", "weren't", "what", "when", "where", "which", "while",
  "who", "whom", "why", "with", "won't", "would", "wouldn't", "you", "your",
  "yours", "yourself", "yourselves",
  "define", "definition", "explain", "describe", "identify", "state", "list",
  "name", "give", "true", "false", "difference", "between", "vs", "versus",
  "example", "examples", "calculate", "find", "determine", "what's", "whats",
]);

function capitalize(word: string): string {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function extractWeakTopics(cards: Flashcard[]): WeakTopic[] {
  const topicCounts = new Map<string, number>();

  for (const card of cards) {
    const cardTopics = new Set<string>();
    const textToAnalyze = `${card.front} ${card.back}`;

    const prefixMatch = card.front.match(
      /^(?:\[(.*?)\]|([^:]+):|(?:topic|subject)\s*[-:]\s*([^,\n]+))/i,
    );
    if (prefixMatch) {
      const explicitTopic = (
        prefixMatch[1] ||
        prefixMatch[2] ||
        prefixMatch[3] ||
        ""
      ).trim();
      if (
        explicitTopic &&
        explicitTopic.length >= 3 &&
        explicitTopic.split(/\s+/).length <= 4
      ) {
        const cleaned = explicitTopic.replace(
          /^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g,
          "",
        );
        if (cleaned && !STOP_WORDS.has(cleaned.toLowerCase())) {
          cardTopics.add(cleaned);
        }
      }
    }

    const words = textToAnalyze
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

    for (const word of words) {
      cardTopics.add(capitalize(word));
    }

    for (const topic of cardTopics) {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    }
  }

  const topicsArray: WeakTopic[] = Array.from(topicCounts.entries()).map(
    ([topic, count]) => ({ topic, count }),
  );

  topicsArray.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.topic.localeCompare(b.topic);
  });

  return topicsArray.slice(0, 10);
}

export function getRetentionLabel(retention: number): string {
  if (retention >= 85) return "Should stick well";
  if (retention >= 70) return "Should mostly stick";
  if (retention >= 50) return "Go over it again";
  return "Worth going over soon";
}

export function computeEstimatedRetention(results: ReviewResult[]): {
  retention: number;
  label: string;
} {
  if (results.length === 0) {
    return { retention: 0, label: "Go over it again" };
  }

  let weightedSum = 0;
  for (const { quality } of results) {
    if (quality <= 1) {
      weightedSum += 25;
    } else if (quality === 2) {
      weightedSum += 55;
    } else if (quality === 3) {
      weightedSum += 85;
    } else {
      weightedSum += 95;
    }
  }

  const retention = Math.round(weightedSum / results.length);
  const label = getRetentionLabel(retention);
  return { retention, label };
}

export function recapFrom(results: ReviewResult[]): SessionRecap {
  const counts = { again: 0, hard: 0, good: 0, easy: 0 };
  const cardsByGrade: CardsByGrade = {
    again: [],
    hard: [],
    good: [],
    easy: [],
  };

  results.forEach(({ card, quality }) => {
    if (quality <= 1) {
      counts.again += 1;
      cardsByGrade.again.push(card);
    } else if (quality === 2) {
      counts.hard += 1;
      cardsByGrade.hard.push(card);
    } else if (quality === 3) {
      counts.good += 1;
      cardsByGrade.good.push(card);
    } else {
      counts.easy += 1;
      cardsByGrade.easy.push(card);
    }
  });

  const confident = counts.good + counts.easy;
  const difficult = counts.again + counts.hard;
  const recallPercent = results.length
    ? Math.round((confident / results.length) * 100)
    : 0;

  const difficultCards = [...cardsByGrade.again, ...cardsByGrade.hard];
  const weakTopics = extractWeakTopics(difficultCards);
  const { retention: estimatedRetention, label: retentionLabel } =
    computeEstimatedRetention(results);

  return {
    counts,
    confident,
    difficult,
    recallPercent,
    cardsByGrade,
    estimatedRetention,
    retentionLabel,
    weakTopics,
    difficultCards,
  };
}
