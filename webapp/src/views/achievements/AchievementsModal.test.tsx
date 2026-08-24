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

  it("supports roving tabindex and arrow/home/end navigation on category tabs", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AchievementsModal open={true} onClose={vi.fn()} />);

    const allTab = screen.getByRole("tab", { name: /^All/ });
    const consistencyTab = screen.getByRole("tab", { name: /^Consistency/ });
    const focusTab = screen.getByRole("tab", { name: /^Focus/ });
    const masteryTab = screen.getByRole("tab", { name: /^Mastery/ });
    const excellenceTab = screen.getByRole("tab", { name: /^Excellence/ });

    // Initial roving tab indices
    expect(allTab).toHaveAttribute("tabindex", "0");
    expect(consistencyTab).toHaveAttribute("tabindex", "-1");
    expect(focusTab).toHaveAttribute("tabindex", "-1");
    expect(masteryTab).toHaveAttribute("tabindex", "-1");
    expect(excellenceTab).toHaveAttribute("tabindex", "-1");

    // All tabs point to the single tabpanel
    expect(allTab).toHaveAttribute("aria-controls", "achievements-badge-grid");
    expect(consistencyTab).toHaveAttribute(
      "aria-controls",
      "achievements-badge-grid",
    );

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "achievements-badge-grid");
    expect(panel).toHaveAttribute("aria-labelledby", "achievements-tab-all");

    // ArrowRight navigates to next tab
    allTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(consistencyTab).toHaveFocus();
    expect(consistencyTab).toHaveAttribute("tabindex", "0");
    expect(allTab).toHaveAttribute("tabindex", "-1");
    expect(panel).toHaveAttribute(
      "aria-labelledby",
      "achievements-tab-consistency",
    );

    // End jumps to the last tab
    await user.keyboard("{End}");
    expect(excellenceTab).toHaveFocus();
    expect(excellenceTab).toHaveAttribute("tabindex", "0");

    // ArrowRight on last tab wraps to first tab
    await user.keyboard("{ArrowRight}");
    expect(allTab).toHaveFocus();
    expect(allTab).toHaveAttribute("tabindex", "0");

    // ArrowLeft on first tab wraps to last tab
    await user.keyboard("{ArrowLeft}");
    expect(excellenceTab).toHaveFocus();
    expect(excellenceTab).toHaveAttribute("tabindex", "0");

    // Home jumps to the first tab
    await user.keyboard("{Home}");
    expect(allTab).toHaveFocus();
    expect(allTab).toHaveAttribute("tabindex", "0");
  });
});
