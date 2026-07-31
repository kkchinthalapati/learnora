import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLogSession } from "../hooks/useSessions";
import { useToast } from "./toast";
import { useSettings } from "./settings";
import { Storage } from "../lib/storage";
import {
  QUOTES,
  TIMER_END_KEY,
  applyNow as applyNowT,
  extend as extendT,
  handleEnd as handleEndT,
  isCountUp,
  nextQuoteIndex,
  pause as pauseT,
  persistTimerState,
  readFavs,
  reset as resetT,
  restoreTimerState,
  stagePreset as stagePresetT,
  stageType as stageTypeT,
  start as startT,
  takeBreak as takeBreakT,
  tick as tickT,
  writeFavs,
  type FavPreset,
  type TimerConfig,
  type TimerEffects,
  type TimerState,
  type TimerType,
} from "../lib/timer";
import { TimerContext, type TimerApi } from "./timer";

/* Drives js/timer.js's state machine (lib/timer.ts) and owns the one live
 * interval. Mounted above the router because a running timer has to survive
 * navigating away from /timer, and the mini-timer is docked on every route.
 *
 * The vanilla stored sessions in localStorage first and wrote to Supabase
 * best-effort ("local history is the source of truth for instant UI"). That's
 * preserved: the local write is synchronous and the Supabase mutation's failure
 * is swallowed with a warning, so a flaky connection never loses a logged
 * session. */

const LOCAL_SESSIONS_KEY = "sessions";
const MAX_LOCAL_SESSIONS = 500;
/* The vanilla dispatches this after every local write (js/timer.js:463) so
 * the dashboard's session log and "today" total repaint live even though the
 * timer that logged them can be running on a different route — MiniTimer
 * keeps ticking app-wide. A `storage` event won't do it: that only fires in
 * *other* tabs, never the one that made the write. */
export const SESSION_LOGGED_EVENT = "learnora:sessionLogged";

interface LocalSession {
  id: number;
  timestamp: string;
  minutes: number;
  task: string;
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const { settings } = useSettings();
  const logSession = useLogSession();

  const restored = useState(() => restoreTimerState())[0];
  const [state, setState] = useState<TimerState>(restored.state);
  const [draftConfig, setDraft] = useState<TimerConfig>(restored.state.config);
  const [favs, setFavs] = useState<FavPreset[]>(() => readFavs());
  const [quoteIndex, setQuoteIndex] = useState(() =>
    Math.floor(Math.random() * QUOTES.length),
  );
  /* The task/subject a logged session is attributed to. The vanilla read these
     straight off `#active-task-select` / `#active-folder-select` at log time
     (js/timer.js:442-445); here the view binds them and the provider, which
     does the logging, holds them. */
  const [activeTask, setActiveTask] = useState("None");
  const [activeFolderId, setActiveFolderId] = useState("");

  /* Effects are applied outside the state updater — running them inside would
     fire them twice under StrictMode's double-invoked reducers. */
  const applyEffects = useCallback(
    (effects: TimerEffects) => {
      if (effects.logMinutes) {
        const minutes = effects.logMinutes;
        const task = activeTask !== "None" ? activeTask : "General Study";
        const folderId = activeFolderId || null;

        /* Local history first, synchronously — see the note above. */
        const stored = Storage.get<LocalSession[]>(LOCAL_SESSIONS_KEY, []);
        const sessions = Array.isArray(stored) ? stored : [];
        sessions.unshift({
          id: Date.now(),
          timestamp: new Date().toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          minutes,
          task,
        });
        Storage.set(LOCAL_SESSIONS_KEY, sessions.slice(0, MAX_LOCAL_SESSIONS));
        window.dispatchEvent(new Event(SESSION_LOGGED_EVENT));

        logSession.mutate(
          { minutes, task, folderId, timerType: state.type },
          {
            onError: (err) =>
              console.warn(
                "[Timer] Supabase session log failed (local copy preserved):",
                err,
              ),
          },
        );
      }

      if (effects.toast) showToast(effects.toast.message);

      if (effects.notify && settings.notifyTimerAlerts) {
        if ("Notification" in window) {
          if (Notification.permission === "granted") {
            new Notification("Learnora", {
              body: `${effects.notify} time! Let's go.`,
              icon: "learnora.jpg",
            });
          } else if (Notification.permission !== "denied") {
            void Notification.requestPermission();
          }
        }
      }

      if (effects.newQuote) setQuoteIndex((i) => nextQuoteIndex(i));
    },
    [
      activeTask,
      activeFolderId,
      logSession,
      settings.notifyTimerAlerts,
      showToast,
      state.type,
    ],
  );

  /* `applyEffects` closes over state.type and the mutation, both of which
     change; the interval below must not be torn down and rebuilt for that. */
  const effectsRef = useRef(applyEffects);
  effectsRef.current = applyEffects;

  /* Persist on every state change rather than at each call site, which is what
     the vanilla's scattered `this.save()` calls amounted to. */
  useEffect(() => {
    persistTimerState(state);
  }, [state]);

  /* A count-down that expired while the tab was closed still owes the user a
     logged session and a toast. */
  const handledAwayEnd = useRef(false);
  useEffect(() => {
    if (!restored.endedWhileAway || handledAwayEnd.current) return;
    handledAwayEnd.current = true;
    const { state: next, effects } = handleEndT(restored.state);
    setState(next);
    effectsRef.current(effects);
  }, [restored]);

  /* The one live interval. Count-down reads the wall clock rather than
     accumulating ticks, so a throttled background tab catches up rather than
     drifting behind. */
  useEffect(() => {
    if (!state.isRunning) return;
    const id = setInterval(() => {
      setState((prev) => {
        if (!prev.isRunning) return prev;
        const { state: ticked, ended } = tickT(prev);
        if (!ended) return ticked;
        const { state: next, effects } = handleEndT(ticked);
        /* Deferred so the effects don't run during the updater. */
        queueMicrotask(() => effectsRef.current(effects));
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state.isRunning]);

  const start = useCallback(() => setState((s) => startT(s)), []);
  const pause = useCallback(() => setState((s) => pauseT(s)), []);
  const toggle = useCallback(
    () => setState((s) => (s.isRunning ? pauseT(s) : startT(s))),
    [],
  );

  const reset = useCallback(() => {
    setState((s) => {
      const { state: next, effects } = resetT(s);
      queueMicrotask(() => effectsRef.current(effects));
      return next;
    });
  }, []);

  const extend = useCallback(() => setState((s) => extendT(s)), []);

  const takeBreak = useCallback(() => {
    setState((s) => {
      const { state: next, effects } = takeBreakT(s);
      queueMicrotask(() => effectsRef.current(effects));
      /* The vanilla rolled straight into the break countdown. */
      return next.mode === "Break" ? startT(next) : next;
    });
  }, []);

  const applyConfig = useCallback(
    (partial: Partial<TimerConfig>, type: TimerType | null) => {
      setState((s) => {
        const { state: next, effects } = applyNowT(s, partial, type);
        queueMicrotask(() => effectsRef.current(effects));
        setDraft(next.config);
        return next;
      });
    },
    [],
  );

  const selectType = useCallback(
    (type: TimerType) => {
      setState((s) => {
        if (s.isRunning) return stageTypeT(s, type);
        const { state: next, effects } = applyNowT(s, draftConfig, type);
        queueMicrotask(() => effectsRef.current(effects));
        return next;
      });
    },
    [draftConfig],
  );

  const applyAndReset = useCallback(() => {
    applyConfig(draftConfig, state.stagedType ?? state.type);
  }, [applyConfig, draftConfig, state.stagedType, state.type]);

  const startPreset = useCallback(
    (partial: Partial<TimerConfig>, type: TimerType = "pomodoro") => {
      setState((s) => {
        const { state: next, effects } = applyNowT(s, partial, type);
        queueMicrotask(() => effectsRef.current(effects));
        setDraft(next.config);
        return startT(next);
      });
    },
    [],
  );

  const setDraftConfig = useCallback((patch: Partial<TimerConfig>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  /* Ports the plan-block handoff (js/router.js:82-85 + js/main.js:1288-1319):
     "Start →" on a Weekly Plan block fills in the block's duration and subject
     and drops the student on /timer with only the Start press left. It
     deliberately does not start the clock — the vanilla didn't either, and
     auto-starting a 90-minute block from a card tap is not something to do
     without a confirmation.

     A running timer is never torn down: its values are staged for the next
     Apply & Reset instead, which is the same rule `selectType` follows.

     One deviation from the vanilla, which set only `#config-focus`: both
     `focus` and `countdown` are written, because which one the clock reads
     depends on the current timer type (lib/timer.ts `focusSeconds`) — setting
     only `focus` left a student on the Countdown type staring at an unchanged
     duration with no indication the button had done anything. */
  const prepareFocus = useCallback((mins: number, task?: string) => {
    const partial: Partial<TimerConfig> = { focus: mins, countdown: mins };
    setDraft((prev) => ({ ...prev, ...partial }));
    setState((s) => {
      if (s.isRunning) return stagePresetT(s, partial, s.stagedType ?? s.type);
      const { state: next, effects } = applyNowT(s, partial, s.type);
      queueMicrotask(() => effectsRef.current(effects));
      return next;
    });
    if (task) setActiveTask(task);
  }, []);

  const saveFav = useCallback(
    (name: string) => {
      const next = [
        ...favs,
        { name: name.trim(), type: state.type, config: { ...draftConfig } },
      ];
      writeFavs(next);
      setFavs(next);
    },
    [draftConfig, favs, state.type],
  );

  const deleteFav = useCallback(
    (index: number) => {
      const next = favs.filter((_, i) => i !== index);
      writeFavs(next);
      setFavs(next);
    },
    [favs],
  );

  const applyFav = useCallback((fav: FavPreset) => {
    setDraft(fav.config);
    setState((s) => {
      // Never cancel a running timer — stage it instead.
      if (s.isRunning) return stagePresetT(s, fav.config, fav.type);
      const { state: next, effects } = applyNowT(s, fav.config, fav.type);
      queueMicrotask(() => effectsRef.current(effects));
      return next;
    });
  }, []);

  const newQuote = useCallback(
    () => setQuoteIndex((i) => nextQuoteIndex(i)),
    [],
  );

  /* Another tab (or the vanilla app) finishing a timer clears TIMER_END_KEY;
     mirroring that keeps the two apps from fighting over one countdown. */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== TIMER_END_KEY || e.newValue !== null) return;
      setState((s) => (s.isRunning && !isCountUp(s) ? pauseT(s) : s));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<TimerApi>(
    () => ({
      state,
      draftConfig,
      setDraftConfig,
      panelType: state.stagedType ?? state.type,
      start,
      pause,
      toggle,
      reset,
      extend,
      takeBreak,
      selectType,
      applyAndReset,
      startPreset,
      prepareFocus,
      activeTask,
      setActiveTask,
      activeFolderId,
      setActiveFolderId,
      favs,
      saveFav,
      deleteFav,
      applyFav,
      quote: QUOTES[quoteIndex],
      newQuote,
    }),
    [
      activeTask,
      activeFolderId,
      state,
      draftConfig,
      setDraftConfig,
      start,
      pause,
      toggle,
      reset,
      extend,
      takeBreak,
      selectType,
      applyAndReset,
      startPreset,
      prepareFocus,
      favs,
      saveFav,
      deleteFav,
      applyFav,
      quoteIndex,
      newQuote,
    ],
  );

  return (
    <TimerContext.Provider value={value}>{children}</TimerContext.Provider>
  );
}
