import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { MISCONCEPTION_CATALOGUE } from "../../lib/misconceptionCatalogue";
import type { Misconception } from "../../lib/misconceptions";
import { recordLoopObservation } from "../../lib/offlineSync";
import { HABITS } from "../../lib/errorHabits";
import { HabitView } from "./HabitView";

const mocks = vi.hoisted(() => ({ all: [] as Misconception[], isPending: false }));

vi.mock("../../hooks/useMisconceptions", async (orig) => ({
  ...(await orig<typeof import("../../hooks/useMisconceptions")>()),
  useMisconceptions: () => ({ all: mocks.all, ranked: mocks.all, isPending: mocks.isPending }),
}));
vi.mock("../../lib/offlineSync", async (orig) => ({
  ...(await orig<typeof import("../../lib/offlineSync")>()),
  recordLoopObservation: vi.fn().mockResolvedValue({ queued: false }),
}));

function row(catalogueId: string, patch: Partial<Misconception> = {}): Misconception {
  const entry = MISCONCEPTION_CATALOGUE.find((e) => e.id === catalogueId)!;
  return {
    id: catalogueId,
    subject: entry.subject,
    concept: entry.concept,
    conceptKey: entry.concept.toLowerCase(),
    summary: entry.belief,
    status: "open",
    severity: "moderate",
    originTool: "quiz",
    timesObserved: 2,
    timesCorrected: 0,
    firstSeenAt: "2026-10-12T09:00:00.000Z",
    lastSeenAt: "2026-10-20T09:00:00.000Z",
    resolvedAt: null,
    repairedAt: null,
    retestDueAt: null,
    excludedQuestionKeys: [],
    catalogueId,
    ...patch,
  };
}

function renderAt(slug = "overgeneralisation") {
  return renderWithAuth(
    <Routes>
      <Route path="/analytics/habits/:slug" element={<HabitView />} />
      <Route path="/analytics" element={<p>Progress</p>} />
    </Routes>,
    { session: fakeSession() },
    { initialEntries: [`/analytics/habits/${slug}`] },
  );
}

const heavier = MISCONCEPTION_CATALOGUE.find((e) => e.id === "phys-heavier-falls-faster")!;

beforeEach(() => {
  mockAuthSession("user-1");
  vi.clearAllMocks();
  mocks.isPending = false;
  mocks.all = [row("phys-heavier-falls-faster"), row("bio-antibiotics-viruses"), row("maths-multiply-makes-bigger")];
});

describe("a habit across subjects", () => {
  it("names the habit as the page's one heading, and says only where the ledger shows it", () => {
    renderAt();
    expect(screen.getByRole("heading", { level: 1, name: HABITS.Overgeneralisation.name })).toBeInTheDocument();
    expect(screen.getByText(HABITS.Overgeneralisation.looksLike)).toBeInTheDocument();
    expect(screen.getByText(/^Shows up in /)).toBeInTheDocument();
  });

  it("groups the student's own mistakes by subject", () => {
    renderAt();
    for (const subject of ["Biology", "Mathematics", "Physics"]) {
      expect(screen.getByRole("region", { name: subject })).toBeInTheDocument();
    }
    const physics = screen.getByRole("region", { name: "Physics" });
    expect(within(physics).getByText(heavier.belief)).toBeInTheDocument();
  });

  it("marks what is already fixed", () => {
    mocks.all = [
      row("phys-heavier-falls-faster", { status: "resolved", resolvedAt: "2026-10-25T00:00:00Z" }),
      row("bio-antibiotics-viruses"),
    ];
    renderAt();
    expect(screen.getByText(/You fixed this in Physics\. Watch for it in Biology\./)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Physics" })).getByText("Fixed")).toBeInTheDocument();
  });

  it("offers the move and the question, and nothing is recorded just by looking", () => {
    renderAt();
    expect(screen.getByText(HABITS.Overgeneralisation.move)).toBeInTheDocument();
    expect(screen.getByText(HABITS.Overgeneralisation.question)).toBeInTheDocument();
    expect(recordLoopObservation).not.toHaveBeenCalled();
  });

  it("'Fix it' opens the catalogue's re-teach for that row, which is recorded as its repair", async () => {
    renderAt();
    const physics = screen.getByRole("region", { name: "Physics" });
    await userEvent.click(within(physics).getByRole("button", { name: "Fix it" }));
    expect(await within(physics).findByText(heavier.remediation, { exact: false })).toBeInTheDocument();
    expect(recordLoopObservation).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "repair", misconceptionId: "phys-heavier-falls-faster" }),
    );
    expect(recordLoopObservation).toHaveBeenCalledTimes(1);
    await userEvent.click(within(physics).getByRole("button", { name: "Hide" }));
    expect(within(physics).queryByText(heavier.remediation, { exact: false })).not.toBeInTheDocument();
  });

  it("is honest when the ledger doesn't show this habit across subjects right now", () => {
    mocks.all = [row("phys-heavier-falls-faster")];
    renderAt();
    expect(screen.getByText("Nothing in your mistakes shows this one across subjects right now.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Physics" })).not.toBeInTheDocument();
    expect(screen.getByText(HABITS.Overgeneralisation.move)).toBeInTheDocument();
  });

  it("waits for the ledger instead of claiming there is nothing", () => {
    mocks.isPending = true;
    mocks.all = [];
    renderAt();
    expect(screen.getByLabelText("Finding your examples")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing in your mistakes/)).not.toBeInTheDocument();
  });

  it("handles a link to a habit that doesn't exist", () => {
    renderAt("nope");
    expect(screen.getByText("We don’t have that habit")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to your mistakes" })).toHaveAttribute("href", "/analytics?tab=mistakes");
  });
});
