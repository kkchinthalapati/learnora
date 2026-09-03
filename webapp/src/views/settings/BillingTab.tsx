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
import { PRO_FEATURES, formatPrice, PRICES } from "../../lib/entitlements";
import styles from "./settings.module.css";

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
  const { isPro, subscription, isPending } = useEntitlements();
  const openPortal = useOpenBillingPortal();
  const refresh = useRefreshSubscription();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [paywallOpen, setPaywallOpen] = useState(false);

  /* Stripe sends the student back with ?checkout=success. The webhook usually
     wins the race, but not always — the onboarding screen we forward to does
     its own polling for the gap, so this only needs to fire the first read
     and get out of the way. */
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
                <span className={styles.labelText}>
                  {isPro ? "Learnora Pro" : "Free"}
                </span>
                <span className={styles.fieldDesc}>
                  {isPro
                    ? (STATUS_COPY[subscription.status] ?? "Active")
                    : "Everything in the core study system, at no cost."}
                </span>
              </div>
              <div className={styles.fieldAction}>
                {isPro ? (
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
                  <Button
                    variant="primary"
                    onClick={() => setPaywallOpen(true)}
                  >
                    Upgrade to Pro
                  </Button>
                )}
              </div>
            </div>

            {isPro && renews ? (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>
                  <span className={styles.labelText}>
                    {subscription.cancelAtPeriodEnd ? "Access ends" : "Renews"}
                  </span>
                  <span className={styles.fieldDesc}>
                    {subscription.cancelAtPeriodEnd
                      ? `You have cancelled. Pro stays on until ${renews}.`
                      : `Next payment on ${renews}.`}
                  </span>
                </div>
              </div>
            ) : null}

            {!isPro ? (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>
                  <span className={styles.labelText}>What Pro adds</span>
                  <span className={styles.fieldDesc}>
                    {PRO_FEATURES.map((f) => f.name).join(" · ")}
                  </span>
                </div>
                <div className={styles.fieldAction}>
                  <span className={styles.fieldValue}>
                    from {formatPrice(PRICES[1].amountPence / 12)} a month
                  </span>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </>
  );
}
