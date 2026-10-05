import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithAuth, fakeSession } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { MistakeLoopSection } from "./MistakeLoopSection";
import { mistakeTitle } from "../../lib/mistakeLoop";
import type { Misconception } from "../../lib/misconceptions";
import { recordLoopObservation } from "../../lib/offlineSync";
import { bankRetestQuestion } from "../../api/retestQuestion";

vi.mock("../../lib/offlineSync", async (orig) => ({
  ...(await orig<typeof import("../../lib/offlineSync")>()),
  recordLoopObservation: vi.fn().mockResolvedValue({ queued: false }),
}));
vi.mock("../../api/retestQuestion", () => ({
  bankRetestQuestion: vi.fn(),
  aiRetestQuestion: vi.fn(),
}));

const NOW = new Date("2026-10-10T09:00:00Z");

function row(patch: Partial<Misconception>): Misconception {
  return {
    id: "m1",
    subject: "History",
    concept: "Single-cause explanations",
    conceptKey: "single cause explanations",
    summary: "Big events have one cause.",
    status: "open",
    severity: "moderate",
    originTool: "quiz",
    timesObserved: 1,
    timesCorrected: 0,
    firstSeenAt: "2026-10-01T00:00:00Z",
    lastSeenAt: "2026-10-01T00:00:00Z",
    resolvedAt: null,
    provisional: true,
    repairText: "Causes interact: name two and say how one made the other worse.",
    contrastText: "'The war caused it' vs 'the war and the crash together caused it'.",
    repairedAt: null,
    retestDueAt: null,
    excludedQuestionKeys: [],
    ...patch,
  };
}

beforeEach(() => {
  mockAuthSession("user-1");
  vi.clearAllMocks();
});

describe("provisional misconceptions on Today", () => {
  it("are not shown as a named pattern after one sighting", () => {
    expect(mistakeTitle(row({ timesObserved: 1 }))).toBe("A History question you missed");
    expect(mistakeTitle(row({ timesObserved: 2 }))).toBe("Single-cause explanations");
  });

  it("label an AI repair as unverified, and 'Got it' records the repair", async () => {
    renderWithAuth(<MistakeLoopSection misconceptions={[row({ timesObserved: 2 })]} now={NOW} />, {
      session: fakeSession(),
    });
    await userEvent.click(screen.getByRole("button", { name: "Fix it" }));
    expect(screen.getByText("Suggested by AI, not yet verified")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() =>
      expect(recordLoopObservation).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "repair", misconceptionId: "m1" }),
      ),
    );
    expect(screen.getByText(/different question in a couple of days/)).toBeInTheDocument();
  });
});

describe("retests on Today", () => {
  const due = row({
    status: "improving",
    provisional: false,
    repairedAt: "2026-10-05T09:00:00Z",
    retestDueAt: "2026-10-07T09:00:00Z",
  });

  it("only appear once due", () => {
    const { container } = renderWithAuth(
      <MistakeLoopSection misconceptions={[{ ...due, retestDueAt: "2026-10-12T09:00:00Z" }]} now={NOW} />,
      { session: fakeSession() },
    );
    expect(within(container).queryByRole("button", { name: "Retest" })).toBeNull();
  });

  it("an answer is recorded once, with the new question, however often it's clicked", async () => {
    vi.mocked(bankRetestQuestion).mockResolvedValue({
      question: "Which best explains the collapse?",
      choices: ["One cause", "Several interacting causes"],
      correctIndex: 1,
      source: "bank",
    });
    renderWithAuth(<MistakeLoopSection misconceptions={[due]} now={NOW} />, { session: fakeSession() });
    await userEvent.click(screen.getByRole("button", { name: "Retest" }));
    const right = await screen.findByRole("button", { name: "Several interacting causes" });
    await userEvent.click(right);
    await userEvent.click(right);
    expect(recordLoopObservation).toHaveBeenCalledTimes(1);
    expect(recordLoopObservation).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "correction", misconceptionId: "m1", idempotencyKey: expect.stringContaining("retest:m1:") }),
    );
  });
});
