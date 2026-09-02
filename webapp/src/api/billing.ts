/* Reading the plan, and starting or managing a subscription.
 *
 * The read is a plain `profiles` select — the plan columns live there and RLS
 * lets the owner read their own row. The *writes* are not here and cannot be:
 * a migration trigger silently rewrites any client attempt to change the
 * billing columns back to their old values, so the only thing that can grant
 * Pro is the Stripe webhook running with the service-role key.
 *
 * Checkout and the customer portal both go through the `stripe-billing` edge
 * function, which is the same JWT-authenticated shape `learnora-ai` uses. The
 * client never touches a Stripe secret; it only ever receives a URL to send
 * the browser to. */

import { supabase, SUPABASE_URL } from "../lib/supabase";
import { requireUserId } from "./session";
import {
  FREE_SUBSCRIPTION,
  type Plan,
  type PlanStatus,
  type Subscription,
} from "../lib/entitlements";

const EDGE_URL = `${SUPABASE_URL}/functions/v1/stripe-billing`;

const REQUEST_TIMEOUT_MS = 20000;

/** Thrown when billing is reachable but refused the request. Distinct from a
 *  network failure so the UI can say "we couldn't start checkout" rather than
 *  "you're offline". */
export class BillingError extends Error {
  /** True when the deployment simply has no Stripe key configured yet — the
   *  expected state before the keys are dropped in, and worth a different
   *  message than a real failure. */
  readonly notConfigured: boolean;

  constructor(message: string, notConfigured = false) {
    super(message);
    this.name = "BillingError";
    this.notConfigured = notConfigured;
  }
}

interface ProfileBillingRow {
  plan: string | null;
  plan_status: string | null;
  plan_renews_at: string | null;
  plan_cancel_at_period_end: boolean | null;
}

const PLANS: Plan[] = ["free", "pro"];
const STATUSES: PlanStatus[] = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "none",
];

/** Read a row into the shape the app reasons about, treating anything
 *  unrecognised as free. A plan string we do not understand is not a licence
 *  to hand out features. */
export function toSubscription(row: ProfileBillingRow | null): Subscription {
  if (!row) return FREE_SUBSCRIPTION;
  const plan = PLANS.includes(row.plan as Plan) ? (row.plan as Plan) : "free";
  const status = STATUSES.includes(row.plan_status as PlanStatus)
    ? (row.plan_status as PlanStatus)
    : "none";
  return {
    plan,
    status,
    renewsAt: row.plan_renews_at,
    cancelAtPeriodEnd: row.plan_cancel_at_period_end ?? false,
  };
}

async function callBilling<T>(body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new BillingError("Not authenticated");

  let response: Response;
  try {
    response = await fetch(EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("Could not reach billing. Check your connection.");
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as {
      error?: string;
      notConfigured?: boolean;
    };
    throw new BillingError(
      errorBody.error ?? `Billing failed (${response.status})`,
      errorBody.notConfigured === true,
    );
  }

  return (await response.json()) as T;
}

export const billingApi = {
  /** The signed-in student's current plan. */
  async fetchSubscription(): Promise<Subscription> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("profiles")
      .select("plan, plan_status, plan_renews_at, plan_cancel_at_period_end")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return toSubscription(data as ProfileBillingRow | null);
  },

  /** A Stripe Checkout URL for the chosen price. The caller navigates to it;
   *  Stripe sends the student back to `/app/settings` either way, and the plan
   *  only actually changes when the webhook fires. */
  async createCheckoutSession(priceId: "monthly" | "annual"): Promise<string> {
    const { url } = await callBilling<{ url: string }>({
      action: "checkout",
      price: priceId,
      returnUrl: `${window.location.origin}/app/settings`,
    });
    return url;
  },

  /** A Stripe billing-portal URL, where the student can change their card,
   *  see invoices or cancel. We deliberately do not build any of that
   *  ourselves — Stripe's portal is compliant, localised and free. */
  async createPortalSession(): Promise<string> {
    const { url } = await callBilling<{ url: string }>({
      action: "portal",
      returnUrl: `${window.location.origin}/app/settings`,
    });
    return url;
  },
};
