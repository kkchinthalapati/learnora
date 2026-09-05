/* First-run onboarding: the answers a brand new student gives on /welcome,
 * and — the part that actually matters — how each answer is translated into
 * the preferences the rest of the app already reads.
 *
 * The design borrows the shape of a Discord server's join questions: a few
 * taps that pick which parts of the product you see, rather than a settings
 * form. Nothing asked here is unique to this screen. Every answer lands in a
 * store that already existed and is already editable elsewhere:
 *
 *   goal, focusAreas   → dashboard section visibility (Dashboard ▸ Customize)
 *   coachStyle, detail → `Settings.aiPersona` / `aiConciseness` / `aiDepth` /
 *                        `aiStyle`            (Settings ▸ Preferences)
 *   studyTime, capacity→ `LifeContext.chronotype` / capacity  (My week)
 *
 * That is deliberate: skipping the wizard must never leave a feature
 * unreachable, and re-running it must never be the only way to change an
 * answer. The wizard is a fast path through settings that already exist.
 *
 * The answers themselves live in Supabase `user_metadata` rather than
 * localStorage. They are per-account and follow the student to a second
 * device, and `useAuth().user` already carries them synchronously, so the
 * route guard can decide whether to redirect without an extra fetch. A
 * localStorage mirror exists only as a failsafe — see `markOnboardedLocally`.
 */

import type { User } from "@supabase/supabase-js";
import { Storage } from "./storage";
import type {
  AiConciseness,
  AiPersona,
  PersonaDepth,
  Settings,
  StudyStyle,
} from "./settings";
import type { Chronotype, LifeContext } from "./lifeContext";
import type { DashboardLayoutPreferences } from "../views/dashboard/DashboardCustomizeModal";
import { DEFAULT_DASHBOARD_LAYOUT } from "../views/dashboard/DashboardCustomizeModal";
import type { IconName } from "../components/icons";

export const ONBOARDING_VERSION = 1;

/** The `user_metadata` field the answers are stored under. */
export const ONBOARDING_METADATA_KEY = "onboarding";

/** Failsafe mirror, so a failed metadata write can't trap someone in a loop. */
export const ONBOARDING_LOCAL_KEY = "learnora_onboarding_done_v1";

/* Accounts created before onboarding shipped have already found their way
   around; bouncing them into a welcome wizard would be worse than useless.
   Only accounts newer than this are ever redirected. */
export const ONBOARDING_RELEASE_ISO = "2026-09-03T00:00:00.000Z";

export type StudyGoalId = "school" | "university" | "professional" | "self";
export type FocusAreaId =
  "deadlines" | "planning" | "understanding" | "recall" | "exams" | "social";
export type StudyTimeId = "morning" | "steady" | "night";
/** Mirrors the `profiles_exam_type_check` constraint. */
export type ExamTypeId =
  "ap" | "ib" | "a_level" | "gcse" | "sat" | "act" | "other";
/** Mirrors the `profiles_study_pace_check` constraint. */
export type StudyPaceId = "light" | "balanced" | "intensive";

export interface OnboardingAnswers {
  version: number;
  goal: StudyGoalId | null;
  /** Which qualification, when the goal is one that has boards. Null for
   *  "learning for myself", and for anyone who skipped the follow-up. */
  examType: ExamTypeId | null;
  /** Free text — a syllabus's grading scale is not something to hardcode
   *  (IB 1-7, GCSE 9-1, letters, percentages). */
  targetGrade: string | null;
  focusAreas: FocusAreaId[];
  coachStyle: AiPersona;
  detail: AiConciseness;
  studyTime: StudyTimeId | null;
  weekdayCapacityMins: number | null;
  /** ISO timestamp; null while the wizard is still open. */
  completedAt: string | null;
  /** True when they pressed "Skip setup" rather than answering. */
  skipped: boolean;
}

export const EMPTY_ANSWERS: OnboardingAnswers = Object.freeze({
  version: ONBOARDING_VERSION,
  goal: null,
  examType: null,
  targetGrade: null,
  focusAreas: [],
  coachStyle: "tutor",
  detail: "medium",
  studyTime: null,
  weekdayCapacityMins: null,
  completedAt: null,
  skipped: false,
} satisfies OnboardingAnswers);

/* ---------------------------------------------------------------- options */

export const STUDY_GOALS: ReadonlyArray<{
  id: StudyGoalId;
  label: string;
  hint: string;
  icon: IconName;
}> = [
  {
    id: "school",
    label: "School exams",
    hint: "GCSEs, A-levels, high school finals",
    icon: "graduation-cap",
  },
  {
    id: "university",
    label: "A university course",
    hint: "Modules, coursework, end-of-term papers",
    icon: "book-open",
  },
  {
    id: "professional",
    label: "A professional exam",
    hint: "Certifications, licensing, board exams",
    icon: "award",
  },
  {
    id: "self",
    label: "Learning for myself",
    hint: "No deadline — I just want it to stick",
    icon: "compass",
  },
];

/* Offered as a follow-up to the goal question rather than a step of its own:
   it is a qualifier on an answer already given, and a whole screen asking
   "which exam board" would be the most skippable screen in the wizard.

   `self` is deliberately absent from GOALS_WITH_BOARDS below — someone
   learning for themselves has no board, and asking anyway is the kind of
   question that makes a product feel like it wasn't listening. */
export const EXAM_BOARDS: ReadonlyArray<{
  id: ExamTypeId;
  label: string;
}> = [
  { id: "gcse", label: "GCSE" },
  { id: "a_level", label: "A-Level" },
  { id: "ib", label: "IB" },
  { id: "ap", label: "AP" },
  { id: "sat", label: "SAT" },
  { id: "act", label: "ACT" },
  { id: "other", label: "Something else" },
];

/** Goals for which "which board?" is a question worth asking. */
export const GOALS_WITH_BOARDS: ReadonlyArray<StudyGoalId> = [
  "school",
  "professional",
];

export const FOCUS_AREAS: ReadonlyArray<{
  id: FocusAreaId;
  label: string;
  hint: string;
  icon: IconName;
}> = [
  {
    id: "deadlines",
    label: "Stay on top of deadlines",
    hint: "Nothing due sneaks up on me",
    icon: "flame",
  },
  {
    id: "planning",
    label: "Plan my study time",
    hint: "Fit study around lectures, work and life",
    icon: "calendar-week",
  },
  {
    id: "understanding",
    label: "Understand hard topics",
    hint: "Explain it until it actually clicks",
    icon: "brain",
  },
  {
    id: "recall",
    label: "Remember what I learn",
    hint: "Flashcards and spaced review",
    icon: "layers",
  },
  {
    id: "exams",
    label: "Practise for exams",
    hint: "Quizzes, mock papers, trap-spotting",
    icon: "target",
  },
  {
    id: "social",
    label: "Study with other people",
    hint: "Study rooms, friends, shared streaks",
    icon: "users",
  },
];

export const COACH_STYLES: ReadonlyArray<{
  id: AiPersona;
  label: string;
  hint: string;
  sample: string;
  icon: IconName;
}> = [
  {
    id: "tutor",
    label: "Patient tutor",
    hint: "Walks you through it, one step at a time",
    sample: "Let's take that apart together — what happens at the first step?",
    icon: "bot",
  },
  {
    id: "coach",
    label: "Direct coach",
    hint: "Tells you what to fix and what to do next",
    sample: "That's the weak spot. Twenty minutes on it now, then we re-test.",
    icon: "zap",
  },
  {
    id: "buddy",
    label: "Study buddy",
    hint: "Casual, encouraging, low pressure",
    sample: "Okay that one's genuinely tricky — here's the shortcut I use.",
    icon: "smartphone",
  },
  {
    id: "professor",
    label: "Precise professor",
    hint: "Formal and rigorous, with the reasoning shown",
    sample: "Observe that the premise constrains the result in two ways.",
    icon: "graduation-cap",
  },
];

export const STUDY_TIMES: ReadonlyArray<{
  id: StudyTimeId;
  label: string;
  hint: string;
  chronotype: Chronotype;
  icon: IconName;
}> = [
  {
    id: "morning",
    label: "Early",
    hint: "Sharpest before noon",
    chronotype: "early",
    icon: "sun",
  },
  {
    id: "steady",
    label: "Steady",
    hint: "About the same all day",
    chronotype: "neutral",
    icon: "activity",
  },
  {
    id: "night",
    label: "Late",
    hint: "I do my best work at night",
    chronotype: "night",
    icon: "moon",
  },
];

/** The capacity choices, in minutes per weekday. Mirrors My week's stepper. */
export const CAPACITY_CHOICES: ReadonlyArray<{
  mins: number;
  label: string;
  hint: string;
}> = [
  { mins: 30, label: "30 min", hint: "Something small, most days" },
  { mins: 60, label: "1 hour", hint: "A focused block after everything else" },
  { mins: 120, label: "2 hours", hint: "A serious evening of work" },
  { mins: 180, label: "3 hours +", hint: "Study is the main thing right now" },
];

/* ------------------------------------------------------------ read / parse */

function isFocusArea(value: unknown): value is FocusAreaId {
  return FOCUS_AREAS.some((a) => a.id === value);
}

/** Parse whatever is sitting in `user_metadata.onboarding`, defensively.
 *
 * Metadata is a free-form JSON blob that older builds (and, in principle, a
 * hand-edited row) can have written, so every field is validated rather than
 * cast. Anything unrecognised falls back to `EMPTY_ANSWERS`' value. */
export function parseAnswers(raw: unknown): OnboardingAnswers | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    version: typeof r.version === "number" ? r.version : ONBOARDING_VERSION,
    goal: STUDY_GOALS.some((g) => g.id === r.goal)
      ? (r.goal as StudyGoalId)
      : null,
    examType: EXAM_BOARDS.some((b) => b.id === r.examType)
      ? (r.examType as ExamTypeId)
      : null,
    targetGrade:
      typeof r.targetGrade === "string" && r.targetGrade.trim()
        ? r.targetGrade.trim().slice(0, 20)
        : null,
    focusAreas: Array.isArray(r.focusAreas)
      ? r.focusAreas.filter(isFocusArea)
      : [],
    coachStyle: COACH_STYLES.some((c) => c.id === r.coachStyle)
      ? (r.coachStyle as AiPersona)
      : EMPTY_ANSWERS.coachStyle,
    detail:
      r.detail === "short" || r.detail === "medium" || r.detail === "detailed"
        ? r.detail
        : EMPTY_ANSWERS.detail,
    studyTime: STUDY_TIMES.some((s) => s.id === r.studyTime)
      ? (r.studyTime as StudyTimeId)
      : null,
    weekdayCapacityMins:
      typeof r.weekdayCapacityMins === "number" &&
      Number.isFinite(r.weekdayCapacityMins)
        ? Math.min(900, Math.max(0, Math.round(r.weekdayCapacityMins)))
        : null,
    completedAt: typeof r.completedAt === "string" ? r.completedAt : null,
    skipped: r.skipped === true,
  };
}

/** The saved answers for a signed-in user, or null if they've never answered. */
export function readOnboarding(user: User | null): OnboardingAnswers | null {
  if (!user) return null;
  return parseAnswers(
    (user.user_metadata as Record<string, unknown> | undefined)?.[
      ONBOARDING_METADATA_KEY
    ],
  );
}

/** Records "this account is done" in localStorage as well as metadata.
 *
 * The metadata write is a network call and can fail — offline, expired token,
 * a Supabase blip. If it did fail and the guard only consulted metadata, the
 * student would be redirected straight back into the wizard they just
 * finished, forever. The local mirror is keyed by user id so a shared browser
 * doesn't mark the next account as onboarded. */
export function markOnboardedLocally(userId: string): void {
  const seen = Storage.get<string[]>(ONBOARDING_LOCAL_KEY, []);
  const list = Array.isArray(seen) ? seen : [];
  if (list.includes(userId)) return;
  Storage.set(ONBOARDING_LOCAL_KEY, [...list, userId].slice(-8));
}

function onboardedLocally(userId: string): boolean {
  const seen = Storage.get<string[]>(ONBOARDING_LOCAL_KEY, []);
  return Array.isArray(seen) && seen.includes(userId);
}

/** Should this user be redirected into the welcome wizard right now? */
export function shouldOnboard(
  user: User | null,
  releaseIso: string = ONBOARDING_RELEASE_ISO,
): boolean {
  if (!user) return false;
  if (onboardedLocally(user.id)) return false;

  const saved = readOnboarding(user);
  if (saved && (saved.completedAt || saved.skipped)) return false;

  /* Pre-existing accounts are grandfathered in. `created_at` is set by
     Supabase on signup and is never absent in practice, but if it is
     unparseable we take the cautious route and leave them alone rather than
     interrupting someone mid-session. */
  const created = Date.parse(user.created_at ?? "");
  if (!Number.isFinite(created)) return false;
  return created >= Date.parse(releaseIso);
}

/* ----------------------------------------------------------- the wiring up */

const DEPTH_BY_DETAIL: Record<AiConciseness, PersonaDepth> = {
  short: 2,
  medium: 3,
  detailed: 4,
};

/* First match wins, so the order is the priority order: someone revising for
   exams wants trap-spotting more than they want pretty analogies. */
const STYLE_BY_FOCUS: ReadonlyArray<[FocusAreaId, StudyStyle]> = [
  ["exams", "exam_trap"],
  ["understanding", "visual"],
  ["recall", "concise"],
  ["planning", "concise"],
];

/** The `Settings` patch implied by the answers — feed to `updateAndSave`. */
export function settingsPatchFor(
  answers: OnboardingAnswers,
): Partial<Settings> {
  const style = STYLE_BY_FOCUS.find(([focus]) =>
    answers.focusAreas.includes(focus),
  )?.[1];
  return {
    aiPersona: answers.coachStyle,
    aiConciseness: answers.detail,
    aiDepth: DEPTH_BY_DETAIL[answers.detail],
    ...(style ? { aiStyle: style } : {}),
    /* Someone who told us deadlines are the problem has opted in to being
       reminded about them; anyone else keeps the shipped default. */
    ...(answers.focusAreas.includes("deadlines")
      ? { notifyStudyReminders: true }
      : {}),
  };
}

/* Study pace is *derived*, not asked. The rhythm step already establishes how
   much study is realistic on a weekday, and asking a second, softer version of
   the same question ("light / balanced / intensive?") would be asking the
   student to answer it twice and to reconcile the two themselves.

   The thresholds match CAPACITY_CHOICES' own rungs: half an hour is someone
   fitting study around a full life, an hour is the middle, and two hours or
   more is someone for whom study is the main thing right now — which is
   exactly the distinction `STUDY_PACE_HINTS` draws for the planner. */
export function studyPaceFor(answers: OnboardingAnswers): StudyPaceId | null {
  const mins = answers.weekdayCapacityMins;
  if (mins === null) return null;
  if (mins <= 30) return "light";
  if (mins <= 60) return "balanced";
  return "intensive";
}

/** The `profiles` study-configuration patch implied by the answers.
 *
 * These four columns are read by `loadAdaptiveContext` and rendered into the
 * planner prompt as its STUDENT CONTEXT block (see `api/aiPlan.ts`). Before
 * this, they were reachable only from Settings ▸ Preferences ▸ Study Focus —
 * a screen a brand new account has no reason to open — so the block the
 * planner was built to read was empty for every student who had just
 * onboarded, which is all of them.
 *
 * `subject` comes from the wizard's own subject field rather than the answers
 * blob: the same string already becomes their first folder, and it is the
 * one thing here the student typed in their own words. */
export function studyProfilePatchFor(
  answers: OnboardingAnswers,
  subjectName: string,
): {
  subject: string | null;
  examType: string | null;
  targetGrade: string | null;
  studyPace: string | null;
} {
  return {
    subject: subjectName.trim() || null,
    examType: answers.examType,
    targetGrade: answers.targetGrade,
    studyPace: studyPaceFor(answers),
  };
}

/** The `LifeContext` patch implied by the answers — feed to `update`. */
export function lifeContextPatchFor(
  answers: OnboardingAnswers,
): Partial<LifeContext> {
  const patch: Partial<LifeContext> = {};
  const time = STUDY_TIMES.find((s) => s.id === answers.studyTime);
  if (time) patch.chronotype = time.chronotype;
  if (answers.weekdayCapacityMins !== null) {
    patch.weekdayCapacityMins = answers.weekdayCapacityMins;
    /* Weekends run about an hour longer for most people, which is the same
       assumption `DEFAULT_LIFE_CONTEXT` makes (150 → 210). Capped at the
       ceiling `normalizeLifeContext` enforces. */
    patch.weekendCapacityMins = Math.min(900, answers.weekdayCapacityMins + 60);
  }
  return patch;
}

type SectionId = keyof DashboardLayoutPreferences["visibleSections"];

/* Which answers earn a dashboard section its place. `priorities` is absent on
   purpose — it is the dashboard's spine (what's due, what's next) and is
   always shown. */
const SECTION_INTERESTS: Record<SectionId, FocusAreaId[]> = {
  todayTimeline: ["planning", "deadlines"],
  activityRings: ["recall", "planning"],
  recentNotebooks: ["understanding", "recall"],
  priorities: ["deadlines", "exams", "planning", "recall", "understanding"],
  continueStudying: ["understanding", "exams"],
  progressStreak: ["recall", "planning"],
  sessionsCommunity: ["social"],
};

/** Start a new account on a dashboard showing only what they asked for.
 *
 * The empty dashboard is nine cards and eight "you have nothing here yet"
 * messages, which is the overwhelm this whole flow exists to fix. Hiding the
 * sections nobody asked for is the single biggest lever we have — and it is
 * fully reversible from Dashboard ▸ Customize, which is why this is safe to
 * do on their behalf.
 *
 * Answering nothing returns the untouched defaults: an unanswered question is
 * not a request for a smaller dashboard. */
export function dashboardLayoutFor(
  answers: OnboardingAnswers,
  base: DashboardLayoutPreferences = DEFAULT_DASHBOARD_LAYOUT,
): DashboardLayoutPreferences {
  if (answers.focusAreas.length === 0) return base;
  const visibleSections = { ...base.visibleSections };
  for (const id of Object.keys(visibleSections) as SectionId[]) {
    visibleSections[id] =
      id === "priorities" ||
      SECTION_INTERESTS[id].some((focus) => answers.focusAreas.includes(focus));
  }
  return { ...base, visibleSections };
}

export interface NextStep {
  id: FocusAreaId;
  label: string;
  blurb: string;
  to: string;
  cta: string;
  icon: IconName;
}

const NEXT_STEP_BY_FOCUS: Record<FocusAreaId, Omit<NextStep, "id">> = {
  deadlines: {
    label: "Your exams and deadlines",
    blurb:
      "Add what's coming up and every countdown on your dashboard fills in.",
    to: "/exams",
    cta: "Add an exam",
    icon: "flame",
  },
  planning: {
    label: "My week",
    blurb:
      "Tell Learnora when your lectures, shifts and commitments are, and it schedules study around them.",
    to: "/my-week",
    cta: "Set up my week",
    icon: "calendar-week",
  },
  understanding: {
    label: "Explain It Simply",
    blurb:
      "Teach a topic back in your own words and get told exactly where it fell apart.",
    to: "/feynman",
    cta: "Try it on a topic",
    icon: "brain",
  },
  recall: {
    label: "Flashcards and review",
    blurb:
      "Turn any note into a deck, then let spaced repetition decide what you see each day.",
    to: "/library",
    cta: "Open your library",
    icon: "layers",
  },
  exams: {
    label: "Practice and mock exams",
    blurb:
      "Generate quizzes from your own material and sit them under real exam conditions.",
    to: "/library/quizzes",
    cta: "Build a quiz",
    icon: "target",
  },
  social: {
    label: "Study rooms and friends",
    blurb:
      "Sit in a shared focus room, compare streaks, and keep each other honest.",
    to: "/room",
    cta: "Open a study room",
    icon: "users",
  },
};

/** Deep links tailored to what they said they came here for. */
export function nextStepsFor(answers: OnboardingAnswers): NextStep[] {
  /* Rendered in FOCUS_AREAS order rather than click order, so the list reads
     the same way as the question that produced it. */
  return FOCUS_AREAS.filter((area) => answers.focusAreas.includes(area.id)).map(
    (area) => ({ id: area.id, ...NEXT_STEP_BY_FOCUS[area.id] }),
  );
}

/** One-line summary of the goal, for the recap screen and Settings. */
export function goalSummary(answers: OnboardingAnswers): string | null {
  return STUDY_GOALS.find((g) => g.id === answers.goal)?.label ?? null;
}
