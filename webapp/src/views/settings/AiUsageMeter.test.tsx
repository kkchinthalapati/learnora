import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/render";
import { AiUsageMeter } from "./AiUsageMeter";
import { quotaUsage } from "../../lib/entitlements";
import { useAiUsage } from "../../hooks/useAiUsage";

/* The hook is covered by api/aiUsage.test.ts and the entitlements tests; what
 * is worth pinning here is the meter's own presentation decisions — which of
 * them are safe to make while the number is still unknown. */
vi.mock("../../hooks/useAiUsage", () => ({ useAiUsage: vi.fn() }));

const mockedUseAiUsage = vi.mocked(useAiUsage);

function state(
  plan: "free" | "pro",
  used: number,
  overrides: Partial<ReturnType<typeof useAiUsage>> = {},
) {
  return {
    usage: quotaUsage(plan, "aiGenerationsPerDay", used),
    resetsAt: "2026-09-05T00:00:00.000Z",
    isPending: false,
    isError: false,
    ...overrides,
  };
}

describe("AiUsageMeter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows what is left, not what is spent", async () => {
    mockedUseAiUsage.mockReturnValue(state("free", 7));
    renderWithProviders(<AiUsageMeter isPro={false} />);

    // 25 - 7. The remaining count is the number a decision turns on.
    expect(await screen.findByText(/18 of 25 left/i)).toBeInTheDocument();
  });

  it("exposes the count to assistive tech, not just the bar width", async () => {
    mockedUseAiUsage.mockReturnValue(state("free", 7));
    renderWithProviders(<AiUsageMeter isPro={false} />);

    const bar = await screen.findByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "7");
    expect(bar).toHaveAttribute("aria-valuemax", "25");
    expect(bar).toHaveAttribute(
      "aria-valuetext",
      "7 of 25 generations used today",
    );
  });

  it("renders no number at all while the count is still loading", () => {
    mockedUseAiUsage.mockReturnValue(
      state("free", 0, { isPending: true, resetsAt: null }),
    );
    renderWithProviders(<AiUsageMeter isPro={false} />);

    /* "0 used" and "not known yet" look identical on screen, and showing the
       wrong one tells someone who is nearly out that they have a full day. */
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/left/i)).not.toBeInTheDocument();
  });

  it("says the counter failed without implying the limit lifted", async () => {
    mockedUseAiUsage.mockReturnValue(
      state("free", 0, { isError: true, resetsAt: null }),
    );
    renderWithProviders(<AiUsageMeter isPro={false} />);

    expect(
      await screen.findByText(/daily allowance still applies/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("points a spent free user at Pro, and a spent Pro user only at the reset", async () => {
    mockedUseAiUsage.mockReturnValue(state("free", 25));
    const { unmount } = renderWithProviders(<AiUsageMeter isPro={false} />);
    expect(
      await screen.findByText(/Pro raises the limit/i),
    ).toBeInTheDocument();
    unmount();

    mockedUseAiUsage.mockReturnValue(state("pro", 400));
    renderWithProviders(<AiUsageMeter isPro />);
    expect(await screen.findByText(/reset at midnight/i)).toBeInTheDocument();
    // Nothing to upsell someone who already pays.
    expect(screen.queryByText(/Pro raises the limit/i)).not.toBeInTheDocument();
  });

  it("caps the bar at full when usage is at the limit", async () => {
    mockedUseAiUsage.mockReturnValue(state("free", 25));
    renderWithProviders(<AiUsageMeter isPro={false} />);
    const bar = await screen.findByRole("progressbar");
    expect(bar.firstElementChild).toHaveStyle({ width: "100%" });
  });
});
