import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { StudyLabView } from "./StudyLabView";
import { loadRun } from "../../lib/adaptiveSession";
import type { Misconception } from "../../lib/misconceptions";

const ledger = vi.fn();
const exams = vi.fn();
const dueCount = vi.fn();

function SessionProbe() {
  const { search } = useLocation();
  return <h1>{`Session ${search}`}</h1>;
}

vi.mock("../../hooks/useMisconceptions", () => ({
  useMisconceptions: () => ledger(),
}));
vi.mock("../../hooks/useExams", () => ({
  useExams: () => exams(),
}));
vi.mock("../../hooks/useFolders", () => ({
  useFolders: () => ({ data: [{ id: "f1", name: "Chemistry" }], isPending: false }),
}));
vi.mock("../../hooks/useFlashcards", () => ({
  useFlashcardsDueCount: () => dueCount(),
}));

function row(patch: Partial<Misconception> = {}): Misconception {
  return {
    id: "m1",
    subject: "Chemistry",
    concept: "Hydrolysis",
    conceptKey: "hydrolysis",
    summary: "Believes water is consumed rather than added.",
    status: "open",
    severity: "critical",
    originTool: "debugger",
    timesObserved: 1,
    timesCorrected: 0,
    firstSeenAt: "2026-09-01T00:00:00Z",
    lastSeenAt: "2026-09-05T00:00:00Z",
    resolvedAt: null,
    ...patch,
  };
}

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function renderLab(entry = "/study") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/study" element={<StudyLabView />} />
        <Route path="/study/:sessionId" element={<SessionProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const steps = () =>
  screen.getAllByRole("listitem").map((li) => li.firstChild?.textContent);

describe("StudyLabView", () => {
  beforeEach(() => {
    localStorage.clear();
    ledger.mockReturnValue({ ranked: [], isPending: false });
    exams.mockReturnValue({ data: [], isPending: false });
    dueCount.mockReturnValue({ data: 0, isPending: false });
  });

  it("opens on one Start, with the modes behind a secondary link", async () => {
    ledger.mockReturnValue({ ranked: [row()], isPending: false });
    renderLab();

    expect(screen.getAllByRole("button", { name: "Start" })).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Choose how to study" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /choose a mode yourself/ }));
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    for (const mode of ["explain", "socratic", "practice", "teach", "recall"]) {
      expect(hrefs).toContain(`/study/new?mode=${mode}`);
    }
    /* Oral practice and exam traps are variants, not separate tools. */
    expect(
      screen.getByRole("link", { name: /Oral practice, mic on/ }),
    ).toHaveAttribute("href", "/study/new?mode=socratic&voice=1");
    expect(
      screen.getByRole("link", { name: /Exam traps, timed/ }),
    ).toHaveAttribute("href", "/study/new?mode=practice&preset=traps");
  });

  it("opens the modes straight away from ?modes=1", () => {
    renderLab("/study?modes=1");
    expect(screen.getByRole("region", { name: "Choose how to study" })).toBeInTheDocument();
  });

  it("builds the session from the ledger and the next exam", () => {
    ledger.mockReturnValue({ ranked: [row({ timesObserved: 3 })], isPending: false });
    exams.mockReturnValue({
      data: [{ exam_name: "Chemistry Paper 1", exam_date: inDays(5), folder_id: "f1" }],
      isPending: false,
    });
    dueCount.mockReturnValue({ data: 8, isPending: false });
    renderLab();

    expect(screen.getByRole("heading", { name: "Hydrolysis" })).toBeInTheDocument();
    expect(screen.getByText("From your work in Chemistry")).toBeInTheDocument();
    expect(steps()).toEqual(["Quick check", "Flashcards", "Teach it back", "Exam traps"]);
    expect(screen.getByText(/come back 3 times/)).toBeInTheDocument();
    expect(screen.getAllByText(/Chemistry Paper 1 exam is in 5 days/).length).toBeGreaterThan(0);
  });

  it("starts the run on its first activity, as an ordinary Session", async () => {
    ledger.mockReturnValue({ ranked: [row()], isPending: false });
    renderLab();
    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    const probe = await screen.findByText(/^Session \?mode=practice&topic=Hydrolysis&misconception=m1&run=/);
    const runId = new URLSearchParams(probe.textContent!.replace("Session ", "")).get("run")!;
    expect(loadRun(runId)).toMatchObject({
      focus: { topic: "Hydrolysis", misconceptionId: "m1" },
      done: [],
      current: { kind: "check" },
    });
  });

  it("builds the session around a typed topic instead", async () => {
    ledger.mockReturnValue({ ranked: [row()], isPending: false });
    renderLab("/study?topic=Acids%20%26%20Bases");
    expect(screen.getByDisplayValue("Acids & Bases")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Acids & Bases" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(
      await screen.findByText(/^Session \?mode=practice&topic=Acids\+%26\+Bases&run=/),
    ).toBeInTheDocument();
  });

  it("carries the typed topic into a hand-picked mode too", async () => {
    renderLab("/study?modes=1");
    await userEvent.type(screen.getByRole("textbox"), "Osmosis");
    expect(
      screen.getByRole("link", { name: /keep it from fading/ }).getAttribute("href"),
    ).toBe("/study/new?mode=recall&topic=Osmosis");
  });

  /* A new account has no diagnosis and no exam, and inventing a topic would
     be worse than asking for one. */
  it("asks for a topic when there is nothing to go on", async () => {
    renderLab();
    expect(screen.getByRole("heading", { name: "What are you working on?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox"), "Osmosis");
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
    expect(steps()).toEqual(["Quick check"]);
  });

  it("says what a finished session did", () => {
    localStorage.setItem(
      "learnora_session_runs",
      JSON.stringify([
        {
          id: "r1",
          focus: { topic: "Hydrolysis" },
          startedAt: "2026-10-15T10:00:00Z",
          done: ["check", "teach", "traps"],
          taught: ["m1"],
          current: null,
          finishedAt: "2026-10-15T10:40:00Z",
        },
      ]),
    );
    renderLab("/study?finished=r1");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Session done: 3 activities on Hydrolysis.",
    );
  });
});
