import { useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { PaywallModal } from "./PaywallModal";
import { Skeleton } from "./Skeleton";
import { useEntitlements } from "../hooks/useSubscription";
import { FEATURES, type FeatureId } from "../lib/entitlements";
import styles from "./PaywallModal.module.css";

/* One gate, used everywhere something is Pro-only.
 *
 * Three states, and the middle one is the one that is usually got wrong:
 *
 *   - entitled       → render the feature
 *   - still loading  → render a skeleton, never the upsell
 *   - not entitled   → render the invitation
 *
 * Showing the paywall while the plan is still in flight would flash "upgrade"
 * at somebody who has already paid, on every single page load. That is a small
 * bug with a large effect on whether a paying customer trusts the product, so
 * the gate waits rather than guessing. */

interface ProGateProps {
  feature: FeatureId;
  children: ReactNode;
  /** Height of the placeholder while the plan is loading. */
  loadingHeight?: number;
  /** Replaces the default invitation, for surfaces that want their own. */
  fallback?: (open: () => void) => ReactNode;
}

export function ProGate({
  feature,
  children,
  loadingHeight = 180,
  fallback,
}: ProGateProps) {
  const { can, isPending } = useEntitlements();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const meta = FEATURES[feature];

  if (isPending) {
    return (
      <div aria-busy="true">
        <Skeleton label={`Checking your plan`} height={loadingHeight} />
      </div>
    );
  }

  if (can(feature)) return <>{children}</>;

  const open = () => setPaywallOpen(true);

  return (
    <>
      {fallback ? (
        fallback(open)
      ) : (
        <div className={styles.gate}>
          <span className={styles.gateIcon} aria-hidden="true">
            <Icon name="sparkles" size={18} />
          </span>
          <h3 className={styles.gateTitle}>{meta.name}</h3>
          <p className={styles.gateCopy}>{meta.pitch}</p>
          <Button variant="primary" size="sm" onClick={open}>
            See what Pro adds
          </Button>
        </div>
      )}
      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        feature={feature}
      />
    </>
  );
}

/** The small "Pro" pill, for menu items and card headers. Purely decorative —
 *  it labels a gate, it is never the gate itself. */
export function ProBadge({ quiet = false }: { quiet?: boolean }) {
  return (
    <span className={`${styles.badge} ${quiet ? styles.badgeQuiet : ""}`}>
      Pro
    </span>
  );
}

/** Imperative gate for handlers: returns true when the action may proceed, and
 *  otherwise opens the paywall. For buttons that do something rather than
 *  regions that show something. */
export function useProAction(feature: FeatureId): {
  allowed: boolean;
  /** Renders the paywall; put it somewhere in the component's tree. */
  paywall: ReactNode;
  /** Call in the handler: `if (!guard()) return;` */
  guard: () => boolean;
} {
  const { can, isPending } = useEntitlements();
  const [open, setOpen] = useState(false);
  const allowed = !isPending && can(feature);

  return {
    allowed,
    paywall: (
      <PaywallModal
        open={open}
        onClose={() => setOpen(false)}
        feature={feature}
      />
    ),
    guard: () => {
      if (allowed) return true;
      /* A click while the plan is still loading opens the paywall rather than
         silently doing nothing — the read takes milliseconds, and a dead
         button is a worse answer than a modal they can close. */
      setOpen(true);
      return false;
    },
  };
}
