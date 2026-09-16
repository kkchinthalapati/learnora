import { describe, expect, it } from "vitest";
import { resolveBlockTarget, type PlanTargetSources } from "./planTargets";

function sources(
  overrides: Partial<PlanTargetSources> = {},
): PlanTargetSources {
  return {
    folders: [{ id: "f-chem", name: "Chemistry" }],
    decks: [],
    quizzes: [],
    dueCards: [],
    ...overrides,
  };
}

describe("resolveBlockTarget — subject to folder", () => {
  it("resolves the folder whose name matches the block's subject", () => {
    const resolved = resolveBlockTarget({ subject: "Chemistry" }, sources());
    expect(resolved.folderId).toBe("f-chem");
  });

  it("matches regardless of case and surrounding whitespace", () => {
    const resolved = resolveBlockTarget({ subject: "  chemistry " }, sources());
    expect(resolved.folderId).toBe("f-chem");
  });

  it("resolves nothing when no folder matches the subject", () => {
    const resolved = resolveBlockTarget({ subject: "Astrophysics" }, sources());
    expect(resolved.folderId).toBeUndefined();
    expect(resolved.target).toBeUndefined();
  });

  it("does not target content from a folder the subject did not match", () => {
    const resolved = resolveBlockTarget(
      { subject: "Astrophysics" },
      sources({
        decks: [{ id: "d1", title: "Hydrolysis", folder_id: "f-chem" }],
        dueCards: [{ deck_id: "d1" }],
      }),
    );
    expect(resolved.target).toBeUndefined();
  });
});

describe("resolveBlockTarget — deck targets", () => {
  it("targets a deck in the folder that has cards due", () => {
    const resolved = resolveBlockTarget(
      { subject: "Chemistry" },
      sources({
        decks: [{ id: "d1", title: "Hydrolysis", folder_id: "f-chem" }],
        dueCards: [{ deck_id: "d1" }, { deck_id: "d1" }],
      }),
    );
    expect(resolved.target).toEqual({
      kind: "deck",
      id: "d1",
      title: "Hydrolysis",
      dueCount: 2,
    });
  });

  it("ignores a deck with no cards due", () => {
    const resolved = resolveBlockTarget(
      { subject: "Chemistry" },
      sources({
        decks: [{ id: "d1", title: "Hydrolysis", folder_id: "f-chem" }],
        dueCards: [],
      }),
    );
    expect(resolved.target).toBeUndefined();
    expect(resolved.folderId).toBe("f-chem");
  });

  it("ignores due cards belonging to a deck in another folder", () => {
    const resolved = resolveBlockTarget(
      { subject: "Chemistry" },
      sources({
        folders: [
          { id: "f-chem", name: "Chemistry" },
          { id: "f-bio", name: "Biology" },
        ],
        decks: [{ id: "d-bio", title: "Cells", folder_id: "f-bio" }],
        dueCards: [{ deck_id: "d-bio" }],
      }),
    );
    expect(resolved.target).toBeUndefined();
  });

  it("prefers the deck with more hard cards due over the one with more cards due", () => {
    const resolved = resolveBlockTarget(
      { subject: "Chemistry" },
      sources({
        decks: [
          { id: "d-easy", title: "Easy stuff", folder_id: "f-chem" },
          { id: "d-hard", title: "Hydrolysis", folder_id: "f-chem" },
        ],
        dueCards: [
          // Four easy cards due — more cards, but none the student struggles with.
          { deck_id: "d-easy", difficulty: 2 },
          { deck_id: "d-easy", difficulty: 2 },
          { deck_id: "d-easy", difficulty: 2 },
          { deck_id: "d-easy", difficulty: 2 },
          // Two cards the FSRS difficulty says are already a problem.
          { deck_id: "d-hard", difficulty: 9 },
          { deck_id: "d-hard", difficulty: 8 },
        ],
      }),
    );
    expect(resolved.target?.id).toBe("d-hard");
  });

  it("treats a low pre-FSRS ease factor as hard when difficulty is absent", () => {
    const resolved = resolveBlockTarget(
      { subject: "Chemistry" },
      sources({
        decks: [
          { id: "d-easy", title: "Easy stuff", folder_id: "f-chem" },
          { id: "d-hard", title: "Hydrolysis", folder_id: "f-chem" },
        ],
        dueCards: [
          { deck_id: "d-easy", ease_factor: 2.5 },
          { deck_id: "d-easy", ease_factor: 2.5 },
          { deck_id: "d-hard", ease_factor: 1.7 },
        ],
      }),
    );
    expect(resolved.target?.id).toBe("d-hard");
  });

  it("falls back to the deck with the most cards due when none are hard", () => {
    const resolved = resolveBlockTarget(
      { subject: "Chemistry" },
      sources({
        decks: [
          { id: "d-few", title: "Few", folder_id: "f-chem" },
          { id: "d-many", title: "Many", folder_id: "f-chem" },
        ],
        dueCards: [
          { deck_id: "d-few" },
          { deck_id: "d-many" },
          { deck_id: "d-many" },
        ],
      }),
    );
    expect(resolved.target?.id).toBe("d-many");
  });
});

describe("resolveBlockTarget — quiz fallback", () => {
  it("targets the folder's most recent quiz when no cards are due", () => {
    const resolved = resolveBlockTarget(
      { subject: "Chemistry" },
      sources({
        quizzes: [
          {
            id: "q-old",
            title: "Old quiz",
            folder_id: "f-chem",
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "q-new",
            title: "Titration Basics",
            folder_id: "f-chem",
            created_at: "2026-03-01T00:00:00.000Z",
          },
        ],
      }),
    );
    expect(resolved.target).toEqual({
      kind: "quiz",
      id: "q-new",
      title: "Titration Basics",
    });
  });

  it("prefers a deck with cards due over a quiz", () => {
    const resolved = resolveBlockTarget(
      { subject: "Chemistry" },
      sources({
        decks: [{ id: "d1", title: "Hydrolysis", folder_id: "f-chem" }],
        dueCards: [{ deck_id: "d1" }],
        quizzes: [
          {
            id: "q1",
            title: "Titration Basics",
            folder_id: "f-chem",
            created_at: "2026-03-01T00:00:00.000Z",
          },
        ],
      }),
    );
    expect(resolved.target?.kind).toBe("deck");
  });

  it("ignores a quiz belonging to another folder", () => {
    const resolved = resolveBlockTarget(
      { subject: "Chemistry" },
      sources({
        quizzes: [
          {
            id: "q-bio",
            title: "Cells",
            folder_id: "f-bio",
            created_at: "2026-03-01T00:00:00.000Z",
          },
        ],
      }),
    );
    expect(resolved.target).toBeUndefined();
  });
});
