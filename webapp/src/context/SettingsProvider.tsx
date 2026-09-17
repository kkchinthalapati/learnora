import { hydrateLifeContextFromProfile, cancelLifeContextHydration } from "../hooks/useLifeContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { loadSettings, saveSettings, type Settings } from "../lib/settings";
import { SettingsContext, type SettingsApi } from "./settings";
import { useOptionalAuth } from "./auth";
import { profileApi } from "../api/profile";
import { isFrameworkId, isRegionId } from "../lib/region";
import { isGradeScaleId } from "../lib/gradeScale";

/* Holds the `learnora_settings` object (js/ui.js:1074-1107).
 *
 * One provider rather than per-tab state because two tabs write the same
 * localStorage key: Preferences saves explicitly on a button, Notifications
 * saves on every toggle (js/main.js:1048-1049). With separate state each
 * would serialise its own stale copy of the other's fields and silently
 * revert them. */

export function SettingsProvider({ children }: { children: ReactNode }) {
  const auth = useOptionalAuth();
  const userId = auth?.user?.id;
  useEffect(() => {
    void hydrateLifeContextFromProfile(userId ?? null);
    return cancelLifeContextHydration;
  }, [userId]);
  const initial = useState<Settings>(loadSettings)[0];
  const [settings, setSettingsState] = useState<Settings>(initial);

  /* Merges are computed off this ref rather than off `settings` so two
     updates in the same tick compose instead of the second overwriting the
     first with a pre-patch snapshot — and so `save()` always serialises the
     value the user last saw, not the one from the render that created it. */
  const latest = useRef<Settings>(initial);
  const revisions = useRef({ region: 0, framework: 0, gradeScale: 0 });
  const previousUser = useRef(userId);

  const merge = useCallback((patch: Partial<Settings>): Settings => {
    for (const key of ["region", "framework", "gradeScale"] as const) {
      if (key in patch) revisions.current[key]++;
    }
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

  useEffect(() => {
    let cancelled = false;
    if (previousUser.current && previousUser.current !== userId) {
      updateAndSave({ region: "auto", framework: "auto", gradeScale: "auto" });
    }
    previousUser.current = userId;
    if (!userId) return;
    const started = { ...revisions.current };
    void profileApi
      .fetchRegion(userId)
      .then((profile) => {
        if (cancelled || !profile) return;
        const patch: Partial<Settings> = {};
        if (
          profile.region !== undefined &&
          started.region === revisions.current.region
        ) {
          patch.region = isRegionId(profile.region) ? profile.region : "auto";
        }
        if (
          profile.framework_id !== undefined &&
          started.framework === revisions.current.framework
        ) {
          patch.framework = isFrameworkId(profile.framework_id)
            ? profile.framework_id
            : "auto";
        }
        if (
          profile.grade_scale_id !== undefined &&
          started.gradeScale === revisions.current.gradeScale
        ) {
          patch.gradeScale = isGradeScaleId(profile.grade_scale_id)
            ? profile.grade_scale_id
            : "auto";
        }
        // API prompts read the persisted settings, so hydration must update both.
        if (Object.keys(patch).length) {
          merge(patch);
          saveSettings({ ...loadSettings(), ...patch });
        }
      })
      .catch((error) => {
        if (!cancelled)
          console.warn(
            "[Settings] Could not restore curriculum preferences",
            error,
          );
      });
    return () => {
      cancelled = true;
    };
  }, [userId, updateAndSave, merge]);

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
