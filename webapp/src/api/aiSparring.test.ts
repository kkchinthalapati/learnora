import { beforeEach, describe, expect, it, vi } from "vitest";
import { callEdge } from "./ai";
import {
  startSparringSession,
  submitStudentAnswer,
  generateNextSparringRound,
  SPARRING_PERSONAS,
  type SparringSession,
} from "./aiSparring";

vi.mock("./ai", () => ({ callEdge: vi.fn() }));

const mockedCallEdge = vi.mocked(callEdge);

describe("aiSparring API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("startSparringSession", () => {
    it("initializes a session with edge function structured response", async () => {
      mockedCallEdge.mockResolvedValueOnce({
        text: JSON.stringify({
          speaker: "alex",
          speechText:
            "If every action has an equal and opposite reaction, why doesn't everything cancel out?",
          conceptAnchor: "Newton's Third Law & Forces",
          suggestedHints: [
            "Forces act on different objects",
            "Draw a free-body diagram",
          ],
        }),
      });

      const session = await startSparringSession(
        "Newton's Laws",
        "Action-reaction pairs act on different bodies.",
      );

      expect(session.topic).toBe("Newton's Laws");
      expect(session.currentRound).toBe(1);
      expect(session.dialogue).toHaveLength(1);
      expect(session.dialogue[0].speaker).toBe("alex");
      expect(session.dialogue[0].name).toBe("Alex");
      expect(session.currentChallenge.speaker).toBe("alex");
      expect(session.currentChallenge.speechText).toContain(
        "equal and opposite reaction",
      );
      expect(session.currentChallenge.citations).toBeDefined();
      expect(session.currentChallenge.citations?.length).toBeGreaterThan(0);
      expect(mockedCallEdge).toHaveBeenCalledTimes(1);
    });

    it("falls back gracefully to offline generator when callEdge throws", async () => {
      mockedCallEdge.mockRejectedValueOnce(
        new Error("Network connection lost"),
      );

      const session = await startSparringSession(
        "Photosynthesis vs Respiration",
        "Plants perform both processes.",
      );

      expect(session.topic).toBe("Photosynthesis vs Respiration");
      expect(session.currentRound).toBe(1);
      expect(session.dialogue).toHaveLength(1);
      expect(["alex", "jordan"]).toContain(session.dialogue[0].speaker);
      expect(session.currentChallenge.speechText.length).toBeGreaterThan(10);
      expect(session.status).toBe("active");
    });

    it("aims the opening round with the student's measured performance", async () => {
      mockedCallEdge.mockResolvedValueOnce({
        text: JSON.stringify({
          speaker: "jordan",
          speechText: "Walk me through why the light reaction needs water.",
          conceptAnchor: "Photosynthesis",
          suggestedHints: ["Think about the electron source"],
        }),
      });

      const session = await startSparringSession(
        "Biology",
        "Notes about plants.",
        undefined,
        "PERFORMANCE EVIDENCE:\n  · Photosynthesis: 31% (4/13 correct)",
      );

      const prompt = mockedCallEdge.mock.calls[0][0].history[0].content;
      expect(prompt).toContain("Photosynthesis: 31%");
      // Evidence steers where it probes; it is not read out to the student.
      expect(prompt).toMatch(
        /do not (?:tell the student their scores|quote a percentage)/i,
      );
      // Carried on the session so later rounds are aimed the same way.
      expect(session.performanceEvidence).toContain("Photosynthesis: 31%");
    });

    it("omits the evidence section entirely when there is none to pass", async () => {
      mockedCallEdge.mockResolvedValueOnce({
        text: JSON.stringify({
          speaker: "alex",
          speechText: "Why does that hold?",
          conceptAnchor: "Topic",
        }),
      });

      await startSparringSession("Biology", "Notes about plants.");

      const prompt = mockedCallEdge.mock.calls[0][0].history[0].content;
      expect(prompt).not.toContain("PERFORMANCE EVIDENCE");
      expect(prompt).not.toContain("NEVER TESTED");
    });
  });

  describe("submitStudentAnswer", () => {
    it("evaluates student answer and generates Jordan's counter-challenge", async () => {
      mockedCallEdge.mockResolvedValueOnce({
        text: JSON.stringify({
          clarityScore: 88,
          rigourScore: 82,
          accuracyScore: 90,
          reactionTone: "enthusiastic",
          shortCritique:
            "Great distinction between internal and external forces.",
          keyConceptsMastered: [
            "Equal and opposite reaction",
            "System boundaries",
          ],
          missingPoints: [],
          nextSpeaker: "jordan",
          nextSpeechText:
            "Fine, but what happens when you consider non-inertial frames of reference?",
          nextConceptAnchor: "Inertial Frames",
          suggestedHints: ["Recall fictitious forces"],
        }),
      });

      const initialSession: SparringSession = {
        id: "test-session-1",
        topic: "Newton's Third Law",
        status: "active",
        currentRound: 1,
        dialogue: [
          {
            id: "d1",
            speaker: "alex",
            name: "Alex",
            avatar: "🌱",
            content: "Why doesn't everything cancel out?",
            timestamp: "10:00",
          },
        ],
        currentChallenge: {
          id: "c1",
          roundNumber: 1,
          speaker: "alex",
          personaName: "Alex",
          personaAvatar: "🌱",
          speechText: "Why doesn't everything cancel out?",
          conceptAnchor: "Newton's 3rd Law",
        },
        cumulativeScores: {
          clarity: 0,
          rigour: 0,
          accuracy: 0,
          roundsCount: 0,
        },
        createdAt: new Date().toISOString(),
      };

      const result = await submitStudentAnswer(
        initialSession,
        "Because the forces act on two completely different objects, not on the same body!",
      );

      expect(result.feedback.clarityScore).toBe(88);
      expect(result.feedback.rigourScore).toBe(82);
      expect(result.feedback.reactionTone).toBe("enthusiastic");
      expect(result.nextRound.speaker).toBe("jordan");
      expect(result.nextRound.personaName).toBe("Jordan");
      expect(result.nextRound.personaAvatar).toBe("⚡");
      expect(result.session.currentRound).toBe(2);
      expect(result.session.dialogue).toHaveLength(3); // Initial Alex + Student + Next Jordan
      expect(result.session.cumulativeScores.roundsCount).toBe(1);
      expect(result.session.cumulativeScores.clarity).toBe(88);
    });

    it("evaluates student answer locally when offline or callEdge fails", async () => {
      mockedCallEdge.mockRejectedValueOnce(new Error("Edge failure"));

      const initialSession: SparringSession = {
        id: "test-session-2",
        topic: "Kinematics",
        status: "active",
        currentRound: 1,
        dialogue: [],
        currentChallenge: {
          id: "c2",
          roundNumber: 1,
          speaker: "alex",
          personaName: "Alex",
          personaAvatar: "🌱",
          speechText: "Can acceleration be negative while speed is increasing?",
          conceptAnchor: "Velocity & Acceleration Vectors",
        },
        cumulativeScores: {
          clarity: 0,
          rigour: 0,
          accuracy: 0,
          roundsCount: 0,
        },
        createdAt: new Date().toISOString(),
      };

      const result = await submitStudentAnswer(
        initialSession,
        "Yes, because if an object travels in the negative direction, negative acceleration increases speed!",
      );

      expect(result.feedback.clarityScore).toBeGreaterThanOrEqual(60);
      expect(result.feedback.reactionTone).toBeDefined();
      expect(result.nextRound.speaker).toBe("jordan");
      expect(result.session.dialogue).toHaveLength(2); // Student + Jordan
    });
  });

  describe("generateNextSparringRound", () => {
    it("alternates speaker from Alex to Jordan", async () => {
      mockedCallEdge.mockResolvedValueOnce({
        text: JSON.stringify({
          speechText: "What if friction is non-negligible?",
          conceptAnchor: "Friction & Dissipation",
          suggestedHints: ["Consider thermodynamic energy loss"],
        }),
      });

      const session: SparringSession = {
        id: "sess-3",
        topic: "Mechanics",
        status: "active",
        currentRound: 1,
        dialogue: [],
        currentChallenge: {
          id: "c-alex",
          roundNumber: 1,
          speaker: "alex",
          personaName: "Alex",
          personaAvatar: "🌱",
          speechText: "Alex question",
          conceptAnchor: "Mechanics",
        },
        cumulativeScores: {
          clarity: 80,
          rigour: 80,
          accuracy: 80,
          roundsCount: 1,
        },
        createdAt: new Date().toISOString(),
      };

      const next = await generateNextSparringRound(session);
      expect(next.speaker).toBe("jordan");
      expect(next.personaName).toBe(SPARRING_PERSONAS.jordan.name);
      expect(next.speechText).toBe("What if friction is non-negligible?");
    });
  });
});
