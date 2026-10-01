import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { StudyLabView } from "./StudyLabView";
import { CognitiveBridge } from "../../lib/cognitiveBridge";
import type { Misconception } from "../../lib/misconceptions";

const ledger = vi.fn();

function SessionProbe() {
  const { search } = useLocation();
  return <h1>{`Session ${search}`}</h1>;
}

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

function renderLab(entry = "/study-lab") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/study-lab" element={<StudyLabView />} />
        <Route path="/study/:sessionId" element={<SessionProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StudyLabView", () => {
  beforeEach(() => {
    CognitiveBridge.clear();
    ledger.mockReturnValue({ ranked: [] });
  });

  it("offers the five session modes", () => {
    renderLab();
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

  it("carries the topic into whichever mode is picked", async () => {
    renderLab("/study-lab?topic=Acids%20%26%20Bases");
    expect(screen.getByDisplayValue("Acids & Bases")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /I think I understand it/ }).getAttribute("href"),
    ).toBe("/study/new?mode=teach&topic=Acids+%26+Bases");
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "Osmosis");
    expect(
      screen.getByRole("link", { name: /keep it from fading/ }).getAttribute("href"),
    ).toBe("/study/new?mode=recall&topic=Osmosis");
  });

  /* A new account has no diagnosis, and inventing one would be worse than the
     plain menu this page was. */
  it("shows no recommendation when the ledger is empty", () => {
    renderLab();
    expect(screen.queryByText(/Based on your work/)).not.toBeInTheDocument();
  });

  it("sends a first-time diagnosis to Explain, with the concept loaded", async () => {
    ledger.mockReturnValue({ ranked: [row()] });
    const user = userEvent.setup();
    renderLab();

    expect(
      screen.getByText("Based on your work in Chemistry"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Start on this/ }));

    expect(
      await screen.findByText("Session ?mode=explain&topic=Hydrolysis&misconception=m1"),
    ).toBeInTheDocument();
    expect(CognitiveBridge.getPayload()).toMatchObject({
      concept: "Hydrolysis",
      subject: "Chemistry",
      suggestedAction: "debug_stack",
    });
  });

  /* Something that survived correction is not a knowledge gap — it is an
     explanation the student believes and cannot defend, which is what
     teaching it exposes and tracing it does not. */
  it("sends a recurring one to Teach instead, and says how often it has been seen", async () => {
    ledger.mockReturnValue({
      ranked: [row({ timesObserved: 4, timesCorrected: 1 })],
    });
    const user = userEvent.setup();
    renderLab();

    expect(screen.getByText(/Seen 4 times so far/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Start on this/ }));

    expect(await screen.findByText(/Session \?mode=teach/)).toBeInTheDocument();
    expect(CognitiveBridge.getPayload()).toMatchObject({
      suggestedAction: "teach_apprentice",
    });
  });
});
