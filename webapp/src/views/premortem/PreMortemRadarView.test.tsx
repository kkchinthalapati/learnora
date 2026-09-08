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
    gradeEstimate: "Some traps still caught you",
    radarData: [
      {
        topic: "Limits & Discontinuities",
        riskLevel: "high",
        failureProbability: 75,
      },
      {
        topic: "Matrix Inversion",
        riskLevel: "medium",
        failureProbability: 40,
      },
      {
        topic: "Integration Techniques",
        riskLevel: "low",
        failureProbability: 20,
      },
    ],
    predictedFailures: [
      {
        topic: "Limits & Discontinuities",
        failureProbability: 75,
        predictedLostMarks: 2,
        coreTrap: "Edge cases",
        neutralizerId: "boundary-condition-tricks",
      },
      {
        topic: "Matrix Inversion",
        failureProbability: 40,
        predictedLostMarks: 1,
        coreTrap: "Questions phrased backwards",
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

  it("renders the observed score, miss-rate visual, and missed trap cards", () => {
    renderWithAuth(
      <PreMortemRadarView report={mockReport} />,
      { session: fakeSession() },
      { withRouter: true },
    );

    expect(screen.getByText("Common Exam Traps")).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.getByText("Some traps still caught you")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Summary of how you did")).getByText("3"),
    ).toBeInTheDocument();

    // Radar Section
    expect(screen.getByText("Where this set caught you")).toBeInTheDocument();
    expect(screen.getByText("Topic by topic")).toBeInTheDocument();
    expect(
      screen.getAllByText("Limits & Discontinuities").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Matrix Inversion").length).toBeGreaterThan(0);

    // Predicted Failure Points
    expect(screen.getByText("The traps that caught you")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Learn to spot it/i }).length,
    ).toBe(2);
  });

  it("opens the trap breakdown modal, steps through it, and completes the challenge", async () => {
    const user = userEvent.setup();

    renderWithAuth(
      <PreMortemRadarView report={mockReport} />,
      { session: fakeSession() },
      { withRouter: true },
    );

    const neutralizeButtons = screen.getAllByRole("button", {
      name: /Learn to spot it/i,
    });
    await user.click(neutralizeButtons[0]);

    // Modal should be open
    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByText("What pulls you in")).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog");

    // Step 1 -> Step 2
    const nextBtn1 = within(dialog).getByRole("button", {
      name: /Next: the catch/i,
    });
    await user.click(nextBtn1);

    await waitFor(() => {
      expect(
        within(dialog).getByText("What's actually wrong with it"),
      ).toBeInTheDocument();
    });

    // Step 2 -> Step 3
    const nextBtn2 = within(dialog).getByRole("button", {
      name: /Next: how to beat it/i,
    });
    await user.click(nextBtn2);

    await waitFor(() => {
      expect(
        within(dialog).getByText("How to beat it every time"),
      ).toBeInTheDocument();
    });

    // Step 3 -> Step 4 Practice Challenge
    const nextBtn3 = within(dialog).getByRole("button", {
      name: /Next: your turn/i,
    });
    await user.click(nextBtn3);

    await waitFor(() => {
      expect(
        within(dialog).getByText("One question — can you spot it?"),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          /For what real values of k does the equation kx² \+ 4x \+ 1 = 0 have exactly ONE real root\?/i,
        ),
      ).toBeInTheDocument();
    });

    // Select option B (k = 0 and k = 4)
    const optionB = within(dialog).getByRole("button", {
      name: /k = 0 and k = 4/i,
    });
    await user.click(optionB);

    // Verify answer
    const checkBtn = within(dialog).getByRole("button", {
      name: "Check my answer",
    });
    await user.click(checkBtn);

    await waitFor(() => {
      expect(
        within(dialog).getByText(/You spotted it. Nice./i),
      ).toBeInTheDocument();
    });

    // Finish modal
    const doneBtn = within(dialog).getByRole("button", { name: "Done" });
    await user.click(doneBtn);

    // Trap badge on radar view should update
    await waitFor(() => {
      expect(
        screen.getByText("Sorted — you'll spot this one now"),
      ).toBeInTheDocument();
    });
  });

  it("handles empty report by showing empty state", () => {
    renderWithAuth(
      <PreMortemRadarView report={null} />,
      { session: fakeSession() },
      { withRouter: true },
    );

    expect(
      screen.getByText(
        "You haven't tried a set of trap questions yet. Have a go and we'll show you what caught you out.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pick some questions" }),
    ).toBeInTheDocument();
  });
});
