import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession, mockNoAuthSession } from "../test/mockSession";
import { BillingError, billingApi, toSubscription } from "./billing";
import { FREE_SUBSCRIPTION } from "../lib/entitlements";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;
const fn = (name: string) => `${SUPABASE_URL}/functions/v1/${name}`;

describe("toSubscription", () => {
  it("maps a real row", () => {
    expect(
      toSubscription({
        plan: "pro",
        plan_status: "active",
        plan_renews_at: "2026-10-01T00:00:00Z",
        plan_cancel_at_period_end: true,
      }),
    ).toEqual({
      plan: "pro",
      status: "active",
      renewsAt: "2026-10-01T00:00:00Z",
      cancelAtPeriodEnd: true,
    });
  });

  it("treats a missing row as free", () => {
    expect(toSubscription(null)).toEqual(FREE_SUBSCRIPTION);
  });

  it("refuses to honour a plan string it does not recognise", () => {
    /* A plan we cannot parse is not a licence to hand out paid features. */
    expect(
      toSubscription({
        plan: "enterprise",
        plan_status: "active",
        plan_renews_at: null,
        plan_cancel_at_period_end: null,
      }).plan,
    ).toBe("free");
  });

  it("falls back to a status that grants nothing", () => {
    expect(
      toSubscription({
        plan: "pro",
        plan_status: "weird",
        plan_renews_at: null,
        plan_cancel_at_period_end: null,
      }).status,
    ).toBe("none");
  });

  it("defaults a null cancel flag to false", () => {
    expect(
      toSubscription({
        plan: "free",
        plan_status: "none",
        plan_renews_at: null,
        plan_cancel_at_period_end: null,
      }).cancelAtPeriodEnd,
    ).toBe(false);
  });
});

describe("billingApi.fetchSubscription", () => {
  beforeEach(() => mockAuthSession("user-1"));
  afterEach(() => vi.restoreAllMocks());

  it("reads only the caller's own row", async () => {
    let seen = "";
    server.use(
      http.get(rest("profiles"), ({ request }) => {
        seen = new URL(request.url).searchParams.get("id") ?? "";
        return HttpResponse.json([
          {
            plan: "pro",
            plan_status: "trialing",
            plan_renews_at: null,
            plan_cancel_at_period_end: false,
          },
        ]);
      }),
    );

    const sub = await billingApi.fetchSubscription();
    expect(seen).toBe("eq.user-1");
    expect(sub.plan).toBe("pro");
  });

  it("throws when the query fails", async () => {
    server.use(
      http.get(rest("profiles"), () =>
        HttpResponse.json({ message: "nope" }, { status: 500 }),
      ),
    );
    await expect(billingApi.fetchSubscription()).rejects.toThrow();
  });

  it("throws when there is no session", async () => {
    mockNoAuthSession();
    await expect(billingApi.fetchSubscription()).rejects.toThrow(
      "Not authenticated",
    );
  });
});

describe("billingApi checkout and portal", () => {
  beforeEach(() => mockAuthSession("user-1"));
  afterEach(() => vi.restoreAllMocks());

  it("asks the edge function for a checkout URL", async () => {
    let body: unknown;
    server.use(
      http.post(fn("stripe-billing"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ url: "https://checkout.stripe.com/x" });
      }),
    );

    await expect(billingApi.createCheckoutSession("annual")).resolves.toBe(
      "https://checkout.stripe.com/x",
    );
    expect(body).toMatchObject({ action: "checkout", price: "annual" });
  });

  it("asks for a portal URL", async () => {
    let body: unknown;
    server.use(
      http.post(fn("stripe-billing"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ url: "https://billing.stripe.com/y" });
      }),
    );

    await expect(billingApi.createPortalSession()).resolves.toBe(
      "https://billing.stripe.com/y",
    );
    expect(body).toMatchObject({ action: "portal" });
  });

  it("surfaces a not-configured deployment as its own kind of failure", async () => {
    /* The expected state before the Stripe keys are dropped in. It deserves
       "billing isn't set up yet", not a red error about a broken payment. */
    server.use(
      http.post(fn("stripe-billing"), () =>
        HttpResponse.json(
          {
            error: "Billing isn't set up on this deployment yet.",
            notConfigured: true,
          },
          { status: 503 },
        ),
      ),
    );

    await expect(billingApi.createCheckoutSession("monthly")).rejects.toThrow(
      /isn't set up/,
    );
    await billingApi.createCheckoutSession("monthly").catch((err) => {
      expect(err).toBeInstanceOf(BillingError);
      expect((err as BillingError).notConfigured).toBe(true);
    });
  });

  it("reports a plain failure as a normal billing error", async () => {
    server.use(
      http.post(fn("stripe-billing"), () =>
        HttpResponse.json({ error: "Stripe said no" }, { status: 502 }),
      ),
    );
    await billingApi.createPortalSession().catch((err) => {
      expect(err).toBeInstanceOf(BillingError);
      expect((err as BillingError).notConfigured).toBe(false);
      expect((err as Error).message).toBe("Stripe said no");
    });
  });

  it("refuses to call billing without a session", async () => {
    mockNoAuthSession();
    await expect(billingApi.createPortalSession()).rejects.toThrow(
      "Not authenticated",
    );
  });
});
