import { useCallback, useEffect, useRef, useState } from "react";

export interface AiTaskState {
  pending: boolean;
  /** The failure in the service's own words, when it had any. */
  error: string | null;
  /** The student pressed Stop; the next call clears it. */
  stopped: boolean;
}

/* One AI call at a time for a mode: pending / error / Stop, and results that
   arrive after Stop (or after the student left) are dropped rather than
   written over what they are now looking at. The endpoints don't take an
   abort signal, so Stop means "stop waiting", and says so. */
export function useAiTask() {
  const [state, setState] = useState<AiTaskState>({
    pending: false,
    error: null,
    stopped: false,
  });
  const token = useRef(0);
  const retry = useRef<(() => void) | null>(null);
  /* Tracked rather than bumping the token on unmount: StrictMode's rehearsal
     unmount would otherwise drop the one real result and leave the mode
     waiting forever. */
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    <T,>(task: () => Promise<T>, onDone: (value: T) => void) => {
      const mine = ++token.current;
      retry.current = () => run(task, onDone);
      setState({ pending: true, error: null, stopped: false });
      task().then(
        (value) => {
          if (mine !== token.current || !mounted.current) return;
          /* onDone may reject a result the endpoint returned but couldn't
             stand behind (a stand-in trace): that is a failure too. */
          try {
            onDone(value);
            setState({ pending: false, error: null, stopped: false });
          } catch (err) {
            setState({
              pending: false,
              stopped: false,
              error:
                err instanceof Error && err.message
                  ? err.message
                  : "The AI service is busy.",
            });
          }
        },
        (err: unknown) => {
          if (mine !== token.current || !mounted.current) return;
          setState({
            pending: false,
            stopped: false,
            error:
              err instanceof Error && err.message
                ? err.message
                : "The AI service is busy.",
          });
        },
      );
    },
    [],
  );

  const stop = useCallback(() => {
    token.current++;
    setState({ pending: false, error: null, stopped: true });
  }, []);

  const again = useCallback(() => retry.current?.(), []);

  /* Run `task` once per mount, however many times the effect that asks for
     it fires (StrictMode fires it twice). The metered tools cost the student
     a daily allowance, so a duplicate call is a real cost, not a dev quirk. */
  const started = useRef<Set<string>>(new Set());
  const once = useCallback((key: string, start: () => void) => {
    if (started.current.has(key)) return;
    started.current.add(key);
    start();
  }, []);

  return { ...state, run, stop, again, once };
}
