import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { AiError } from "../../api/ai";
import { pastYouSays } from "../../api/aiPastYou";
import type { Misconception, MisconceptionObservation } from "../../lib/misconceptions";
import { recordLoopObservation } from "../../lib/offlineSync";
import { MAX_TURNS } from "../../lib/pastYou";
import { PastYouView } from "./PastYouView";

const mocks = vi.hoisted(() => ({
  all: [] as Misconception[],
  observations: [] as MisconceptionObservation[],
}));

vi.mock("../../hooks/useMisconceptions", async (orig) => ({
  ...(await orig<typeof import("../../hooks/useMisconceptions")>()),
  useMisconceptions: () => ({ all: mocks.all, ranked: mocks.all, isPending: false }),
  useMisconceptionObservations: () => ({ data: mocks.observations, isPending: false }),
}));
vi.mock("../../lib/offlineSync", async (orig) => ({
  ...(await orig<typeof import("../../lib/offlineSync")>()),
  recordLoopObservation: vi.fn().mockResolvedValue({ queued: false }),
}));
vi.mock("../../api/aiPastYou", async (orig) => ({
  ...(await orig<typeof import("../../api/aiPastYou")>()),
  pastYouSays: vi.fn(),
}));

const said = vi.mocked(pastYouSays);

function open(patch: Partial<Misconception> = {}): Misconception {
  return {
    id: "m1",
    subject: "Physics",
    concept: "Free fall",
    conceptKey: "free fall",
    summary: "heavier objects fall faster",
    status: "open",
    severity: "moderate",
    originTool: "quiz",
    timesObserved: 1,
    timesCorrected: 0,
    firstSeenAt: "2026-10-12T09:00:00.000Z",
    lastSeenAt: "2026-10-12T09:00:00.000Z",
    resolvedAt: null,
    repairedAt: null,
    retestDueAt: null,
    repairText: "Without air, everything falls with the same acceleration.",
    excludedQuestionKeys: [],
    ...patch,
  };
}

function renderAt(id = "m1") {
  return renderWithAuth(
    <Routes>
      <Route path="/past-you/:misconceptionId" element={<PastYouView />} />
      <Route path="/" element={<p>Home</p>} />
    </Routes>,
    { session: fakeSession() },
    { initialEntries: [`/past-you/${id}`] },
  );
}

async function argue(text: string) {
  await userEvent.type(screen.getByLabelText("Your argument"), text);
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
}

const ARG_1 = "A feather is slow only because air pushes back on it.";
const ARG_2 = "In a vacuum a hammer and a feather land together, the Moon showed it.";

beforeEach(() => {
  mockAuthSession("user-1");
  vi.clearAllMocks();
  mocks.all = [open()];
  mocks.observations = [
    {
      id: "o1",
      misconceptionId: "m1",
      sourceTool: "quiz",
      sourceId: null,
      kind: "evidence",
      detail: 'Chose "The bowling ball lands first".',
      occurredAt: "2026-10-12T09:00:00.000Z",
    },
  ];
});

describe("talk past you out of it", () => {
  it("opens with past you defending the belief, quoting the record", async () => {
    said.mockResolvedValueOnce({ reply: "I picked the bowling ball. Heavy wins.", belief: 100, landed: "" });
    renderAt();
    expect(screen.getByText("heavier objects fall faster")).toBeInTheDocument();
    expect(await screen.findByText("I picked the bowling ball. Heavy wins.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Past you is 100% sure of the old idea" })).toBeInTheDocument();
    expect(said.mock.calls[0][1]).toEqual(['Chose "The bowling ball lands first".']);
    expect(said.mock.calls[0][2]).toEqual([]);
    expect(screen.getByText(`${MAX_TURNS} of ${MAX_TURNS} messages left`)).toBeInTheDocument();
  });

  it("asks for a reason instead of spending a message on a few words", async () => {
    said.mockResolvedValueOnce({ reply: "Heavy wins.", belief: 100, landed: "" });
    renderAt();
    await screen.findByText("Heavy wins.");
    await argue("ur wrong");
    expect(screen.getByText("Give past you a reason. A few words won’t move them.")).toBeInTheDocument();
    expect(said).toHaveBeenCalledTimes(1);
  });

  it("two good arguments convince past you: a re-teach and a correction are recorded, never a fix", async () => {
    said
      .mockResolvedValueOnce({ reply: "Heavy wins.", belief: 100, landed: "" })
      .mockResolvedValueOnce({ reply: "Okay, air matters. But without air?", belief: 0, landed: "air pushes back" })
      .mockResolvedValueOnce({ reply: "Fine. Same acceleration for everything.", belief: 5, landed: "the Moon drop" });
    renderAt();
    await screen.findByText("Heavy wins.");

    await argue(ARG_1);
    expect(await screen.findByText("Okay, air matters. But without air?")).toBeInTheDocument();
    /* One message moves past you at most 45 points, whatever the model says. */
    expect(screen.getByRole("img", { name: "Past you is 55% sure of the old idea" })).toBeInTheDocument();
    expect(screen.getByText("✓ Got through: air pushes back")).toBeInTheDocument();
    expect(recordLoopObservation).not.toHaveBeenCalled();

    await argue(ARG_2);
    expect(await screen.findByText("You talked yourself out of it")).toBeInTheDocument();
    expect(screen.getByText("Fine. Same acceleration for everything.")).toBeInTheDocument();
    expect(screen.getByText("A check-back on a new question proves it stuck")).toBeInTheDocument();

    await waitFor(() => expect(recordLoopObservation).toHaveBeenCalledTimes(2));
    const writes = vi.mocked(recordLoopObservation).mock.calls.map((c) => c[0]);
    expect(writes.map((w) => w.kind).sort()).toEqual(["correction", "repair"]);
    for (const w of writes) {
      expect(w.sourceTool).toBe("feynman");
      expect(w.questionKey).toBeNull();
    }
    /* The argument that moved past you most is the one quoted. */
    expect(writes.find((w) => w.kind === "correction")?.detail).toContain(ARG_1);
  });

  it("keeps an already-scheduled check-back rather than pushing it back", async () => {
    mocks.all = [open({ status: "improving", repairedAt: "2026-10-20T09:00:00.000Z", retestDueAt: "2026-10-30T09:00:00.000Z" })];
    said
      .mockResolvedValueOnce({ reply: "Heavy wins.", belief: 100, landed: "" })
      .mockResolvedValueOnce({ reply: "Hm.", belief: 50, landed: "air" })
      .mockResolvedValueOnce({ reply: "You're right.", belief: 0, landed: "vacuum" });
    renderAt();
    await screen.findByText("Heavy wins.");
    await argue(ARG_1);
    await screen.findByText("Hm.");
    await argue(ARG_2);
    await screen.findByText("You talked yourself out of it");
    await waitFor(() => expect(recordLoopObservation).toHaveBeenCalledTimes(1));
    expect(vi.mocked(recordLoopObservation).mock.calls[0][0].kind).toBe("correction");
    expect(screen.getByText("Fri 30 Oct")).toBeInTheDocument();
  });

  it("runs out of messages without recording anything, and shows the right idea", async () => {
    said.mockResolvedValue({ reply: "Still think heavy wins.", belief: 100, landed: "" });
    renderAt();
    await screen.findAllByText("Still think heavy wins.");
    for (let i = 0; i < MAX_TURNS; i++) {
      await argue(`Attempt number ${i + 1} at a proper reason here.`);
      /* Past you's answer, not just the call: Send waits for it. */
      await waitFor(() => expect(screen.getAllByText("Still think heavy wins.")).toHaveLength(i + 2));
    }
    expect(await screen.findByText("Past you isn’t convinced yet")).toBeInTheDocument();
    expect(screen.getByText("Without air, everything falls with the same acceleration.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your argument")).not.toBeInTheDocument();
    expect(recordLoopObservation).not.toHaveBeenCalled();
  });

  it("says plainly when past you didn't answer, and retries the same message", async () => {
    said
      .mockResolvedValueOnce({ reply: "Heavy wins.", belief: 100, landed: "" })
      .mockRejectedValueOnce(new AiError("boom", { retryable: true }))
      .mockResolvedValueOnce({ reply: "Hm, go on.", belief: 70, landed: "air" });
    renderAt();
    await screen.findByText("Heavy wins.");
    await argue(ARG_1);
    expect(await screen.findByText("Past you didn’t answer. That’s on our side, not yours.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Hm, go on.")).toBeInTheDocument();
    expect(said.mock.calls[2][2]).toEqual([
      { from: "past", text: "Heavy wins." },
      { from: "you", text: ARG_1 },
    ]);
  });

  it("passes the allowance message through", async () => {
    said.mockRejectedValueOnce(new AiError("You've used today's allowance for this tool.", { retryable: false, status: 429 }));
    renderAt();
    expect(await screen.findByText("You've used today's allowance for this tool.")).toBeInTheDocument();
  });

  it("has nothing to argue with in a slip, and makes no call", async () => {
    mocks.all = [open({ errorType: "calculation" })];
    renderAt();
    expect(screen.getByText("There’s no belief to argue with here")).toBeInTheDocument();
    expect(said).not.toHaveBeenCalled();
  });

  it("'Not now' leaves without recording anything", async () => {
    said.mockResolvedValueOnce({ reply: "Heavy wins.", belief: 100, landed: "" });
    renderAt();
    await screen.findByText("Heavy wins.");
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(recordLoopObservation).not.toHaveBeenCalled();
  });
});
