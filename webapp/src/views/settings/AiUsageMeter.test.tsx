import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/render";
import { AiUsageMeter } from "./AiUsageMeter";
import { AI_TOOL_IDS, AI_TOOLS, quotaUsage, type AiToolId, type Plan } from "../../lib/entitlements";
import { useAiUsage } from "../../hooks/useAiUsage";

/* The hook is covered by api/aiUsage.test.ts and the entitlements tests; what
 * is worth pinning here is the meter's own presentation decisions — which of
 * them are safe to make while the number is still unknown, and that each
 * tool gets its own row now that quotas are per-tool rather than one shared
 * pool. "chat" stands in for "some tool" throughout — the rendering logic is
 * identical for all ten. */
vi.mock("../../hooks/useAiUsage", () => ({ useAiUsage: vi.fn() }));

const mockedUseAiUsage = vi.mocked(useAiUsage);
const CHAT_NAME = AI_TOOLS.chat.name;

function state(
  plan: Plan,
  usedByTool: Partial<Record<AiToolId, number>>,
  overrides: Partial<ReturnType<typeof useAiUsage>> = {},
) {
  return {
    usageFor: (tool: AiToolId) => quotaUsage(plan, tool, usedByTool[tool] ?? 0),
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

  it("renders one meter per AI tool", () => {
    mockedUseAiUsage.mockReturnValue(state("free", {}));
    renderWithProviders(<AiUsageMeter isPro={false} />);
    expect(screen.getAllByRole("progressbar")).toHaveLength(
      AI_TOOL_IDS.length,
    );
  });

  it("shows what is left, not what is spent", async () => {
    mockedUseAiUsage.mockReturnValue(state("free", { chat: 7 }));
    renderWithProviders(<AiUsageMeter isPro={false} />);

    // free chat is 15/day; 15 - 7. The remaining count is what a decision
    // turns on.
    expect(await screen.findByText(/8 of 15 left/i)).toBeInTheDocument();
  });

  it("exposes the count to assistive tech, not just the bar width", async () => {
    mockedUseAiUsage.mockReturnValue(state("free", { chat: 7 }));
    renderWithProviders(<AiUsageMeter isPro={false} />);

    const bar = await screen.findByRole("progressbar", { name: CHAT_NAME });
    expect(bar).toHaveAttribute("aria-valuenow", "7");
    expect(bar).toHaveAttribute("aria-valuemax", "15");
    expect(bar).toHaveAttribute(
      "aria-valuetext",
      `7 of 15 ${CHAT_NAME} generations used today`,
    );
  });

  it("renders no numbers at all while the count is still loading", () => {
    mockedUseAiUsage.mockReturnValue(
      state("free", {}, { isPending: true, resetsAt: null }),
    );
    renderWithProviders(<AiUsageMeter isPro={false} />);

    /* "0 used" and "not known yet" look identical on screen, and showing the
       wrong one tells someone who is nearly out that they have a full day. */
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/left/i)).not.toBeInTheDocument();
  });

  it("says the counter failed without implying the limit lifted", async () => {
    mockedUseAiUsage.mockReturnValue(
      state("free", {}, { isError: true, resetsAt: null }),
    );
    renderWithProviders(<AiUsageMeter isPro={false} />);

    expect(
      await screen.findByText(/daily allowance still applies/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("points a free user at Plus/Pro, and a Pro user only at the reset", async () => {
    mockedUseAiUsage.mockReturnValue(state("free", { chat: 15 }));
    const { unmount } = renderWithProviders(<AiUsageMeter isPro={false} />);
    expect(
      await screen.findByText(/Plus and Pro raise/i),
    ).toBeInTheDocument();
    unmount();

    mockedUseAiUsage.mockReturnValue(state("pro", { chat: 200 }));
    renderWithProviders(<AiUsageMeter isPro />);
    expect(
      await screen.findByText(/own daily allowance/i),
    ).toBeInTheDocument();
    // Nothing to upsell someone who already pays for the top tier.
    expect(screen.queryByText(/Plus and Pro raise/i)).not.toBeInTheDocument();
  });

  it("marks a tool used up once it hits its limit", async () => {
    mockedUseAiUsage.mockReturnValue(state("free", { chat: 15 }));
    renderWithProviders(<AiUsageMeter isPro={false} />);
    expect(await screen.findByText("Used up")).toBeInTheDocument();
  });

  it("caps the bar at full when usage is at the limit", async () => {
    mockedUseAiUsage.mockReturnValue(state("free", { chat: 15 }));
    renderWithProviders(<AiUsageMeter isPro={false} />);
    const bar = await screen.findByRole("progressbar", { name: CHAT_NAME });
    expect(bar.firstElementChild).toHaveStyle({ width: "100%" });
  });
});
