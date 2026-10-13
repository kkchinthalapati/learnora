import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import type { Misconception } from "../../lib/misconceptions";
import { recordLoopObservation } from "../../lib/offlineSync";
import { bankRetestQuestion } from "../../api/retestQuestion";
import { CheckBackView } from "./CheckBackView";

const mocks = vi.hoisted(() => ({ all: [] as Misconception[] }));

vi.mock("../../hooks/useMisconceptions", async (orig) => ({
  ...(await orig<typeof import("../../hooks/useMisconceptions")>()),
  useMisconceptions: () => ({
    all: mocks.all,
    ranked: mocks.all,
    isPending: false,
  }),
}));
vi.mock("../../lib/offlineSync", async (orig) => ({
  ...(await orig<typeof import("../../lib/offlineSync")>()),
  recordLoopObservation: vi.fn().mockResolvedValue({ queued: false }),
}));
vi.mock("../../api/retestQuestion", () => ({
  bankRetestQuestion: vi.fn(),
  aiRetestQuestion: vi.fn(),
}));

function due(patch: Partial<Misconception> = {}): Misconception {
  const day = 86_400_000;
  return {
    id: "m1",
    subject: "Biology",
    concept: "Osmosis",
    conceptKey: "osmosis",
    summary: "Salt soaks into cells.",
    status: "improving",
    severity: "moderate",
    originTool: "quiz",
    timesObserved: 2,
    timesCorrected: 0,
    firstSeenAt: new Date(Date.now() - 9 * day).toISOString(),
    lastSeenAt: new Date(Date.now() - 4 * day).toISOString(),
    resolvedAt: null,
    repairedAt: new Date(Date.now() - 4 * day).toISOString(),
    retestDueAt: new Date(Date.now() - day).toISOString(),
    excludedQuestionKeys: [],
    ...patch,
  };
}

function renderAt(id = "m1") {
  return renderWithAuth(
    <Routes>
      <Route path="/check-back/:misconceptionId" element={<CheckBackView />} />
      <Route path="/" element={<p>Today</p>} />
    </Routes>,
    { session: fakeSession() },
    { initialEntries: [`/check-back/${id}`] },
  );
}

beforeEach(() => {
  mockAuthSession("user-1");
  vi.clearAllMocks();
  mocks.all = [due()];
  vi.mocked(bankRetestQuestion).mockResolvedValue({
    question: "A cell is put in salty water. What moves?",
    choices: ["Salt moves in", "Water moves out"],
    correctIndex: 1,
    source: "bank",
  });
});

describe("check-back", () => {
  it("shows the old belief, a new question and no hints, with 'Not now' as the only exit", async () => {
    renderAt();
    expect(screen.getByText("Check-back · 1 question")).toBeInTheDocument();
    expect(screen.getByText("Salt soaks into cells.")).toBeInTheDocument();
    expect(
      screen.getByText(/This is a new question, not the same one/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("A cell is put in salty water. What moves?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No hints on a check-back. That’s what makes it proof."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(recordLoopObservation).not.toHaveBeenCalled();
  });

  it("asks for an answer before checking", async () => {
    renderAt();
    await screen.findByText("A cell is put in salty water. What moves?");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("Pick an answer first.")).toBeInTheDocument();
    expect(recordLoopObservation).not.toHaveBeenCalled();
  });

  it("right on a new question two days on: the Fixed moment, recorded once", async () => {
    mocks.all = [
      due(),
      due({
        id: "m0",
        status: "resolved",
        resolvedAt: new Date().toISOString(),
      }),
    ];
    renderAt();
    await userEvent.click(
      await screen.findByRole("button", { name: /Water moves out/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Osmosis" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fixed")).toBeInTheDocument();
    expect(
      screen.getByText("No longer: “Salt soaks into cells.”"),
    ).toBeInTheDocument();
    expect(screen.getByText("Fixed: Osmosis.")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getByText("Proved, on a new question")).toBeInTheDocument();
    expect(
      screen.getByText("That’s 2 mix-ups you’ve fixed."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(recordLoopObservation).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "correction", misconceptionId: "m1" }),
      ),
    );
    expect(recordLoopObservation).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Done" })).toHaveFocus();
  });

  it("wrong: 'Not yet', neutral, and it stays in Fixing", async () => {
    renderAt();
    await userEvent.click(
      await screen.findByRole("button", { name: /Salt moves in/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("Not yet")).toBeInTheDocument();
    expect(screen.getByText(/It stays in\s+Fixing/)).toBeInTheDocument();
    expect(screen.queryByText("Fixed")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "B: Water moves out. The right answer",
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(recordLoopObservation).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "evidence" }),
      ),
    );
  });

  it("isn't offered before its date", async () => {
    mocks.all = [
      due({ retestDueAt: new Date(Date.now() + 2 * 86_400_000).toISOString() }),
    ];
    renderAt();
    expect(
      await screen.findByRole("heading", { name: "Not ready yet" }),
    ).toBeInTheDocument();
    expect(bankRetestQuestion).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Check" })).toBeNull();
  });

  it("says so calmly when there's nothing to check", () => {
    mocks.all = [];
    renderAt("gone");
    expect(
      screen.getByRole("heading", { name: "Nothing to check right now" }),
    ).toBeInTheDocument();
  });
});
