import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityRings } from "./ActivityRings";

describe("ActivityRings", () => {
  it("renders with given metric values", () => {
    render(
      <ActivityRings
        focusMinutes={15}
        focusGoal={30}
        cardsReviewed={10}
        cardsGoal={20}
        tasksCompleted={2}
        tasksGoal={4}
        streakDays={3}
      />,
    );

    expect(screen.getByText("Focus")).toBeInTheDocument();
    expect(screen.getByText("Cards")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();

    expect(screen.getByText("15/30m")).toBeInTheDocument();
    expect(screen.getByText("10/20")).toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument();

    // Overall progress: (50% + 50% + 50%) / 3 = 50%
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("handles 0 goal without dividing by zero", () => {
    render(
      <ActivityRings
        focusMinutes={0}
        focusGoal={0}
        cardsReviewed={0}
        cardsGoal={0}
        tasksCompleted={0}
        tasksGoal={0}
      />,
    );

    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("handles 100%+ completion", () => {
    render(
      <ActivityRings
        focusMinutes={60}
        focusGoal={30}
        cardsReviewed={30}
        cardsGoal={15}
        tasksCompleted={5}
        tasksGoal={5}
      />,
    );

    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("60/30m")).toBeInTheDocument();
  });
});
