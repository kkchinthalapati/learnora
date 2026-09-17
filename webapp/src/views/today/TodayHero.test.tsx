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
    expect(screen.getByText(/mastery is low/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /start 45 min/i }));
    expect(onStart).toHaveBeenCalledWith("d1", "Enzymes");
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
