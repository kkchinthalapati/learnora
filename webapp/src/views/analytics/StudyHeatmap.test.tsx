import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StudyHeatmap } from "./StudyHeatmap";
import { generateActivityHeatmap } from "../../lib/analyticsEngine";
import type { StudySession } from "../../api/types";

describe("StudyHeatmap", () => {
  const fakeSession: StudySession = {
    id: "s-1",
    user_id: "u-1",
    task: "Calculus practice",
    folder_id: null,
    minutes: 45,
    timer_type: "pomodoro",
    started_at: "2026-08-20T10:00:00.000Z",
    created_at: "2026-08-20T10:45:00.000Z",
  };

  it("renders the 52-week activity grid, streak metrics, and legend", () => {
    const data = generateActivityHeatmap([fakeSession], 365, new Date("2026-08-23T12:00:00"));
    render(<StudyHeatmap data={data} />);

    expect(screen.getByRole("grid", { name: "Study activity calendar" })).toBeInTheDocument();
    expect(screen.getByText(/Current Streak:/i)).toBeInTheDocument();
    expect(screen.getByText(/Longest Streak:/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Days:/i)).toBeInTheDocument();
    expect(screen.getByText("Less")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();
  });

  it("shows tooltip on cell mouse enter and clears on mouse leave", () => {
    const data = generateActivityHeatmap([fakeSession], 365, new Date("2026-08-23T12:00:00"));
    render(<StudyHeatmap data={data} />);

    const cells = screen.getAllByRole("gridcell");
    expect(cells.length).toBeGreaterThan(0);

    const firstCell = cells[0];
    fireEvent.mouseEnter(firstCell);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toBeInTheDocument();

    fireEvent.mouseLeave(firstCell);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
