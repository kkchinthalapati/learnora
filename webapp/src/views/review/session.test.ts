import { describe, expect, it } from "vitest";
import type { Flashcard } from "../../api/types";
import {
  availableReviewLengths,
  createReviewSnapshot,
  defaultReviewLength,
  recapFrom,
  weakTopicScore,
} from "./session";

function card(id: string, overrides: Partial<Flashcard> = {}): Flashcard {
  return {
    id,
    user_id: "u-1",
    deck_id: "d-1",
    front: id,
    back: `${id} answer`,
    next_review_date: null,
    srs_interval: 0,
    ease_factor: 2.5,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("review session helpers", () => {
  it("offers only useful preset lengths plus all", () => {
    expect(availableReviewLengths(4)).toEqual(["all"]);
    expect(availableReviewLengths(5)).toEqual(["all"]);
    expect(availableReviewLengths(12)).toEqual([5, 10, "all"]);
    expect(availableReviewLengths(25)).toEqual([5, 10, 20, "all"]);
    expect(defaultReviewLength(4)).toBe("all");
    expect(defaultReviewLength(5)).toBe("all");
    expect(defaultReviewLength(20)).toBe(5);
  });

  it("takes a stable, limited snapshot in due order", () => {
    const cards = [
      card("new"),
      card("later", { next_review_date: "2026-08-20T00:00:00.000Z" }),
      card("oldest", { next_review_date: "2026-08-01T00:00:00.000Z" }),
    ];

    const snapshot = createReviewSnapshot(cards, 5, "due");
    cards.reverse();

    expect(snapshot.map(({ id }) => id)).toEqual(["new", "oldest", "later"]);
  });

  /* Quiz weak topics reached the study schedule and the forecast but never
     the review queue, so a topic failed on three quizzes running still
     waited its turn behind whatever happened to be due. */
  describe("quiz-weak ordering", () => {
    const weak = [
      { topic: "Titration", count: 3 },
      { topic: "Moles", count: 1 },
    ];

    it("brings cards matching a failed quiz topic to the front", () => {
      const cards = [
        card("unrelated", { front: "What is a catalyst?" }),
        card("moles", { front: "How many moles in 12 g of carbon?" }),
        card("titration", { front: "Define the titration endpoint" }),
      ];

      const snapshot = createReviewSnapshot(cards, "all", "quiz-weak", weak);

      /* Titration is missed more often than Moles, so it outranks it. */
      expect(snapshot.map(({ id }) => id)).toEqual([
        "titration",
        "moles",
        "unrelated",
      ]);
    });

    it("matches on the source material's title as well as the card text", () => {
      const cards = [
        card("plain", { front: "A", back: "B" }),
        card("from-material", {
          front: "A",
          back: "B",
          source_material_title: "Titration lab notes",
        }),
      ];

      const snapshot = createReviewSnapshot(cards, "all", "quiz-weak", weak);
      expect(snapshot[0].id).toBe("from-material");
    });

    it("keeps every card in the session — it reorders, never filters", () => {
      const cards = [card("a"), card("b"), card("c")];
      const snapshot = createReviewSnapshot(cards, "all", "quiz-weak", weak);
      expect(snapshot).toHaveLength(3);
    });

    it("falls back to due order when no card matches a weak topic", () => {
      const cards = [
        card("later", { next_review_date: "2026-09-01T00:00:00.000Z" }),
        card("oldest", { next_review_date: "2026-08-01T00:00:00.000Z" }),
      ];

      const snapshot = createReviewSnapshot(cards, "all", "quiz-weak", weak);
      expect(snapshot.map(({ id }) => id)).toEqual(["oldest", "later"]);
    });

    it("scores a card by the summed attempt-count of the topics it mentions", () => {
      const both = card("both", {
        front: "Titration",
        back: "Moles per litre",
      });
      expect(weakTopicScore(both, weak)).toBe(4);
      expect(weakTopicScore(card("none"), weak)).toBe(0);
      expect(weakTopicScore(both, [])).toBe(0);
    });

    it("matches case-insensitively and ignores blank topic labels", () => {
      const c = card("c", { front: "TITRATION curve" });
      expect(weakTopicScore(c, [{ topic: "titration", count: 2 }])).toBe(2);
      expect(weakTopicScore(c, [{ topic: "   ", count: 9 }])).toBe(0);
    });
  });

  it("puts low-ease cards first without mutating the query result", () => {
    const cards = [
      card("easy", { ease_factor: 2.8 }),
      card("hard", { ease_factor: 1.5 }),
      card("middle", { ease_factor: 2.1 }),
    ];

    expect(
      createReviewSnapshot(cards, "all", "difficult").map(({ id }) => id),
    ).toEqual(["hard", "middle", "easy"]);
    expect(cards.map(({ id }) => id)).toEqual(["easy", "hard", "middle"]);
  });

  it("builds recall-oriented recap metrics from all four grades", () => {
    const cards = [card("again"), card("hard"), card("good"), card("easy")];
    const recap = recapFrom(
      cards.map((reviewedCard, index) => ({
        card: reviewedCard,
        quality: index + 1,
      })),
    );

    expect(recap.counts).toEqual({ again: 1, hard: 1, good: 1, easy: 1 });
    expect(recap.confident).toBe(2);
    expect(recap.difficult).toBe(2);
    expect(recap.recallPercent).toBe(50);
  });

  it("categorizes cardsByGrade and collects difficultCards correctly", () => {
    const c1 = card("c1", { front: "Photosynthesis light reaction" });
    const c2 = card("c2", { front: "Photosynthesis dark reaction" });
    const c3 = card("c3", { front: "Mitochondria ATP" });
    const c4 = card("c4", { front: "Ribosome protein synthesis" });

    const results = [
      { card: c1, quality: 1 }, // Again
      { card: c2, quality: 2 }, // Hard
      { card: c3, quality: 3 }, // Good
      { card: c4, quality: 4 }, // Easy
    ];

    const recap = recapFrom(results);

    expect(recap.cardsByGrade.again).toEqual([c1]);
    expect(recap.cardsByGrade.hard).toEqual([c2]);
    expect(recap.cardsByGrade.good).toEqual([c3]);
    expect(recap.cardsByGrade.easy).toEqual([c4]);
    expect(recap.difficultCards).toEqual([c1, c2]);
  });

  it("computes estimatedRetention and retentionLabel according to recall accuracy and weights", () => {
    // All Easy cards -> 95% Excellent Retention
    const allEasy = recapFrom([
      { card: card("c1"), quality: 4 },
      { card: card("c2"), quality: 4 },
    ]);
    expect(allEasy.estimatedRetention).toBe(95);
    expect(allEasy.retentionLabel).toBe("Should stick well");

    // All Good cards -> 85% Excellent Retention
    const allGood = recapFrom([
      { card: card("c1"), quality: 3 },
      { card: card("c2"), quality: 3 },
    ]);
    expect(allGood.estimatedRetention).toBe(85);
    expect(allGood.retentionLabel).toBe("Should stick well");

    // Good (85) + Hard (55) -> 70% Good Retention
    const goodAndHard = recapFrom([
      { card: card("c1"), quality: 3 },
      { card: card("c2"), quality: 2 },
    ]);
    expect(goodAndHard.estimatedRetention).toBe(70);
    expect(goodAndHard.retentionLabel).toBe("Should mostly stick");

    // Hard only (55) -> 55% Needs Review
    const hardOnly = recapFrom([{ card: card("c1"), quality: 2 }]);
    expect(hardOnly.estimatedRetention).toBe(55);
    expect(hardOnly.retentionLabel).toBe("Go over it again");

    // Again only (25) -> 25% Critical Review Needed
    const againOnly = recapFrom([{ card: card("c1"), quality: 1 }]);
    expect(againOnly.estimatedRetention).toBe(25);
    expect(againOnly.retentionLabel).toBe("Worth going over soon");

    // Empty results -> 0% Needs Review
    const emptyRecap = recapFrom([]);
    expect(emptyRecap.estimatedRetention).toBe(0);
    expect(emptyRecap.retentionLabel).toBe("Go over it again");
  });

  it("extracts weak topics from cards graded Again and Hard, filtering stop words and ranking by frequency", () => {
    const c1 = card("c1", {
      front: "What is Photosynthesis in plant cells?",
      back: "Process converting sunlight into glucose.",
    });
    const c2 = card("c2", {
      front: "Explain the Light Reactions of Photosynthesis",
      back: "Occurs in thylakoid membranes.",
    });
    const c3 = card("c3", {
      front: "Define Cellular Respiration Krebs cycle",
      back: "Mitochondrial matrix ATP production.",
    });
    const c4 = card("c4", {
      front: "What is Ribosome function?",
      back: "Translates RNA into proteins.",
    });

    const results = [
      { card: c1, quality: 1 }, // Again
      { card: c2, quality: 2 }, // Hard
      { card: c3, quality: 2 }, // Hard
      { card: c4, quality: 4 }, // Easy - should not contribute to weak topics
    ];

    const recap = recapFrom(results);

    // Photosynthesis appears in c1 and c2 -> count: 2
    expect(recap.weakTopics.length).toBeGreaterThan(0);
    const photosynthesisTopic = recap.weakTopics.find(
      (t) => t.topic.toLowerCase() === "photosynthesis",
    );
    expect(photosynthesisTopic).toBeDefined();
    expect(photosynthesisTopic?.count).toBe(2);

    // Ribosome is from an Easy card so it should not be in weakTopics
    const ribosomeTopic = recap.weakTopics.find(
      (t) => t.topic.toLowerCase() === "ribosome",
    );
    expect(ribosomeTopic).toBeUndefined();
  });
});

