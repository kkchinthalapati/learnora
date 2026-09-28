import { hydrateLifeContextFromProfile, cancelLifeContextHydration } from "../hooks/useLifeContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { loadSettings, saveSettings, type Settings } from "../lib/settings";
import { SettingsContext, type SettingsApi } from "./settings";
import { useOptionalAuth } from "./auth";
import { profileApi } from "../api/profile";
import { isFrameworkId, isRegionId } from "../lib/region";
import { isGradeScaleId } from "../lib/gradeScale";

/* Settings that follow the student between devices, stored on
 * `profiles.settings`. Region, framework and grade scale have their own
 * columns (hydrated below); timezone is left per-device because it is
 * detected from the browser. */
const SYNCED_KEYS = [
  "aiPersona",
  "aiConciseness",
  "uiLanguage",
  "aiLanguage",
  "notifyStudyReminders",
  "notifyTimerAlerts",
  "timerFocusWatchdog",
  "examTerminationGrace",
  "aiDepth",
  "aiStyle",
  "aiAutoAdapt",
  "webAccess",
] as const satisfies readonly (keyof Settings)[];

const REMOTE_SAVE_DEBOUNCE_MS = 1000;

function syncedPart(settings: Settings): Partial<Settings> {
  const out: Partial<Settings> = {};
  for (const key of SYNCED_KEYS) {
    (out as Record<string, unknown>)[key] = settings[key];
  }
  return out;
}

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
  const lastSignedInUser = useRef(userId);

  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  /* Bumped on every local change, so a profile fetch that started before the
     student changed something doesn't overwrite it when it lands. */
  const localEdits = useRef(0);
  const remoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushRemote = useCallback(() => {
    if (!userIdRef.current) return;
    if (remoteTimer.current) clearTimeout(remoteTimer.current);
    remoteTimer.current = setTimeout(() => {
      remoteTimer.current = null;
      if (!userIdRef.current) return;
      void profileApi
        .saveSettings(syncedPart(latest.current))
        .catch((error) =>
          console.warn("[Settings] Could not sync settings", error),
        );
    }, REMOTE_SAVE_DEBOUNCE_MS);
  }, []);

  useEffect(
    () => () => {
      if (remoteTimer.current) clearTimeout(remoteTimer.current);
    },
    [],
  );

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
      localEdits.current++;
      merge(patch);
    },
    [merge],
  );

  const updateAndSave = useCallback(
    (patch: Partial<Settings>) => {
      localEdits.current++;
      saveSettings(merge(patch));
      if (SYNCED_KEYS.some((key) => key in patch)) pushRemote();
    },
    [merge, pushRemote],
  );

  const save = useCallback(() => {
    localEdits.current++;
    saveSettings(latest.current);
    pushRemote();
  }, [pushRemote]);

  /* Pull the profile's copy on sign-in. Written through localStorage and
     read back with loadSettings so a stale or hand-edited profile value is
     validated exactly like a stored one. */
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const editsAtStart = localEdits.current;
    void profileApi
      .fetchSettings(userId)
      .then((remote) => {
        if (cancelled || !remote || localEdits.current !== editsAtStart) return;
        const picked: Record<string, unknown> = {};
        for (const key of SYNCED_KEYS) {
          if (key in remote) picked[key] = remote[key];
        }
        if (!Object.keys(picked).length) return;
        saveSettings({ ...latest.current, ...picked } as Settings);
        merge(syncedPart(loadSettings()));
      })
      .catch((error) => {
        if (!cancelled)
          console.warn("[Settings] Could not restore settings", error);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, merge]);

  useEffect(() => {
    let cancelled = false;
    if (
      userId &&
      lastSignedInUser.current &&
      lastSignedInUser.current !== userId
    ) {
      // A different student on this browser: the previous one's persona,
      // language and study style are still in memory. Start from what is
      // stored now — defaults, since claimLocalStorageFor has cleared the
      // previous account's copy. Tracked apart from `previousUser` because a
      // sign-out in between (A → none → B) is the usual way this happens.
      merge(loadSettings());
    }
    if (previousUser.current && previousUser.current !== userId) {
      updateAndSave({ region: "auto", framework: "auto", gradeScale: "auto" });
    }
    previousUser.current = userId;
    if (userId) lastSignedInUser.current = userId;
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
