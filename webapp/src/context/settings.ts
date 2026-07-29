import { createContext, useContext } from "react";
import type { Settings } from "../lib/settings";

/* Settings context + hook. Provider lives in SettingsProvider.tsx. */

export interface SettingsApi {
  settings: Settings;
  /** Update in memory only — the Preferences tab saves on its own button. */
  setSettings: (patch: Partial<Settings>) => void;
  /** Update and write through to localStorage in one step. */
  updateAndSave: (patch: Partial<Settings>) => void;
  save: () => void;
}

export const SettingsContext = createContext<SettingsApi | null>(null);

export function useSettings(): SettingsApi {
  const ctx = useContext(SettingsContext);
  if (!ctx)
    throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
