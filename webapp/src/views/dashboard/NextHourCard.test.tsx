import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { NextHourCard } from "./NextHourCard";
import type { TrajectoryForecast, Intervention } from "../../lib/trajectory";
import type { Exam } from "../../api/types";

const prepareFocus = vi.fn();
const trajectory = vi.fn();

vi.mock("../../context/timer", () => ({
  useTimer: () => ({ prepareFocus }),
}));

vi.mock("../../hooks/useTrajectory", () => ({
  useTrajectory: () => trajectory(),
}));

function intervention(patch: Partial<Intervention> & { label: string }): Intervention {
  return {
    topicId: patch.label,
    points: 3,
    pointsPerHour: 4,
    mastery: 0.3,
    atRisk: false,
    ...patch,
  };
}

function forecast(patch: Partial<TrajectoryForecast> = {}): TrajectoryForecast {
  return {
    examDate: "2026-09-15",
    examName: "Chemistry Paper 1",
    daysRemaining: 14,
    todayScore: 50,
    projectedScore: 62,
    driftScore: 44,
    planValue: 18,
    confidence: { lower: 55, upper: 70, evidence: 0.6 },
    curve: [],
    interventions: [
      intervention({ label: "Titration", pointsPerHour: 4.2 }),
      intervention({ label: "Bonding", pointsPerHour: 0.7 }),
    ],
    availableMins: 900,
    minsToTarget: 600,
    targetScore: 70,
    verdict: "at-risk",
    topics: [],
    ...patch,
  };
}

const exam = { id: 1, exam_name: "Chemistry Paper 1", exam_date: "2026-09-15" } as Exam;

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
      candidates: [exam],
      forecast: forecast(),
      needsMaterial: false,
      isPending: false,
    });
  });

  it("leads with the marks the next hour buys, and on what", () => {
    renderCard();
    expect(screen.getByText(/\+4\.2/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /on Titration/ })).toBeInTheDocument();
  });

  /* The ratio is the argument. "Revise titration" is advice anyone can give;
     "six times the value of the same hour on bonding" is one only a memory
     model and a real calendar can produce, and it is the reason to open this
     app instead of a chatbot. */
  it("states how much better the top topic is than the worst", () => {
    renderCard();
    expect(screen.getByText(/6\.0× what the same hour buys you on Bonding/)).toBeInTheDocument();
  });

  it("drops the comparison when the gap is too small to change a decision", () => {
    trajectory.mockReturnValue({
      exam,
      candidates: [exam],
      forecast: forecast({
        interventions: [
          intervention({ label: "Titration", pointsPerHour: 2.1 }),
          intervention({ label: "Bonding", pointsPerHour: 2.0 }),
        ],
      }),
      needsMaterial: false,
      isPending: false,
    });
    renderCard();
    expect(screen.queryByText(/what the same hour buys you/)).not.toBeInTheDocument();
  });

  it("starts a block on the top topic and sends the student to the timer", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: /Start 45 min on Titration/ }));
    expect(prepareFocus).toHaveBeenCalledWith(45, "Titration");
    expect(await screen.findByText("Timer Page")).toBeInTheDocument();
  });

  it("says the target is gone rather than softening it", () => {
    trajectory.mockReturnValue({
      exam,
      candidates: [exam],
      forecast: forecast({ verdict: "not-enough-time" }),
      needsMaterial: false,
      isPending: false,
    });
    renderCard();
    expect(screen.getByText(/out of reach in the time left/)).toBeInTheDocument();
  });

  /* Silence is the correct output when the forecast would have to guess: the
     cards below this one handle "no exam" and "no material" properly, and a
     hedged number here would undermine every honest number elsewhere. */
  it("renders nothing at all without a forecast to stand on", () => {
    trajectory.mockReturnValue({
      exam: null,
      candidates: [],
      forecast: null,
      needsMaterial: false,
      isPending: false,
    });
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when no topic is worth an hour", () => {
    trajectory.mockReturnValue({
      exam,
      candidates: [exam],
      forecast: forecast({
        interventions: [intervention({ label: "Bonding", pointsPerHour: 0 })],
      }),
      needsMaterial: false,
      isPending: false,
    });
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });
});
