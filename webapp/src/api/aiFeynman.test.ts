import { describe, it, expect, beforeEach, vi } from "vitest";
import { callEdge } from "./ai";
import {
  assessExplanationQuality,
  isGibberishToken,
  MAX_SCORE_GAIN_PER_TURN,
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
  type TeachingTurn,
} from "./aiFeynman";

vi.mock("./ai", () => ({ callEdge: vi.fn() }));

const mockedCallEdge = vi.mocked(callEdge);

describe("aiFeynman API & Simulation Engine", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Default: no model reachable, so these exercise the offline scorer. The
    // AI path has its own describe block below.
    mockedCallEdge.mockRejectedValue(new Error("offline"));
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

  /* Regression cover for the arena scoring anything at all.
   *
   * Reported from the live app: a student typed "sdsi" over and over, watched
   * the bar climb five points a turn, and was told "OHHH! It clicked!" at 85%.
   * The score line had a floor (`Math.max(previousScore + 5, …)`), nothing
   * checked whether the submission was an explanation, and `solvedPoints` fell
   * back to a stock concept so junk got a green tick beside it. */
  describe("Junk Submission Handling", () => {
    const draft = () =>
      generateDynamicDraft("Biology", "Photosynthesis", "curious_beginner", "intermediate");

    it("spots mashed tokens without accusing real words, acronyms or notation", () => {
      ["sdsi", "asdfgh", "qwerty", "hjkl", "aaaa", "jkjkjk", "sdfsdf"].forEach((t) => {
        expect(isGibberishToken(t), `${t} should read as mash`).toBe(true);
      });

      [
        "chlorophyll", "photosynthesis", "strengths", "through", "rhythm",
        "sphere", "schedule", "DNA", "ATP", "the", "O(n)", "n2", "spring",
      ].forEach((t) => {
        expect(isGibberishToken(t), `${t} should read as a word`).toBe(false);
      });
    });

    it("classifies keyboard mash, padding, repeats and stubs as non-teaching", async () => {
      const d = draft();
      expect(assessExplanationQuality("sdsi", d).verdict).toBe("gibberish");
      expect(assessExplanationQuality("asdf jkl qwerty zxcv", d).verdict).toBe("gibberish");
      expect(assessExplanationQuality("blah blah blah blah blah", d).verdict).toBe("gibberish");
      expect(assessExplanationQuality("... ?! 123", d).verdict).toBe("gibberish");
      expect(assessExplanationQuality("", d).verdict).toBe("empty");
      expect(assessExplanationQuality("yes it is", d).verdict).toBe("too_short");

      const real =
        "Chlorophyll reflects green light and absorbs the red and blue wavelengths.";
      expect(assessExplanationQuality(real, d).verdict).toBe("substantive");

      const turn = await evaluateTeachingExplanation(d, [], real);
      expect(assessExplanationQuality(real, d, [turn]).verdict).toBe("repeated");
    });

    it("bounces a short off-topic message but never a long own-words one", () => {
      const d = draft();

      expect(
        assessExplanationQuality("I had beans on toast for my lunch today", d).verdict,
      ).toBe("off_topic");

      /* Explaining it in your own words is the whole exercise, so a long
         answer is never rejected for using vocabulary the draft didn't. */
      const ownWords =
        "Right, so the way I picture it is that the leaf works a bit like a solar panel wired to a tiny factory. " +
        "The panel part grabs the energy it needs from daylight and uses it to split up water, which is where the gas " +
        "we breathe comes off as a by-product. That energy then gets handed over to the factory part, which builds the " +
        "sugar out of what the leaf pulls in from the air around it, and none of that bulk is coming up through the roots.";
      expect(assessExplanationQuality(ownWords, d).verdict).toBe("substantive");
    });

    it("awards nothing for a keyboard mash and says so in the apprentice's voice", async () => {
      const d = draft();
      const first = await evaluateTeachingExplanation(d, [], "sdsi");

      expect(first.understandingScore).toBe(20);
      expect(first.delta).toBe(0);
      expect(first.solvedPoints).toEqual([]);
      expect(first.quality).toBe("gibberish");
      expect(first.emotion).toBe("confused");
      expect(first.apprenticeReaction).toMatch(/can't read that/i);
      expect(first.apprenticeReaction).not.toMatch(/clicked/i);
    });

    it("never lets a run of junk carry the apprentice to a breakthrough", async () => {
      const d = draft();
      const turns: TeachingTurn[] = [];

      // The exact shape of the report: the same junk, over and over.
      for (let i = 0; i < 15; i++) {
        turns.push(await evaluateTeachingExplanation(d, turns, "sdsi"));
      }

      const last = turns[turns.length - 1];
      expect(last.understandingScore).toBe(20);
      expect(turns.every((t) => t.delta === 0)).toBe(true);
      expect(turns.every((t) => t.solvedPoints.length === 0)).toBe(true);
      expect(turns.some((t) => /clicked|concede|puzzle fall/i.test(t.apprenticeReaction))).toBe(false);
    });

    it("keeps a junk turn out of the debrief instead of marking it", async () => {
      const d = draft();
      const turns: TeachingTurn[] = [];
      for (let i = 0; i < 6; i++) {
        turns.push(await evaluateTeachingExplanation(d, turns, `sdsi ${i}`));
      }

      const debrief = await generateFeynmanDebrief(d, turns);
      expect(debrief.clarityScore).toBe(0);
      expect(debrief.precisionScore).toBe(0);
      expect(debrief.pedagogicalRating).toBe("Needs a bit more practice");
      expect(debrief.summary).toMatch(/didn't actually explain/i);
    });

    it("still rewards a real explanation", async () => {
      const d = draft();
      const turn = await evaluateTeachingExplanation(
        d,
        [],
        "Think of it like a filter: chlorophyll absorbs the red and blue wavelengths and reflects green light back at your eyes, which is why leaves look green.",
      );

      expect(turn.delta).toBeGreaterThan(0);
      expect(turn.quality).toBe("substantive");
    });

    it("caps how far one message can carry the apprentice", async () => {
      const d = draft();
      const turn = await evaluateTeachingExplanation(
        d,
        [],
        "First, imagine chlorophyll as a filter: it absorbs red and blue light and reflects green light, which is why leaves look green rather than black. Then, because plant cells need ATP in the dark too, respiration carries on continuously day and night instead of stopping. Finally the carbon in glucose comes from carbon dioxide in the air, not from the soil.",
      );

      expect(turn.delta).toBeLessThanOrEqual(MAX_SCORE_GAIN_PER_TURN);
    });
  });

  describe("Model-marked Teaching Turns", () => {
    const draft = () =>
      generateDynamicDraft("Biology", "Photosynthesis", "curious_beginner", "intermediate");

    it("uses the model's marking when it comes back usable", async () => {
      const d = draft();
      const concept = d.hiddenMisconceptions[0].concept;
      mockedCallEdge.mockResolvedValue({
        text: JSON.stringify({
          isSubstantive: true,
          understandingScore: 38,
          solvedConcepts: [concept],
          remainingConfusions: [],
          emotion: "lightbulb",
          reaction: "Oh! So the limit is what stops it running away. That makes sense.",
        }),
      });

      const turn = await evaluateTeachingExplanation(
        d,
        [],
        "Chlorophyll absorbs the red and blue wavelengths and reflects green light, which is why leaves look green.",
      );

      expect(mockedCallEdge).toHaveBeenCalledOnce();
      expect(turn.understandingScore).toBe(38);
      expect(turn.solvedPoints).toEqual([concept]);
      expect(turn.apprenticeReaction).toMatch(/that makes sense/i);
    });

    it("refuses a model verdict that rewards input it called non-substantive", async () => {
      const d = draft();
      mockedCallEdge.mockResolvedValue({
        text: JSON.stringify({
          isSubstantive: false,
          understandingScore: 95,
          solvedConcepts: d.hiddenMisconceptions.map((m) => m.concept),
          emotion: "convinced",
          reaction: "I have no idea what you mean by that, sorry.",
        }),
      });

      const turn = await evaluateTeachingExplanation(
        d,
        [],
        "Plant cells keep respiring in the dark because they still need energy at night.",
      );

      expect(turn.understandingScore).toBe(20);
      expect(turn.delta).toBe(0);
      expect(turn.solvedPoints).toEqual([]);
    });

    it("clamps a model that tries to hand out the whole session in one turn", async () => {
      const d = draft();
      mockedCallEdge.mockResolvedValue({
        text: JSON.stringify({
          isSubstantive: true,
          understandingScore: 100,
          solvedConcepts: ["Some Concept That Is Not In The Draft"],
          emotion: "convinced",
          reaction: "Completely clear now!",
        }),
      });

      const turn = await evaluateTeachingExplanation(
        d,
        [],
        "The carbon in a plant's dry mass comes from carbon dioxide in the air, not from minerals in the soil.",
      );

      expect(turn.understandingScore).toBe(20 + MAX_SCORE_GAIN_PER_TURN);
      // A concept the draft never listed cannot be ticked off.
      expect(turn.solvedPoints).toEqual([]);
    });

    it("falls back to the offline scorer when the model is unreachable", async () => {
      const d = draft();
      mockedCallEdge.mockRejectedValue(new Error("network down"));

      const turn = await evaluateTeachingExplanation(
        d,
        [],
        "Think of it like a filter: chlorophyll absorbs red and blue light and reflects green light straight back at you.",
      );

      expect(turn.delta).toBeGreaterThan(0);
      expect(turn.apprenticeReaction.length).toBeGreaterThan(10);
    });

    it("does not spend a model call on obvious junk", async () => {
      mockedCallEdge.mockResolvedValue({ text: "{}" });
      await evaluateTeachingExplanation(draft(), [], "asdf jkl qwerty");
      expect(mockedCallEdge).not.toHaveBeenCalled();
    });
  });
});
