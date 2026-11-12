import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import type { LearnerSignal } from "../../lib/learnerSignals";

const record = vi.fn(async (_input: unknown) => undefined);
let stored: LearnerSignal[] = [];
let available = true;
vi.mock("../../api/learnerSignals", () => ({
  learnerSignalsKey: ["learner-signals"],
  learnerSignalsApi: {
    fetchState: async () => ({ signals: stored, available }),
    record: (input: unknown) => record(input),
  },
}));

const { RateThis, StyleSuggestion } = await import("./Adapt");

beforeEach(() => {
  record.mockClear();
  stored = [];
  available = true;
  window.localStorage.clear();
});

describe("while the table is missing", () => {
  it("offers no controls that would save nothing", async () => {
    available = false;
    const { container } = renderWithProviders(
      <>
        <RateThis surface="learn" refId="x" />
      </>,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/did this work/i)).toBeNull();
    expect(container.textContent).toBe("");
  });
});

describe("RateThis", () => {
  it("asks what missed on a thumbs-down and saves the reason once", async () => {
    renderWithProviders(<RateThis surface="learn" refId="learn:m:s:1" style="visual" />);
    await userEvent.click(await screen.findByRole("button", { name: /not quite/i }));
    await userEvent.click(screen.getByRole("button", { name: /too long/i }));
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "rating", score: -1, value: "too_long", style: "visual", clientId: "rate:learn:m:s:1" }),
    );
    expect(screen.getByText(/take it into account/)).toHaveAttribute("role", "status");
  });

  it("saves a helpful rating with no reason", async () => {
    renderWithProviders(<RateThis surface="learn" refId="x" />);
    await userEvent.click(await screen.findByRole("button", { name: /helpful/i }));
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ score: 1, value: null }));
  });
});

describe("StyleSuggestion", () => {
  it("offers the switch, and stays away once dismissed", async () => {
    const onAccept = vi.fn();
    const suggestion = { style: "examples" as const, reason: "You keep asking for worked examples." };
    const { unmount } = renderWithProviders(<StyleSuggestion suggestion={suggestion} onAccept={onAccept} />);
    await userEvent.click(screen.getByRole("button", { name: /switch to worked examples/i }));
    expect(onAccept).toHaveBeenCalledWith("examples");
    await userEvent.click(screen.getByRole("button", { name: /keep my choice/i }));
    expect(screen.queryByText(/keep asking/)).toBeNull();
    unmount();
    renderWithProviders(<StyleSuggestion suggestion={suggestion} onAccept={onAccept} />);
    expect(screen.queryByText(/keep asking/)).toBeNull();
  });
});
