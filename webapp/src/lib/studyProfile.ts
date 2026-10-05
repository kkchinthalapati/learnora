/* The study profile: who a student is as a learner, for any country, board
 * and subject, and how it becomes their first plan.
 *
 * Nothing here invents curriculum facts. Exam systems per country come from
 * the curriculum presets and regions the app already ships (lib/onboarding,
 * lib/region); a board is "supported" only when the syllabus catalogue
 * (lib/syllabus) holds a specification for it. Everything else — any other
 * board, any other subject — runs in a generic mode the UI marks as
 * unverified: an AI-drafted topic outline the student can edit, with equal
 * weights until real ones exist.
 *
 * Saved progressively (profiles.study_profile, migration 20261005020000) so
 * the questions can be skipped and resumed. Five answers are needed to build
 * a plan; the rest sit behind "go deeper". */

import type { Exam } from "../api/types";
import { autoSchedule, type ScheduledBlock, type StudyDemand } from "./autoSchedule";
import { availabilityRange, windowEnergy } from "./availability";
import {
  DEFAULT_LIFE_CONTEXT,
  type Chronotype,
  type Commitment,
  type LifeContext,
  type Weekday,
} from "./lifeContext";
import { REGIONS, type RegionId } from "./region";
import { SYLLABUS_SPECS, type SyllabusSpec } from "./syllabus";
import { buildDemands } from "./studyDemands";
import { dateInDays } from "./date";
import { normaliseTopicKey } from "./topicKey";

export const STUDY_PROFILE_VERSION = 1;

export type AgeBand = "under13" | "13-15" | "16-17" | "18+";
export type SessionLength = "short" | "medium" | "long";
export type Confidence = 1 | 2 | 3;

export interface ProfileSubject {
  name: string;
  /** A seeded specification, when there is one for this board + subject. */
  specId: string | null;
  examDate: string | null;
  confidence: Confidence | null;
}

export interface StudyProfile {
  version: number;
  ageBand: AgeBand | null;
  /** ISO 3166-1 alpha-2. */
  country: string | null;
  /** An `EXAM_SYSTEMS` id, or "other". */
  system: string | null;
  /** The board: a supported one's name, or the student's own words. */
  board: string | null;
  /** Year, grade or level, in the student's words ("Year 11", "Grade 12"). */
  level: string | null;
  subjects: ProfileSubject[];
  /* The five required to build a plan. */
  weekdayMins: number | null;
  weekendMins: number | null;
  /** Weekday fixed commitment (school, work) as "HH:MM"–"HH:MM". */
  busyFrom: string | null;
  busyUntil: string | null;
  protectedDays: Weekday[];
  bestTime: Chronotype | null;
  sessionLength: SessionLength | null;
  target: string | null;
  /* "Go deeper": optional, skippable. */
  devices: string[];
  methods: string[];
  pastProblems: string | null;
  learningStyle: string | null;
  deeperSkipped: boolean;
  updatedAt: string | null;
}

export const EMPTY_PROFILE: StudyProfile = Object.freeze({
  version: STUDY_PROFILE_VERSION,
  ageBand: null,
  country: null,
  system: null,
  board: null,
  level: null,
  subjects: [],
  weekdayMins: null,
  weekendMins: null,
  busyFrom: null,
  busyUntil: null,
  protectedDays: [],
  bestTime: null,
  sessionLength: null,
  target: null,
  devices: [],
  methods: [],
  pastProblems: null,
  learningStyle: null,
  deeperSkipped: false,
  updatedAt: null,
}) as StudyProfile;

/** Learnora is for students 13 and over (the AI content policy says so). */
export function isUnderAge(p: Pick<StudyProfile, "ageBand">): boolean {
  return p.ageBand === "under13";
}

/* ── Where, and what they sit ──────────────────────────────────────────── */

/** ISO 3166-1 alpha-2 codes. Names come from the browser (Intl.DisplayNames),
 *  so they follow the student's language. */
export const COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

export function countryName(code: string, locale = "en"): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The app's pricing/privacy region for a country; INTL when none claims it. */
export function regionForCountry(code: string | null): RegionId {
  if (!code) return "INTL";
  const lower = code.toLowerCase();
  const hit = Object.values(REGIONS).find((r) => r.localeRegions.includes(lower));
  return hit?.id ?? "INTL";
}

export interface ExamSystem {
  id: string;
  label: string;
  /** Regions it is offered first in. Empty = everywhere. */
  regions: readonly RegionId[];
  /** The syllabus catalogue's qualification, when it seeds any specs. */
  qualification: "GCSE" | "IB" | null;
  /** The profiles.exam_type value written before 20261005020000 relaxed the
   *  check, so saving works against either schema. */
  legacyExamType: "gcse" | "a_level" | "ib" | "ap" | "sat" | "other";
}

/* The systems the app's curriculum presets already name, by the regions
   they are listed for there. Not a claim about every country's schools:
   anything else is "my board isn't listed". */
export const EXAM_SYSTEMS: readonly ExamSystem[] = [
  { id: "gcse", label: "GCSE / IGCSE", regions: ["GB", "INTL"], qualification: "GCSE", legacyExamType: "gcse" },
  { id: "a_level", label: "A-Level", regions: ["GB"], qualification: null, legacyExamType: "a_level" },
  { id: "ib", label: "IB Diploma", regions: [], qualification: "IB", legacyExamType: "ib" },
  { id: "ap", label: "AP", regions: ["US", "CA"], qualification: null, legacyExamType: "ap" },
  { id: "sat", label: "SAT / ACT", regions: ["US"], qualification: null, legacyExamType: "sat" },
  { id: "cbse", label: "CBSE", regions: ["IN"], qualification: null, legacyExamType: "other" },
  { id: "icse", label: "ICSE", regions: ["IN"], qualification: null, legacyExamType: "other" },
  { id: "atar", label: "Year 12 (HSC / VCE)", regions: ["AU"], qualification: null, legacyExamType: "other" },
];

export const OTHER_SYSTEM = "other";

/** Systems to offer for a country: the ones listed for its region, then the
 *  ones offered everywhere. "My board isn't listed" is always added by the
 *  UI. */
export function examSystemsFor(country: string | null): ExamSystem[] {
  const region = regionForCountry(country);
  return EXAM_SYSTEMS.filter((s) => s.regions.length === 0 || s.regions.includes(region));
}

export function getSystem(id: string | null): ExamSystem | null {
  return EXAM_SYSTEMS.find((s) => s.id === id) ?? null;
}

export interface BoardOption {
  board: string;
  /** Subjects with a seeded specification for this board. */
  subjects: string[];
}

/** Boards with seeded specifications under a system: the "supported" ones. */
export function supportedBoards(systemId: string | null): BoardOption[] {
  const qual = getSystem(systemId)?.qualification;
  if (!qual) return [];
  const byBoard = new Map<string, Set<string>>();
  for (const spec of SYLLABUS_SPECS) {
    if (spec.qualification !== qual) continue;
    if (!byBoard.has(spec.board)) byBoard.set(spec.board, new Set());
    byBoard.get(spec.board)!.add(spec.subject);
  }
  return [...byBoard].map(([board, subjects]) => ({ board, subjects: [...subjects].sort() }));
}

const SUBJECT_ALIASES: Record<string, string> = { maths: "mathematics", math: "mathematics" };
const subjectKey = (s: string) => {
  const k = s.trim().toLowerCase();
  return SUBJECT_ALIASES[k] ?? k;
};

/** The seeded specification for a system, board and subject, or null. */
export function specFor(
  systemId: string | null,
  board: string | null,
  subject: string,
): SyllabusSpec | null {
  const qual = getSystem(systemId)?.qualification;
  if (!qual || !board) return null;
  return (
    SYLLABUS_SPECS.find(
      (s) =>
        s.qualification === qual &&
        s.board.toLowerCase() === board.trim().toLowerCase() &&
        subjectKey(s.subject) === subjectKey(subject),
    ) ?? null
  );
}

export function isSupportedSubject(p: Pick<StudyProfile, "system" | "board">, subject: string): boolean {
  return specFor(p.system, p.board, subject) !== null;
}

/* ── The five required answers ─────────────────────────────────────────── */

export type RequiredQuestion = "availability" | "bestTime" | "sessionLength" | "confidence" | "target";
export const REQUIRED_QUESTIONS: readonly RequiredQuestion[] = [
  "availability",
  "bestTime",
  "sessionLength",
  "confidence",
  "target",
];

export function missingRequired(p: StudyProfile): RequiredQuestion[] {
  const missing: RequiredQuestion[] = [];
  if (p.weekdayMins === null || p.weekendMins === null) missing.push("availability");
  if (!p.bestTime) missing.push("bestTime");
  if (!p.sessionLength) missing.push("sessionLength");
  if (p.subjects.length === 0 || p.subjects.some((s) => s.confidence === null)) missing.push("confidence");
  if (!p.target?.trim()) missing.push("target");
  return missing;
}

export function canBuildPlan(p: StudyProfile): boolean {
  return !isUnderAge(p) && p.subjects.length > 0 && missingRequired(p).length === 0;
}

/* ── Into the planner ──────────────────────────────────────────────────── */

const SESSION_BLOCKS: Record<SessionLength, { min: number; max: number }> = {
  short: { min: 10, max: 15 },
  medium: { min: 20, max: 30 },
  long: { min: 30, max: 90 },
};

/** The student's answers as the Life Sync context the planner reads. */
export function toLifeContext(p: StudyProfile, base: LifeContext = DEFAULT_LIFE_CONTEXT): LifeContext {
  const blocks = p.sessionLength ? SESSION_BLOCKS[p.sessionLength] : null;
  const commitments: Commitment[] =
    p.busyFrom && p.busyUntil
      ? [
          {
            id: "onboarding-fixed",
            label: "School / work",
            kind: "class",
            days: [1, 2, 3, 4, 5],
            start: p.busyFrom,
            end: p.busyUntil,
          },
        ]
      : base.commitments;
  return {
    ...base,
    chronotype: p.bestTime ?? base.chronotype,
    weekdayCapacityMins: p.weekdayMins ?? base.weekdayCapacityMins,
    weekendCapacityMins: p.weekendMins ?? base.weekendCapacityMins,
    minBlockMins: blocks?.min ?? base.minBlockMins,
    maxBlockMins: blocks?.max ?? base.maxBlockMins,
    commitments,
    protectedDays: p.protectedDays.length ? p.protectedDays : base.protectedDays,
  };
}

export interface OutlineTopic {
  title: string;
  weight: number;
}

/** Equal weights until real ones exist: a draft outline knows the topics,
 *  not how many marks each is worth. */
export function equalWeights(titles: string[]): OutlineTopic[] {
  const clean = [...new Set(titles.map((t) => t.trim()).filter(Boolean))].slice(0, 60);
  const w = clean.length ? Math.round((1 / clean.length) * 1000) / 1000 : 0;
  return clean.map((title) => ({ title, weight: w }));
}

export interface PlanBlock extends ScheduledBlock {
  /** One line on why this block is here, at this time. */
  reason: string;
}

export interface FirstPlan {
  blocks: PlanBlock[];
  /** Subjects whose topics come from an unverified draft outline. */
  unverifiedSubjects: string[];
  unplacedMins: number;
}

const BEST_TIME_PHRASE: Record<Chronotype, string> = {
  early: "you said mornings are when you focus best",
  neutral: "a steady slot in your day",
  night: "you said you focus best later in the day",
};

const CONFIDENCE_PHRASE: Record<Confidence, string> = {
  1: "you rated your confidence low",
  2: "you rated your confidence middling",
  3: "you feel confident, so it gets a lighter share",
};

/**
 * The first plan: the student's subjects and exam dates, through the same
 * demand builder and scheduler the Plan page uses, inside the hours they
 * said they have. Seeded subjects get spec-weighted exam prep (buildDemands
 * does that from `syllabus_id`); unseeded ones rotate through their outline
 * at equal weight. Every block says why it is there.
 */
export function buildFirstPlan(
  p: StudyProfile,
  outlines: Record<string, OutlineTopic[]>,
  today: string,
  horizonDays = 7,
): FirstPlan {
  const life = toLifeContext(p);
  const exams: Exam[] = p.subjects
    .filter((s) => s.examDate && s.examDate >= today)
    .map((s, i) => ({
      id: -(i + 1),
      user_id: "",
      exam_name: s.name,
      exam_date: s.examDate!,
      difficulty: s.confidence === 1 ? "Hard" : s.confidence === 3 ? "Easy" : "Medium",
      status: null,
      syllabus_id: s.specId,
      syllabus_tier: null,
    }));

  const demands: StudyDemand[] = buildDemands({
    tasks: [],
    exams,
    dueCardCount: 0,
    today,
    horizonDays,
  });

  /* Subjects with no exam date in range still need time: one sitting every
     other day, rotating through their outline topics, weighted towards the
     subjects they're least confident in. */
  const unverified: string[] = [];
  p.subjects.forEach((s, si) => {
    const outline = s.specId ? [] : (outlines[normaliseTopicKey(s.name)] ?? []);
    if (!s.specId && outline.length) unverified.push(s.name);
    if (s.examDate && s.examDate >= today && s.examDate <= dateInDays(horizonDays - 1, today)) return;
    const every = s.confidence === 1 ? 1 : 2;
    for (let d = si % every, k = 0; d < horizonDays; d += every, k += 1) {
      const topic = outline.length ? outline[k % outline.length].title : null;
      demands.push({
        id: `subject:${si}:${d}`,
        label: topic ? `${s.name}: ${topic}` : s.name,
        kind: "subject",
        /* One sitting of the length they chose. Focus work (load 3), so the
           scheduler puts it in the hours they said they work best. */
        estMins: life.maxBlockMins,
        load: 3,
        notBefore: dateInDays(d, today),
        dueDate: dateInDays(Math.min(horizonDays - 1, d + 1), today),
        subject: s.name,
      });
    }
  });

  /* availability gives each free stretch as one window, and the scheduler
     fills a window from its start — so a free day put every session at
     wake-up time, whatever the student said about their best hours. Cut
     into session-sized pieces, each scored for its own energy, the
     scheduler can choose the evening for a night owl. */
  const piece = life.maxBlockMins + life.breakMins;
  const windows = availabilityRange(life, today, horizonDays)
    .flatMap((d) => d.windows)
    .flatMap((w) => {
      const out: typeof w[] = [];
      for (let start = w.startMin; start + life.minBlockMins <= w.endMin; start += piece) {
        const end = Math.min(w.endMin, start + piece);
        out.push({ ...w, startMin: start, endMin: end, energy: windowEnergy(life.chronotype, start, end) });
      }
      return out;
    });
  const schedule = autoSchedule(demands, windows, {
    maxBlockMins: life.maxBlockMins,
    minBlockMins: life.minBlockMins,
    breakMins: life.breakMins,
    today,
  });

  const byDemand = new Map(demands.map((d) => [d.id, d]));
  const subjectOf = (name: string | null | undefined) =>
    p.subjects.find((s) => s.name.toLowerCase() === (name ?? "").toLowerCase()) ?? null;

  const blocks = schedule.blocks.map((b): PlanBlock => {
    const demand = byDemand.get(b.demandId);
    const subj = subjectOf(demand?.subject ?? b.subject ?? (demand?.label ?? "").split(":")[0]);
    const exam = exams.find((e) => b.demandId.startsWith(`exam:${e.id}:`));
    const time = b.energy >= 0.75 && p.bestTime ? `; ${BEST_TIME_PHRASE[p.bestTime]}` : "";
    let reason: string;
    if (exam) {
      const days = Math.max(0, Math.round((Date.parse(exam.exam_date) - Date.parse(b.date)) / 86_400_000));
      reason = `${exam.exam_name} exam in ${days} day${days === 1 ? "" : "s"}${
        exam.syllabus_id ? ", on the topic worth the most marks left" : ""
      }${time}.`;
    } else if (subj && !subj.specId && unverified.includes(subj.name)) {
      reason = `Next topic from your draft ${subj.name} outline (unverified, equal weights)${
        subj.confidence ? `; ${CONFIDENCE_PHRASE[subj.confidence]}` : ""
      }${time}.`;
    } else if (subj) {
      reason = `Keeps ${subj.name} moving${subj.confidence ? `; ${CONFIDENCE_PHRASE[subj.confidence]}` : ""}${time}.`;
    } else {
      reason = `Fits the time you said you have${time}.`;
    }
    return { ...b, reason };
  });

  return {
    blocks,
    unverifiedSubjects: unverified,
    unplacedMins: schedule.unplaced.reduce((n, u) => n + u.remainingMins, 0),
  };
}

/* ── What may reach an AI provider ─────────────────────────────────────── */

/** The only profile fields an AI prompt may carry: no country, no age band,
 *  no free-text answers about the student's life. */
export function aiContext(p: StudyProfile, subject: string): { subject: string; level: string | null; board: string | null } {
  return { subject, level: p.level, board: p.board };
}

/* ── Where a returning student resumes ─────────────────────────────────── */

export const PROFILE_STEPS = ["age", "country", "system", "subjects", "week", "habits", "goals", "deeper", "plan"] as const;
export type ProfileStep = (typeof PROFILE_STEPS)[number];

/** The first step still missing an answer: where a returning student resumes. */
export function resumeStep(p: StudyProfile): ProfileStep {
  if (!p.ageBand || isUnderAge(p)) return "age";
  if (!p.country) return "country";
  if (!p.system || (p.system === OTHER_SYSTEM && !p.board)) return "system";
  if (p.subjects.length === 0) return "subjects";
  const missing = missingRequired(p);
  if (missing.includes("availability")) return "week";
  if (missing.includes("bestTime") || missing.includes("sessionLength")) return "habits";
  if (missing.includes("confidence") || missing.includes("target")) return "goals";
  const deeperAnswered = p.devices.length || p.methods.length || p.pastProblems || p.learningStyle;
  if (!p.deeperSkipped && !deeperAnswered) return "deeper";
  return "plan";
}
