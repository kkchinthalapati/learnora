import { useState } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { useToast } from "../context/toast";
import { useStartCheckout } from "../hooks/useSubscription";
import {
  AI_TOOLS,
  FEATURES,
  canUse,
  getLocalizedPlanPricing,
  quotaFor,
  type FeatureId,
  type Plan,
  type QuotaId,
} from "../lib/entitlements";
import styles from "./PaywallModal.module.css";

/* The upgrade screen.
 *
 * Written to be honest rather than pushy, for a specific reason: our users are
 * students, a lot of them are broke, and the free tier is genuinely complete.
 * A paywall that implies the app is useless without paying would be a lie
 * about our own product. So this leads with the one feature they actually hit
 * (when a gate sent them), shows exactly what each plan changes, and has no
 * countdown timers, fake scarcity or pre-ticked extras.
 *
 * What each plan changes is read from the same tables the server enforces
 * (QUOTAS and FEATURES in lib/entitlements.ts), never written out here, so the
 * comparison cannot promise more than the edge function will grant.
 *
 * It also never pretends the purchase has happened. The plan changes when
 * Stripe's webhook says so and not a moment earlier — see `stripe-webhook`.
 *
 * A feature-triggered paywall (opened from a `ProGate`) offers only the plans
 * that unlock that feature: Pro for the Pro tools, Plus and Pro for theme
 * colours. Offering a plan that doesn't unlock what they clicked would be a
 * dead end dressed up as an option. */

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  /** The gate that brought them here, so the modal can lead with it. */
  feature?: FeatureId;
  /** Which plan is selected first, for a caller that knows which one the
   *  student was already looking at (a Plus account clicking "See Pro").
   *  Ignored when `feature` is set — a gate starts on the cheapest plan that
   *  unlocks it. Defaults to Plus, the cheaper first rung. */
  initialPlan?: "plus" | "pro";
}

type PaidPlan = "plus" | "pro";
type Period = "monthly" | "annual";

/* The daily allowances worth comparing. Explain, Teach and Socratic sessions
   share one row because their caps are the same on every plan; the rest of
   the AI tools follow the same steps and are summed up under the table. */
const ALLOWANCES: ReadonlyArray<{ label: string; quota: QuotaId }> = [
  { label: AI_TOOLS.chat.name, quota: "chat" },
  { label: AI_TOOLS.notes.name, quota: "notes" },
  { label: AI_TOOLS.flashcards.name, quota: "flashcards" },
  { label: AI_TOOLS.quiz.name, quota: "quiz" },
  { label: AI_TOOLS.plan.name, quota: "plan" },
  { label: "Study sessions, each mode", quota: "debugger" },
  { label: "Notebooks, in total", quota: "notebooks" },
];

const TOOLS = Object.values(FEATURES).filter((f) => f.minimumPlan !== "free");

function allowance(plan: Plan, quota: QuotaId): string {
  const n = quotaFor(plan, quota);
  return Number.isFinite(n) ? String(n) : "No limit";
}

export function PaywallModal({
  open,
  onClose,
  feature,
  initialPlan = "plus",
}: PaywallModalProps) {
  const lowest: PaidPlan | null = feature
    ? FEATURES[feature].minimumPlan === "plus"
      ? "plus"
      : "pro"
    : null;
  const [selectedPlan, setSelectedPlan] = useState<PaidPlan>(
    lowest ?? initialPlan,
  );
  const [period, setPeriod] = useState<Period>("annual");
  const startCheckout = useStartCheckout();
  const { showToast } = useToast();

  const lead = feature ? FEATURES[feature] : null;
  const localized = getLocalizedPlanPricing();
  const offered: PaidPlan[] = lowest === "pro" ? ["pro"] : ["plus", "pro"];
  const columns: Plan[] = ["free", ...offered];
  const nameOf = (p: PaidPlan) =>
    localized.plans[p].name.replace("Learnora ", "");
  const priceOf = (p: PaidPlan) =>
    localized.plans[p].prices.find((x) => x.id === period) ??
    localized.plans[p].prices[0];
  const chosen = priceOf(selectedPlan);
  /* The switch says what yearly saves on the plan currently picked. */
  const saving = localized.plans[selectedPlan].prices.find(
    (x) => x.id === "annual",
  )?.savingPercent;

  const allowanceRows = (
    <tbody>
      <tr className={styles.group}>
        <th scope="rowgroup" colSpan={columns.length + 1}>
          AI each day
        </th>
      </tr>
      {ALLOWANCES.map((row) => (
        <tr key={row.quota}>
          <th scope="row">{row.label}</th>
          {columns.map((c) => (
            <td key={c} data-on={c === selectedPlan || undefined}>
              {allowance(c, row.quota)}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );

  const toolRows = (
    <tbody>
      <tr className={styles.group}>
        <th scope="rowgroup" colSpan={columns.length + 1}>
          Tools
        </th>
      </tr>
      {(lead ? [lead, ...TOOLS.filter((t) => t.id !== lead.id)] : TOOLS).map(
        (tool) => (
          <tr key={tool.id} data-lead={tool.id === lead?.id || undefined}>
            <th scope="row">
              {tool.name}
              <span className={styles.toolBlurb}>{tool.blurb}</span>
            </th>
            {columns.map((c) => (
              <td key={c} data-on={c === selectedPlan || undefined}>
                {canUse(c, tool.id) ? (
                  <>
                    <Icon name="check" size={16} />
                    <span className={styles.srOnly}>Included</span>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true" className={styles.dash}>
                      –
                    </span>
                    <span className={styles.srOnly}>Not included</span>
                  </>
                )}
              </td>
            ))}
          </tr>
        ),
      )}
    </tbody>
  );

  const upgrade = () => {
    startCheckout.mutate(
      { plan: selectedPlan, period },
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
      title={
        lead && lowest
          ? lowest === "pro"
            ? `${lead.name} is part of Pro`
            : `${lead.name} comes with Plus and Pro`
          : "Choose a plan"
      }
      subtitle={
        lead
          ? lead.pitch
          : "Plus gives every AI tool more room each day. Pro gives the most, and adds the exam forecast and calendar tools."
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
            busy={startCheckout.isPending}
          >
            {startCheckout.isPending
              ? "Opening checkout"
              : `Upgrade to ${nameOf(selectedPlan)} · ${localized.format(chosen.amountPence)}/${chosen.interval}`}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <div className={styles.periodRow}>
          <div
            className={styles.period}
            role="radiogroup"
            aria-label="Billing period"
          >
            {(["monthly", "annual"] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={period === id}
                className={styles.periodOption}
                onClick={() => setPeriod(id)}
              >
                {id === "monthly" ? "Monthly" : "Yearly"}
                {id === "annual" && saving ? (
                  <span className={styles.saving}> · save {saving}%</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div
          className={styles.plans}
          role="radiogroup"
          aria-label="Plan"
          data-count={offered.length}
        >
          {offered.map((p) => {
            const price = priceOf(p);
            const on = selectedPlan === p;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={on}
                className={styles.plan}
                onClick={() => setSelectedPlan(p)}
              >
                <span className={styles.planName}>{nameOf(p)}</span>
                <span className={styles.planPrice}>
                  {localized.format(price.amountPence)}
                  <span className={styles.planInterval}>
                    {" "}
                    / {price.interval}
                  </span>
                </span>
                <span className={styles.planNote}>
                  {price.note ?? "Billed monthly. Cancel any time."}
                </span>
                <span className={styles.planTagline}>
                  {localized.plans[p].tagline}
                </span>
              </button>
            );
          })}
        </div>

        <table className={styles.compare}>
          <caption className={styles.caption}>
            What changes on each plan
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className={styles.srOnly}>Allowance</span>
              </th>
              {columns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  data-on={c === selectedPlan || undefined}
                >
                  {c === "free" ? "Free" : nameOf(c)}
                </th>
              ))}
            </tr>
          </thead>
          {/* A gate leads with its tools, so the feature they clicked is the
              first row they read; otherwise the allowances, which are what
              most upgrades are for, come first. */}
          {lead ? (
            <>
              {toolRows}
              {allowanceRows}
            </>
          ) : (
            <>
              {allowanceRows}
              {toolRows}
            </>
          )}
        </table>
        <p className={styles.footnote}>
          The other AI tools go up in the same steps. Your exact allowances and
          today's use are in Settings, under Plan and billing.
        </p>

        {localized.paymentHint ? (
          <p className={styles.footnote}>{localized.paymentHint}</p>
        ) : null}

        {/* Said plainly, because it is the thing that makes the rest of this
            screen believable — and because it is true. */}
        <p className={styles.promise}>
          Everything you already use stays free, forever. Cancel any time from
          Settings.
        </p>
      </div>
    </Modal>
  );
}
