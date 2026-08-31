import { describe, expect, it, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { renderWithAuth, fakeSession } from "../../test/auth";
import { ConceptGraphView } from "./ConceptGraphView";
import type { Folder, Material, Note, Flashcard, FlashcardDeck, Quiz, QuizAttempt } from "../../api/types";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

describe("ConceptGraphView", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  const mockFolders: Folder[] = [
    { id: "f-bio", user_id: "user-1", name: "Biology", color: "#4ade80", created_at: "2026-01-01" },
    { id: "f-chem", user_id: "user-1", name: "Chemistry", color: "#60a5fa", created_at: "2026-01-01" },
  ];

  const mockMaterials: Material[] = [
    {
      id: "m-1",
      user_id: "user-1",
      folder_id: "f-bio",
      title: "Enzymes and Reaction Rates",
      type: "pdf",
      raw_content: null,
      storage_path: null,
      created_at: "2026-01-01",
    },
  ];

  const mockNotes: Note[] = [
    {
      id: "n-1",
      user_id: "user-1",
      material_id: "m-1",
      markdown_content: "## Enzymes\nEnzymes lower **activation energy** of reactions.\n- Active site: Specific binding pocket.",
      html_content: null,
      created_at: "2026-01-01",
    },
  ];

  const mockDecks: FlashcardDeck[] = [
    { id: "d-1", user_id: "user-1", folder_id: "f-bio", title: "Enzymes", created_at: "2026-01-01" },
  ];

  const mockCards: Flashcard[] = [
    {
      id: "c-1",
      user_id: "user-1",
      deck_id: "d-1",
      front: "What is an active site?",
      back: "Binding pocket on an enzyme.",
      next_review_date: "2026-01-10",
      srs_interval: 4,
      ease_factor: 2.6,
      created_at: "2026-01-01",
    },
  ];

  const mockQuizzes: Quiz[] = [
    {
      id: "q-1",
      user_id: "user-1",
      material_id: "m-1",
      folder_id: "f-bio",
      title: "Enzymes Quick Check",
      questions_json: [
        {
          id: 1,
          question: "Enzymes act as catalysts",
          choices: ["True", "False"],
          correctIndex: 0,
          topic: "Enzymes",
        },
      ],
      created_at: "2026-01-01",
    },
  ];

  /* A badly-failed attempt makes "Enzymes" a measured knowledge gap (weak
     topic + ~49% blended mastery) — the gap-filter test needs a real gap to
     reveal, not one inferred from absent evidence. */
  const mockAttempts: QuizAttempt[] = [
    {
      id: "qa-1",
      user_id: "user-1",
      quiz_id: "q-1",
      score: 2,
      total: 10,
      answers_json: {},
      weak_topics: ["Enzymes"],
      created_at: "2026-01-02",
    },
  ];

  it("renders toolbar controls, summary counts, and the interactive SVG canvas", async () => {
    server.use(
      http.get(rest("folders"), () => HttpResponse.json(mockFolders)),
      http.get(rest("materials"), () => HttpResponse.json(mockMaterials)),
      http.get(rest("notes"), () => HttpResponse.json(mockNotes)),
      http.get(rest("flashcards"), () => HttpResponse.json(mockCards)),
      http.get(rest("flashcard_decks"), () => HttpResponse.json(mockDecks)),
      http.get(rest("quizzes"), () => HttpResponse.json(mockQuizzes)),
      http.get(rest("quiz_attempts"), () => HttpResponse.json(mockAttempts)),
    );

    renderWithAuth(
      <MemoryRouter>
        <ConceptGraphView />
      </MemoryRouter>,
      { session: fakeSession() },
    );

    /* The view shows a skeleton until its seven queries resolve, so the
       first lookup awaits the loaded state; everything after it is stable. */
    expect(
      await screen.findByPlaceholderText("Search topics or notes…"),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter by subject" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Needs work/ })).toBeInTheDocument();

    // Stats Bar
    expect(screen.getByText("Topics:")).toBeInTheDocument();
    expect(screen.getByText("Links:")).toBeInTheDocument();
    expect(screen.getByText("Average:")).toBeInTheDocument();

    // SVG Map & interactive nodes
    expect(screen.getByRole("group", { name: /Map of how your topics connect/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Enzymes, you know/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /, you know \d+% of this$/i }).length).toBeGreaterThan(0);
  });

  it("supports searching and filtering topics", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(rest("folders"), () => HttpResponse.json(mockFolders)),
      http.get(rest("materials"), () => HttpResponse.json(mockMaterials)),
      http.get(rest("notes"), () => HttpResponse.json(mockNotes)),
      http.get(rest("flashcards"), () => HttpResponse.json(mockCards)),
      http.get(rest("flashcard_decks"), () => HttpResponse.json(mockDecks)),
      http.get(rest("quizzes"), () => HttpResponse.json(mockQuizzes)),
      http.get(rest("quiz_attempts"), () => HttpResponse.json(mockAttempts)),
    );

    renderWithAuth(
      <MemoryRouter>
        <ConceptGraphView />
      </MemoryRouter>,
      { session: fakeSession() },
    );

    const searchInput = await screen.findByPlaceholderText(
      "Search topics or notes…",
    );
    await user.type(searchInput, "NonExistentConceptXYZ");

    // Empty state when search yields no matches
    expect(await screen.findByText("Nothing matches")).toBeInTheDocument();

    // Reset filters button
    const resetBtn = screen.getByRole("button", { name: "Clear filters" });
    await user.click(resetBtn);

    expect(screen.getByRole("group", { name: /Map of how your topics connect/i })).toBeInTheDocument();
  });

  it("toggles the needs-work filter and opens the drawer on node click", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(rest("folders"), () => HttpResponse.json(mockFolders)),
      http.get(rest("materials"), () => HttpResponse.json(mockMaterials)),
      http.get(rest("notes"), () => HttpResponse.json(mockNotes)),
      http.get(rest("flashcards"), () => HttpResponse.json(mockCards)),
      http.get(rest("flashcard_decks"), () => HttpResponse.json(mockDecks)),
      http.get(rest("quizzes"), () => HttpResponse.json(mockQuizzes)),
      http.get(rest("quiz_attempts"), () => HttpResponse.json(mockAttempts)),
    );

    renderWithAuth(
      <MemoryRouter>
        <ConceptGraphView />
      </MemoryRouter>,
      { session: fakeSession() },
    );

    const gapToggle = await screen.findByRole("button", {
      name: /Needs work/,
    });
    await user.click(gapToggle);
    expect(gapToggle).toHaveAttribute("aria-pressed", "true");

    // Click a node in the graph
    const nodeButton = screen.getAllByRole("button", { name: /, you know \d+% of this$/i })[0];
    if (nodeButton) {
      await user.click(nodeButton);
      expect(await screen.findByRole("dialog", { name: /Details for/i })).toBeInTheDocument();
    }
  });

  it("triggers the weakest-topic action and opens the five-minute practice", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(rest("folders"), () => HttpResponse.json(mockFolders)),
      http.get(rest("materials"), () => HttpResponse.json(mockMaterials)),
      http.get(rest("notes"), () => HttpResponse.json(mockNotes)),
      http.get(rest("flashcards"), () => HttpResponse.json(mockCards)),
      http.get(rest("flashcard_decks"), () => HttpResponse.json(mockDecks)),
      http.get(rest("quizzes"), () => HttpResponse.json(mockQuizzes)),
      http.get(rest("quiz_attempts"), () => HttpResponse.json(mockAttempts)),
    );

    renderWithAuth(
      <MemoryRouter>
        <ConceptGraphView />
      </MemoryRouter>,
      { session: fakeSession() },
    );

    const remediateTopBtn = await screen.findByRole("button", {
      name: /Work on my weakest topic/i,
    });
    expect(remediateTopBtn).toBeInTheDocument();
    await user.click(remediateTopBtn);

    expect(await screen.findByRole("dialog", { name: /Details for/i })).toBeInTheDocument();
    expect(await screen.findByText("Five minutes on this")).toBeInTheDocument();
  });

  it("toggles the what-leads-into-what filter", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(rest("folders"), () => HttpResponse.json(mockFolders)),
      http.get(rest("materials"), () => HttpResponse.json(mockMaterials)),
      http.get(rest("notes"), () => HttpResponse.json(mockNotes)),
      http.get(rest("flashcards"), () => HttpResponse.json(mockCards)),
      http.get(rest("flashcard_decks"), () => HttpResponse.json(mockDecks)),
      http.get(rest("quizzes"), () => HttpResponse.json(mockQuizzes)),
      http.get(rest("quiz_attempts"), () => HttpResponse.json(mockAttempts)),
    );

    renderWithAuth(
      <MemoryRouter>
        <ConceptGraphView />
      </MemoryRouter>,
      { session: fakeSession() },
    );

    const prereqFilter = await screen.findByRole("button", {
      name: /What leads into what/,
    });
    expect(prereqFilter).toBeInTheDocument();
    await user.click(prereqFilter);
    expect(prereqFilter).toHaveAttribute("aria-pressed", "true");
  });
});
