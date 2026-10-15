import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { clearStudySnapshot, getStudySnapshot } from "../../lib/continuity";
import { listStudySessions, loadStudySession } from "../../lib/studySessions";
import { loadRun, saveRun, type SessionRun } from "../../lib/adaptiveSession";
import type { Misconception } from "../../lib/misconceptions";
import { SessionView } from "./SessionView";

const mocks = vi.hoisted(() => ({
  diagnose: vi.fn(),
  repair: vi.fn(),
  mutate: vi.fn(),
  record: vi.fn(),
  event: vi.fn(async () => true),
  due: [] as Array<Record<string, unknown>>,
  ranked: [] as Misconception[],
  /* Teach's apprentice never answers here: the run tests only need the
     screen it opens on. */
  draft: vi.fn(() => new Promise(() => {})),
}));

vi.mock("../../api/aiFeynman", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/aiFeynman")>()),
  generateApprenticeDraft: mocks.draft,
}));

vi.mock("../../hooks/useExams", () => ({
  useExams: () => ({ data: [], isPending: false }),
}));

vi.mock("../../hooks/useFolders", () => ({
  useFolders: () => ({ data: [], isPending: false }),
}));

vi.mock("../../api/aiDebugger", () => ({
  generateMicroRepair: mocks.repair,
}));

/* Explain plans with aiExplain since 2026-10 (the debugger's diagnosis
   wrote "mistakes" for a topic the student only named). Same trace shape. */
vi.mock("../../api/aiExplain", () => ({
  planExplanation: mocks.diagnose,
}));

vi.mock("../../api/learningEvents", () => ({
  learningEventsApi: { record: mocks.event },
}));

vi.mock("../../hooks/useMisconceptions", () => ({
  useMisconceptions: () => ({
    all: mocks.ranked,
    ranked: mocks.ranked,
    forSubject: () => [],
    isPending: false,
  }),
  useRecordMisconceptions: () => mocks.record,
}));

vi.mock("../../hooks/useFlashcards", () => ({
  useAllDueFlashcards: () => ({ data: mocks.due, isPending: false }),
  useFlashcardsDueCount: () => ({ data: mocks.due.length, isPending: false }),
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
  mocks.record.mockReset();
  mocks.event.mockClear();
  mocks.due = [];
  mocks.ranked = [];
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

  it("Explain: the plan writes no mistakes; only a missed check does, and the retry is a new question", async () => {
    const challenge = (id: string, prompt: string) => ({
      challenge: {
        id,
        rootConcept: "Gradients store energy",
        intuitionSummary: "Like water behind a dam.",
        verified: false,
        interactiveExercise: {
          prompt,
          options: ["The gradient", "The glucose", "The light", "The water"],
          correctIndex: 0,
          firstPrinciplesExplanation: "The gradient is the store.",
        },
      },
    });
    mocks.diagnose.mockResolvedValue(trace);
    mocks.repair
      .mockResolvedValueOnce(challenge("r1", "Where is the energy stored?"))
      .mockResolvedValueOnce(challenge("r2", "What would a leak in the membrane do?"));
    renderSession("/study/new?mode=explain&topic=ATP%20synthesis");

    await screen.findByRole("heading", { level: 2, name: "Gradients store energy" });
    expect(mocks.record).not.toHaveBeenCalled();

    for (let i = 0; i < 3; i++) {
      await userEvent.click(await screen.findByRole("button", { name: "I've got it, next step" }));
    }
    await userEvent.click(await screen.findByRole("button", { name: /The glucose/ }));
    /* The miss is the evidence: one ledger row, and a score of 0. */
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(mocks.record.mock.calls[0][0][0]).toMatchObject({ kind: "evidence", concept: "Gradients store energy" });
    expect(mocks.event).toHaveBeenLastCalledWith(expect.objectContaining({ score: 0 }));

    await userEvent.click(screen.getByRole("button", { name: "Try a different question" }));
    expect(await screen.findByText("What would a leak in the membrane do?")).toBeInTheDocument();
    expect(mocks.repair).toHaveBeenLastCalledWith("Gradients store energy", {
      avoidPrompt: "Where is the energy stored?",
    });
    await userEvent.click(screen.getByRole("button", { name: /The gradient/ }));
    expect(mocks.record.mock.calls[1][0][0]).toMatchObject({ kind: "correction" });
    expect(mocks.event).toHaveBeenLastCalledWith(expect.objectContaining({ score: 1 }));
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

  it("Save and stop pauses without asking, and Today can resume it", async () => {
    mocks.diagnose.mockResolvedValue(trace);
    renderSession("/study/new?mode=explain&topic=ATP%20synthesis");
    await screen.findByRole("heading", { level: 2, name: "Gradients store energy" });
    await userEvent.click(screen.getByRole("button", { name: "Save and stop" }));

    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
    const pointer = getStudySnapshot().lastStudySession;
    expect(pointer).toMatchObject({ objective: "ATP synthesis", status: "paused", totalSteps: 4 });
    expect(loadStudySession(pointer!.id)?.status).toBe("paused");
  });

  it("looks for a session on the server before saying it can't be found", async () => {
    renderSession("/study/s-unknown?mode=explain");
    expect(screen.getByText(/Fetching this session from your other device/)).toBeInTheDocument();
    expect(await screen.findByText("That session couldn't be found.")).toBeInTheDocument();
  });

  it("opens a session another device saved", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("../../test/mocks/server");
    const { SUPABASE_URL } = await import("../../lib/supabase");
    const { createStudySession } = await import("../../lib/studySessions");
    const remote = { ...createStudySession({ objective: "Titration", mode: "explain", id: "s-laptop01" }), plan: [{ id: "a", label: "Moles" }] };
    server.use(http.get(`${SUPABASE_URL}/rest/v1/study_session_state`, () => HttpResponse.json({ record: remote })));
    mocks.diagnose.mockResolvedValue(trace);
    renderSession("/study/s-laptop01?mode=explain");
    expect(await screen.findByRole("heading", { level: 1, name: "Titration" })).toBeInTheDocument();
    expect(loadStudySession("s-laptop01")).not.toBeNull();
  });

  describe("as one activity of Study's adaptive session", () => {
    const hydrolysis: Misconception = {
      id: "m1",
      subject: "Chemistry",
      concept: "Hydrolysis",
      conceptKey: "hydrolysis",
      summary: "Believes water is consumed rather than added.",
      status: "open",
      severity: "critical",
      originTool: "quiz",
      timesObserved: 2,
      timesCorrected: 1,
      firstSeenAt: "2026-09-01T00:00:00Z",
      lastSeenAt: "2026-09-05T00:00:00Z",
      resolvedAt: null,
    };

    function seedRun(patch: Partial<SessionRun> = {}): void {
      saveRun({
        id: "r1",
        focus: { topic: "Hydrolysis", subject: "Chemistry", misconceptionId: "m1" },
        startedAt: "2026-10-15T10:00:00Z",
        done: ["check"],
        taught: [],
        current: {
          kind: "flashcards",
          mode: "recall",
          title: "Flashcards",
          topic: "Hydrolysis",
          why: "3 cards are due.",
        },
        ...patch,
      });
    }

    it("says where the student is, and opens the next activity as a new Session", async () => {
      mocks.ranked = [hydrolysis];
      seedRun();
      renderSession("/study/new?mode=recall&topic=Hydrolysis&run=r1");

      const bar = await screen.findByRole("region", { name: "Your session" });
      expect(bar).toHaveTextContent("Step 2 Flashcards");
      const recallId = loadRun("r1")?.current?.sessionId;
      expect(recallId).toBeTruthy();

      await userEvent.click(within(bar).getByRole("button", { name: "Skip to: Teach it back" }));

      await waitFor(() =>
        expect(screen.getByTestId("where").textContent).toMatch(/^\/study\/s-.+\?mode=teach$/),
      );
      /* Moving on closes the activity it left. */
      expect(loadStudySession(recallId!)?.status).toBe("done");
      const run = loadRun("r1")!;
      expect(run.done).toEqual(["check", "flashcards"]);
      expect(run.current).toMatchObject({ kind: "teach", misconceptionId: "m1" });
      const teach = loadStudySession(run.current!.sessionId!)!;
      expect(teach).toMatchObject({ mode: "teach", objective: "Hydrolysis", runId: "r1" });
      expect(teach.id).not.toBe(recallId);
      expect(
        await screen.findByRole("region", { name: "Your session" }),
      ).toHaveTextContent("Step 3 Teach it back");
      expect(screen.getByRole("button", { name: "Skip to: Exam traps" })).toBeInTheDocument();
    });

    it("finishes the run when nothing is left to pick", async () => {
      seedRun({ focus: { topic: "Osmosis" } });
      renderSession("/study/new?mode=recall&topic=Osmosis&run=r1");
      await userEvent.click(await screen.findByRole("button", { name: "Finish session" }));
      expect(await screen.findByRole("heading", { name: "Study hub" })).toBeInTheDocument();
      expect(screen.getByTestId("where")).toHaveTextContent("/study?finished=r1");
      expect(loadRun("r1")).toMatchObject({ current: null, done: ["check", "flashcards"] });
    });

    it("shows no run bar on an ordinary Session", async () => {
      renderSession("/study/new?mode=recall&topic=Osmosis");
      await screen.findByRole("heading", { level: 1, name: "Osmosis" });
      expect(screen.queryByRole("region", { name: "Your session" })).not.toBeInTheDocument();
    });
  });
});
