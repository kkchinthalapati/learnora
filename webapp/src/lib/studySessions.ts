/* Sessions — one screen, five modes (views/session).
 *
 * A Session is a goal ("explain how the proton gradient makes ATP"), a mode,
 * a short plan and a position in it. Every change is saved as it happens so
 * "Save & leave" never has to ask, and so the sidebar's "Session paused" card
 * and Today's Resume can pick it back up (both read lib/continuity, which this
 * keeps in step on every save).
 *
 * Stored on this device first (instant, offline-proof), and pushed to the
 * server behind it (api/studySessionSync) so a session started on one
 * device can be resumed on another. */

import { recordStudySession } from "./continuity";
import type { SessionMode } from "./sessionModes";
import { collection } from "./storage";
import { scheduleSessionPush } from "../api/studySessionSync";

export interface PlanStepRecord {
  id: string;
  label: string;
}

export interface SourceRef {
  title: string;
  href?: string;
}

export interface StudySessionRecord {
  id: string;
  objective: string;
  subject?: string;
  mode: SessionMode;
  sourceRefs: SourceRef[];
  plan: PlanStepRecord[];
  currentStep: number;
  /** The misconception this session is watching for, from the ledger. */
  watchingFor: { id?: string; text: string; seenAt?: string } | null;
  status: "active" | "paused" | "done";
  /** Oral practice: the mic is on by default (Viva = Socratic + voice). */
  voice?: boolean;
  /** Exam-traps = a Practice preset with a timer. */
  preset?: "traps";
  /** A time box the student chose ("Only have 10 minutes"). */
  minutes?: number;
  createdAt: string;
  updatedAt: string;
  /** Each mode's own resume state (keyed by mode: its AI session, answers,
   *  position) and each mode's stashed plan (`plan:<mode>`). */
  data: Record<string, unknown>;
}

export const STUDY_SESSIONS_KEY = "learnora_study_sessions";

const store = collection<StudySessionRecord>(STUDY_SESSIONS_KEY, (s) => s.id, {
  limit: 30,
});

/** Rough minutes a remaining step costs, for "12 min left". */
const MINUTES_PER_STEP = 3;

export function newSessionId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `s-${Date.now().toString(36)}-${rand}`;
}

export function createStudySession(init: {
  objective: string;
  mode: SessionMode;
  subject?: string;
  sourceRefs?: SourceRef[];
  watchingFor?: StudySessionRecord["watchingFor"];
  voice?: boolean;
  preset?: "traps";
  minutes?: number;
  id?: string;
}): StudySessionRecord {
  const now = new Date().toISOString();
  return {
    id: init.id ?? newSessionId(),
    objective: init.objective,
    subject: init.subject,
    mode: init.mode,
    sourceRefs: init.sourceRefs ?? [],
    plan: [],
    currentStep: 0,
    watchingFor: init.watchingFor ?? null,
    status: "active",
    voice: init.voice,
    preset: init.preset,
    minutes: init.minutes,
    createdAt: now,
    updatedAt: now,
    data: {},
  };
}

export function loadStudySession(id: string): StudySessionRecord | null {
  return store.find(id);
}

export function listStudySessions(): StudySessionRecord[] {
  return store.list();
}

export function minutesLeft(session: StudySessionRecord): number {
  const remaining = Math.max(0, session.plan.length - session.currentStep);
  const estimate = Math.max(remaining, session.plan.length ? 0 : 3) * MINUTES_PER_STEP;
  return session.minutes ? Math.min(session.minutes, estimate) : estimate;
}

/** Persist, and keep continuity's pointer in step so the paused card and
 *  Today's Resume always describe the session as it was last saved. */
export function saveStudySession(
  session: StudySessionRecord,
): StudySessionRecord {
  const saved = { ...session, updatedAt: new Date().toISOString() };
  store.save(saved);
  scheduleSessionPush(saved);
  rememberInContinuity(saved);
  return saved;
}

/** A session that arrived from another device: kept as it was saved there,
 *  and not pushed straight back. */
export function adoptRemoteSession(session: StudySessionRecord): StudySessionRecord {
  store.save(session);
  rememberInContinuity(session);
  return session;
}

function rememberInContinuity(saved: StudySessionRecord): void {
  recordStudySession({
    id: saved.id,
    objective: saved.objective,
    mode: saved.mode,
    stepIndex: saved.currentStep,
    totalSteps: Math.max(saved.plan.length, 1),
    minutesLeft: minutesLeft(saved),
    status: saved.status,
    stepLabel: saved.plan[saved.currentStep]?.label,
    watchingFor: saved.watchingFor?.text,
    subject: saved.subject,
  });
}

export function deleteStudySession(id: string): void {
  store.remove(id);
}
