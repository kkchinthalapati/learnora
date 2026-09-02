import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "../api/billing";
import {
  FREE_SUBSCRIPTION,
  canUse,
  effectivePlan,
  quotaUsage,
  type FeatureId,
  type Plan,
  type QuotaId,
  type Subscription,
} from "../lib/entitlements";

export const billingKeys = {
  subscription: ["subscription"] as const,
};

/* The plan, read once and shared.
 *
 * `staleTime` is short by this app's standards because the plan changes
 * *outside* the app: the student pays on Stripe's page and comes back, and the
 * webhook may land a second or two after they do. A minute-stale plan would
 * show someone who has just paid a paywall, which is the single worst moment
 * to get this wrong. */
export function useSubscription() {
  return useQuery({
    queryKey: billingKeys.subscription,
    queryFn: billingApi.fetchSubscription,
    staleTime: 5_000,
  });
}

export interface Entitlements {
  plan: Plan;
  isPro: boolean;
  subscription: Subscription;
  /** True while the plan is still being read. Gates should not slam shut
   *  during this — see `useEntitlements`' comment. */
  isPending: boolean;
  can: (feature: FeatureId) => boolean;
  usage: (quota: QuotaId, used: number) => ReturnType<typeof quotaUsage>;
}

/** The one hook every gate in the app asks. */
export function useEntitlements(): Entitlements {
  const { data, isPending } = useSubscription();
  const subscription = data ?? FREE_SUBSCRIPTION;
  const plan = effectivePlan(subscription);

  return {
    plan,
    isPro: plan === "pro",
    subscription,
    isPending,
    /* While the plan is loading this reports the free answer, and every gate
       is written to show a *loading* state rather than the upsell when
       `isPending` is true. Reporting "pro" optimistically would flash paid
       features at free users; reporting the paywall would flash it at people
       who have paid. Neither is acceptable, so the gate waits. */
    can: (feature) => canUse(plan, feature),
    usage: (quota, used) => quotaUsage(plan, quota, used),
  };
}

/** Send the student to Stripe Checkout. The mutation resolves to a URL and the
 *  caller navigates — kept as a mutation so the button gets `isPending` and
 *  error handling for free, like every other write in the app. */
export function useStartCheckout() {
  return useMutation({
    mutationFn: (price: "monthly" | "annual") =>
      billingApi.createCheckoutSession(price),
  });
}

export function useOpenBillingPortal() {
  return useMutation({
    mutationFn: () => billingApi.createPortalSession(),
  });
}

/** Re-read the plan — for the moment the student lands back from Stripe.
 *  Exposed rather than inlined so both the settings tab and the post-checkout
 *  return path use the same refresh. */
export function useRefreshSubscription() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: billingKeys.subscription });
}
