import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { NextHourCard } from "./NextHourCard";
import type { Exam } from "../../api/types";
import type { Intervention, TrajectoryForecast } from "../../lib/trajectory";

const prepareFocus = vi.fn();
const trajectory = vi.fn();

vi.mock("../../context/timer", () => ({ useTimer: () => ({ prepareFocus }) }));
vi.mock("../../hooks/useTrajectory", () => ({
  useTrajectory: () => trajectory(),
}));

const exam = {
  id: 1,
  exam_name: "Chemistry Paper 1",
  exam_date: "2026-09-15",
} as Exam;

function intervention(pointsPerHour = 4.2): Intervention {
  return {
    topicId: "topic-1",
    label: "Titration",
    points: 3,
    pointsPerHour,
    mastery: 0.3,
    atRisk: false,
  };
}

function forecast(evidence = 0.6): TrajectoryForecast {
  return {
    examDate: "2026-09-15",
    examName: "Chemistry Paper 1",
    daysRemaining: 7,
    todayScore: 50,
    projectedScore: 62,
    driftScore: 44,
    planValue: 18,
    confidence: { lower: 55, upper: 70, evidence },
    curve: [],
    interventions: [intervention()],
    availableMins: 900,
    minsToTarget: 600,
    targetScore: 70,
    verdict: "at-risk",
    topics: [],
  };
}

function renderCard() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<NextHourCard />} />
        <Route path="/timer" element={<h1>Timer Page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NextHourCard", () => {
  beforeEach(() => {
    prepareFocus.mockClear();
    trajectory.mockReturnValue({
      exam,
      forecast: forecast(),
      isPending: false,
    });
  });

  it("recommends an action without presenting a precise marks-per-hour promise", () => {
    renderCard();
    expect(
      screen.getByRole("heading", { name: "Study Titration next" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/projected range 55–70%/)).toBeInTheDocument();
    expect(screen.queryByText(/marks an hour/)).not.toBeInTheDocument();
  });

  it("discloses when the recommendation has little evidence", () => {
    trajectory.mockReturnValue({
      exam,
      forecast: forecast(0.2),
      isPending: false,
    });
    renderCard();
    expect(screen.getByText(/low-confidence suggestion/)).toBeInTheDocument();
  });

  it("starts a focus block on the recommended topic", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(
      screen.getByRole("button", { name: /Start 45 min on Titration/ }),
    );
    expect(prepareFocus).toHaveBeenCalledWith(45, "Titration");
    expect(await screen.findByText("Timer Page")).toBeInTheDocument();
  });

  it("renders nothing without enough data for a recommendation", () => {
    trajectory.mockReturnValue({
      exam: null,
      forecast: null,
      isPending: false,
    });
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });
});
