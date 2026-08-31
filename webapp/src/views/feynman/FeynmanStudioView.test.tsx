import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import { FeynmanStudioView } from "./FeynmanStudioView";
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
    useParams: () => ({ sessionId: "test-studio-sess-1" }),
  };
});

describe("FeynmanStudioView Component", () => {
  const sampleSession: FeynmanSessionState = {
    id: "test-studio-sess-1",
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
      draftText:
        "Leaves are green because chlorophyll absorbs green light to make sugar. Plants only photosynthesize and sleep at night without doing respiration.",
      hiddenMisconceptions: [
        {
          id: "misc-1",
          snippet: "chlorophyll absorbs green light",
          concept: "Light Absorption",
          explanation: "Chlorophyll reflects green light and absorbs blue/red light.",
          misconception: "Believing green light is absorbed.",
          correctedSnippet: "chlorophyll absorbs blue/red light and reflects green",
          hint: "What color bounces off into our eyes?",
        },
      ],
      challengeQuestion: "Do plants need oxygen at night to survive?",
      learningObjectives: ["Understand light reflection vs absorption"],
    },
    turns: [],
    currentScore: 20,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    clearFeynmanSessions();
    vi.clearAllMocks();
    mockNavigate.mockReset();
    saveFeynmanSession(sampleSession);
    setActiveFeynmanSessionId(sampleSession.id);
  });

  it("renders apprentice draft, challenge question, and reactive understanding gauge", () => {
    renderWithProviders(<FeynmanStudioView />, undefined, { withRouter: true });

    expect(screen.getByText("Photosynthesis")).toBeInTheDocument();
    expect(screen.getByTestId("apprentice-draft-text")).toHaveTextContent(
      "Leaves are green because chlorophyll absorbs green light"
    );
    expect(screen.getByTestId("challenge-question-card")).toHaveTextContent(
      "Do plants need oxygen at night to survive?"
    );
    expect(screen.getByTestId("understanding-gauge")).toBeInTheDocument();
    expect(screen.getByTestId("apprentice-emotion-badge")).toHaveTextContent("🤔 Confused");
  });

  it("toggles misconception hints when clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeynmanStudioView />, undefined, { withRouter: true });

    const hintBtn = screen.getByText(/Give me a hint/i);
    await user.click(hintBtn);

    expect(screen.getByTestId("hint-misc-1")).toHaveTextContent(
      "What color bounces off into our eyes?"
    );
  });

  it("applies scaffolding prompt shortcuts into teaching textarea", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeynmanStudioView />, undefined, { withRouter: true });

    const analogyBtn = screen.getByText(/💡 Use a comparison/i);
    await user.click(analogyBtn);

    const textarea = screen.getByTestId("teaching-textarea") as HTMLTextAreaElement;
    expect(textarea.value).toContain("Think of it like this analogy");
  });

  it("evaluates student explanation, updates dialogue, and increases score", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeynmanStudioView />, undefined, { withRouter: true });

    const textarea = screen.getByTestId("teaching-textarea");
    await user.type(
      textarea,
      "Chlorophyll actually reflects green light and absorbs red and blue light to power photosynthesis."
    );

    const submitBtn = screen.getByTestId("submit-explanation-btn");
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId("user-turn-bubble")).toHaveTextContent(
        "Chlorophyll actually reflects green light"
      );
      expect(screen.getByTestId("apprentice-turn-bubble")).toBeInTheDocument();
    });
  });

  it("allows revising draft and finishing session to debrief", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeynmanStudioView />, undefined, { withRouter: true });

    const finishBtn = screen.getByTestId("finish-session-btn");
    await user.click(finishBtn);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        "/feynman/debrief/test-studio-sess-1"
      );
    });
  });

  it("renders not-found state when session does not exist", () => {
    clearFeynmanSessions();
    renderWithProviders(<FeynmanStudioView />, undefined, { withRouter: true });

    expect(screen.getByText(/We can’t find that session/i)).toBeInTheDocument();
  });
});
