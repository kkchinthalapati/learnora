import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { StressTestRunner } from "./StressTestRunner";
import type { StressQuestion } from "../../api/aiPreMortem";

describe("StressTestRunner", () => {
  const mockQuestions: StressQuestion[] = [
    {
      id: "q-1",
      question: "What happens to the limit of |x|/x as x approaches 0?",
      options: [
        "Limit equals 1",
        "Limit does not exist because left and right limits differ",
        "Limit equals 0",
        "Limit equals -1",
      ],
      correctAnswerIndex: 1,
      trapArchetypeId: "boundary-condition-tricks",
      trapExplanation: "Boundary condition trap: Left limit is -1 and right limit is +1.",
      difficulty: "Extreme",
      hint: "Evaluate one-sided limits approaching from both signs.",
      topic: "Limits",
    },
    {
      id: "q-2",
      question: "Which of the following is NOT true for symmetric matrices?",
      options: [
        "Eigenvalues are all real numbers",
        "Eigenvectors are orthogonal",
        "The matrix is always invertible",
        "It can be orthogonally diagonalized",
      ],
      correctAnswerIndex: 2,
      trapArchetypeId: "negative-phrasing-distractors",
      trapExplanation: "Negative phrasing: A symmetric matrix with 0 eigenvalue is singular.",
      difficulty: "Hard",
      hint: "Look for the inverted negative condition.",
      topic: "Matrices",
    },
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  it("renders question text, options, timer, and trap banner", () => {
    renderWithAuth(
      <StressTestRunner
        subject="Calculus 2"
        questions={mockQuestions}
        timeLimitSeconds={180}
      />,
      { session: fakeSession() },
      { withRouter: true }
    );

    expect(screen.getByText("Calculus 2")).toBeInTheDocument();
    expect(screen.getByText(/Question 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByText("What happens to the limit of |x|/x as x approaches 0?")).toBeInTheDocument();
    expect(screen.getByText("Limit equals 1")).toBeInTheDocument();
    expect(screen.getByText("Limit does not exist because left and right limits differ")).toBeInTheDocument();
    expect(screen.getByText(/Watch out — this one uses: Edge cases/i)).toBeInTheDocument();
  });

  it("handles selecting options, tagging confidence, and navigation", async () => {
    const user = userEvent.setup();

    renderWithAuth(
      <StressTestRunner
        subject="Calculus 2"
        questions={mockQuestions}
        timeLimitSeconds={180}
      />,
      { session: fakeSession() },
      { withRouter: true }
    );

    // Select option B
    const optionB = screen.getByRole("radio", {
      name: /Limit does not exist because left and right limits differ/i,
    });
    await user.click(optionB);
    expect(optionB).toHaveAttribute("aria-checked", "true");

    // Tag confidence
    const trickyBtn = screen.getByRole("button", { name: /Not sure/i });
    await user.click(trickyBtn);

    // Flag question
    const flagBtn = screen.getByRole("button", { name: "Flag this one" });
    await user.click(flagBtn);
    expect(screen.getByText("Flagged")).toBeInTheDocument();

    // Reveal hint
    const hintToggle = screen.getByRole("button", { name: /Show me a hint/i });
    await user.click(hintToggle);
    expect(screen.getByText(/Evaluate one-sided limits approaching from both signs/i)).toBeInTheDocument();

    // Navigate to next question
    const nextBtn = screen.getByRole("button", { name: "Next" });
    await user.click(nextBtn);

    expect(screen.getByText(/Question 2 of 2/i)).toBeInTheDocument();
    expect(screen.getByText("Which of the following is NOT true for symmetric matrices?")).toBeInTheDocument();
  });

  it("submits the gauntlet and invokes onComplete callback with report", async () => {
    const user = userEvent.setup();
    const handleComplete = vi.fn();

    renderWithAuth(
      <StressTestRunner
        subject="Calculus 2"
        questions={mockQuestions}
        timeLimitSeconds={180}
        onComplete={handleComplete}
      />,
      { session: fakeSession() },
      { withRouter: true }
    );

    // Answer Q1
    await user.click(
      screen.getByRole("radio", {
        name: /Limit does not exist because left and right limits differ/i,
      })
    );

    // Next
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Answer Q2
    await user.click(
      screen.getByRole("radio", {
        name: /The matrix is always invertible/i,
      })
    );

    // Submit
    const submitBtn = screen.getByRole("button", {
      name: /Finish and see how you did/i,
    });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(handleComplete).toHaveBeenCalledTimes(1);
      const report = handleComplete.mock.calls[0][0];
      expect(report.subject).toBe("Calculus 2");
      expect(report.predictedScore).toBeGreaterThanOrEqual(50);
      expect(report.radarData.length).toBeGreaterThan(0);
    });
  });

  it("handles empty questions gracefully", () => {
    renderWithAuth(
      <StressTestRunner subject="Calculus" questions={[]} />,
      { session: fakeSession() },
      { withRouter: true }
    );

    expect(screen.getByText("No questions yet")).toBeInTheDocument();
  });
});
