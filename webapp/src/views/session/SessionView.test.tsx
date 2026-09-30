import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { clearStudySnapshot, getStudySnapshot } from "../../lib/continuity";
import { listStudySessions, loadStudySession } from "../../lib/studySessions";
import { SessionView } from "./SessionView";

const mocks = vi.hoisted(() => ({
  diagnose: vi.fn(),
  repair: vi.fn(),
  mutate: vi.fn(),
  due: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../api/aiDebugger", () => ({
  diagnoseCognitiveGap: mocks.diagnose,
  generateMicroRepair: mocks.repair,
  recordRepairSuccess: vi.fn(),
}));

vi.mock("../../hooks/useMisconceptions", () => ({
  useMisconceptions: () => ({ all: [], ranked: [], forSubject: () => [] }),
  useRecordMisconceptions: () => vi.fn(),
}));

vi.mock("../../hooks/useFlashcards", () => ({
  useAllDueFlashcards: () => ({ data: mocks.due, isPending: false }),
  useUpdateFlashcardReview: () => ({ mutate: mocks.mutate }),
}));

vi.mock("../../hooks/useDecks", () => ({
  useAllDecks: () => ({ data: [{ id: "deck-1", title: "Biology" }] }),
}));

const trace = {
  id: "t1",
  failedQuestionOrTopic: "ATP synthesis",
  subject: "Biology",
  rootCauseSummary: "The gradient is the energy store.",
  timestamp: "2026-09-30T10:00:00Z",
  layers: [
    { level: 3, concept: "Reading the yield", status: "severed", explanation: "Surface." },
    { level: 2, concept: "Proton pumping", status: "shaky", explanation: "Middle." },
    { level: 1, concept: "Gradients store energy", status: "severed", explanation: "Root idea." },
  ],
};

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{`${pathname}${search}`}</p>;
}

function renderSession(entry: string) {
  return renderWithAuth(
    <>
      <Routes>
        <Route path="/study/:sessionId" element={<SessionView />} />
        <Route path="/" element={<h1>Today</h1>} />
        <Route path="/study" element={<h1>Study hub</h1>} />
      </Routes>
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </>,
    { session: fakeSession() },
    { initialEntries: [entry] },
  );
}

beforeEach(() => {
  mockAuthSession("user-1");
  localStorage.clear();
  clearStudySnapshot();
  mocks.diagnose.mockReset();
  mocks.repair.mockReset();
  mocks.mutate.mockReset();
  mocks.due = [];
});

afterEach(() => vi.restoreAllMocks());

describe("SessionView", () => {
  it("asks for an objective when a new session has none, then starts it", async () => {
    mocks.diagnose.mockResolvedValue(trace);
    renderSession("/study/new?mode=explain");
    expect(
      screen.getByRole("heading", { level: 1, name: "What are you working on?" }),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("What you're working on"), "ATP synthesis");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "ATP synthesis" }),
    ).toBeInTheDocument();
    /* The session gets its own URL, so a reload lands on it. */
    await waitFor(() =>
      expect(screen.getByTestId("where").textContent).toMatch(/^\/study\/s-.+\?mode=explain$/),
    );
    expect(listStudySessions()).toHaveLength(1);
  });

  it("Explain: plans from the diagnosis, root idea first, and advances on the check", async () => {
    mocks.diagnose.mockResolvedValue(trace);
    renderSession("/study/new?mode=explain&topic=ATP%20synthesis");

    expect(
      await screen.findByRole("heading", { level: 2, name: "Gradients store energy" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Step 1 · Explain")).toBeInTheDocument();
    const plan = screen.getByRole("list", { name: /Plan, 4 steps/ });
    expect(within(plan).getAllByRole("listitem")[0]).toHaveAttribute("aria-current", "step");

    await userEvent.click(screen.getByRole("button", { name: "I've got it, next step" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: "Proton pumping" }),
    ).toBeInTheDocument();
    expect(within(plan).getAllByRole("listitem")[0]).toHaveTextContent("Done:");
  });

  it("says what was kept when the tutor fails, and retrying works", async () => {
    mocks.diagnose.mockRejectedValueOnce(new Error("The AI service is busy."));
    mocks.diagnose.mockResolvedValueOnce(trace);
    renderSession("/study/new?mode=explain&topic=ATP%20synthesis");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The tutor didn't answer that one.");
    expect(alert).toHaveTextContent(/nothing was lost, and retrying is safe/);
    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: "Gradients store energy" }),
    ).toBeInTheDocument();
  });

  it("Recall: Space reveals, 3 rates the card on FSRS", async () => {
    mocks.due = [
      { id: "c1", deck_id: "deck-1", front: "Where is ATP synthase?", back: "Inner membrane", srs_interval: 1, ease_factor: 2.5, next_review_date: null },
      { id: "c2", deck_id: "deck-1", front: "What pumps protons?", back: "The chain", srs_interval: 1, ease_factor: 2.5, next_review_date: null },
    ];
    renderSession("/study/new?mode=recall&topic=ATP");
    expect(await screen.findByText("Where is ATP synthase?")).toBeInTheDocument();
    expect(screen.getByText("1 / 2 · mixed")).toBeInTheDocument();

    await userEvent.keyboard(" ");
    expect(screen.getByText("Inner membrane")).toBeInTheDocument();
    await userEvent.keyboard("3");
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: "c1" }),
      expect.anything(),
    );
    expect(await screen.findByText("What pumps protons?")).toBeInTheDocument();
  });

  it("switches mode in place and keeps the objective", async () => {
    mocks.diagnose.mockResolvedValue(trace);
    renderSession("/study/new?mode=explain&topic=ATP%20synthesis");
    await screen.findByRole("heading", { level: 2, name: "Gradients store energy" });

    const recall = screen.getByRole("button", { name: "Recall" });
    await userEvent.click(recall);
    expect(recall).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/mode=recall$/));
    expect(screen.getByRole("heading", { level: 1, name: "ATP synthesis" })).toBeInTheDocument();
    /* No cards due: Recall says so and offers Practice instead. */
    expect(screen.getByText("Nothing is due right now.")).toBeInTheDocument();
  });

  it("Save & leave pauses without asking, and Today can resume it", async () => {
    mocks.diagnose.mockResolvedValue(trace);
    renderSession("/study/new?mode=explain&topic=ATP%20synthesis");
    await screen.findByRole("heading", { level: 2, name: "Gradients store energy" });
    await userEvent.click(screen.getByRole("button", { name: "Save & leave" }));

    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
    const pointer = getStudySnapshot().lastStudySession;
    expect(pointer).toMatchObject({ objective: "ATP synthesis", status: "paused", totalSteps: 4 });
    expect(loadStudySession(pointer!.id)?.status).toBe("paused");
  });

  it("says plainly when a session isn't on this device", () => {
    renderSession("/study/s-unknown?mode=explain");
    expect(screen.getByText("That session isn't on this device.")).toBeInTheDocument();
  });
});
