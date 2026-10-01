import { describe, expect, it } from "vitest";
import {
  AI_TOOL_IDS,
  FEATURES,
  FREE_SUBSCRIPTION,
  PLAN_PRICING,
  PRO_FEATURES,
  QUOTAS,
  canUse,
  effectivePlan,
  formatPrice,
  isEntitled,
  quotaFor,
  quotaUsage,
  type PlanStatus,
  type Subscription,
} from "./entitlements";

function sub(patch: Partial<Subscription> = {}): Subscription {
  return { ...FREE_SUBSCRIPTION, plan: "pro", status: "active", ...patch };
}

describe("isEntitled", () => {
  it("entitles an active or trialing paid subscription", () => {
    expect(isEntitled(sub({ status: "active" }))).toBe(true);
    expect(isEntitled(sub({ status: "trialing" }))).toBe(true);
    expect(isEntitled(sub({ plan: "plus", status: "active" }))).toBe(true);
  });

  it("keeps a past-due subscription working", () => {
    /* A card that expires on the 3rd must not delete someone's exam forecast
       during exam week. Stripe retries for days; a few days of unpaid access
       costs far less than breaking a student's revision on a billing hiccup. */
    expect(isEntitled(sub({ status: "past_due" }))).toBe(true);
  });

  it("does not entitle a cancelled or incomplete subscription", () => {
    expect(isEntitled(sub({ status: "canceled" }))).toBe(false);
    expect(isEntitled(sub({ status: "incomplete" }))).toBe(false);
    expect(isEntitled(sub({ status: "none" }))).toBe(false);
  });

  it("does not entitle a free plan whatever the status says", () => {
    expect(isEntitled(sub({ plan: "free", status: "active" }))).toBe(false);
  });

  it("treats the default subscription as free", () => {
    expect(isEntitled(FREE_SUBSCRIPTION)).toBe(false);
    expect(effectivePlan(FREE_SUBSCRIPTION)).toBe("free");
  });
});

describe("effectivePlan", () => {
  it("collapses plan and status into the single answer gates should ask", () => {
    expect(effectivePlan(sub({ status: "active" }))).toBe("pro");
    expect(effectivePlan(sub({ plan: "plus", status: "active" }))).toBe(
      "plus",
    );
    expect(effectivePlan(sub({ status: "canceled" }))).toBe("free");
  });
});

describe("canUse", () => {
  it("keeps every Pro feature away from free and Plus", () => {
    for (const feature of PRO_FEATURES) {
      expect(canUse("free", feature.id)).toBe(false);
      expect(canUse("plus", feature.id)).toBe(false);
      expect(canUse("pro", feature.id)).toBe(true);
    }
  });

  it("has at least one thing to sell", () => {
    expect(PRO_FEATURES.length).toBeGreaterThan(0);
  });

  it("describes every feature it gates", () => {
    /* The paywall renders these strings verbatim, so an empty one ships an
       empty bullet to a paying customer. */
    for (const feature of Object.values(FEATURES)) {
      expect(feature.name.length).toBeGreaterThan(0);
      expect(feature.blurb.length).toBeGreaterThan(0);
      expect(feature.pitch.length).toBeGreaterThan(0);
    }
  });
});

describe("quotas", () => {
  it("gives Plus at least as much as free, and Pro at least as much as Plus, on every quota", () => {
    for (const key of Object.keys(
      QUOTAS.free,
    ) as (keyof typeof QUOTAS.free)[]) {
      expect(QUOTAS.plus[key]).toBeGreaterThanOrEqual(QUOTAS.free[key]);
      expect(QUOTAS.pro[key]).toBeGreaterThanOrEqual(QUOTAS.plus[key]);
    }
  });

  it("gives every plan, including free, a real allowance on every AI tool", () => {
    /* Nothing that shipped free becomes paid — each tool keeps a non-zero
       free allowance rather than being gated to Plus/Pro entirely. */
    for (const tool of AI_TOOL_IDS) {
      expect(QUOTAS.free[tool]).toBeGreaterThan(0);
    }
  });

  it("reports remaining and exceeded against the plan's limit", () => {
    const usage = quotaUsage("free", "chat", 10);
    expect(usage.limit).toBe(quotaFor("free", "chat"));
    expect(usage.remaining).toBe(usage.limit - 10);
    expect(usage.exceeded).toBe(false);
    expect(usage.fraction).toBeCloseTo(10 / usage.limit, 6);
  });

  it("marks a quota exceeded at the limit, not past it", () => {
    const limit = quotaFor("free", "quiz");
    expect(quotaUsage("free", "quiz", limit).exceeded).toBe(true);
    expect(quotaUsage("free", "quiz", limit - 1).exceeded).toBe(false);
  });

  it("never exceeds or fills the meter for an unlimited quota", () => {
    const usage = quotaUsage("pro", "notebooks", 9999);
    expect(usage.unlimited).toBe(true);
    expect(usage.exceeded).toBe(false);
    expect(usage.fraction).toBe(0);
    expect(usage.remaining).toBe(Infinity);
  });

  it("caps the meter rather than reporting over 100%", () => {
    expect(quotaUsage("free", "notebooks", 500).fraction).toBe(1);
  });
});

describe("pricing", () => {
  const plans = ["plus", "pro"] as const;

  it("offers a monthly and an annual price for both paid plans", () => {
    for (const plan of plans) {
      expect(PLAN_PRICING[plan].prices.map((p) => p.id).sort()).toEqual([
        "annual",
        "monthly",
      ]);
    }
  });

  it("makes the annual plan actually cheaper per month, for both paid plans", () => {
    for (const plan of plans) {
      const { prices } = PLAN_PRICING[plan];
      const monthly = prices.find((p) => p.id === "monthly")!;
      const annual = prices.find((p) => p.id === "annual")!;
      expect(annual.amountPence / 12).toBeLessThan(monthly.amountPence);
    }
  });

  it("states a saving that matches the prices, for both paid plans", () => {
    for (const plan of plans) {
      const { prices } = PLAN_PRICING[plan];
      const monthly = prices.find((p) => p.id === "monthly")!;
      const annual = prices.find((p) => p.id === "annual")!;
      const real = Math.round(
        (1 - annual.amountPence / (monthly.amountPence * 12)) * 100,
      );
      /* Advertising a saving the arithmetic does not support is the kind of
         thing that is legally interesting as well as dishonest. */
      expect(annual.savingPercent).toBe(real);
    }
  });

  it("prices Plus below Pro on every billing period", () => {
    for (const period of ["monthly", "annual"] as const) {
      const plus = PLAN_PRICING.plus.prices.find((p) => p.id === period)!;
      const pro = PLAN_PRICING.pro.prices.find((p) => p.id === period)!;
      expect(plus.amountPence).toBeLessThan(pro.amountPence);
    }
  });

  it("holds money in minor units so no float ever touches a price", () => {
    for (const plan of plans) {
      for (const price of PLAN_PRICING[plan].prices) {
        expect(Number.isInteger(price.amountPence)).toBe(true);
      }
    }
  });

  it("formats a price as currency", () => {
    expect(formatPrice(599)).toMatch(/5\.99/);
    expect(formatPrice(4900)).toMatch(/49/);
  });
});

describe("status vocabulary", () => {
  it("covers every status the webhook can write", () => {
    /* Kept in step with toPlanStatus() in supabase/functions/stripe-webhook.
       A status the client does not recognise falls back to "none", which
       grants nothing — but it should not be reachable in the first place. */
    const fromWebhook: PlanStatus[] = [
      "active",
      "trialing",
      "past_due",
      "canceled",
      "incomplete",
      "none",
    ];
    for (const status of fromWebhook) {
      expect(() => isEntitled(sub({ status }))).not.toThrow();
    }
  });
});
