import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import type { Misconception } from "../../lib/misconceptions";
import { recordLoopObservation } from "../../lib/offlineSync";
import { loadPairState } from "../../lib/confusionPairs";
import { getPair } from "../../lib/confusionPairData";
import { TellApartView } from "./TellApartView";

const mocks = vi.hoisted(() => ({ all: [] as Misconception[] }));

vi.mock("../../hooks/useMisconceptions", async (orig) => ({
  ...(await orig<typeof import("../../hooks/useMisconceptions")>()),
  useMisconceptions: () => ({ all: mocks.all, ranked: mocks.all, isPending: false }),
}));
vi.mock("../../lib/offlineSync", async (orig) => ({
  ...(await orig<typeof import("../../lib/offlineSync")>()),
  recordLoopObservation: vi.fn().mockResolvedValue({ queued: false }),
}));

const pair = getPair("mass-weight")!;

function named(patch: Partial<Misconception> = {}): Misconception {
  return {
    id: "mw",
    subject: "Physics",
    concept: "Mass and weight",
    conceptKey: "mass weight",
    summary: "Mass and weight are the same thing, so mass changes on the Moon.",
    status: "open",
    severity: "moderate",
    originTool: "quiz",
    timesObserved: 2,
    timesCorrected: 0,
    firstSeenAt: "2026-10-12T09:00:00.000Z",
    lastSeenAt: "2026-10-20T09:00:00.000Z",
    resolvedAt: null,
    catalogueId: "phys-mass-weight",
    ...patch,
  };
}

function renderAt(id = "mass-weight") {
  return renderWithAuth(
    <Routes>
      <Route path="/tell-apart/:pairId" element={<TellApartView />} />
      <Route path="/" element={<p>Home</p>} />
    </Routes>,
    { session: fakeSession() },
    { initialEntries: [`/tell-apart/${id}`] },
  );
}

/** The statement on screen, and the side it really belongs to. */
function current() {
  const text = screen.getByText((_, el) => el?.tagName === "P" && !!pair.statements.find((s) => s.text === el.textContent));
  return pair.statements.find((s) => s.text === text.textContent)!;
}

async function answer(side: "a" | "b" | "wrong" | "right") {
  const statement = current();
  const pick = side === "right" ? statement.side : side === "wrong" ? (statement.side === "a" ? "b" : "a") : side;
  await userEvent.click(screen.getByRole("button", { name: pair[pick].term }));
}

async function runDrill(misses: number) {
  await userEvent.click(screen.getByRole("button", { name: "Start" }));
  for (let i = 0; i < 6; i++) {
    await answer(i < misses ? "wrong" : "right");
    await userEvent.click(screen.getByRole("button", { name: i === 5 ? "See how it went" : "Next" }));
  }
}

beforeEach(() => {
  mockAuthSession("user-1");
  vi.clearAllMocks();
  localStorage.clear();
  mocks.all = [named()];
});

describe("tell them apart", () => {
  it("opens with the two ideas side by side, and says plainly they've been mixed up", () => {
    renderAt();
    expect(screen.getByRole("heading", { name: "Mass or weight?" })).toBeInTheDocument();
    expect(screen.getByText("These two have been getting mixed up.", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Mass" })).toHaveTextContent("How much matter");
    expect(screen.getByRole("region", { name: "Weight" })).toHaveTextContent("The force of gravity");
  });

  it("doesn't claim a mix-up the ledger doesn't show", () => {
    mocks.all = [];
    renderAt();
    expect(screen.getByText("These two are easy to swap in an exam.", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/been getting mixed up/)).not.toBeInTheDocument();
  });

  it("shows why straight away, neutrally for a wrong pick, and won't move on before an answer", async () => {
    renderAt();
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("1 of 6")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("1 of 6")).toBeInTheDocument();

    const statement = current();
    await answer("wrong");
    expect(screen.getByText(`Not quite: it’s ${pair[statement.side].term}`)).toBeInTheDocument();
    expect(screen.getByText(statement.why)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("2 of 6")).toBeInTheDocument();
  });

  it("a clean sort writes a correction to the named row, never a fix, and remembers the result", async () => {
    renderAt();
    await runDrill(0);
    expect(await screen.findByRole("heading", { name: "6 of 6 sorted right" })).toBeInTheDocument();
    expect(screen.getByText("No mix-ups this time.")).toBeInTheDocument();
    await waitFor(() => expect(recordLoopObservation).toHaveBeenCalledTimes(1));
    const w = vi.mocked(recordLoopObservation).mock.calls[0][0];
    expect(w).toMatchObject({ misconceptionId: "mw", kind: "correction", sourceTool: "review", questionKey: null });
    expect(await screen.findByText(/It only counts as fixed after a check-back on a new question/)).toBeInTheDocument();
    expect(loadPairState()["mass-weight"]).toMatchObject({ correct: 6, total: 6 });
  });

  it("two or more misses are evidence on the row, quoting the first one, and list what to look at", async () => {
    renderAt();
    await runDrill(2);
    expect(await screen.findByRole("heading", { name: "4 of 6 sorted right" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "The ones to look at again" }).children).toHaveLength(2);
    await waitFor(() => expect(recordLoopObservation).toHaveBeenCalledTimes(1));
    const w = vi.mocked(recordLoopObservation).mock.calls[0][0];
    expect(w).toMatchObject({ misconceptionId: "mw", kind: "evidence", sourceTool: "review" });
    expect(w.detail).toMatch(/^Mixed the two up again/);
    expect(w.questionKey).toBeTruthy();
    expect(await screen.findByText(/same mix-up showing up again/)).toBeInTheDocument();
    expect(loadPairState()["mass-weight"]).toMatchObject({ correct: 4, total: 6 });
  });

  it("one miss is a slip: nothing written, nothing claimed", async () => {
    renderAt();
    await runDrill(1);
    expect(await screen.findByRole("heading", { name: "5 of 6 sorted right" })).toBeInTheDocument();
    expect(recordLoopObservation).not.toHaveBeenCalled();
    expect(screen.queryByText(/showing up again/)).not.toBeInTheDocument();
    expect(screen.queryByText(/counts in your favour/)).not.toBeInTheDocument();
  });

  it("writes nothing to the ledger when the pair isn't one of the student's named confusions", async () => {
    mocks.all = [];
    renderAt();
    await runDrill(3);
    expect(await screen.findByRole("heading", { name: "3 of 6 sorted right" })).toBeInTheDocument();
    expect(recordLoopObservation).not.toHaveBeenCalled();
    expect(loadPairState()["mass-weight"]).toMatchObject({ correct: 3, total: 6 });
  });

  it("'Not now' leaves with nothing recorded", async () => {
    renderAt();
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(recordLoopObservation).not.toHaveBeenCalled();
    expect(loadPairState()).toEqual({});
  });

  it("handles a link to a pair that doesn't exist", () => {
    renderAt("nope");
    expect(screen.getByRole("heading", { name: "We don’t have that pair" })).toBeInTheDocument();
  });
});
