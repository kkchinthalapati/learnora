import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import { FeynmanDebriefView } from "./FeynmanDebriefView";
import {
  saveFeynmanSession,
  clearFeynmanSessions,
  setActiveFeynmanSessionId,
  type FeynmanSessionState,
} from "../../api/aiFeynman";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ sessionId: "test-debrief-sess-1" }),
  };
});

describe("FeynmanDebriefView Component", () => {
  const sampleCompletedSession: FeynmanSessionState = {
    id: "test-debrief-sess-1",
    subject: "Biology",
    topic: "Photosynthesis",
    persona: "curious_beginner",
    difficulty: "intermediate",
    draft: {
      id: "draft-1",
      subject: "Biology",
      topic: "Photosynthesis",
      persona: "curious_beginner",
      difficulty: "intermediate",
      draftText: "Leaves are green.",
      hiddenMisconceptions: [
        {
          id: "m-1",
          snippet: "absorbs green",
          concept: "Light Absorption",
          explanation: "Reflects green and absorbs red/blue.",
          misconception: "Green absorption",
          correctedSnippet: "reflects green",
          hint: "Think about reflection",
        },
      ],
      challengeQuestion: "Why leaves are green?",
      learningObjectives: ["Light physics"],
    },
    turns: [
      {
        id: "t-1",
        userExplanation: "Chlorophyll absorbs red and blue light, reflecting green.",
        apprenticeReaction: "Oh I see!",
        understandingScore: 88,
        delta: 25,
        confusionPoints: [],
        solvedPoints: ["Light Absorption"],
        emotion: "convinced",
        timestamp: new Date().toISOString(),
      },
    ],
    currentScore: 88,
    status: "completed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    debriefReport: {
      overallMastery: 92,
      clarityScore: 90,
      precisionScore: 94,
      pedagogicalRating: "Master Teacher",
      summary: "You guided Alex smoothly through light absorption.",
      conceptsMastered: ["Light Absorption: Reflects green light and absorbs blue/red light."],
      remainingGaps: [],
      strengths: ["Effective use of intuitive analogies", "Clear cause-and-effect structure"],
      improvementAreas: ["Continue practicing with edge cases"],
      generatedFlashcards: [
        {
          front: 'In Photosynthesis, what is the misconception regarding "absorbs green"?',
          back: "Reflects green and absorbs red/blue.\n\nAccurate understanding: reflects green",
          rationale: "Targeted review card.",
          concept: "Light Absorption",
        },
      ],
    },
  };

  beforeEach(() => {
    clearFeynmanSessions();
    vi.clearAllMocks();
    mockNavigate.mockReset();
    saveFeynmanSession(sampleCompletedSession);
    setActiveFeynmanSessionId(sampleCompletedSession.id);
  });

  it("renders mastery overview score, rating badge, clarity and precision ratings", () => {
    renderWithProviders(<FeynmanDebriefView />, undefined, { withRouter: true });

    expect(screen.getByTestId("mastery-overview-card")).toBeInTheDocument();
    expect(screen.getByTestId("overall-mastery-score")).toHaveTextContent("92");
    expect(screen.getByTestId("pedagogical-rating-badge")).toHaveTextContent("Master Teacher");
    expect(screen.getByTestId("clarity-score")).toHaveTextContent("90%");
    expect(screen.getByTestId("precision-score")).toHaveTextContent("94%");
  });

  it("renders concepts mastered, strengths, and flashcards preview", () => {
    renderWithProviders(<FeynmanDebriefView />, undefined, { withRouter: true });

    expect(screen.getByTestId("concept-mastered-item")).toHaveTextContent("Light Absorption");
    expect(screen.getByText("Pedagogical Strengths")).toBeInTheDocument();
    expect(screen.getByTestId("flashcards-export-section")).toBeInTheDocument();
    expect(screen.getByTestId("flashcard-preview-item")).toBeInTheDocument();
  });

  it("exports generated flashcards to library on click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeynmanDebriefView />, undefined, { withRouter: true });

    const exportBtn = screen.getByTestId("export-flashcards-btn");
    await user.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByTestId("export-success-banner")).toBeInTheDocument();
    });
  });

  it("navigates to hub when Teach Another Topic is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeynmanDebriefView />, undefined, { withRouter: true });

    const teachAnotherBtn = screen.getByTestId("teach-another-btn");
    await user.click(teachAnotherBtn);

    expect(mockNavigate).toHaveBeenCalledWith("/feynman");
  });
});
