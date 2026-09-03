/* What each plan is allowed to do.
 *
 * One table, no scattered `if (isPro)` checks. Every gate in the app asks this
 * module, so the answer to "what does Pro actually get?" lives in one place a
 * person can read — and so a marketing page, a paywall modal and the code that
 * enforces it can never disagree about it.
 *
 * Two rules shaped this list, and both are worth stating because they are easy
 * to violate later under revenue pressure:
 *
 *  1. **Nothing that already shipped free becomes paid.** Tasks, exams, the
 *     timer, flashcards, quizzes, notes, spaced repetition, the study room,
 *     friends — all of it stays free forever. Taking working features away
 *     from students who already rely on them is how you lose the trust this
 *     product needs, and the people we are building for are the least able to
 *     pay their way back in.
 *  2. **The free tier has to be genuinely good.** A student who never pays
 *     should still get a real study system. Pro buys leverage on top of a
 *     complete product, not a product out of hostage.
 *
 * What Pro sells is the two things nothing else in this category can do —
 * knowing when you are free and knowing what your studying is worth — plus the
 * headroom to use the AI as hard as a serious student wants to.
 *
 * Client-side checks here are for *presentation*: showing the right price, the
 * right meter, the right upsell. They are not the security boundary. The edge
 * functions re-derive the plan from the database on every call, because a
 * localStorage flag is not a payment. */

export type Plan = "free" | "pro";

/** What Stripe says the subscription is doing. Mirrors the statuses Stripe
 *  actually sends; anything unrecognised is treated as not-entitled. */
export type PlanStatus =
  "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "none";

export interface Subscription {
  plan: Plan;
  status: PlanStatus;
  /** When the current period ends — the date a cancelled plan stops working. */
  renewsAt: string | null;
  /** Set once the student has cancelled but is still inside a paid period. */
  cancelAtPeriodEnd: boolean;
}

export const FREE_SUBSCRIPTION: Subscription = {
  plan: "free",
  status: "none",
  renewsAt: null,
  cancelAtPeriodEnd: false,
};

/* `past_due` deliberately keeps working. A card that expires on the 3rd of the
   month should not delete a student's exam forecast during exam week; Stripe
   retries for days, and the cost of a few days of unpaid access is far smaller
   than the cost of breaking someone's revision on a billing hiccup. */
const ENTITLED_STATUSES: PlanStatus[] = ["active", "trialing", "past_due"];

export function isEntitled(sub: Subscription): boolean {
  return sub.plan === "pro" && ENTITLED_STATUSES.includes(sub.status);
}

/** The effective plan, after status is taken into account. Everything else in
 *  the app should ask this rather than reading `sub.plan` directly. */
export function effectivePlan(sub: Subscription): Plan {
  return isEntitled(sub) ? "pro" : "free";
}

/* --- Features ----------------------------------------------------------- */

export type FeatureId =
  | "trajectory"
  | "calendarImport"
  | "autoSchedule"
  | "scheduleExport"
  | "unlimitedNotebooks"
  | "prioritySupport";

export interface FeatureMeta {
  id: FeatureId;
  name: string;
  /** One line, written to the student, saying what they get. */
  blurb: string;
  /** Why it is worth paying for — used on the paywall, not in the code. */
  pitch: string;
  minimumPlan: Plan;
}

export const FEATURES: Record<FeatureId, FeatureMeta> = {
  trajectory: {
    id: "trajectory",
    name: "Exam Trajectory",
    blurb: "See the grade you are heading for, and what changes it.",
    pitch:
      "Projects every topic forward to exam day under real memory decay, then tells you what the next hour of your life is worth — in points, on the topic that needs it.",
    minimumPlan: "pro",
  },
  calendarImport: {
    id: "calendarImport",
    name: "Calendar import",
    blurb: "Bring in your real timetable and study around it.",
    pitch:
      "Import the .ics from your university timetable, work rota or Google Calendar. It stays on your device, and every plan is built around the week you actually have.",
    minimumPlan: "pro",
  },
  autoSchedule: {
    id: "autoSchedule",
    name: "Auto-scheduled days",
    blurb: "Your work, placed in the hours you are genuinely free.",
    pitch:
      "Due cards, deadlines and exam prep placed into your real gaps — hardest work in your best hours, deadlines never quietly moved.",
    minimumPlan: "pro",
  },
  scheduleExport: {
    id: "scheduleExport",
    name: "Calendar sync out",
    blurb: "Push your study blocks back to your calendar, with reminders.",
    pitch:
      "Every block becomes a real timed event with an alarm, so studying shows up next to the lecture it has to fit around.",
    minimumPlan: "pro",
  },
  unlimitedNotebooks: {
    id: "unlimitedNotebooks",
    name: "Unlimited notebooks",
    blurb: "As many grounded research notebooks as you need.",
    pitch: "Free accounts keep three. Pro keeps everything.",
    minimumPlan: "pro",
  },
  prioritySupport: {
    id: "prioritySupport",
    name: "Priority support",
    blurb: "We answer you first.",
    pitch: "Questions and bug reports from Pro accounts go to the top.",
    minimumPlan: "pro",
  },
};

export const PRO_FEATURES: FeatureMeta[] = Object.values(FEATURES).filter(
  (f) => f.minimumPlan === "pro",
);

export function canUse(plan: Plan, feature: FeatureId): boolean {
  return FEATURES[feature].minimumPlan === "free" || plan === "pro";
}

/* --- Quotas -------------------------------------------------------------- */

export type QuotaId = "aiGenerationsPerDay" | "notebooks" | "importedCalendars";

export interface Quotas {
  aiGenerationsPerDay: number;
  notebooks: number;
  importedCalendars: number;
}

/* Free is set where a committed student doing a normal week never touches it,
   and only someone leaning on the AI as a daily driver does. A limit a real
   user hits on a good day is a limit that teaches them the product is stingy
   rather than that the plan is worth buying. */
export const QUOTAS: Record<Plan, Quotas> = {
  free: {
    aiGenerationsPerDay: 25,
    notebooks: 3,
    importedCalendars: 0,
  },
  pro: {
    aiGenerationsPerDay: 400,
    notebooks: Infinity,
    importedCalendars: 5,
  },
};

export function quotaFor(plan: Plan, quota: QuotaId): number {
  return QUOTAS[plan][quota];
}

export interface QuotaUsage {
  used: number;
  limit: number;
  remaining: number;
  /** 0-1, for a meter. Always 0 for an unlimited quota. */
  fraction: number;
  exceeded: boolean;
  unlimited: boolean;
}

export function quotaUsage(
  plan: Plan,
  quota: QuotaId,
  used: number,
): QuotaUsage {
  const limit = quotaFor(plan, quota);
  const unlimited = !Number.isFinite(limit);
  return {
    used,
    limit,
    remaining: unlimited ? Infinity : Math.max(0, limit - used),
    fraction: unlimited ? 0 : Math.min(1, limit === 0 ? 1 : used / limit),
    exceeded: !unlimited && used >= limit,
    unlimited,
  };
}

/* --- Pricing ------------------------------------------------------------- */

export interface PriceOption {
  id: "monthly" | "annual";
  label: string;
  /** Minor units, so no float ever touches money. */
  amountPence: number;
  interval: "month" | "year";
  /** Shown under the price, e.g. "£4.17/month, billed yearly". */
  note?: string;
  /** Percent saved against paying monthly. */
  savingPercent?: number;
}

/* Display only. Stripe is the source of truth for what is actually charged —
   these exist so the paywall can render before a network call and so the
   copy has something to say. If they drift from the Stripe prices, Stripe
   wins and this is the bug. */
export const PRICES: PriceOption[] = [
  {
    id: "monthly",
    label: "Monthly",
    amountPence: 599,
    interval: "month",
  },
  {
    id: "annual",
    label: "Yearly",
    amountPence: 4900,
    interval: "year",
    note: "£4.08 a month, billed once a year",
    savingPercent: 32,
  },
];

export function formatPrice(pence: number, currency = "GBP"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
  }).format(pence / 100);
}

/** What the student is told when a gate stops them. Kept here rather than in
 *  the modal so the same sentence is used wherever the gate appears. */
export function gateMessage(feature: FeatureId): string {
  return FEATURES[feature].pitch;
}
