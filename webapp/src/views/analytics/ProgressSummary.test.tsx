import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ReadinessCard, ThisWeekStrip } from "./ProgressSummary";

const m = vi.hoisted(() => ({
  sessions: [] as { minutes: number }[],
  misconceptions: [] as Record<string, unknown>[],
  forecast: null as unknown,
  events: [] as Record<string, unknown>[],
}));

vi.mock("../../hooks/useSessions", () => ({
  useSessionsSince: () => ({ data: m.sessions, isPending: false }),
}));
vi.mock("../../hooks/useMisconceptions", () => ({
  useMisconceptions: () => ({
    all: m.misconceptions,
    ranked: m.misconceptions,
    isPending: false,
  }),
}));
vi.mock("../../hooks/useTrajectory", () => ({
  useTrajectory: () => ({
    exam: { id: 1, exam_name: "Biology Paper 1" },
    forecast: m.forecast,
    isPending: false,
  }),
}));
vi.mock("../../hooks/useLearningEvents", () => ({
  useLearningEvents: () => ({ data: m.events, isPending: false }),
}));

const NOW = new Date("2026-10-14T12:00:00Z");
const ev = (i: number) => ({
  id: `e${i}`,
  score: 1,
  occurred_at: "2026-10-13T10:00:00Z",
});

beforeEach(() => {
  m.sessions = [{ minutes: 25 }, { minutes: 50 }];
  m.misconceptions = [
    { id: "a", status: "resolved", resolvedAt: "2026-10-12T10:00:00Z" },
    {
      id: "b",
      status: "improving",
      repairedAt: "2026-10-12T10:00:00Z",
      retestDueAt: "2026-10-15T10:00:00Z",
    },
  ];
  m.forecast = {
    confidence: { lower: 55, upper: 68, evidence: 0.6 },
    interventions: [{ label: "Enzymes" }],
  };
  m.events = [];
});

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("This week", () => {
  it("is three plain lines a parent can read", () => {
    wrap(<ThisWeekStrip now={NOW} />);
    expect(
      screen.getByRole("heading", { name: "This week" }),
    ).toBeInTheDocument();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toBe("1 hour 15 min of study in the last 7 days.");
    expect(items[1]).toBe("1 mistake corrected, and proved right days later.");
    expect(items[2]).toMatch(/^Next: a check-back on Thursday\./);
  });
});

describe("Readiness", () => {
  it("says there's not enough to go on, with a 20-segment counter, under 20 answers", () => {
    m.events = Array.from({ length: 7 }, (_, i) => ev(i));
    wrap(<ReadinessCard />);
    expect(
      screen.getByRole("heading", { name: "Not enough to go on yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "7 of 20 checked answers so far" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/out of 100/)).toBeNull();
  });

  it("is a range with a basis and a best move, and the chart has a sentence and a table", async () => {
    m.events = Array.from({ length: 24 }, (_, i) => ev(i));
    wrap(<ReadinessCard />);
    expect(
      screen.getByRole("heading", { name: "Likely 55–68 out of 100" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: /^Likely between 55 and 68 out of 100\. Possibly between/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Based on 24 checked answers/)).toBeInTheDocument();
    expect(
      screen.getByText(/Updated after Tuesday’s practice/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Practise Enzymes/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Show as a table" }),
    );
    expect(screen.getByRole("table")).toHaveTextContent("Likely5568");
  });
});
