import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateApprenticeDraft,
  evaluateTeachingExplanation,
  generateFeynmanDebrief,
  listFeynmanSessions,
  loadFeynmanSession,
  saveFeynmanSession,
  deleteFeynmanSession,
  clearFeynmanSessions,
  getActiveFeynmanSessionId,
  setActiveFeynmanSessionId,
  PERSONA_PROFILES,
  generateDynamicDraft,
  type FeynmanSessionState,
} from "./aiFeynman";

describe("aiFeynman API & Simulation Engine", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("Persona Profiles", () => {
    it("provides complete metadata for all three apprentice personas", () => {
      expect(PERSONA_PROFILES.curious_beginner).toBeDefined();
      expect(PERSONA_PROFILES.overconfident_peer).toBeDefined();
      expect(PERSONA_PROFILES.struggling_student).toBeDefined();

      expect(PERSONA_PROFILES.curious_beginner.shortName).toBe("Alex");
      expect(PERSONA_PROFILES.overconfident_peer.shortName).toBe("Jordan");
      expect(PERSONA_PROFILES.struggling_student.shortName).toBe("Taylor");
    });
  });

  describe("Draft Generation", () => {
    it("generates curated drafts for known topics", async () => {
      const draft = await generateApprenticeDraft(
        "Biology",
        "Photosynthesis",
        "curious_beginner",
        "intermediate"
      );

      expect(draft).toBeDefined();
      expect(draft.subject).toBe("Biology");
      expect(draft.topic).toBe("Photosynthesis");
      expect(draft.persona).toBe("curious_beginner");
      expect(draft.draftText.length).toBeGreaterThan(20);
      expect(draft.hiddenMisconceptions.length).toBeGreaterThan(0);
      expect(draft.challengeQuestion).toBeTruthy();
    });

    it("generates dynamic procedural drafts for custom arbitrary topics", async () => {
      const draft = generateDynamicDraft(
        "Computer Science",
        "Dijkstra Algorithm",
        "overconfident_peer",
        "advanced"
      );

      expect(draft).toBeDefined();
      expect(draft.subject).toBe("Computer Science");
      expect(draft.topic).toBe("Dijkstra Algorithm");
      expect(draft.hiddenMisconceptions.length).toBeGreaterThan(0);
      expect(draft.draftText).toContain("Dijkstra Algorithm");
    });
  });

  describe("Teaching Explanation Evaluation", () => {
    it("evaluates student explanation and calculates understanding score delta", async () => {
      const draft = generateDynamicDraft(
        "Biology",
        "Photosynthesis",
        "curious_beginner",
        "intermediate"
      );

      const turn = await evaluateTeachingExplanation(
        draft,
        [],
        "Chlorophyll actually absorbs blue and red light, and reflects green light, which is why leaves appear green like a mirror bouncing that color off!"
      );

      expect(turn).toBeDefined();
      expect(turn.understandingScore).toBeGreaterThan(20);
      expect(turn.delta).toBeGreaterThan(0);
      expect(turn.apprenticeReaction.length).toBeGreaterThan(10);
      expect(["confused", "skeptical", "lightbulb", "convinced"]).toContain(
        turn.emotion
      );
    });

    it("handles multi-turn progressive understanding", async () => {
      const draft = generateDynamicDraft(
        "Physics",
        "Quantum Entanglement",
        "overconfident_peer",
        "advanced"
      );

      const turn1 = await evaluateTeachingExplanation(
        draft,
        [],
        "You cannot use it for FTL communication because measurement results are random."
      );

      const turn2 = await evaluateTeachingExplanation(
        draft,
        [turn1],
        "First, Bell's theorem proves no local hidden variables exist. Second, Alice and Bob only see random noise unless they compare measurements with classical light-speed signals."
      );

      expect(turn2.understandingScore).toBeGreaterThan(turn1.understandingScore);
      expect(turn2.delta).toBeGreaterThan(0);
    });
  });

  describe("Feynman Debrief Generation", () => {
    it("generates comprehensive debrief report with clarity scores and flashcards", async () => {
      const draft = generateDynamicDraft(
        "Biology",
        "Photosynthesis",
        "curious_beginner",
        "intermediate"
      );

      const turn1 = await evaluateTeachingExplanation(
        draft,
        [],
        "Chlorophyll reflects green light and absorbs red and blue light to power photosynthesis."
      );

      const debrief = await generateFeynmanDebrief(draft, [turn1]);

      expect(debrief).toBeDefined();
      expect(debrief.overallMastery).toBeGreaterThanOrEqual(0);
      expect(debrief.clarityScore).toBeGreaterThanOrEqual(0);
      expect(debrief.precisionScore).toBeGreaterThanOrEqual(0);
      expect(debrief.conceptsMastered.length).toBeGreaterThan(0);
      expect(debrief.generatedFlashcards.length).toBeGreaterThan(0);
      expect(debrief.generatedFlashcards[0].front).toBeTruthy();
      expect(debrief.generatedFlashcards[0].back).toBeTruthy();
    });
  });

  describe("Session LocalStorage Persistence", () => {
    it("saves, lists, loads, and deletes sessions accurately", () => {
      expect(listFeynmanSessions()).toEqual([]);

      const mockDraft = generateDynamicDraft(
        "Chemistry",
        "Thermodynamics",
        "struggling_student"
      );

      const session: FeynmanSessionState = {
        id: "feynman-sess-1",
        subject: "Chemistry",
        topic: "Thermodynamics",
        persona: "struggling_student",
        difficulty: "intermediate",
        draft: mockDraft,
        turns: [],
        currentScore: 25,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      saveFeynmanSession(session);
      const list = listFeynmanSessions();
      expect(list.length).toBe(1);
      expect(list[0].id).toBe("feynman-sess-1");

      const loaded = loadFeynmanSession("feynman-sess-1");
      expect(loaded).toBeDefined();
      expect(loaded?.topic).toBe("Thermodynamics");

      setActiveFeynmanSessionId("feynman-sess-1");
      expect(getActiveFeynmanSessionId()).toBe("feynman-sess-1");

      deleteFeynmanSession("feynman-sess-1");
      expect(listFeynmanSessions()).toEqual([]);
      expect(getActiveFeynmanSessionId()).toBeNull();
    });

    it("clears all sessions when requested", () => {
      const mockDraft = generateDynamicDraft("Math", "Linear Algebra", "curious_beginner");
      const session: FeynmanSessionState = {
        id: "sess-2",
        subject: "Math",
        topic: "Linear Algebra",
        persona: "curious_beginner",
        difficulty: "beginner",
        draft: mockDraft,
        turns: [],
        currentScore: 30,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      saveFeynmanSession(session);
      expect(listFeynmanSessions().length).toBe(1);

      clearFeynmanSessions();
      expect(listFeynmanSessions()).toEqual([]);
    });
  });
});
