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
    },
  ];

  it("renders concept summary, mastery meter, coverage metrics, and gap alert", () => {
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

    expect(screen.getByText("Enzymes")).toBeInTheDocument();
    expect(screen.getByText("Biology")).toBeInTheDocument();
    expect(screen.getByText("Knowledge Gap Identified")).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByText("Note Mentions")).toBeInTheDocument();
    expect(screen.getByText("Flashcards")).toBeInTheDocument();
    expect(screen.getByText("Quiz Questions")).toBeInTheDocument();
    expect(screen.getByText(/Enzymes lower the activation energy/)).toBeInTheDocument();
    expect(screen.getByText("Catalysts")).toBeInTheDocument();
    expect(screen.getByText("Practice Concept Now")).toBeInTheDocument();
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

    const pill = screen.getByRole("button", { name: /Jump to Catalysts/i });
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

    const closeBtn = screen.getByRole("button", { name: /Close concept drawer/i });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
