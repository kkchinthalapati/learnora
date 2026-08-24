import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import { AchievementsModal } from "./AchievementsModal";
import { loadStudyGoals } from "../../lib/achievements";

describe("AchievementsModal", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does not render when open is false", () => {
    renderWithProviders(
      <AchievementsModal open={false} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the modal title, trophy cabinet, and daily goal controls", () => {
    renderWithProviders(<AchievementsModal open={true} onClose={vi.fn()} />);

    expect(
      screen.getByRole("dialog", { name: "Trophy Cabinet & Goals" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Trophy Cabinet")).toBeInTheDocument();
    expect(screen.getByText("Customize Daily Study Goals")).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Consistency/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Focus/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Mastery/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Excellence/i })).toBeInTheDocument();
  });

  it("filters badge cards by category when clicking category pills", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AchievementsModal open={true} onClose={vi.fn()} />);

    // Initially all 16 badges are rendered
    expect(screen.getByText("First Spark")).toBeInTheDocument();
    expect(screen.getByText("Focus Initiate")).toBeInTheDocument();

    // Click "Focus" tab
    await user.click(screen.getByRole("tab", { name: /Focus/i }));

    // Focus Initiate should be visible, but First Spark shouldn't be in the filtered list
    expect(screen.getByText("Focus Initiate")).toBeInTheDocument();
    expect(screen.queryByText("First Spark")).not.toBeInTheDocument();
  });

  it("updates and saves study goals instantly when modifying inputs or presets", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AchievementsModal open={true} onClose={vi.fn()} />);

    const focusGoalInput = screen.getByLabelText(
      "Daily focus goal in minutes",
    );
    expect(focusGoalInput).toHaveValue(30);

    // Click a preset button: "45m"
    await user.click(screen.getByRole("button", { name: "45m" }));

    expect(focusGoalInput).toHaveValue(45);
    expect(loadStudyGoals().dailyMinutesGoal).toBe(45);

    // Click preset for flashcards: "25"
    await user.click(screen.getByRole("button", { name: "25" }));
    expect(loadStudyGoals().dailyCardsGoal).toBe(25);
  });

  it("exposes the selected preset via aria-pressed, for assistive tech", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AchievementsModal open={true} onClose={vi.fn()} />);

    const preset45 = screen.getByRole("button", { name: "45m" });
    const preset30 = screen.getByRole("button", { name: "30m" });
    expect(preset45).toHaveAttribute("aria-pressed", "false");

    await user.click(preset45);

    expect(preset45).toHaveAttribute("aria-pressed", "true");
    expect(preset30).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    renderWithProviders(
      <AchievementsModal open={true} onClose={handleClose} />,
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(handleClose).toHaveBeenCalledTimes(1));
  });
});
