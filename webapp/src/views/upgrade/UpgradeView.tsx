import { useState } from "react";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { useToast } from "../../context/toast";
import { useEntitlements, useStartCheckout } from "../../hooks/useSubscription";
import {
  getLocalizedPlanPricing,
  PRO_FEATURES,
  QUOTAS,
  type Plan,
} from "../../lib/entitlements";
import { useDocumentTitle } from "../../lib/routeTitle";
import styles from "./upgrade.module.css";

/* /upgrade — the plan comparison, as a page you chose to open, never a modal
 * that opens on you (2026-10 revamp, Screens "Limits"). It leads with what
 * Free already includes, because the free tier is a complete study system and
 * a comparison that implies otherwise would be a lie about the product. No
 * countdowns, no pre-ticked yearly plan. Prices are lib/entitlements'
 * display copy; Stripe is the source of truth for what is charged. */

const ROWS: { label: string; get: (p: Plan) => string }[] = [
  {
    label: "Cards, bank questions, your plan, the mistake loop",
    get: () => "Always",
  },
  {
    label: "Tutor sessions a day (Explain, Socratic or Teach, each)",
    get: (p) => String(QUOTAS[p].debugger),
  },
  { label: "AI-written quizzes a day", get: (p) => String(QUOTAS[p].quiz) },
  { label: "Tutor chat messages a day", get: (p) => String(QUOTAS[p].chat) },
];

const PLANS: Plan[] = ["free", "plus", "pro"];

export function UpgradeView() {
  useDocumentTitle("Plans");
  const { plan: current, isPending } = useEntitlements();
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const startCheckout = useStartCheckout();
  const { showToast } = useToast();
  const pricing = getLocalizedPlanPricing();

  const choose = (plan: "plus" | "pro") =>
    startCheckout.mutate(
      { plan, period },
      {
        onSuccess: (url) => window.location.assign(url),
        onError: (error) =>
          showToast(
            error instanceof Error
              ? error.message
              : "Could not start checkout. Please try again.",
          ),
      },
    );

  const priceOf = (plan: Plan) => {
    if (plan === "free") return { amount: pricing.format(0), note: "for good" };
    const option = pricing.plans[plan].prices.find((p) => p.id === period);
    if (!option) return { amount: "", note: "" };
    return {
      amount: pricing.format(option.amountPence),
      note: option.note ?? `a ${option.interval}`,
    };
  };

  const nameOf = (plan: Plan) =>
    plan === "free"
      ? "Free"
      : pricing.plans[plan].name.replace("Learnora ", "");

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Plans</h1>
        <p className={styles.lead}>
          Free is the whole study system. Paid plans add more tutor time each
          day, and Pro adds a few extras. Nothing you use now goes away.
        </p>
        <div
          className={styles.period}
          role="radiogroup"
          aria-label="Billing period"
        >
          {(["monthly", "annual"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={period === p}
              className={styles.periodBtn}
              onClick={() => setPeriod(p)}
            >
              {p === "monthly" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
      </header>

      <div className={styles.grid}>
        {PLANS.map((plan) => {
          const price = priceOf(plan);
          const mine = !isPending && plan === current;
          return (
            <section
              key={plan}
              className={styles.plan}
              data-current={mine || undefined}
              aria-labelledby={`plan-${plan}`}
            >
              <div className={styles.planHead}>
                <h2 id={`plan-${plan}`} className={styles.planName}>
                  {nameOf(plan)}
                </h2>
                {mine ? <span className={styles.yours}>Your plan</span> : null}
              </div>
              <p className={styles.price}>
                <span className={styles.amount}>{price.amount}</span>{" "}
                <span className={styles.note}>{price.note}</span>
              </p>
              <p className={styles.tagline}>
                {plan === "free"
                  ? "Everything you need to revise, with a few tutor sessions every day."
                  : pricing.plans[plan].tagline}
              </p>
              <dl className={styles.rows}>
                {ROWS.map((r) => (
                  <div key={r.label} className={styles.row}>
                    <dt>{r.label}</dt>
                    <dd>{r.get(plan)}</dd>
                  </div>
                ))}
              </dl>
              {plan === "pro" ? (
                <ul className={styles.extras} aria-label="Only on Pro">
                  {PRO_FEATURES.map((f) => (
                    <li key={f.id}>{f.name}</li>
                  ))}
                </ul>
              ) : null}
              {plan !== "free" && !mine ? (
                <Button
                  variant="secondary"
                  size="lg"
                  busy={
                    startCheckout.isPending &&
                    startCheckout.variables?.plan === plan
                  }
                  onClick={() => choose(plan)}
                >
                  Choose {nameOf(plan)}
                </Button>
              ) : null}
            </section>
          );
        })}
      </div>

      <p className={styles.foot}>
        Prices shown in {pricing.currency}. Change or cancel any time in{" "}
        <Link to="/settings?tab=billing" className={styles.link}>
          Settings
        </Link>
        . A session you’ve started always finishes, whatever your plan.
      </p>
    </div>
  );
}
