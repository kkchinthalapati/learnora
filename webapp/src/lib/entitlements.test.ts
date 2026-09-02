import { describe, expect, it } from "vitest";
import {
  FEATURES,
  FREE_SUBSCRIPTION,
  PRICES,
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
  it("entitles an active or trialing Pro subscription", () => {
    expect(isEntitled(sub({ status: "active" }))).toBe(true);
    expect(isEntitled(sub({ status: "trialing" }))).toBe(true);
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
    expect(effectivePlan(sub({ status: "canceled" }))).toBe("free");
  });
});

describe("canUse", () => {
  it("keeps every Pro feature away from free", () => {
    for (const feature of PRO_FEATURES) {
      expect(canUse("free", feature.id)).toBe(false);
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
  it("gives Pro at least as much as free on every quota", () => {
    for (const key of Object.keys(
      QUOTAS.free,
    ) as (keyof typeof QUOTAS.free)[]) {
      expect(QUOTAS.pro[key]).toBeGreaterThanOrEqual(QUOTAS.free[key]);
    }
  });

  it("reports remaining and exceeded against the plan's limit", () => {
    const usage = quotaUsage("free", "aiGenerationsPerDay", 20);
    expect(usage.limit).toBe(quotaFor("free", "aiGenerationsPerDay"));
    expect(usage.remaining).toBe(usage.limit - 20);
    expect(usage.exceeded).toBe(false);
    expect(usage.fraction).toBeCloseTo(20 / usage.limit, 6);
  });

  it("marks a quota exceeded at the limit, not past it", () => {
    const limit = quotaFor("free", "aiGenerationsPerDay");
    expect(quotaUsage("free", "aiGenerationsPerDay", limit).exceeded).toBe(
      true,
    );
    expect(quotaUsage("free", "aiGenerationsPerDay", limit - 1).exceeded).toBe(
      false,
    );
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
  it("offers a monthly and an annual price", () => {
    expect(PRICES.map((p) => p.id).sort()).toEqual(["annual", "monthly"]);
  });

  it("makes the annual plan actually cheaper per month", () => {
    const monthly = PRICES.find((p) => p.id === "monthly")!;
    const annual = PRICES.find((p) => p.id === "annual")!;
    expect(annual.amountPence / 12).toBeLessThan(monthly.amountPence);
  });

  it("states a saving that matches the prices", () => {
    const monthly = PRICES.find((p) => p.id === "monthly")!;
    const annual = PRICES.find((p) => p.id === "annual")!;
    const real = Math.round(
      (1 - annual.amountPence / (monthly.amountPence * 12)) * 100,
    );
    /* Advertising a saving the arithmetic does not support is the kind of
       thing that is legally interesting as well as dishonest. */
    expect(annual.savingPercent).toBe(real);
  });

  it("holds money in minor units so no float ever touches a price", () => {
    for (const price of PRICES) {
      expect(Number.isInteger(price.amountPence)).toBe(true);
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
