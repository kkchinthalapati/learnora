import { useCallback, useEffect, useRef, useState } from "react";
import { loadFeynmanSession } from "../api/aiFeynman";
import type { Misconception } from "../lib/misconceptions";
import { CognitiveBridge } from "../lib/cognitiveBridge";
import {
  createStudySession,
  loadStudySession,
  saveStudySession,
  type PlanStepRecord,
  type StudySessionRecord,
} from "../lib/studySessions";
import { isSessionMode, type SessionMode } from "../lib/sessionModes";

/** Where a Session starts from: `/study/new?mode=…&topic=…` or an id. */
export interface SessionRouteInput {
  sessionId: string;
  params: URLSearchParams;
  misconceptions: Misconception[];
}

/** Build a new session from `/study/new` params (and a CognitiveBridge
 *  handoff, when one is waiting). Returns null when there is no objective
 *  yet — the view asks for one. Exported for tests. */
export function sessionFromParams(
  params: URLSearchParams,
  misconceptions: Misconception[],
  objectiveOverride?: string,
): StudySessionRecord | null {
  const modeParam = params.get("mode");
  const mode: SessionMode = isSessionMode(modeParam) ? modeParam : "explain";
  const bridge = CognitiveBridge.getPayload();
  const misconceptionId = params.get("misconception");
  const fromLedger = misconceptionId
    ? misconceptions.find((m) => m.id === misconceptionId)
    : undefined;
  const objective = (
    objectiveOverride ||
    params.get("topic") ||
    fromLedger?.concept ||
    bridge?.topic ||
    ""
  ).trim();
  if (!objective) return null;

  const watching = fromLedger
    ? { id: fromLedger.id, text: fromLedger.summary, seenAt: fromLedger.lastSeenAt }
    : bridge?.misconceptions?.[0]
      ? { text: bridge.misconceptions[0] }
      : null;
  const minutes = Number(params.get("minutes")) || undefined;

  return createStudySession({
    objective,
    mode,
    subject: fromLedger?.subject || bridge?.subject || undefined,
    watchingFor: watching,
    voice: params.get("voice") === "1" || undefined,
    preset: params.get("preset") === "traps" ? "traps" : undefined,
    minutes,
  });
}

/** A Feynman studio session from before Sessions existed: its old
 *  /feynman/studio/:id link redirects here, and it opens in Teach with its
 *  transcript intact. */
export function importLegacySession(id: string): StudySessionRecord | null {
  const feynman = loadFeynmanSession(id);
  if (!feynman) return null;
  const record = createStudySession({
    id,
    objective: feynman.topic,
    subject: feynman.subject,
    mode: "teach",
  });
  return {
    ...record,
    createdAt: feynman.createdAt,
    status: feynman.status === "completed" ? "done" : "active",
    plan: feynman.draft.learningObjectives.map((label, i) => ({ id: `o${i + 1}`, label })),
    data: { teach: { draft: feynman.draft, turns: feynman.turns } },
  };
}

export interface UseStudySession {
  session: StudySessionRecord | null;
  /** True when the route names a session this device has never seen. */
  missing: boolean;
  /** Last successful save, for "Autosaved 14:02". */
  savedAt: Date | null;
  /** Start a `/study/new` session once the student has named an objective. */
  begin: (objective: string) => StudySessionRecord | null;
  update: (fn: (s: StudySessionRecord) => StudySessionRecord) => void;
  setPlan: (plan: PlanStepRecord[], currentStep?: number) => void;
  setStep: (index: number) => void;
  /** Store the active mode's resume state. */
  setModeData: <T>(mode: SessionMode, data: T) => void;
  switchMode: (mode: SessionMode) => void;
  pause: () => void;
  finish: () => void;
}

interface PlanStash {
  plan: PlanStepRecord[];
  currentStep: number;
}

/* Every change is written straight through: localStorage is cheap, and it
   is what makes a reload, a closed tab or "Save & leave" lose nothing. */
export function useStudySession({
  sessionId,
  params,
  misconceptions,
}: SessionRouteInput): UseStudySession {
  const [session, setSession] = useState<StudySessionRecord | null>(() => {
    if (sessionId === "new") return sessionFromParams(params, misconceptions);
    return loadStudySession(sessionId) ?? importLegacySession(sessionId);
  });
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const commit = useCallback((next: StudySessionRecord) => {
    const saved = saveStudySession(next);
    sessionRef.current = saved;
    setSession(saved);
    setSavedAt(new Date());
  }, []);

  /* A ledger id in the URL can arrive before the ledger itself has loaded;
     fill the "watching for" line in once it does. */
  useEffect(() => {
    const s = sessionRef.current;
    const id = params.get("misconception");
    if (!s || s.watchingFor || !id) return;
    const m = misconceptions.find((x) => x.id === id);
    if (m) commit({ ...s, watchingFor: { id: m.id, text: m.summary, seenAt: m.lastSeenAt } });
  }, [misconceptions, params, commit]);

  /* A new session is saved as soon as it exists; the bridge payload it was
     built from has been used and is cleared. */
  useEffect(() => {
    const s = sessionRef.current;
    if (s && !loadStudySession(s.id)) {
      commit(s);
      CognitiveBridge.clear();
    }
  }, [commit]);

  /* Walking away mid-session leaves it paused — which is what puts the
     "Session paused" card in the sidebar and Resume on Today. */
  useEffect(
    () => () => {
      const s = sessionRef.current;
      if (s && s.status === "active") {
        saveStudySession({ ...s, status: "paused" });
      }
    },
    [],
  );

  const update = useCallback(
    (fn: (s: StudySessionRecord) => StudySessionRecord) => {
      const s = sessionRef.current;
      if (!s) return;
      const next = fn(s);
      /* Any change made from the screen means the student is back at it. */
      commit(next.status === "done" ? next : { ...next, status: "active" });
    },
    [commit],
  );

  const begin = useCallback(
    (objective: string) => {
      const created = sessionFromParams(params, misconceptions, objective);
      if (created) {
        commit(created);
        CognitiveBridge.clear();
      }
      return created;
    },
    [params, misconceptions, commit],
  );

  return {
    session,
    missing: sessionId !== "new" && session === null,
    savedAt,
    begin,
    update,
    setPlan: useCallback(
      (plan, currentStep = 0) =>
        update((s) => ({ ...s, plan, currentStep: Math.min(currentStep, Math.max(plan.length - 1, 0)) })),
      [update],
    ),
    setStep: useCallback(
      (index) =>
        update((s) => ({
          ...s,
          currentStep: Math.max(0, Math.min(index, s.plan.length)),
        })),
      [update],
    ),
    setModeData: useCallback(
      (mode, data) => update((s) => ({ ...s, data: { ...s.data, [mode]: data } })),
      [update],
    ),
    switchMode: useCallback(
      (mode) =>
        update((s) => {
          if (s.mode === mode) return s;
          /* Each mode keeps its own plan and position, so flipping to
             Recall and back returns to the step you were on. */
          const restored = s.data[`plan:${mode}`] as PlanStash | undefined;
          return {
            ...s,
            mode,
            plan: restored?.plan ?? [],
            currentStep: restored?.currentStep ?? 0,
            data: {
              ...s.data,
              [`plan:${s.mode}`]: { plan: s.plan, currentStep: s.currentStep },
            },
          };
        }),
      [update],
    ),
    pause: useCallback(() => {
      const s = sessionRef.current;
      if (s && s.status !== "done") commit({ ...s, status: "paused" });
    }, [commit]),
    finish: useCallback(() => {
      const s = sessionRef.current;
      if (s) commit({ ...s, status: "done", currentStep: s.plan.length });
    }, [commit]),
  };
}
