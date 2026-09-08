import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { StudyLabView } from "./StudyLabView";
import { CognitiveBridge } from "../../lib/cognitiveBridge";
import type { Misconception } from "../../lib/misconceptions";

const ledger = vi.fn();

vi.mock("../../hooks/useMisconceptions", () => ({
  useMisconceptions: () => ledger(),
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

function renderLab() {
  return render(
    <MemoryRouter initialEntries={["/study-lab"]}>
      <Routes>
        <Route path="/study-lab" element={<StudyLabView />} />
        <Route path="/debugger" element={<h1>Debugger Page</h1>} />
        <Route path="/feynman" element={<h1>Feynman Page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StudyLabView", () => {
  beforeEach(() => {
    CognitiveBridge.clear();
    ledger.mockReturnValue({ ranked: [] });
  });

  it("offers the four routes", () => {
    renderLab();
    expect(screen.getByText("Find the gap")).toBeInTheDocument();
    expect(screen.getByText("Prove it by teaching")).toBeInTheDocument();
    expect(screen.getByText("Challenge me out loud")).toBeInTheDocument();
    expect(screen.getByText("Practise the traps")).toBeInTheDocument();
  });

  /* A new account has no diagnosis, and inventing one would be worse than the
     plain menu this page was. */
  it("shows no recommendation when the ledger is empty", () => {
    renderLab();
    expect(screen.queryByText(/Based on your work/)).not.toBeInTheDocument();
  });

  it("sends a first-time diagnosis to the Debugger, with the concept loaded", async () => {
    ledger.mockReturnValue({ ranked: [row()] });
    const user = userEvent.setup();
    renderLab();

    expect(screen.getByText("Based on your work in Chemistry")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Start on this/ }));

    expect(await screen.findByText("Debugger Page")).toBeInTheDocument();
    expect(CognitiveBridge.getPayload()).toMatchObject({
      concept: "Hydrolysis",
      subject: "Chemistry",
      suggestedAction: "debug_stack",
    });
  });

  /* Something that survived correction is not a knowledge gap — it is an
     explanation the student believes and cannot defend, which is what
     teaching it exposes and tracing it does not. */
  it("sends a recurring one to Feynman instead, and says how often it has been seen", async () => {
    ledger.mockReturnValue({ ranked: [row({ timesObserved: 4, timesCorrected: 1 })] });
    const user = userEvent.setup();
    renderLab();

    expect(screen.getByText(/Seen 4 times so far/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Start on this/ }));

    expect(await screen.findByText("Feynman Page")).toBeInTheDocument();
    expect(CognitiveBridge.getPayload()).toMatchObject({
      suggestedAction: "teach_apprentice",
    });
  });
});
