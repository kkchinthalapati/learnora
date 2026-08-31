import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { renderWithAuth, fakeSession } from "../../test/auth";
import { ConceptNodeDrawer } from "./ConceptNodeDrawer";
import type { ConceptNode } from "../../lib/conceptGraph";

describe("ConceptNodeDrawer", () => {
  const mockNode: ConceptNode = {
    id: "concept-enzymes",
    label: "Enzymes",
    folderId: "f-bio",
    folderName: "Biology",
    folderColor: "#4ade80",
    masteryScore: 45,
    isKnowledgeGap: true,
    gapScore: 65,
    gapDetails: {
      gapScore: 65,
      quizDeficit: 20,
      overdueCardsCount: 1,
      examProximityDays: 3,
      examName: "Biology Midterm",
      urgency: "critical",
      remediationReasons: ["Low retention score (45%)", "Exam approaching in 3 days"],
    },
    notesCount: 3,
    flashcardsCount: 2,
    quizzesCount: 1,
    materialsCount: 1,
    degree: 2,
    x: 100,
    y: 100,
    radius: 24,
    noteSnippets: [
      "Enzymes lower the activation energy of biological reactions.",
    ],
    relatedConcepts: ["concept-catalysts"],
    prerequisites: ["concept-catalysts"],
    dependents: ["concept-denaturation"],
    deckId: "d-1",
    materialId: "m-1",
  };

  const allNodes: ConceptNode[] = [
    mockNode,
    {
      id: "concept-catalysts",
      label: "Catalysts",
      folderId: "f-chem",
      folderName: "Chemistry",
      folderColor: "#60a5fa",
      masteryScore: 85,
      isKnowledgeGap: false,
      notesCount: 1,
      flashcardsCount: 2,
      quizzesCount: 1,
      materialsCount: 1,
      degree: 1,
      x: 200,
      y: 200,
      radius: 24,
      noteSnippets: [],
      relatedConcepts: ["concept-enzymes"],
      prerequisites: [],
      dependents: ["concept-enzymes"],
    },
    {
      id: "concept-denaturation",
      label: "Denaturation",
      folderId: "f-bio",
      folderName: "Biology",
      folderColor: "#4ade80",
      masteryScore: 40,
      isKnowledgeGap: true,
      notesCount: 1,
      flashcardsCount: 1,
      quizzesCount: 0,
      materialsCount: 1,
      degree: 1,
      x: 300,
      y: 300,
      radius: 24,
      noteSnippets: [],
      relatedConcepts: ["concept-enzymes"],
      prerequisites: ["concept-enzymes"],
      dependents: [],
    },
  ];

  it("renders the topic summary, how-well-you-know-it meter, counts, and weak-topic alert", () => {
    renderWithAuth(
      <MemoryRouter>
        <ConceptNodeDrawer
          node={mockNode}
          allNodes={allNodes}
          isOpen={true}
          onClose={vi.fn()}
          onSelectRelated={vi.fn()}
        />
      </MemoryRouter>,
      { session: fakeSession() },
    );

    expect(screen.getAllByText("Enzymes").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Biology").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("cognitive-cross-link-bar")).toBeInTheDocument();
    expect(screen.getByTestId("cross-link-debugger-btn")).toBeInTheDocument();
    expect(screen.getByTestId("cross-link-feynman-btn")).toBeInTheDocument();
    expect(screen.getByTestId("cross-link-premortem-btn")).toBeInTheDocument();
    expect(screen.getByText("This one needs some work")).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByText("Mentions in notes")).toBeInTheDocument();
    expect(screen.getByText("Flashcards")).toBeInTheDocument();
    expect(screen.getByText("Quiz questions")).toBeInTheDocument();
    expect(screen.getByText(/Enzymes lower the activation energy/)).toBeInTheDocument();
    expect(screen.getByText("Practise this now")).toBeInTheDocument();
    expect(screen.getByText("Give me five minutes of practice")).toBeInTheDocument();
  });

  it("opens and interacts with the five-minute practice", async () => {
    const user = userEvent.setup();

    renderWithAuth(
      <MemoryRouter>
        <ConceptNodeDrawer
          node={mockNode}
          allNodes={allNodes}
          isOpen={true}
          onClose={vi.fn()}
          onSelectRelated={vi.fn()}
        />
      </MemoryRouter>,
      { session: fakeSession() },
    );

    const remediateBtn = screen.getByRole("button", {
      name: /Give me five minutes of practice/i,
    });
    await user.click(remediateBtn);

    expect(screen.getByText("Five minutes on this")).toBeInTheDocument();
    expect(screen.getByText("The main point")).toBeInTheDocument();
    expect(screen.getByText(/Quick questions/)).toBeInTheDocument();

    // Click an option in question 1
    const optionBtn = screen.getByRole("button", {
      name: /Enzymes lower the activation energy/i,
    });
    await user.click(optionBtn);

    expect(screen.getByText(/✓ Correct\./)).toBeInTheDocument();
  });

  it("renders prerequisite hierarchy and calls onSelectRelated when prerequisite card is clicked", async () => {
    const onSelectRelated = vi.fn();
    const user = userEvent.setup();

    renderWithAuth(
      <MemoryRouter>
        <ConceptNodeDrawer
          node={mockNode}
          allNodes={allNodes}
          isOpen={true}
          onClose={vi.fn()}
          onSelectRelated={onSelectRelated}
        />
      </MemoryRouter>,
      { session: fakeSession() },
    );

    expect(screen.getByText("What leads into what")).toBeInTheDocument();
    expect(screen.getByText("Learn these first")).toBeInTheDocument();
    expect(screen.getByText("This leads on to")).toBeInTheDocument();

    const prereqCard = screen.getByRole("button", { name: /Go to Catalysts, which you need first/i });
    await user.click(prereqCard);
    expect(onSelectRelated).toHaveBeenCalledWith("concept-catalysts");
  });

  it("calls onSelectRelated when a connected concept pill is clicked", async () => {
    const onSelectRelated = vi.fn();
    const user = userEvent.setup();

    renderWithAuth(
      <MemoryRouter>
        <ConceptNodeDrawer
          node={mockNode}
          allNodes={allNodes}
          isOpen={true}
          onClose={vi.fn()}
          onSelectRelated={onSelectRelated}
        />
      </MemoryRouter>,
      { session: fakeSession() },
    );

    const pill = screen.getByRole("button", { name: /^Go to Catalysts$/i });
    await user.click(pill);
    expect(onSelectRelated).toHaveBeenCalledWith("concept-catalysts");
  });

  it("closes when the close button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithAuth(
      <MemoryRouter>
        <ConceptNodeDrawer
          node={mockNode}
          allNodes={allNodes}
          isOpen={true}
          onClose={onClose}
          onSelectRelated={vi.fn()}
        />
      </MemoryRouter>,
      { session: fakeSession() },
    );

    const closeBtn = screen.getByRole("button", { name: /Close this topic/i });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
