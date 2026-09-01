import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import { AchievementsModal } from "./AchievementsModal";
import { http } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
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

  it("renders the modal title, trophy cabinet, and daily goal controls", async () => {
    renderWithProviders(<AchievementsModal open={true} onClose={vi.fn()} />);

    /* Awaited throughout this file: badge unlock state is derived from five
       queries, so the modal holds a skeleton until they land rather than
       telling a student with a live streak that every badge is locked. */
    expect(
      await screen.findByRole("dialog", { name: "Trophy Cabinet & Goals" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Trophy Cabinet")).toBeInTheDocument();
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
    expect(await screen.findByText("First Spark")).toBeInTheDocument();
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

    const focusGoalInput = await screen.findByLabelText(
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

    const preset45 = await screen.findByRole("button", { name: "45m" });
    const preset30 = screen.getByRole("button", { name: "30m" });
    expect(preset45).toHaveAttribute("aria-pressed", "false");

    await user.click(preset45);

    expect(preset45).toHaveAttribute("aria-pressed", "true");
    expect(preset30).toHaveAttribute("aria-pressed", "false");
  });

  it("floors the minutes goal at 5 (its own input's stated minimum) rather than 1", async () => {
    renderWithProviders(<AchievementsModal open={true} onClose={vi.fn()} />);

    const focusGoalInput = await screen.findByLabelText(
      "Daily focus goal in minutes",
    );

    fireEvent.change(focusGoalInput, { target: { value: "1" } });

    expect(focusGoalInput).toHaveValue(5);
    expect(loadStudyGoals().dailyMinutesGoal).toBe(5);
  });

  it("still floors the cards/tasks goals at 1, unlike minutes", async () => {
    renderWithProviders(<AchievementsModal open={true} onClose={vi.fn()} />);

    const cardsGoalInput = await screen.findByLabelText(
      "Daily flashcards review goal",
    );

    // "0" would hit the input's own `parseInt(...) || 15` fallback before
    // ever reaching the clamp (0 is falsy) — a negative value exercises the
    // actual Math.max floor instead.
    fireEvent.change(cardsGoalInput, { target: { value: "-5" } });

    expect(loadStudyGoals().dailyCardsGoal).toBe(1);
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

    const allTab = await screen.findByRole("tab", { name: /^All/ });
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

  it("skeletons the badge grid until its metric queries land", async () => {
    /* Sessions that never resolve stand in for the moment before the first
       byte arrives. Ungated, that window rendered a 0-day streak and every
       badge locked — the app telling a student who has been studying for
       weeks that they have done nothing. */
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/study_sessions`, () =>
        new Promise(() => {}),
      ),
    );

    renderWithProviders(<AchievementsModal open={true} onClose={vi.fn()} />);

    expect(
      await screen.findByRole("status", {
        name: "Checking which badges you've earned",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("First Spark")).not.toBeInTheDocument();
    expect(screen.queryByText(/Day Streak/)).not.toBeInTheDocument();
  });
});
