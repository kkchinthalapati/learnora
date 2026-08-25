import { describe, expect, it } from "vitest";
import {
  normalizeConceptLabel,
  buildConceptGraph,
  filterConceptGraph,
  generateSampleGraph,
  applyClusterLayout,
  getPrerequisites,
  getDependents,
  getPrerequisiteHierarchy,
  generateRecoveryDrill,
  type ConceptNode,
} from "./conceptGraph";
import type { Folder, Material, Note, Flashcard, FlashcardDeck, Quiz, QuizAttempt, Exam } from "../api/types";

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
        markdown_content: `## Enzymes
Prerequisites: Activation Energy, Catalysts
Enzymes lower **activation energy** of reactions.
- Active site: Specific binding pocket.
Active Site is a component of Enzymes.
Denaturation depends on Active Site.`,
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
        next_review_date: "2026-09-10",
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
        next_review_date: "2026-01-01", // Overdue
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

    const mockExams: Exam[] = [
      {
        id: 1,
        user_id: "u-1",
        exam_name: "Biology Midterm",
        exam_date: "2026-08-28", // In 2 days
        difficulty: "hard",
        status: "upcoming",
      },
    ];

    it("extracts concept nodes, prerequisites, and edges from study artifacts", () => {
      const graph = buildConceptGraph({
        folders: mockFolders,
        materials: mockMaterials,
        notes: mockNotes,
        flashcards: mockFlashcards,
        decks: mockDecks,
        quizzes: mockQuizzes,
        quizAttempts: mockAttempts,
        exams: mockExams,
        now: new Date("2026-08-26T00:00:00Z"),
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

      // Verify prerequisite detection: "Enzymes" depends on "Activation Energy" and "Catalysts"
      const activationEnergyNode = graph.nodes.find((n) => n.label === "Activation Energy");
      expect(activationEnergyNode).toBeDefined();
      expect(enzymeNode?.prerequisites).toContain(activationEnergyNode?.id);

      // Verify "Denaturation" depends on "Active Site"
      const denatureNode = graph.nodes.find((n) => n.label.toLowerCase().includes("denaturation"));
      const activeSiteNode = graph.nodes.find((n) => n.label === "Active Site");
      expect(denatureNode).toBeDefined();
      expect(activeSiteNode).toBeDefined();
      expect(denatureNode?.prerequisites).toContain(activeSiteNode?.id);

      // Verify knowledge gap detection and multi-factor scoring
      expect(denatureNode?.isKnowledgeGap).toBe(true);
      expect(denatureNode?.gapScore).toBeGreaterThan(50);
      expect(denatureNode?.gapDetails).toBeDefined();
      expect(denatureNode?.gapDetails?.overdueCardsCount).toBeGreaterThan(0);
      expect(denatureNode?.gapDetails?.examProximityDays).toBeLessThanOrEqual(3);
      expect(denatureNode?.gapDetails?.urgency).toBe("critical");
    });

    it("returns an empty graph (not the demo) for an account with no study data", () => {
      const graph = buildConceptGraph({});
      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
      expect(graph.stats.totalConcepts).toBe(0);
      expect(graph.stats.averageMastery).toBe(0);
    });

    it("does not flag note-only concepts as knowledge gaps — no evidence is not low mastery", () => {
      const graph = buildConceptGraph({
        folders: mockFolders,
        materials: mockMaterials,
        notes: mockNotes,
      });
      expect(graph.nodes.length).toBeGreaterThan(0);
      graph.nodes.forEach((node) => {
        expect(node.isKnowledgeGap).toBe(false);
      });
    });

    it("mints distinct ids for keys that collapse to the same slug", () => {
      const graph = buildConceptGraph({
        notes: [
          {
            id: "n-a",
            user_id: "u-1",
            material_id: null,
            markdown_content: "## Atp energy\n- Atp-energy: a distinct term",
            html_content: null,
            created_at: "2026-01-01",
          },
        ],
      });
      const ids = graph.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeGreaterThanOrEqual(2);
    });

    it("correctly calculates multi-factor knowledge gap scores with imminent exams and overdue cards", () => {
      const graph = buildConceptGraph({
        folders: mockFolders,
        flashcards: [
          {
            id: "c-urgent",
            user_id: "u-1",
            deck_id: null,
            front: "Define Osmosis",
            back: "Diffusion of water across a semipermeable membrane",
            next_review_date: "2026-08-20", // overdue
            srs_interval: 0,
            ease_factor: 1.5,
            created_at: "2026-01-01",
          },
        ],
        quizzes: [
          {
            id: "q-urgent",
            user_id: "u-1",
            material_id: null,
            folder_id: "f-bio",
            title: "Osmosis Quiz",
            questions_json: [{ id: 1, question: "What is Osmosis?", topic: "Osmosis" }],
            created_at: "2026-01-01",
          },
        ],
        quizAttempts: [
          {
            id: "qa-urgent",
            user_id: "u-1",
            quiz_id: "q-urgent",
            score: 1,
            total: 5,
            answers_json: [],
            weak_topics: ["Osmosis"],
            created_at: "2026-01-01",
          },
        ],
        exams: mockExams,
        now: new Date("2026-08-26T00:00:00Z"),
      });

      const osmosisNode = graph.nodes.find((n) => n.label === "Osmosis");
      expect(osmosisNode).toBeDefined();
      expect(osmosisNode?.isKnowledgeGap).toBe(true);
      expect(osmosisNode?.gapScore).toBeGreaterThanOrEqual(60);
      expect(osmosisNode?.gapDetails?.urgency).toBe("critical");
      expect(osmosisNode?.gapDetails?.remediationReasons.length).toBeGreaterThan(0);
    });
  });

  describe("prerequisite helpers & hierarchy", () => {
    const sampleGraph = generateSampleGraph();

    it("resolves prerequisites for a concept correctly", () => {
      const prereqs = getPrerequisites("concept-enzymes", sampleGraph);
      expect(prereqs.some((p) => p.id === "concept-activation-energy")).toBe(true);
    });

    it("resolves dependents for a concept correctly", () => {
      const dependents = getDependents("concept-enzymes", sampleGraph);
      expect(dependents.some((d) => d.id === "concept-denaturation")).toBe(true);
    });

    it("resolves full prerequisite and component hierarchy", () => {
      const hierarchy = getPrerequisiteHierarchy("concept-enzymes", sampleGraph);
      expect(hierarchy.prerequisites.length).toBeGreaterThan(0);
      expect(hierarchy.dependents.length).toBeGreaterThan(0);
      expect(hierarchy.components.length).toBeGreaterThan(0);
    });
  });

  describe("generateRecoveryDrill", () => {
    const sampleGraph = generateSampleGraph();
    const gapNode = sampleGraph.nodes.find((n) => n.isKnowledgeGap)!;

    it("generates structured 5-minute recovery drill with questions and summary", () => {
      const drill = generateRecoveryDrill(gapNode, sampleGraph.nodes);
      expect(drill.conceptId).toBe(gapNode.id);
      expect(drill.conceptLabel).toBe(gapNode.label);
      expect(drill.estimatedMinutes).toBe(5);
      expect(drill.summaryTakeaway).toBeTruthy();
      expect(drill.highYieldQuestions.length).toBeGreaterThanOrEqual(3);
      expect(drill.highYieldQuestions[0].options.length).toBe(4);
      expect(drill.highYieldQuestions[0].explanation).toBeTruthy();
    });
  });

  describe("filterConceptGraph", () => {
    const sampleGraph = generateSampleGraph();

    it("filters by folder ID", () => {
      const filtered = filterConceptGraph(sampleGraph, { folderId: "f-bio" });
      filtered.nodes.forEach((n) => {
        expect(n.folderId).toBe("f-bio");
      });
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

    it("filters by prerequisites only", () => {
      const filtered = filterConceptGraph(sampleGraph, { prerequisitesOnly: true });
      expect(filtered.edges.every((e) => e.relationship === "depends_on" || e.relationship === "part_of")).toBe(true);
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
          prerequisites: [],
          dependents: [],
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
          prerequisites: [],
          dependents: [],
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
