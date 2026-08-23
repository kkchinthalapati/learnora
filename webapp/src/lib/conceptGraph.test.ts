import { describe, expect, it } from "vitest";
import {
  normalizeConceptLabel,
  buildConceptGraph,
  filterConceptGraph,
  applyClusterLayout,
  type ConceptNode,
} from "./conceptGraph";
import type { Folder, Material, Note, Flashcard, FlashcardDeck, Quiz, QuizAttempt } from "../api/types";

describe("conceptGraph", () => {
  describe("normalizeConceptLabel", () => {
    it("converts raw strings to clean Title Case", () => {
      expect(normalizeConceptLabel("photosynthesis")).toBe("Photosynthesis");
      expect(normalizeConceptLabel("cellular respiration")).toBe("Cellular Respiration");
      expect(normalizeConceptLabel("   **activation energy**  ")).toBe("Activation Energy");
      expect(normalizeConceptLabel("### <b>Krebs Cycle</b>")).toBe("Krebs Cycle");
    });

    it("preserves known capitalized acronyms", () => {
      expect(normalizeConceptLabel("DNA")).toBe("DNA");
      expect(normalizeConceptLabel("ATP")).toBe("ATP");
      expect(normalizeConceptLabel("RNA")).toBe("RNA");
      expect(normalizeConceptLabel("HTML")).toBe("HTML");
    });

    it("filters out stop words and single characters", () => {
      expect(normalizeConceptLabel("the")).toBeNull();
      expect(normalizeConceptLabel("what")).toBeNull();
      expect(normalizeConceptLabel("a")).toBeNull();
      expect(normalizeConceptLabel("overview")).toBeNull();
      expect(normalizeConceptLabel("definition")).toBeNull();
      expect(normalizeConceptLabel("12345")).toBeNull();
    });
  });

  describe("buildConceptGraph", () => {
    const mockFolders: Folder[] = [
      { id: "f-bio", user_id: "u-1", name: "Biology", color: "#4ade80", created_at: "2026-01-01" },
      { id: "f-chem", user_id: "u-1", name: "Chemistry", color: "#60a5fa", created_at: "2026-01-01" },
    ];

    const mockMaterials: Material[] = [
      {
        id: "m-1",
        user_id: "u-1",
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
        user_id: "u-1",
        material_id: "m-1",
        markdown_content: "## Enzymes\nEnzymes lower **activation energy** of reactions.\n- Active site: Specific binding pocket.",
        html_content: null,
        created_at: "2026-01-01",
      },
    ];

    const mockDecks: FlashcardDeck[] = [
      { id: "d-1", user_id: "u-1", folder_id: "f-bio", title: "Enzymes", created_at: "2026-01-01" },
    ];

    const mockFlashcards: Flashcard[] = [
      {
        id: "c-1",
        user_id: "u-1",
        deck_id: "d-1",
        front: "What is an active site?",
        back: "The catalytic region on an enzyme where the substrate binds.",
        next_review_date: "2026-01-10",
        srs_interval: 4,
        ease_factor: 2.6,
        created_at: "2026-01-01",
      },
      {
        id: "c-2",
        user_id: "u-1",
        deck_id: "d-1",
        front: "Explain denaturation",
        back: "Loss of native structure due to heat or pH.",
        next_review_date: null,
        srs_interval: 0,
        ease_factor: 1.8,
        created_at: "2026-01-01",
      },
    ];

    const mockQuizzes: Quiz[] = [
      {
        id: "q-1",
        user_id: "u-1",
        material_id: "m-1",
        folder_id: "f-bio",
        title: "Enzymes Check",
        questions_json: [
          {
            id: 1,
            question: "What lowers activation energy?",
            choices: ["Enzymes", "Lipids"],
            correctIndex: 0,
            topic: "Enzymes",
          },
        ],
        created_at: "2026-01-01",
      },
    ];

    const mockAttempts: QuizAttempt[] = [
      {
        id: "qa-1",
        user_id: "u-1",
        quiz_id: "q-1",
        score: 1,
        total: 1,
        answers_json: [],
        weak_topics: ["Denaturation"],
        created_at: "2026-01-01",
      },
    ];

    it("extracts concept nodes and edges from all study artifacts", () => {
      const graph = buildConceptGraph({
        folders: mockFolders,
        materials: mockMaterials,
        notes: mockNotes,
        flashcards: mockFlashcards,
        decks: mockDecks,
        quizzes: mockQuizzes,
        quizAttempts: mockAttempts,
      });

      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThan(0);

      // Verify node fields
      const enzymeNode = graph.nodes.find((n) => n.label === "Enzymes");
      expect(enzymeNode).toBeDefined();
      expect(enzymeNode?.folderName).toBe("Biology");
      expect(enzymeNode?.folderColor).toBe("#4ade80");
      expect(enzymeNode?.notesCount).toBeGreaterThan(0);
      expect(enzymeNode?.flashcardsCount).toBeGreaterThan(0);
      expect(enzymeNode?.x).toBeGreaterThan(0);
      expect(enzymeNode?.y).toBeGreaterThan(0);

      // Verify knowledge gap detection
      const denatureNode = graph.nodes.find((n) => n.label.toLowerCase().includes("denaturation"));
      if (denatureNode) {
        expect(denatureNode.isKnowledgeGap).toBe(true);
      }
    });

    it("returns sample fallback graph if input has no study materials", () => {
      const graph = buildConceptGraph({});
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThan(0);
      expect(graph.stats.totalConcepts).toBe(graph.nodes.length);
    });
  });

  describe("filterConceptGraph", () => {
    const sampleGraph = buildConceptGraph({});

    it("filters by folder ID", () => {
      const filtered = filterConceptGraph(sampleGraph, { folderId: "f-bio" });
      filtered.nodes.forEach((n) => {
        expect(n.folderId).toBe("f-bio");
      });
      // All edges must connect nodes within the filtered set
      const nodeIds = new Set(filtered.nodes.map((n) => n.id));
      filtered.edges.forEach((e) => {
        expect(nodeIds.has(e.source)).toBe(true);
        expect(nodeIds.has(e.target)).toBe(true);
      });
    });

    it("filters by knowledge gaps only", () => {
      const filtered = filterConceptGraph(sampleGraph, { knowledgeGapsOnly: true });
      filtered.nodes.forEach((n) => {
        expect(n.isKnowledgeGap).toBe(true);
      });
      expect(filtered.stats.knowledgeGapsCount).toBe(filtered.nodes.length);
    });

    it("filters by search query", () => {
      const filtered = filterConceptGraph(sampleGraph, { searchQuery: "Enzyme" });
      expect(filtered.nodes.some((n) => n.label.includes("Enzyme"))).toBe(true);
    });
  });

  describe("applyClusterLayout", () => {
    it("positions nodes inside canvas bounds", () => {
      const nodes: ConceptNode[] = [
        {
          id: "n1",
          label: "Concept 1",
          folderId: "f1",
          folderName: "F1",
          folderColor: "#ff0000",
          masteryScore: 80,
          isKnowledgeGap: false,
          notesCount: 1,
          flashcardsCount: 1,
          quizzesCount: 1,
          materialsCount: 1,
          degree: 1,
          x: 0,
          y: 0,
          radius: 20,
          noteSnippets: [],
          relatedConcepts: [],
        },
        {
          id: "n2",
          label: "Concept 2",
          folderId: "f1",
          folderName: "F1",
          folderColor: "#ff0000",
          masteryScore: 40,
          isKnowledgeGap: true,
          notesCount: 1,
          flashcardsCount: 1,
          quizzesCount: 1,
          materialsCount: 1,
          degree: 1,
          x: 0,
          y: 0,
          radius: 20,
          noteSnippets: [],
          relatedConcepts: [],
        },
      ];

      applyClusterLayout(nodes, [{ id: "f1", user_id: "u", name: "F1", color: "#ff0000", created_at: "" }]);

      nodes.forEach((node) => {
        expect(node.x).toBeGreaterThan(0);
        expect(node.x).toBeLessThan(1000);
        expect(node.y).toBeGreaterThan(0);
        expect(node.y).toBeLessThan(800);
      });
    });
  });
});
