import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  APPEARANCE_DEFAULTS,
  applyAppearanceToDom,
  clearAppearance,
  defaultCustomTheme,
  normalizeCustomTheme,
  persistAppearance,
  persistAppearanceDefaults,
  readStoredAppearance,
  readStoredCustomTheme,
  type AppearanceState,
  type CustomTheme,
} from "../lib/appearance";
import { Storage } from "../lib/storage";
import { CUSTOM_THEME_KEY } from "../lib/appearance";
import { useAuth } from "./auth";
import { useEntitlements } from "../hooks/useSubscription";
import { AppearanceContext, type AppearanceApi } from "./appearance";

/* Ports js/ui.js's `_activeAppearanceState` + initTheme (:698-742, :1028-1063).
 *
 * The vanilla applied every change to <body> immediately but only wrote to
 * localStorage on "Save Appearance", so a user could audition a theme and
 * navigate away without keeping it. That two-tier behaviour is preserved
 * here: React state is the live tier, localStorage is the saved tier, and
 * `dirty` is just a comparison of the two.
 *
 * Mounted above the router in App.tsx because the body attributes it writes
 * style the whole app, not only the Settings route. */

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { can, isPending: entitlementsPending } = useEntitlements();
  const [appearance, setAppearanceState] = useState<AppearanceState>(() =>
    readStoredAppearance(),
  );
  const [customTheme, setCustomThemeState] = useState<CustomTheme>(() =>
    readStoredCustomTheme(),
  );
  /* Bumped on every save/reset so `dirty` recomputes against fresh storage —
     reading localStorage during render would otherwise be invisible to React. */
  const [savedAt, setSavedAt] = useState(0);
  /* `undefined` means "no session read yet" — distinct from `null` ("read,
     and signed out") so the very first resolution is never mistaken for a
     switch away from a previous user (see AuthProvider's identical guard). */
  const lastUserId = useRef<string | null | undefined>(undefined);

  /* Custom accents are Pro-gated (see AppearanceTab's ProGate), but the
     *setting* can still be sitting in localStorage from before this gate
     existed, or from a subscription that has since lapsed. The gate gets a
     free user's finger off the controls; this is what actually keeps a
     non-default accent off their screen — belt and braces, since a
     localStorage flag is presentation, not the security boundary (see
     lib/entitlements.ts's header comment). While the plan is still loading,
     the last-known appearance is left alone rather than flashed to default,
     matching ProGate's own "never guess mid-flight" rule. */
  const effectiveAppearance = useMemo(() => {
    if (entitlementsPending || appearance.accent === "default") {
      return appearance;
    }
    return can("customAppearance")
      ? appearance
      : { ...appearance, accent: APPEARANCE_DEFAULTS.accent };
  }, [appearance, can, entitlementsPending]);

  /* Applying to <body> is a side effect on a node React doesn't own, so it
     belongs in an effect rather than in the setters — that way a state change
     from any source (including the system-theme listener) repaints exactly
     once, after commit. */
  useEffect(() => {
    applyAppearanceToDom(effectiveAppearance, customTheme);
  }, [effectiveAppearance, customTheme]);

  /* Reset appearance when user logs out or switches accounts — don't carry
     device-local appearance across different user sessions. */
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (
      lastUserId.current !== undefined &&
      lastUserId.current !== currentUserId
    ) {
      clearAppearance();
      setAppearanceState({ ...APPEARANCE_DEFAULTS });
      setCustomThemeState(defaultCustomTheme());
      setSavedAt((n) => n + 1);
    }
    lastUserId.current = currentUserId;
  }, [user?.id]);

  /* Only "system" mode cares about the OS switching underneath us. Re-running
     applyAppearanceToDom is enough — the state itself hasn't changed, just
     what "system" resolves to. */
  const latest = useRef({ appearance: effectiveAppearance, customTheme });
  latest.current = { appearance: effectiveAppearance, customTheme };

  useEffect(() => {
    if (appearance.mode !== "system") return;
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () =>
      applyAppearanceToDom(
        latest.current.appearance,
        latest.current.customTheme,
      );
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [appearance.mode]);

  const setAppearance = useCallback((patch: Partial<AppearanceState>) => {
    setAppearanceState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setCustomTheme = useCallback((next: CustomTheme) => {
    setCustomThemeState(normalizeCustomTheme(next));
    /* Any edit in the studio implies "use my colours" — same as the vanilla's
       updateCustomTheme → applyAppearance({accent: "custom"}) (:826). */
    setAppearanceState((prev) =>
      prev.accent === "custom" ? prev : { ...prev, accent: "custom" },
    );
  }, []);

  const save = useCallback(() => {
    persistAppearance(appearance, customTheme);
    setSavedAt((n) => n + 1);
  }, [appearance, customTheme]);

  const reset = useCallback(() => {
    persistAppearanceDefaults();
    setAppearanceState({ ...APPEARANCE_DEFAULTS });
    setCustomThemeState(defaultCustomTheme());
    setSavedAt((n) => n + 1);
  }, []);

  const resetCustomColours = useCallback(() => {
    const next = defaultCustomTheme();
    setCustomThemeState(next);
    /* The vanilla's resetCustomTheme persists the stops straight away, unlike
       every other studio edit (:972-986) — keep that asymmetry. */
    Storage.set(CUSTOM_THEME_KEY, {
      colors: next.colors,
      intensity: next.intensity,
    });
    setSavedAt((n) => n + 1);
  }, []);

  const dirty = useMemo(() => {
    void savedAt;
    const storedAppearance = readStoredAppearance();
    const storedTheme = readStoredCustomTheme();
    const sameAppearance = (
      Object.keys(APPEARANCE_DEFAULTS) as Array<keyof AppearanceState>
    ).every((k) => storedAppearance[k] === appearance[k]);
    const sameTheme =
      storedTheme.intensity === customTheme.intensity &&
      storedTheme.colors.length === customTheme.colors.length &&
      storedTheme.colors.every((c, i) => c === customTheme.colors[i]);
    return !(sameAppearance && sameTheme);
  }, [appearance, customTheme, savedAt]);

  const value = useMemo<AppearanceApi>(
    () => ({
      appearance,
      customTheme,
      dirty,
      setAppearance,
      setCustomTheme,
      save,
      reset,
      resetCustomColours,
    }),
    [
      appearance,
      customTheme,
      dirty,
      setAppearance,
      setCustomTheme,
      save,
      reset,
      resetCustomColours,
    ],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}
