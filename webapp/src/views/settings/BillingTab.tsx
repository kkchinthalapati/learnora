import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { PaywallModal } from "../../components/PaywallModal";
import { Skeleton } from "../../components/Skeleton";
import { useToast } from "../../context/toast";
import {
  useEntitlements,
  useOpenBillingPortal,
  useRefreshSubscription,
} from "../../hooks/useSubscription";
import { BillingError } from "../../api/billing";
import {
  PRO_FEATURES,
  formatPrice,
  getLocalizedPlanPricing,
  isIndianLocale,
  type Plan,
} from "../../lib/entitlements";
import { AiUsageMeter } from "./AiUsageMeter";
import styles from "./settings.module.css";

const PLAN_NAME: Record<Plan, string> = {
  free: "Free",
  plus: "Learnora Plus",
  pro: "Learnora Pro",
};

/* Plan and billing.
 *
 * Everything transactional — cards, invoices, cancelling — is Stripe's billing
 * portal rather than screens of our own. That is not laziness: the portal is
 * PCI-compliant, localised, handles tax and dunning, and stays correct when
 * Stripe changes. Rebuilding it would be a large amount of work whose best
 * possible outcome is parity.
 *
 * So this tab does three things: says what plan you are on, sends you to
 * checkout or to the portal, and — the part that matters after a purchase —
 * re-reads the plan when you come back, because the webhook that actually
 * grants Pro may land a second after the browser does. */

const STATUS_COPY: Record<string, string> = {
  active: "Active",
  trialing: "Free trial",
  past_due: "Payment failed — we are retrying, and your access continues",
  canceled: "Cancelled",
  incomplete: "Waiting for payment",
  none: "No subscription",
};

export function BillingTab() {
  const { plan, isPaid, subscription, isPending } = useEntitlements();
  const openPortal = useOpenBillingPortal();
  const refresh = useRefreshSubscription();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallInitialPlan, setPaywallInitialPlan] = useState<"plus" | "pro">(
    "plus",
  );

  const openPaywall = (initialPlan: "plus" | "pro" = "plus") => {
    setPaywallInitialPlan(initialPlan);
    setPaywallOpen(true);
  };

  /* Stripe sends the student back with ?checkout=success. The webhook usually
     wins the race, but not always — the onboarding screen we forward to does
     its own polling for the gap, so this only needs to fire the first read
     and get out of the way. Routed the same way for either paid plan: the
     welcome screen itself reads which one actually landed and adapts. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("checkout");
    if (!outcome) return;

    if (outcome === "success") {
      refresh();
      navigate("/welcome-pro?checkout=success", { replace: true });
      return;
    }
    if (outcome === "cancelled") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [refresh, navigate]);

  const manage = () => {
    openPortal.mutate(undefined, {
      onSuccess: (url) => window.location.assign(url),
      onError: (error) => {
        showToast(
          error instanceof BillingError && error.notConfigured
            ? "Billing isn't switched on for this deployment yet."
            : error instanceof Error
              ? error.message
              : "Could not open the billing portal.",
        );
      },
    });
  };

  const renews = subscription.renewsAt
    ? new Date(subscription.renewsAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <>
      <Card
        as="section"
        variant="elevated"
        radius="lg"
        padding="lg"
        className={styles.card}
      >
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Icon name="sparkles" size={18} />
          </span>
          <div>
            <h3>Your plan</h3>
            <p>What you are on, and what it includes.</p>
          </div>
        </div>

        {isPending ? (
          <Skeleton label="Loading your plan" height={64} />
        ) : (
          <>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>
                <span className={styles.labelText}>{PLAN_NAME[plan]}</span>
                <span className={styles.fieldDesc}>
                  {isPaid
                    ? (STATUS_COPY[subscription.status] ?? "Active")
                    : "Everything in the core study system, at no cost."}
                </span>
              </div>
              <div className={styles.fieldAction}>
                {isPaid ? (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => navigate("/welcome-pro")}
                    >
                      See what's included
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={manage}
                      disabled={openPortal.isPending}
                    >
                      {openPortal.isPending ? "Opening…" : "Manage billing"}
                    </Button>
                  </>
                ) : (
                  <Button variant="primary" onClick={() => openPaywall()}>
                    Upgrade
                  </Button>
                )}
              </div>
            </div>

            {/* Directly under the plan, because the allowance is the most
                concrete thing the plan buys — and the number a student
                actually wants when they come here wondering about limits. */}
            <AiUsageMeter isPro={plan === "pro"} />

            {isPaid && renews ? (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>
                  <span className={styles.labelText}>
                    {subscription.cancelAtPeriodEnd ? "Access ends" : "Renews"}
                  </span>
                  <span className={styles.fieldDesc}>
                    {subscription.cancelAtPeriodEnd
                      ? `You have cancelled. ${PLAN_NAME[plan]} stays on until ${renews}.`
                      : `Next payment on ${renews}.`}
                  </span>
                </div>
              </div>
            ) : null}

            {plan === "free" ? (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>
                  <span className={styles.labelText}>Plus and Pro</span>
                  <span className={styles.fieldDesc}>
                    Plus raises every AI tool's daily limit. Pro raises them
                    further and adds {PRO_FEATURES.map((f) => f.name).join(" · ")}.
                  </span>
                </div>
                <div className={styles.fieldAction}>
                  <span className={styles.fieldValue}>
                    {(() => {
                      const isIndian = isIndianLocale();
                      const localized = getLocalizedPlanPricing();
                      const cur = isIndian ? "INR" : "GBP";
                      return `Plus from ${formatPrice(localized.plus.prices[1].amountPence / 12, cur)}/mo · Pro from ${formatPrice(localized.pro.prices[1].amountPence / 12, cur)}/mo`;
                    })()}
                  </span>
                </div>
              </div>
            ) : null}

            {plan === "plus" ? (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>
                  <span className={styles.labelText}>What Pro adds</span>
                  <span className={styles.fieldDesc}>
                    {PRO_FEATURES.map((f) => f.name).join(" · ")}, and a
                    higher ceiling on every AI tool.
                  </span>
                </div>
                <div className={styles.fieldAction}>
                  <Button variant="secondary" onClick={() => openPaywall("pro")}>
                    See Pro
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        initialPlan={paywallInitialPlan}
      />
    </>
  );
}
