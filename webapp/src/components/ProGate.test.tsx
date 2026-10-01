import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { fakeSession, renderWithAuth } from "../test/auth";
import { ProGate } from "./ProGate";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

/** Serve a profiles row with the given plan columns. `null` serves no row at
 *  all, which is what a brand-new account looks like. */
function servePlan(row: Record<string, unknown> | null, delayMs = 0) {
  server.use(
    http.get(rest("profiles"), async () => {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return HttpResponse.json(row ? [row] : []);
    }),
  );
}

const PRO_ROW = {
  plan: "pro",
  plan_status: "active",
  plan_renews_at: "2026-10-01T00:00:00Z",
  plan_cancel_at_period_end: false,
};

function render() {
  return renderWithAuth(
    <ProGate feature="trajectory">
      <p>the paid thing</p>
    </ProGate>,
    { session: fakeSession() },
    { withRouter: true },
  );
}

describe("ProGate", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the feature for an entitled account", async () => {
    servePlan(PRO_ROW);
    render();
    expect(await screen.findByText("the paid thing")).toBeInTheDocument();
  });

  it("keeps working while a payment is being retried", async () => {
    servePlan({ ...PRO_ROW, plan_status: "past_due" });
    render();
    expect(await screen.findByText("the paid thing")).toBeInTheDocument();
  });

  it("closes once a subscription is cancelled", async () => {
    servePlan({ ...PRO_ROW, plan: "free", plan_status: "canceled" });
    render();
    expect(await screen.findByText(/Exam Trajectory/)).toBeInTheDocument();
    expect(screen.queryByText("the paid thing")).toBeNull();
  });

  it("shows the invitation to a free account", async () => {
    servePlan(null);
    render();
    expect(
      await screen.findByRole("button", { name: /see what pro adds/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("the paid thing")).toBeNull();
  });

  it("shows neither the feature nor the upsell while the plan is loading", async () => {
    /* Flashing "upgrade" at somebody who has already paid, on every page load,
       is a small bug with a large effect on whether they trust the product. */
    servePlan(PRO_ROW, 60);
    render();
    expect(screen.queryByText("the paid thing")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /see what pro adds/i }),
    ).toBeNull();
    expect(await screen.findByText("the paid thing")).toBeInTheDocument();
  });

  it("falls back to free when the plan cannot be read", async () => {
    /* An unreadable plan is not a licence. The gate closes rather than
       opening, and the student can still reach everything free. */
    server.use(
      http.get(rest("profiles"), () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    render();
    expect(
      await screen.findByRole("button", { name: /see what pro adds/i }),
    ).toBeInTheDocument();
  });

  it("does not treat an unrecognised plan string as paid", async () => {
    servePlan({ ...PRO_ROW, plan: "enterprise-legacy" });
    render();
    expect(
      await screen.findByRole("button", { name: /see what pro adds/i }),
    ).toBeInTheDocument();
  });

  it("opens the paywall from the invitation", async () => {
    const user = userEvent.setup();
    servePlan(null);
    render();

    await user.click(
      await screen.findByRole("button", { name: /see what pro adds/i }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/Exam Trajectory is part of Pro/);
    expect(
      screen.getByRole("button", { name: /upgrade to pro/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /yearly/i })).toBeInTheDocument();
  });

  it("says plainly that nothing already free is being taken away", async () => {
    const user = userEvent.setup();
    servePlan(null);
    render();
    await user.click(
      await screen.findByRole("button", { name: /see what pro adds/i }),
    );

    expect(
      await screen.findByText(/Everything you already use stays free/i),
    ).toBeInTheDocument();
  });
});
