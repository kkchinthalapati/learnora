import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { TodayHero } from "./TodayHero";
import type { Exam, QuizAttempt } from "../../api/types";
import type { LastStudySession } from "../../lib/continuity";
import type { Misconception } from "../../lib/misconceptions";
import type { TrajectoryForecast } from "../../lib/trajectory";

const exam = { id: 1, exam_name: "AP Chem Unit 3", exam_date: "2026-09-18" } as Exam;
const forecast = {
  examName: "AP Chem Unit 3", examDate: "2026-09-18", daysRemaining: 2,
  todayScore: 52, projectedScore: 61, driftScore: 47, planValue: 14,
  confidence: { lower: 55, upper: 68, evidence: 0.6 }, curve: [], availableMins: 300,
  minsToTarget: null, targetScore: 70, verdict: "close", topics: [],
  interventions: [{ topicId: "d1", label: "Enzymes", points: 3, pointsPerHour: 4, mastery: 0.3, atRisk: false }],
} as TrajectoryForecast;

const now = new Date("2026-09-30T10:00:00");

function renderHero(props: Partial<Parameters<typeof TodayHero>[0]> = {}) {
  return render(
    <MemoryRouter>
      <TodayHero
        exam={exam}
        forecast={forecast}
        needsMaterial={false}
        isPending={false}
        onStart={() => {}}
        now={now}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("TodayHero — next step", () => {
  it("names the topic in one headline and keeps the timed block as the fallback", async () => {
    const onStart = vi.fn();
    renderHero({ onStart });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Study Enzymes next.");
    /* mastery 0.3 on 0.6 evidence: getting it wrong, not forgetting it. */
    expect(screen.getByRole("link", { name: /find what's missing in enzymes/i })).toBeInTheDocument();
    expect(screen.getByText(/rehearse the same mistake/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /start 45 min instead/i }));
    expect(onStart).toHaveBeenCalledWith("d1", "Enzymes");
  });

  it("offers due-card review when the topic is understood and slipping", () => {
    const known = { ...forecast, interventions: [{ ...forecast.interventions[0], mastery: 0.55 }] } as TrajectoryForecast;
    renderHero({ forecast: known, dueCards: 12 });
    expect(screen.getByRole("link", { name: /review 12 due cards in enzymes/i })).toHaveAttribute("href", "/review/d1");
  });

  it("makes the timed block the whole action while nothing has measured the topic", async () => {
    const unmeasured = { ...forecast, confidence: { ...forecast.confidence, evidence: 0.2 } } as TrajectoryForecast;
    const onStart = vi.fn();
    renderHero({ forecast: unmeasured, onStart });
    expect(screen.queryByRole("link", { name: /find what's missing/i })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /start 45 min on enzymes/i }));
    expect(onStart).toHaveBeenCalledWith("d1", "Enzymes");
  });

  it("explains its pick for free, and leaves the predicted grade to Progress", async () => {
    const withRunnerUp = { ...forecast, interventions: [...forecast.interventions, { topicId: "d2", label: "Respiration", points: 1, pointsPerHour: 2, mastery: 0.5, atRisk: false }] } as TrajectoryForecast;
    renderHero({ forecast: withRunnerUp });
    expect(screen.queryByText(/predicted grade/i)).toBeNull();
    await userEvent.click(screen.getByText("Why Enzymes?"));
    expect(screen.getByText(/adds about 4 points/i)).toHaveTextContent(/next best: Respiration/);
    expect(screen.getByRole("link", { name: /see the full forecast/i })).toHaveAttribute("href", "/trajectory");
  });

  it("has exactly one filled primary action", () => {
    const { container } = renderHero();
    const primaries = container.querySelectorAll('[class*="primary"]');
    expect(primaries).toHaveLength(1);
  });
});

describe("TodayHero — scenarios", () => {
  const session: LastStudySession = {
    id: "s1", objective: "Cellular respiration", mode: "explain", stepIndex: 2,
    totalSteps: 5, minutesLeft: 12, status: "paused", lastActiveAt: "2026-09-29T18:00:00Z",
    stepLabel: "the electron transport chain", subject: "Biology",
    watchingFor: "ATP synthase placed in the outer membrane",
  };

  it("returning: resumes the unfinished session", () => {
    renderHero({ session, firstName: "Maya" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pick up where you left off, Maya.");
    expect(screen.getByText("Explain session · Biology")).toBeInTheDocument();
    expect(screen.getByText(/You stopped at step 3, the electron transport chain/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resume · 12 min left" })).toHaveAttribute("href", "/study/s1?mode=explain");
    expect(screen.getByText("Your notes and chat are saved")).toBeInTheDocument();
  });

  it("short on time: a mixed recall session, and the unfinished one one link away", async () => {
    const onShortOnTime = vi.fn();
    renderHero({ session, shortOnTime: true, totalDue: 18, onShortOnTime });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ten minutes is enough to keep things from fading.");
    expect(screen.getByText("18 cards due")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start · \d+ min/ })).toHaveAttribute("href", "/study/new?mode=recall&minutes=10");
    expect(screen.getByRole("link", { name: "Resume it instead" })).toHaveAttribute("href", "/study/s1?mode=explain");
  });

  it("lets the student say they only have ten minutes", async () => {
    const onShortOnTime = vi.fn();
    renderHero({ onShortOnTime });
    await userEvent.click(screen.getByRole("button", { name: "Only have 10 minutes?" }));
    expect(onShortOnTime).toHaveBeenCalledWith(true);
  });

  it("after a rough test: numbered fixes, Socratic first, results one link away", () => {
    const attempt = { id: "a", quiz_id: "q9", score: 11, total: 16, created_at: "2026-09-29T20:00:00" } as QuizAttempt;
    const fix = (id: string, concept: string) => ({ id, concept, summary: `${concept} diagnosis`, originTool: "quiz", status: "open", lastSeenAt: "2026-09-29T20:00:05" }) as Misconception;
    renderHero({ rough: { attempt, fixes: [fix("m1", "Where ATP synthase sits"), fix("m2", "Reading the yield table")] } });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Yesterday's test showed us two things to fix.");
    const first = screen.getByRole("link", { name: "Fix this · 8 min" });
    expect(first.getAttribute("href")).toMatch(/^\/study\/new\?mode=socratic&topic=Where\+ATP\+synthase\+sits&misconception=m1$/);
    expect(screen.getByRole("link", { name: "Practise · 5 min" }).getAttribute("href")).toMatch(/mode=practice/);
    expect(screen.getByText(/You got 11 of 16 right/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the full results" })).toHaveAttribute("href", "/quiz/q9/review");
  });

  it("all done: clear for today, with one optional stretch", () => {
    const quiet = { ...forecast, interventions: [], topics: [{ id: "d1", label: "Enzymes", mastery: 0.8, evidence: 0.6, stabilityDays: 60, weight: 1, cardCount: 3 }] } as unknown as TrajectoryForecast;
    renderHero({ forecast: quiet });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("You're clear for today.");
    expect(screen.getByRole("link", { name: /explain Enzymes in your own words/ })).toHaveAttribute("href", "/study/new?mode=teach&topic=Enzymes");
  });

  it("asks for material when there is an exam but nothing to project", () => {
    renderHero({ forecast: null, needsMaterial: true });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/add material for AP Chem Unit 3/i);
  });

  it("asks for an exam when there is none", () => {
    renderHero({ exam: null, forecast: null });
    expect(screen.getByRole("link", { name: /add your next exam/i })).toHaveAttribute("href", "/exams");
  });

  it("reserves the layout while loading", () => {
    renderHero({ isPending: true });
    expect(screen.getByRole("status", { name: "Working out your next step…" })).toBeInTheDocument();
  });
});
