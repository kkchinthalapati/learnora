import { createContext, useContext } from "react";
import type {
  FavPreset,
  TimerConfig,
  TimerState,
  TimerType,
} from "../lib/timer";

/* Timer context + hook. Provider lives in TimerProvider.tsx.
 *
 * App-wide rather than owned by the Timer view: the mini-timer is docked on
 * every route while a session runs, and a running timer must survive
 * navigating away from /timer. */

export interface TimerApi {
  state: TimerState;
  /** Config values shown in the panel — a draft, committed on Apply & Reset. */
  draftConfig: TimerConfig;
  setDraftConfig: (patch: Partial<TimerConfig>) => void;
  /** The type the config panel is showing (staged type, else the live one). */
  panelType: TimerType;

  start: () => void;
  pause: () => void;
  toggle: () => void;
  reset: () => void;
  extend: () => void;
  takeBreak: () => void;

  /** Pick a type: staged if a timer is running, applied immediately if not. */
  selectType: (type: TimerType) => void;
  /** Commit the draft config (and any staged type) and reset. */
  applyAndReset: () => void;
  /** Apply a preset and start it running, for the dashboard quick-starts. */
  startPreset: (partial: Partial<TimerConfig>, type?: TimerType) => void;

  /** Task this session is bound to; "None" logs as General Study. */
  activeTask: string;
  setActiveTask: (task: string) => void;
  /** Subject/folder this session is bound to; "" is unassigned. */
  activeFolderId: string;
  setActiveFolderId: (id: string) => void;

  favs: FavPreset[];
  saveFav: (name: string) => void;
  deleteFav: (index: number) => void;
  applyFav: (fav: FavPreset) => void;

  quote: string;
  newQuote: () => void;
}

export const TimerContext = createContext<TimerApi | null>(null);

export function useTimer(): TimerApi {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer must be used inside <TimerProvider>");
  return ctx;
}
