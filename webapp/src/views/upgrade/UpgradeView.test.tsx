import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { UpgradeView } from "./UpgradeView";

const mutate = vi.fn();
vi.mock("../../hooks/useSubscription", () => ({
  useEntitlements: () => ({ plan: "free", isPending: false }),
  useStartCheckout: () => ({ mutate, isPending: false, variables: undefined }),
}));
vi.mock("../../context/toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

describe("/upgrade", () => {
  it("is a page, leads with what Free includes, and marks the current plan", () => {
    render(
      <MemoryRouter>
        <UpgradeView />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Plans" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    const free = screen.getByRole("region", { name: "Free" });
    expect(within(free).getByText("Your plan")).toBeInTheDocument();
    expect(within(free).getByText("Always")).toBeInTheDocument();
    expect(within(free).queryByRole("button")).toBeNull();
  });

  it("starts checkout for the chosen plan and period, monthly unless changed", async () => {
    render(
      <MemoryRouter>
        <UpgradeView />
      </MemoryRouter>,
    );
    expect(screen.getByRole("radio", { name: "Monthly" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await userEvent.click(screen.getByRole("radio", { name: "Yearly" }));
    await userEvent.click(screen.getByRole("button", { name: "Choose Plus" }));
    expect(mutate).toHaveBeenCalledWith(
      { plan: "plus", period: "annual" },
      expect.anything(),
    );
  });
});
