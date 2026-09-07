/* What each plan is allowed to do.
 *
 * One table, no scattered `if (isPro)` checks. Every gate in the app asks this
 * module, so the answer to "what does Plus/Pro actually get?" lives in one
 * place a person can read — and so a marketing page, a paywall modal and the
 * code that enforces it can never disagree about it.
 *
 * Two rules shaped this list, and both are worth stating because they are easy
 * to violate later under revenue pressure:
 *
 *  1. **Nothing that already shipped free becomes paid.** Tasks, exams, the
 *     timer, flashcards, quizzes, notes, spaced repetition, the study room,
 *     friends — all of it stays free forever. Taking working features away
 *     from students who already rely on them is how you lose the trust this
 *     product needs, and the people we are building for are the least able to
 *     pay their way back in. Every AI tool below keeps a real (if small) free
 *     allowance for the same reason — the free tier tries every tool, it just
 *     runs out of runway on the ones it uses hardest.
 *  2. **The free tier has to be genuinely good.** A student who never pays
 *     should still get a real study system. Plus and Pro buy leverage on top
 *     of a complete product, not a product held hostage.
 *
 * Plus and Pro sell the same two things, at different amounts: headroom to
 * use the AI as hard as a serious student wants to, tool by tool rather than
 * out of one shared pool (so a flashcard-heavy afternoon can't silently burn
 * the day's chat budget), and — Pro only — the things nothing else in this
 * category can do: knowing when you are free and knowing what your studying
 * is worth.
 *
 * Client-side checks here are for *presentation*: showing the right price, the
 * right meter, the right upsell. They are not the security boundary. The edge
 * functions re-derive the plan from the database on every call, because a
 * localStorage flag is not a payment. */

export type Plan = "free" | "plus" | "pro";

/** Ordering for "does this plan meet the minimum" comparisons. Free < Plus <
 *  Pro — never compare `Plan` strings directly, a plan added later would sort
 *  wrong. */
const PLAN_RANK: Record<Plan, number> = { free: 0, plus: 1, pro: 2 };

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
  return sub.plan !== "free" && ENTITLED_STATUSES.includes(sub.status);
}

/** The effective plan, after status is taken into account. Everything else in
 *  the app should ask this rather than reading `sub.plan` directly. */
export function effectivePlan(sub: Subscription): Plan {
  return isEntitled(sub) ? sub.plan : "free";
}

/* --- Features ------------------------------------------------------------
   Binary, non-metered capabilities — as opposed to the AI tool quotas below,
   which are metered. Every one of these is Pro-only today: Plus's whole pitch
   is more AI headroom at a lower price, not a second tier of features to
   track separately. If that changes, `minimumPlan: "plus"` is what to set —
   `canUse` already compares by rank, not by exact match. */

export type FeatureId =
  | "trajectory"
  | "calendarImport"
  | "autoSchedule"
  | "scheduleExport"
  | "unlimitedNotebooks"
  | "prioritySupport"
  | "customAppearance";

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
    pitch: "Free and Plus accounts keep a handful. Pro keeps everything.",
    minimumPlan: "pro",
  },
  prioritySupport: {
    id: "prioritySupport",
    name: "Priority support",
    blurb: "We answer you first.",
    pitch: "Questions and bug reports from Pro accounts go to the top.",
    minimumPlan: "pro",
  },
  customAppearance: {
    id: "customAppearance",
    name: "Theme colours",
    blurb: "Any accent colour, or build your own from scratch.",
    pitch:
      "Pick from thirteen curated accents or mix up to three colours of your own — every button, glow and gradient in the workspace repaints to match.",
    minimumPlan: "pro",
  },
};

export const PRO_FEATURES: FeatureMeta[] = Object.values(FEATURES).filter(
  (f) => f.minimumPlan === "pro",
);

export function canUse(plan: Plan, feature: FeatureId): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[FEATURES[feature].minimumPlan];
}

/* --- AI tools --------------------------------------------------------------

   Every AI surface in the app funnels through one edge function
   (supabase/functions/learnora-ai), but it used to be metered as a single
   shared "generations per day" pool. That meant a flashcard-heavy afternoon
   could burn the same budget as chat, and a student had no way to reason
   about which habit was costing them their allowance. Each tool below is
   metered separately instead — its own daily cap per plan, enforced
   server-side by `learnora-ai` reading the `tool` column on
   `ai_request_log` (kept in step with `AI_TOOL_QUOTAS` there; a value in the
   browser is not a payment). */

export type AiToolId =
  | "chat"
  | "notes"
  | "flashcards"
  | "quiz"
  | "plan"
  | "debugger"
  | "preMortem"
  | "feynman"
  | "examDeconstructor"
  | "sparring"
  | "notebookStudio";

export interface AiToolMeta {
  id: AiToolId;
  name: string;
  description: string;
}

export const AI_TOOLS: Record<AiToolId, AiToolMeta> = {
  chat: {
    id: "chat",
    name: "Chat & quick edits",
    description:
      "The workspace assistant, the notes-sidebar chat, and inline explain/rewrite actions.",
  },
  notes: {
    id: "notes",
    name: "Notes generation",
    description: "Turning a file, link or pasted text into study notes.",
  },
  flashcards: {
    id: "flashcards",
    name: "Flashcard decks",
    description: "Generating a full deck from your notes or a snippet.",
  },
  quiz: {
    id: "quiz",
    name: "Quizzes",
    description: "Generating a multiple-choice quiz.",
  },
  plan: {
    id: "plan",
    name: "Weekly plan",
    description: "Building your weekly study schedule.",
  },
  debugger: {
    id: "debugger",
    name: "Cognitive Debugger",
    description: "Root-cause tracing for a concept you got wrong.",
  },
  preMortem: {
    id: "preMortem",
    name: "Pre-Mortem",
    description: "Predicting where an exam is likely to catch you out.",
  },
  feynman: {
    id: "feynman",
    name: "Feynman Apprentice",
    description: "Teaching a concept to an AI apprentice to prove you know it.",
  },
  examDeconstructor: {
    id: "examDeconstructor",
    name: "Exam Deconstructor",
    description: "Reverse-engineering the trap patterns in past papers.",
  },
  sparring: {
    id: "sparring",
    name: "Socratic Sparring",
    description: "Live back-and-forth debate with an AI study partner.",
  },
  notebookStudio: {
    id: "notebookStudio",
    name: "Notebook Studio",
    description:
      "Grounded Q&A, cheat-sheet and deep-dive generation inside a research notebook.",
  },
};

export const AI_TOOL_IDS = Object.keys(AI_TOOLS) as AiToolId[];

/* --- Quotas -------------------------------------------------------------- */

export type QuotaId = AiToolId | "notebooks" | "importedCalendars";

export type Quotas = Record<AiToolId, number> & {
  notebooks: number;
  importedCalendars: number;
};

/* Free is set where a committed student doing a normal week never touches
   most of these, and only someone leaning on one specific tool as a daily
   driver runs out — on that tool only, not on everything at once. A limit a
   real user hits on a good day is a limit that teaches them the product is
   stingy rather than that the plan is worth buying. Plus sits roughly 4x
   free; Pro roughly 3x Plus again, which is generous enough that only the
   most extreme daily user ever sees the ceiling. */
export const QUOTAS: Record<Plan, Quotas> = {
  free: {
    chat: 15,
    notes: 3,
    flashcards: 3,
    quiz: 3,
    plan: 1,
    debugger: 2,
    preMortem: 2,
    feynman: 2,
    examDeconstructor: 2,
    sparring: 2,
    notebookStudio: 5,
    notebooks: 3,
    importedCalendars: 0,
  },
  plus: {
    chat: 60,
    notes: 10,
    flashcards: 10,
    quiz: 10,
    plan: 3,
    debugger: 8,
    preMortem: 6,
    feynman: 8,
    examDeconstructor: 6,
    sparring: 8,
    notebookStudio: 20,
    notebooks: 10,
    importedCalendars: 1,
  },
  pro: {
    chat: 200,
    notes: 30,
    flashcards: 30,
    quiz: 30,
    plan: 7,
    debugger: 25,
    preMortem: 20,
    feynman: 25,
    examDeconstructor: 20,
    sparring: 25,
    notebookStudio: 60,
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

export interface PlanPricing {
  plan: "plus" | "pro";
  name: string;
  /** One line under the plan name on the paywall. */
  tagline: string;
  prices: PriceOption[];
}

/* Display only. Stripe is the source of truth for what is actually charged —
   these exist so the paywall can render before a network call and so the
   copy has something to say. If they drift from the Stripe prices, Stripe
   wins and this is the bug. Placeholder amounts below (Plus in particular)
   are ours to tune before launch; nothing here is wired to a real Stripe
   price ID — see supabase/functions/stripe-billing for those. */
export const PLAN_PRICING: Record<"plus" | "pro", PlanPricing> = {
  plus: {
    plan: "plus",
    name: "Learnora Plus",
    tagline: "More headroom on every AI tool, for less than a coffee a month.",
    prices: [
      { id: "monthly", label: "Monthly", amountPence: 299, interval: "month" },
      {
        id: "annual",
        label: "Yearly",
        amountPence: 2400,
        interval: "year",
        note: "£2.00 a month, billed once a year",
        savingPercent: 33,
      },
    ],
  },
  pro: {
    plan: "pro",
    name: "Learnora Pro",
    tagline:
      "The full system: exam-day forecasting, calendar sync, and the highest AI ceiling on every tool.",
    prices: [
      { id: "monthly", label: "Monthly", amountPence: 599, interval: "month" },
      {
        id: "annual",
        label: "Yearly",
        amountPence: 4900,
        interval: "year",
        note: "£4.08 a month, billed once a year",
        savingPercent: 32,
      },
    ],
  },
};

export function formatPrice(pence: number, currency = "GBP"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
  }).format(pence / 100);
}

/** What the student is told when a gate stops them. Kept here rather than in
 *  the modal so the same sentence is used wherever the gate appears. */
