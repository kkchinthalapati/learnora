import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithAuth } from "../../test/auth";
import { MicroRepairModal } from "./MicroRepairModal";
import type { MicroRepairChallenge } from "../../api/aiDebugger";

const mockChallenge: MicroRepairChallenge = {
  id: "repair-123",
  rootConcept: "Functional Composition & Intermediate Change",
  intuitionSummary:
    "Zooming in by dx stretches g by g'(x), which stretches f by f'(g(x)). Rates multiply in sequence.",
  interactiveExercise: {
    prompt: "If Gear A turns Gear B at 2x speed, and Gear B turns Gear C at 3x speed, what is the speed of C relative to A?",
    options: [
      "6x speed (2 * 3)",
      "5x speed (2 + 3)",
      "1.5x speed (3 / 2)",
      "No change (1x)",
    ],
    correctIndex: 0,
    firstPrinciplesExplanation:
      "Sequential rates of change multiply. This is why the Chain Rule multiplies derivatives.",
  },
  verified: false,
};

describe("MicroRepairModal Component", () => {
  it("does not render when open is false", () => {
    renderWithAuth(
      <MicroRepairModal
        open={false}
        onClose={vi.fn()}
        challenge={mockChallenge}
        traceId="trace-123"
        onRepairSuccess={vi.fn()}
      />,
    );

    expect(screen.queryByText("Quick check")).not.toBeInTheDocument();
  });

  it("renders the intuition summary and interactive options, with no timer", () => {
    renderWithAuth(
      <MicroRepairModal
        open={true}
        onClose={vi.fn()}
        challenge={mockChallenge}
        traceId="trace-123"
        onRepairSuccess={vi.fn()}
      />,
    );

    expect(screen.getByText("Quick check")).toBeInTheDocument();
    expect(screen.queryByTestId("repair-timer-display")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByTestId("repair-intuition-text")).toHaveTextContent(
      /Zooming in by dx stretches g by g'\(x\)/i,
    );
    expect(screen.getByText(/If Gear A turns Gear B at 2x speed/i)).toBeInTheDocument();
    expect(screen.getByText(/6x speed \(2 \* 3\)/i)).toBeInTheDocument();
    expect(screen.getByText(/5x speed \(2 \+ 3\)/i)).toBeInTheDocument();
  });

  it("displays error alert when incorrect option is submitted", () => {
    renderWithAuth(
      <MicroRepairModal
        open={true}
        onClose={vi.fn()}
        challenge={mockChallenge}
        traceId="trace-123"
        onRepairSuccess={vi.fn()}
      />,
    );

    // Option 1 (index 1) is incorrect
    const wrongOption = screen.getByTestId("repair-option-1");
    fireEvent.click(wrongOption);

    const verifyBtn = screen.getByTestId("verify-repair-btn");
    fireEvent.click(verifyBtn);

    expect(screen.getByText("Not quite")).toBeInTheDocument();
    expect(
      screen.getByText(/Have another look at the idea above/i),
    ).toBeInTheDocument();
  });

  it("verifies successfully when correct option is selected and calls onRepairSuccess", async () => {
    const handleSuccess = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    renderWithAuth(
      <MicroRepairModal
        open={true}
        onClose={handleClose}
        challenge={mockChallenge}
        traceId="trace-123"
        onRepairSuccess={handleSuccess}
      />,
    );

    // Option 0 is correct
    const correctOption = screen.getByTestId("repair-option-0");
    fireEvent.click(correctOption);

    const verifyBtn = screen.getByTestId("verify-repair-btn");
    fireEvent.click(verifyBtn);

    expect(
      screen.getByText("That's it — you've got it"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sequential rates of change multiply/i),
    ).toBeInTheDocument();

    const applyFixBtn = screen.getByTestId("apply-fix-btn");
    fireEvent.click(applyFixBtn);

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalledWith("trace-123", "repair-123");
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it("calls onClose when Cancel button is clicked", () => {
    const handleClose = vi.fn();
    renderWithAuth(
      <MicroRepairModal
        open={true}
        onClose={handleClose}
        challenge={mockChallenge}
        traceId="trace-123"
        onRepairSuccess={vi.fn()}
      />,
    );

    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalled();
  });
  it("shows the explanation when the student skips, without claiming they got it right", () => {
    renderWithAuth(
      <MicroRepairModal
        open={true}
        onClose={vi.fn()}
        challenge={mockChallenge}
        traceId="trace-123"
        onRepairSuccess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("skip-to-explanation-btn"));

    expect(screen.getByText(/Sequential rates of change multiply/i)).toBeInTheDocument();
    expect(screen.queryByText(/you.ve got it/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("skip-to-explanation-btn")).not.toBeInTheDocument();
  });

  it("titles the modal Quick check and offers no countdown at any point", () => {
    renderWithAuth(
      <MicroRepairModal
        open={true}
        onClose={vi.fn()}
        challenge={mockChallenge}
        traceId="trace-123"
        onRepairSuccess={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Quick check" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/remaining/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Time left")).not.toBeInTheDocument();
  });
});
