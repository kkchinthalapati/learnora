import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { PreMortemRadarView } from "./PreMortemRadarView";
import type { PreMortemReport } from "../../api/aiPreMortem";

describe("PreMortemRadarView", () => {
  const mockReport: PreMortemReport = {
    id: "report-1",
    subject: "Calculus & Linear Algebra",
    predictedScore: 72,
    gradeEstimate: "B (Solid with Edge Blindspots)",
    radarData: [
      { topic: "Limits & Discontinuities", riskLevel: "high", failureProbability: 75 },
      { topic: "Matrix Inversion", riskLevel: "medium", failureProbability: 40 },
      { topic: "Integration Techniques", riskLevel: "low", failureProbability: 20 },
    ],
    predictedFailures: [
      {
        topic: "Limits & Discontinuities",
        failureProbability: 75,
        predictedLostMarks: 8,
        coreTrap: "Boundary Condition & Edge Case Traps",
        neutralizerId: "boundary-condition-tricks",
      },
      {
        topic: "Matrix Inversion",
        failureProbability: 40,
        predictedLostMarks: 5,
        coreTrap: "Negative Phrasing Distractors",
        neutralizerId: "negative-phrasing-distractors",
      },
    ],
    timestamp: "2026-08-26T12:00:00.000Z",
    totalQuestions: 10,
    correctCount: 7,
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the score banner, radar visual, and predicted failure cards", () => {
    renderWithAuth(<PreMortemRadarView report={mockReport} />, { session: fakeSession() }, { withRouter: true });

    expect(screen.getByText("Exam Pre-Mortem Failure Radar")).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.getByText("B (Solid with Edge Blindspots)")).toBeInTheDocument();
    expect(screen.getByText("-13 pts")).toBeInTheDocument();

    // Radar Section
    expect(screen.getByText("Topic Failure Probability Radar")).toBeInTheDocument();
    expect(screen.getByText("Topic Risk Index")).toBeInTheDocument();
    expect(screen.getAllByText("Limits & Discontinuities").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Matrix Inversion").length).toBeGreaterThan(0);

    // Predicted Failure Points
    expect(screen.getByText("Predicted Exam-Day Failure Traps")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Neutralize Trap/i }).length).toBe(2);
  });

  it("opens Trap Neutralizer modal, steps through 3-step trick deconstruction, and completes challenge", async () => {
    const user = userEvent.setup();

    renderWithAuth(<PreMortemRadarView report={mockReport} />, { session: fakeSession() }, { withRouter: true });

    const neutralizeButtons = screen.getAllByRole("button", { name: /Neutralize Trap/i });
    await user.click(neutralizeButtons[0]);

    // Modal should be open
    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByText("The Professor's Bait")).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog");

    // Step 1 -> Step 2
    const nextBtn1 = within(dialog).getByRole("button", { name: /Next: The Hidden Flaw/i });
    await user.click(nextBtn1);

    await waitFor(() => {
      expect(within(dialog).getByText("The Hidden Structural Flaw")).toBeInTheDocument();
    });

    // Step 2 -> Step 3
    const nextBtn2 = within(dialog).getByRole("button", { name: /Next: The Disarm Rule/i });
    await user.click(nextBtn2);

    await waitFor(() => {
      expect(within(dialog).getByText("The Invariant Disarm Protocol")).toBeInTheDocument();
    });

    // Step 3 -> Step 4 Practice Challenge
    const nextBtn3 = within(dialog).getByRole("button", { name: /Next: Practice Drill/i });
    await user.click(nextBtn3);

    await waitFor(() => {
      expect(within(dialog).getByText("1-Question Trap Verification Challenge")).toBeInTheDocument();
      expect(within(dialog).getByText(/For what real values of k does the equation kx² \+ 4x \+ 1 = 0 have exactly ONE real root\?/i)).toBeInTheDocument();
    });

    // Select option B (k = 0 and k = 4)
    const optionB = within(dialog).getByRole("button", {
      name: /k = 0 and k = 4/i,
    });
    await user.click(optionB);

    // Verify answer
    const checkBtn = within(dialog).getByRole("button", { name: "Check Deflection" });
    await user.click(checkBtn);

    await waitFor(() => {
      expect(within(dialog).getByText(/Trap Neutralized! Deflection Successful/i)).toBeInTheDocument();
    });

    // Finish modal
    const doneBtn = within(dialog).getByRole("button", { name: "Done & Return to Radar" });
    await user.click(doneBtn);

    // Trap badge on radar view should update
    await waitFor(() => {
      expect(screen.getByText("Trap Neutralized! Deflection Mastered")).toBeInTheDocument();
    });
  });

  it("handles empty report by showing empty state", () => {
    renderWithAuth(<PreMortemRadarView report={null} />, { session: fakeSession() }, { withRouter: true });

    expect(screen.getByText("No recent stress-test audit found. Launch a gauntlet to compute your failure prediction radar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to Pre-Mortem Hub" })).toBeInTheDocument();
  });
});
