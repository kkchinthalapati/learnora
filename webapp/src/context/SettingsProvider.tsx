import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { loadSettings, saveSettings, type Settings } from "../lib/settings";
import { SettingsContext, type SettingsApi } from "./settings";

/* Holds the `learnora_settings` object (js/ui.js:1074-1107).
 *
 * One provider rather than per-tab state because two tabs write the same
 * localStorage key: Preferences saves explicitly on a button, Notifications
 * saves on every toggle (js/main.js:1048-1049). With separate state each
 * would serialise its own stale copy of the other's fields and silently
 * revert them. */

export function SettingsProvider({ children }: { children: ReactNode }) {
  const initial = useState<Settings>(loadSettings)[0];
  const [settings, setSettingsState] = useState<Settings>(initial);

  /* Merges are computed off this ref rather than off `settings` so two
     updates in the same tick compose instead of the second overwriting the
     first with a pre-patch snapshot — and so `save()` always serialises the
     value the user last saw, not the one from the render that created it. */
  const latest = useRef<Settings>(initial);

  const merge = useCallback((patch: Partial<Settings>): Settings => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setSettingsState(next);
    return next;
  }, []);

  const setSettings = useCallback(
    (patch: Partial<Settings>) => {
      merge(patch);
    },
    [merge],
  );

  const updateAndSave = useCallback(
    (patch: Partial<Settings>) => {
      saveSettings(merge(patch));
    },
    [merge],
  );

  const save = useCallback(() => {
    saveSettings(latest.current);
  }, []);

  const value = useMemo<SettingsApi>(
    () => ({ settings, setSettings, updateAndSave, save }),
    [settings, setSettings, updateAndSave, save],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
