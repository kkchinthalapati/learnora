import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { SocraticSparringView } from "./SocraticSparringView";
import * as aiSparringModule from "../../api/aiSparring";

// Mock Speech Synthesis
const mockSpeak = vi.fn();
const mockCancel = vi.fn();
vi.mock("../../hooks/useSpeechSynthesis", () => ({
  useSpeechSynthesis: () => ({
    speak: mockSpeak,
    cancel: mockCancel,
    pause: vi.fn(),
    resume: vi.fn(),
    isSpeaking: false,
    isPaused: false,
    isSupported: true,
    currentSpeaker: null,
    voices: [],
  }),
}));

// Mock Speech Recognition with controllable state
let mockIsListening = false;
let mockTranscript = "";
let mockInterimTranscript = "";
const mockStartListening = vi.fn(() => {
  mockIsListening = true;
});
const mockStopListening = vi.fn(() => {
  mockIsListening = false;
});
const mockResetTranscript = vi.fn(() => {
  mockTranscript = "";
  mockInterimTranscript = "";
});

vi.mock("../../hooks/useSpeechRecognition", () => ({
  useSpeechRecognition: (options?: { onFinalTranscript?: (t: string) => void }) => ({
    isListening: mockIsListening,
    transcript: mockTranscript,
    interimTranscript: mockInterimTranscript,
    isSupported: true,
    error: null,
    startListening: () => {
      mockStartListening();
      if (options?.onFinalTranscript && mockTranscript) {
        options.onFinalTranscript(mockTranscript);
      }
    },
    stopListening: mockStopListening,
    resetTranscript: mockResetTranscript,
    setTranscript: vi.fn(),
  }),
}));

describe("SocraticSparringView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsListening = false;
    mockTranscript = "";
    mockInterimTranscript = "";
  });

  it("renders topic selection screen with starter topics", () => {
    renderWithAuth(<SocraticSparringView />, { session: fakeSession() }, { withRouter: true });

    expect(screen.getByRole("heading", { name: "Socratic Audio Sparring" })).toBeInTheDocument();
    expect(screen.getByText("Choose a sparring topic")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. Newton's Third Law/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Newton's Third Law & Momentum/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter Sparring Arena" })).toBeInTheDocument();
  });

  it("starts sparring session when selecting a starter topic and renders stage & dialogue stream", async () => {
    const user = userEvent.setup();

    vi.spyOn(aiSparringModule, "startSparringSession").mockResolvedValueOnce({
      id: "sess-100",
      topic: "Newton's Third Law & Momentum",
      status: "active",
      currentRound: 1,
      dialogue: [
        {
          id: "entry-1",
          speaker: "alex",
          name: "Alex",
          avatar: "🌱",
          content: "Why don't action-reaction pairs cancel each other out?",
          timestamp: "12:00",
        },
      ],
      currentChallenge: {
        id: "c-1",
        roundNumber: 1,
        speaker: "alex",
        personaName: "Alex",
        personaAvatar: "🌱",
        speechText: "Why don't action-reaction pairs cancel each other out?",
        conceptAnchor: "Action-Reaction Pairs",
        suggestedHints: ["Forces act on different objects"],
      },
      cumulativeScores: { clarity: 0, rigour: 0, accuracy: 0, roundsCount: 0 },
      createdAt: new Date().toISOString(),
    });

    renderWithAuth(<SocraticSparringView />, { session: fakeSession() }, { withRouter: true });

    // Click starter topic
    await user.click(screen.getByRole("button", { name: /Newton's Third Law & Momentum/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Socratic Sparring Stage")).toBeInTheDocument();
    });

    // Check Alex and Jordan pods
    expect(screen.getByTestId("alex-pod")).toBeInTheDocument();
    expect(screen.getByTestId("jordan-pod")).toBeInTheDocument();

    // Check opening dialogue stream
    expect(
      screen.getByText("Why don't action-reaction pairs cancel each other out?"),
    ).toBeInTheDocument();

    // Verify speech synthesis played Alex's prompt
    expect(mockSpeak).toHaveBeenCalledWith(
      "Why don't action-reaction pairs cancel each other out?",
      expect.objectContaining({ persona: "alex" }),
    );
  });

  it("toggles microphone recording on push to speak button click", async () => {
    const user = userEvent.setup();

    vi.spyOn(aiSparringModule, "startSparringSession").mockResolvedValueOnce({
      id: "sess-101",
      topic: "Kinematics",
      status: "active",
      currentRound: 1,
      dialogue: [
        {
          id: "entry-1",
          speaker: "alex",
          name: "Alex",
          avatar: "🌱",
          content: "Can speed increase with negative acceleration?",
          timestamp: "12:00",
        },
      ],
      currentChallenge: {
        id: "c-1",
        roundNumber: 1,
        speaker: "alex",
        personaName: "Alex",
        personaAvatar: "🌱",
        speechText: "Can speed increase with negative acceleration?",
        conceptAnchor: "Kinematics",
      },
      cumulativeScores: { clarity: 0, rigour: 0, accuracy: 0, roundsCount: 0 },
      createdAt: new Date().toISOString(),
    });

    renderWithAuth(<SocraticSparringView />, { session: fakeSession() }, { withRouter: true });

    const input = screen.getByPlaceholderText(/e\.g\. Newton's Third Law/i);
    await user.type(input, "Kinematics");
    await user.click(screen.getByRole("button", { name: "Enter Sparring Arena" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start speaking response" })).toBeInTheDocument();
    });

    // Click mic button to start listening
    await user.click(screen.getByRole("button", { name: "Start speaking response" }));
    expect(mockStartListening).toHaveBeenCalledTimes(1);
  });

  it("submits answer via keyboard input and updates score metrics", async () => {
    const user = userEvent.setup();

    const initialSession: aiSparringModule.SparringSession = {
      id: "sess-102",
      topic: "Cellular Respiration",
      status: "active",
      currentRound: 1,
      dialogue: [
        {
          id: "entry-1",
          speaker: "jordan",
          name: "Jordan",
          avatar: "⚡",
          content: "Why is glycolysis anaerobic while the citric acid cycle requires oxygen?",
          timestamp: "12:00",
        },
      ],
      currentChallenge: {
        id: "c-1",
        roundNumber: 1,
        speaker: "jordan",
        personaName: "Jordan",
        personaAvatar: "⚡",
        speechText: "Why is glycolysis anaerobic while the citric acid cycle requires oxygen?",
        conceptAnchor: "Cellular Respiration Pathways",
        suggestedHints: ["Mitochondrial electron transport chain"],
      },
      cumulativeScores: { clarity: 0, rigour: 0, accuracy: 0, roundsCount: 0 },
      createdAt: new Date().toISOString(),
    };

    vi.spyOn(aiSparringModule, "startSparringSession").mockResolvedValueOnce(initialSession);

    const updatedSession: aiSparringModule.SparringSession = {
      ...initialSession,
      currentRound: 2,
      dialogue: [
        ...initialSession.dialogue,
        {
          id: "entry-student",
          speaker: "student",
          name: "You",
          avatar: "🎓",
          content: "Glycolysis happens in the cytoplasm and does not need the electron transport chain!",
          timestamp: "12:01",
          feedback: {
            clarityScore: 90,
            rigourScore: 85,
            accuracyScore: 92,
            overallScore: 89,
            reactionTone: "enthusiastic",
            shortCritique: "Spot-on location and ETC dependency!",
            keyConceptsMastered: ["Cytoplasm vs Mitochondria"],
            missingPoints: [],
          },
        },
        {
          id: "entry-alex",
          speaker: "alex",
          name: "Alex",
          avatar: "🌱",
          content: "Oh! So what happens to the pyruvate if there is no oxygen?",
          timestamp: "12:01",
        },
      ],
      cumulativeScores: { clarity: 90, rigour: 85, accuracy: 92, roundsCount: 1 },
    };

    vi.spyOn(aiSparringModule, "submitStudentAnswer").mockResolvedValueOnce({
      session: updatedSession,
      feedback: {
        clarityScore: 90,
        rigourScore: 85,
        accuracyScore: 92,
        overallScore: 89,
        reactionTone: "enthusiastic",
        shortCritique: "Spot-on location and ETC dependency!",
        keyConceptsMastered: ["Cytoplasm vs Mitochondria"],
        missingPoints: [],
      },
      nextRound: {
        id: "c-2",
        roundNumber: 2,
        speaker: "alex",
        personaName: "Alex",
        personaAvatar: "🌱",
        speechText: "Oh! So what happens to the pyruvate if there is no oxygen?",
        conceptAnchor: "Fermentation",
      },
    });

    renderWithAuth(<SocraticSparringView />, { session: fakeSession() }, { withRouter: true });

    const input = screen.getByPlaceholderText(/e\.g\. Newton's Third Law/i);
    await user.type(input, "Cellular Respiration");
    await user.click(screen.getByRole("button", { name: "Enter Sparring Arena" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Type response")).toBeInTheDocument();
    });

    const answerInput = screen.getByLabelText("Type response");
    await user.type(
      answerInput,
      "Glycolysis happens in the cytoplasm and does not need the electron transport chain!",
    );
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(screen.getByText("Spot-on location and ETC dependency!")).toBeInTheDocument();
    });

    // Check celebration metrics grid
    expect(screen.getAllByText("90%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("85%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Argument Rigour")).toBeInTheDocument();
    expect(screen.getByText("Oh! So what happens to the pyruvate if there is no oxygen?")).toBeInTheDocument();
  });
});
