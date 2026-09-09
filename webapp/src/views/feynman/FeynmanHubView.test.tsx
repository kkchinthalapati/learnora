import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import { FeynmanHubView } from "./FeynmanHubView";
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
  };
});

vi.mock("../../api/aiFeynman", async () => {
  const actual = await vi.importActual("../../api/aiFeynman");
  return {
    ...actual,
    generateApprenticeDraft: vi.fn().mockImplementation(
      (subject, topic, persona, difficulty, ledger, analogyStyle, depth, customAudience) => {
        return Promise.resolve(
          (actual as any).generateDynamicDraft(
            subject,
            topic,
            persona,
            difficulty,
            ledger,
            analogyStyle,
            depth,
            customAudience
          )
        );
      }
    ),
  };
});

describe("FeynmanHubView Component", () => {
  beforeEach(() => {
    clearFeynmanSessions();
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  it("renders page header, persona choices, and topic setup form", () => {
    renderWithProviders(<FeynmanHubView />, undefined, { withRouter: true });

    expect(screen.getByText("Explain It Simply")).toBeInTheDocument();
    expect(screen.getByText(/Study Lab/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Subject")).toBeInTheDocument();
    expect(screen.getByLabelText("Topic")).toBeInTheDocument();

    // Check personas
    expect(screen.getByTestId("persona-curious_beginner")).toBeInTheDocument();
    expect(screen.getByTestId("persona-overconfident_peer")).toBeInTheDocument();
    expect(screen.getByTestId("persona-struggling_student")).toBeInTheDocument();

    // Check difficulty options
    expect(screen.getByTestId("difficulty-beginner")).toBeInTheDocument();
    expect(screen.getByTestId("difficulty-intermediate")).toBeInTheDocument();
    expect(screen.getByTestId("difficulty-advanced")).toBeInTheDocument();

    // Check start button
    expect(screen.getByTestId("start-arena-btn")).toBeInTheDocument();
  });

  it("allows selecting personas and popular topic chips", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeynmanHubView />, undefined, { withRouter: true });

    // Click overconfident peer
    const jordanCard = screen.getByTestId("persona-overconfident_peer");
    await user.click(jordanCard);

    // Click a popular topic chip (e.g. Quantum Entanglement)
    const quantumChip = screen.getByText(/Quantum Entanglement/i);
    await user.click(quantumChip);

    const topicInput = screen.getByLabelText("Topic") as HTMLInputElement;
    expect(topicInput.value).toBe("Quantum Entanglement");

    const subjectInput = screen.getByLabelText("Subject") as HTMLInputElement;
    expect(subjectInput.value).toBe("Physics");
  });

  it("launches a new arena session and navigates to the studio", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeynmanHubView />, undefined, { withRouter: true });

    const startBtn = screen.getByTestId("start-arena-btn");
    await user.click(startBtn);

    await waitFor(
      () => {
        expect(mockNavigate).toHaveBeenCalledWith(
          expect.stringMatching(/\/feynman\/studio\/feynman-/)
        );
      },
      { timeout: 10000 }
    );
  });

  it("renders active session banner and allows resuming active session", async () => {
    const user = userEvent.setup();

    const existingSession: FeynmanSessionState = {
      id: "active-123",
      subject: "Biology",
      topic: "Cellular Respiration",
      persona: "curious_beginner",
      difficulty: "intermediate",
      draft: {
        id: "d-1",
        subject: "Biology",
        topic: "Cellular Respiration",
        persona: "curious_beginner",
        difficulty: "intermediate",
        draftText: "Mitochondria make energy.",
        hiddenMisconceptions: [],
        challengeQuestion: "Why do we need oxygen?",
        learningObjectives: [],
      },
      turns: [],
      currentScore: 45,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveFeynmanSession(existingSession);
    setActiveFeynmanSessionId("active-123");

    renderWithProviders(<FeynmanHubView />, undefined, { withRouter: true });

    const banner = screen.getByTestId("active-session-banner");
    expect(banner).toBeInTheDocument();
    expect(within(banner).getByText(/Cellular Respiration/i)).toBeInTheDocument();

    const resumeBtn = within(banner).getByText(/Carry on/i);
    await user.click(resumeBtn);

    expect(mockNavigate).toHaveBeenCalledWith("/feynman/studio/active-123");
  });

  it("renders past sessions list and allows deleting a session", async () => {
    const sessionToDelete: FeynmanSessionState = {
      id: "del-456",
      subject: "Computer Science",
      topic: "Dijkstra Shortest Path",
      persona: "struggling_student",
      difficulty: "beginner",
      draft: {
        id: "d-2",
        subject: "Computer Science",
        topic: "Dijkstra Shortest Path",
        persona: "struggling_student",
        difficulty: "beginner",
        draftText: "Dijkstra finds shortest path in weighted graphs.",
        hiddenMisconceptions: [],
        challengeQuestion: "What about negative weights?",
        learningObjectives: [],
      },
      turns: [],
      currentScore: 80,
      status: "completed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveFeynmanSession(sessionToDelete);

    renderWithProviders(<FeynmanHubView />, undefined, { withRouter: true });

    expect(screen.getByText(/Dijkstra Shortest Path/i)).toBeInTheDocument();
    expect(screen.getByTestId("session-row")).toBeInTheDocument();

    const deleteBtn = screen.getByTestId("delete-session-btn");
    fireEvent.click(deleteBtn);

    expect(screen.queryByText(/Dijkstra Shortest Path/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("session-row")).not.toBeInTheDocument();
  });

  it("renders creative parameters: primary personas, analogy styles, and depth options", () => {
    renderWithProviders(<FeynmanHubView />, undefined, { withRouter: true });

    // Primary personas
    expect(screen.getByTestId("persona-eli10")).toBeInTheDocument();
    expect(screen.getByTestId("persona-ninth_grader")).toBeInTheDocument();
    expect(screen.getByTestId("persona-skeptical_buddy")).toBeInTheDocument();
    expect(screen.getByTestId("persona-cbse_examiner")).toBeInTheDocument();
    expect(screen.getByTestId("persona-custom")).toBeInTheDocument();

    // Analogy styles
    expect(screen.getByTestId("analogy-sports_cricket")).toBeInTheDocument();
    expect(screen.getByTestId("analogy-cooking_kitchen")).toBeInTheDocument();
    expect(screen.getByTestId("analogy-gaming_tech")).toBeInTheDocument();
    expect(screen.getByTestId("analogy-physical_machinery")).toBeInTheDocument();
    expect(screen.getByTestId("analogy-storytelling")).toBeInTheDocument();

    // Depth options
    expect(screen.getByTestId("depth-quick_intuition")).toBeInTheDocument();
    expect(screen.getByTestId("depth-core_mechanism")).toBeInTheDocument();
    expect(screen.getByTestId("depth-deep_dive")).toBeInTheDocument();
  });

  it("allows selecting custom audience, analogy style, and depth", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FeynmanHubView />, undefined, { withRouter: true });

    // Custom audience input should not be visible initially
    expect(screen.queryByTestId("custom-audience-input")).not.toBeInTheDocument();

    // Select custom audience persona
    const customPersonaCard = screen.getByTestId("persona-custom");
    await user.click(customPersonaCard);

    // Custom audience input should now appear
    const customInput = screen.getByTestId("custom-audience-input") as HTMLInputElement;
    expect(customInput).toBeInTheDocument();
    await user.type(customInput, "My 75-year-old grandfather who loves carpentry");
    expect(customInput.value).toBe("My 75-year-old grandfather who loves carpentry");

    // Select gaming & tech analogy style
    const gamingAnalogy = screen.getByTestId("analogy-gaming_tech");
    await user.click(gamingAnalogy);

    // Select deep dive depth
    const deepDiveBtn = screen.getByTestId("depth-deep_dive");
    await user.click(deepDiveBtn);

    // Launch session
    const startBtn = screen.getByTestId("start-arena-btn");
    await user.click(startBtn);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/\/feynman\/studio\/feynman-/)
      );
    });
  });
});
