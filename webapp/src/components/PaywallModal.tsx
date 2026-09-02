import { useState } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { useToast } from "../context/toast";
import { useStartCheckout } from "../hooks/useSubscription";
import {
  FEATURES,
  PRICES,
  PRO_FEATURES,
  formatPrice,
  type FeatureId,
} from "../lib/entitlements";
import styles from "./PaywallModal.module.css";

/* The upgrade screen.
 *
 * Written to be honest rather than pushy, for a specific reason: our users are
 * students, a lot of them are broke, and the free tier is genuinely complete.
 * A paywall that implies the app is useless without paying would be a lie
 * about our own product. So this leads with the one feature they actually hit,
 * says plainly what it does, and lists the rest without countdown timers,
 * fake scarcity or a pre-ticked annual plan.
 *
 * It also never pretends the purchase has happened. The plan changes when
 * Stripe's webhook says so and not a moment earlier — see `stripe-webhook`. */

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  /** The gate that brought them here, so the modal can lead with it. */
  feature?: FeatureId;
}

export function PaywallModal({ open, onClose, feature }: PaywallModalProps) {
  const [selected, setSelected] = useState<"monthly" | "annual">("annual");
  const startCheckout = useStartCheckout();
  const { showToast } = useToast();

  const lead = feature ? FEATURES[feature] : null;
  const rest = PRO_FEATURES.filter((f) => f.id !== feature);

  const upgrade = () => {
    startCheckout.mutate(selected, {
      onSuccess: (url) => {
        window.location.assign(url);
      },
      onError: (error) => {
        showToast(
          error instanceof Error
            ? error.message
            : "Could not start checkout. Please try again.",
        );
      },
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lead ? `${lead.name} is part of Pro` : "Learnora Pro"}
      subtitle={
        lead
          ? lead.pitch
          : "Everything you use now stays free. Pro adds the two things nothing else does."
      }
      contentClassName={styles.dialog}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
          <Button
            variant="primary"
            onClick={upgrade}
            disabled={startCheckout.isPending}
          >
            {startCheckout.isPending ? "Opening checkout…" : "Upgrade to Pro"}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <ul
          className={styles.priceList}
          role="radiogroup"
          aria-label="Billing period"
        >
          {PRICES.map((price) => {
            const on = selected === price.id;
            return (
              <li key={price.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`${styles.price} ${on ? styles.priceOn : ""}`}
                  onClick={() => setSelected(price.id)}
                >
                  <span className={styles.priceHead}>
                    <span className={styles.priceLabel}>{price.label}</span>
                    {price.savingPercent ? (
                      <span className={styles.saving}>
                        save {price.savingPercent}%
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.priceAmount}>
                    {formatPrice(price.amountPence)}
                    <span className={styles.priceInterval}>
                      {" "}
                      / {price.interval}
                    </span>
                  </span>
                  {price.note ? (
                    <span className={styles.priceNote}>{price.note}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <ul className={styles.features}>
          {(lead ? [lead, ...rest] : rest).map((f) => (
            <li key={f.id} className={styles.feature}>
              <span className={styles.tick} aria-hidden="true">
                <Icon name="check-square" size={14} />
              </span>
              <span>
                <strong className={styles.featureName}>{f.name}</strong>
                <span className={styles.featureBlurb}>{f.blurb}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* Said plainly, because it is the thing that makes the rest of this
            screen believable — and because it is true. */}
        <p className={styles.promise}>
          <Icon name="lock" size={13} /> Everything you already use stays free,
          forever. Cancel any time, in two clicks, from Settings.
        </p>
      </div>
    </Modal>
  );
}
