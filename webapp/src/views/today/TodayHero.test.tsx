import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { TodayHero } from "./TodayHero";
import type { Exam } from "../../api/types";
import type { TrajectoryForecast } from "../../lib/trajectory";

const exam = { id: 1, exam_name: "AP Chem Unit 3", exam_date: "2026-09-18" } as Exam;
const forecast = {
  examName: "AP Chem Unit 3", examDate: "2026-09-18", daysRemaining: 2,
  todayScore: 52, projectedScore: 61, driftScore: 47, planValue: 14,
  confidence: { lower: 55, upper: 68, evidence: 0.6 }, curve: [], availableMins: 300,
  minsToTarget: null, targetScore: 70, verdict: "close", topics: [],
  interventions: [{ topicId: "d1", label: "Enzymes", points: 3, pointsPerHour: 4, mastery: 0.3, atRisk: false }],
} as TrajectoryForecast;

describe("TodayHero", () => {
  it("renders the decision and hands the deck id to Start", async () => {
    const onStart = vi.fn();
    render(<MemoryRouter><TodayHero exam={exam} forecast={forecast} needsMaterial={false} isPending={false} onStart={onStart} /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Study Enzymes next");
    expect(screen.getByText(/mastery of Enzymes is low/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /start 45 min/i }));
    expect(onStart).toHaveBeenCalledWith("d1", "Enzymes");
  });
  it("routes a measured-but-wrong topic into the Solver, keeping the timer as the fallback", () => {
    render(<MemoryRouter><TodayHero exam={exam} forecast={forecast} needsMaterial={false} isPending={false} onStart={() => {}} /></MemoryRouter>);
    /* mastery 0.3 on 0.6 evidence: they are getting it wrong, not forgetting
       it, so the hero leads with the tool that traces the missing step. */
    expect(screen.getByRole("link", { name: /find what's missing in enzymes/i })).toHaveAttribute("href", "/solver?topic=Enzymes");
    expect(screen.getByText(/rehearse the same mistake/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start 45 min instead/i })).toBeInTheDocument();
  });

  it("offers due-card review when the topic is understood and slipping", async () => {
    const known = { ...forecast, interventions: [{ ...forecast.interventions[0], mastery: 0.55 }] } as TrajectoryForecast;
    render(<MemoryRouter><TodayHero exam={exam} forecast={known} needsMaterial={false} isPending={false} dueCards={12} onStart={() => {}} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /review 12 due cards in enzymes/i })).toHaveAttribute("href", "/review/d1");
  });

  it("keeps the timed block as the whole action while nothing has measured the topic", async () => {
    const unmeasured = { ...forecast, confidence: { ...forecast.confidence, evidence: 0.2 } } as TrajectoryForecast;
    const onStart = vi.fn();
    render(<MemoryRouter><TodayHero exam={exam} forecast={unmeasured} needsMaterial={false} isPending={false} onStart={onStart} /></MemoryRouter>);
    expect(screen.queryByRole("link", { name: /find what's missing/i })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /start 45 min on enzymes/i }));
    expect(onStart).toHaveBeenCalledWith("d1", "Enzymes");
  });

  it("explains its pick for free, with the evidence behind it", async () => {
    const withRunnerUp = { ...forecast, interventions: [...forecast.interventions, { topicId: "d2", label: "Respiration", points: 1, pointsPerHour: 2, mastery: 0.5, atRisk: false }] } as TrajectoryForecast;
    render(<MemoryRouter><TodayHero exam={exam} forecast={withRunnerUp} needsMaterial={false} isPending={false} onStart={() => {}} /></MemoryRouter>);
    /* A predicted grade, labelled as one — not a bare range. */
    expect(screen.getByText(/predicted grade/i)).toBeInTheDocument();
    await userEvent.click(screen.getByText("Why Enzymes?"));
    expect(screen.getByText(/adds about 4 points/i)).toHaveTextContent(/next best: Respiration/);
    expect(screen.getByRole("link", { name: /see the full forecast/i })).toHaveAttribute("href", "/trajectory");
  });

  it("asks for material when there is an exam but nothing to project", () => {
    render(<MemoryRouter><TodayHero exam={exam} forecast={null} needsMaterial isPending={false} onStart={() => {}} /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/add material for AP Chem Unit 3/i);
  });
  it("asks for an exam when there is none", () => {
    render(<MemoryRouter><TodayHero exam={null} forecast={null} needsMaterial={false} isPending={false} onStart={() => {}} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /add your next exam/i })).toHaveAttribute("href", "/exams");
  });
});
