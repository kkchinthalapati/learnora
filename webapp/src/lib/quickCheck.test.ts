import { describe, expect, it } from "vitest";
import { buildQuickCheckSource, scoreQuickCheck } from "./quickCheck";
import type { Flashcard, FlashcardDeck, Material } from "../api/types";

const decks = [{ id: "a", title: "Enzymes", folder_id: "biology" }, { id: "b", title: "Enzymes", folder_id: "chemistry" }] as FlashcardDeck[];
const cards = [{ deck_id: "a", front: "Biology", back: "A" }, { deck_id: "b", front: "Chemistry", back: "B" }] as Flashcard[];
describe("quick check sources and scoring", () => {
  it("uses an explicit deck rather than a same-title deck in another subject", () => {
    const result = buildQuickCheckSource({ topic: "Enzymes", deckId: "b", decks, cards, materials: [] });
    expect(result.deckId).toBe("b");
    expect(result.sourceText).toContain("Chemistry");
    expect(result.sourceText).not.toContain("Biology");
  });
  it("uses the latest matching notes and caps their text", () => {
    const materials = [
      { title: "Enzymes old", folder_id: "biology", type: "text", raw_content: "Old notes", created_at: "2026-01-01" },
      { title: "Enzymes new", folder_id: "biology", type: "text", raw_content: "x".repeat(4000), created_at: "2026-02-01" },
    ] as Material[];
    const { sourceText } = buildQuickCheckSource({ topic: "Enzymes", decks, cards: [], materials });
    expect(sourceText).toContain("Enzymes new");
    expect(sourceText).not.toContain("Old notes");
    expect(sourceText.length).toBeLessThan(2100);
  });
  it("discloses the topic-only fallback and never treats a URL as source content", () => {
    const materials = [{ title: "Enzymes", type: "youtube", raw_content: "https://video.invalid", created_at: "2026-01-01" }] as Material[];
    expect(buildQuickCheckSource({ topic: "Enzymes", decks: [], cards: [], materials })).toEqual({ sourceText: "Topic: Enzymes", deckId: null, grounded: false });
  });
  it("scores unanswered questions as incorrect and handles an empty set", () => {
    expect(scoreQuickCheck([{ correctIndex: 1 }, { correctIndex: 0 }], [1, null])).toEqual({ correct: 1, total: 2, score: .5 });
    expect(scoreQuickCheck([], [])).toEqual({ correct: 0, total: 0, score: 0 });
  });
});
