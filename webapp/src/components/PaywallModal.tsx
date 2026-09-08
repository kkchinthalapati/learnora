import { useState } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { useToast } from "../context/toast";
import { useStartCheckout } from "../hooks/useSubscription";
import {
  FEATURES,
  PLAN_PRICING,
  PRO_FEATURES,
  formatPrice,
  getLocalizedPlanPricing,
  isIndianLocale,
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
 * Stripe's webhook says so and not a moment earlier — see `stripe-webhook`.
 *
 * Two paid plans, not one: Plus is more AI headroom on every tool, at a lower
 * price; Pro is that same headroom at its highest ceiling, plus the handful
 * of binary features (Trajectory, calendar sync, …) that stay Pro-exclusive.
 * A feature-triggered paywall (opened from a `ProGate`) always defaults to
 * Pro and hides the plan tabs — Plus never unlocks a binary feature, so
 * showing it as a choice there would be a dead end dressed up as an option. */

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  /** The gate that brought them here, so the modal can lead with it. */
  feature?: FeatureId;
  /** Which plan tab is selected first, for a caller that knows which one the
   *  student was already looking at (a Plus account clicking "See what Pro
   *  adds"). Ignored when `feature` is set — a feature gate always means
   *  Pro. Defaults to Plus, the cheaper first rung. */
  initialPlan?: "plus" | "pro";
}

export function PaywallModal({
  open,
  onClose,
  feature,
  initialPlan = "plus",
}: PaywallModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<"plus" | "pro">(
    feature ? "pro" : initialPlan,
  );
  const [selectedPeriod, setSelectedPeriod] = useState<"monthly" | "annual">(
    "annual",
  );
  const startCheckout = useStartCheckout();
  const { showToast } = useToast();

  const lead = feature ? FEATURES[feature] : null;
  const rest = PRO_FEATURES.filter((f) => f.id !== feature);
  const isIndian = isIndianLocale();
  const localizedPricing = getLocalizedPlanPricing();
  const pricing = localizedPricing[selectedPlan];
  const planLabel = pricing.name.replace("Learnora ", "");

  const upgrade = () => {
    startCheckout.mutate(
      { plan: selectedPlan, period: selectedPeriod },
      {
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
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lead ? `${lead.name} is part of Pro` : pricing.name}
      subtitle={
        lead
          ? lead.pitch
          : selectedPlan === "pro"
            ? "Everything you use now stays free. Pro adds the two things nothing else does, plus the highest AI ceiling."
            : pricing.tagline
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
            {startCheckout.isPending
              ? "Opening checkout…"
              : `Upgrade to ${planLabel}`}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        {/* A feature gate only ever means Pro, so the choice is hidden rather
            than shown and then overridden — an already-decided question isn't
            a question. */}
        {!lead && (
          <div
            className={styles.planTabs}
            role="radiogroup"
            aria-label="Plan"
          >
            {(["plus", "pro"] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={selectedPlan === p}
                className={`${styles.planTab} ${
                  selectedPlan === p ? styles.planTabOn : ""
                }`}
                onClick={() => setSelectedPlan(p)}
              >
                {PLAN_PRICING[p].name.replace("Learnora ", "")}
              </button>
            ))}
          </div>
        )}

        <ul
          className={styles.priceList}
          role="radiogroup"
          aria-label="Billing period"
        >
          {pricing.prices.map((price) => {
            const on = selectedPeriod === price.id;
            return (
              <li key={price.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`${styles.price} ${on ? styles.priceOn : ""}`}
                  onClick={() => setSelectedPeriod(price.id)}
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
                    {formatPrice(price.amountPence, isIndian ? "INR" : "GBP")}
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

        {isIndian && (
          <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: "var(--s-2)", textAlign: "center" }}>
            ⚡ Supports UPI (Google Pay, PhonePe, Paytm), Net Banking & Cards
          </p>
        )}

        {selectedPlan === "pro" ? (
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
        ) : (
          <p className={styles.plusPitch}>
            Every AI tool's daily limit goes up — chat, notes, flashcards,
            quizzes and the rest — nothing else changes. Upgrade to Pro any
            time for Exam Trajectory, calendar sync, and the highest AI
            ceiling.
          </p>
        )}

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
