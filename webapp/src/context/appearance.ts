import { createContext, useContext } from "react";
import type { AppearanceState, CustomTheme } from "../lib/appearance";
import type { UiOverrides } from "../lib/uiOverrides";

/* Appearance context + hook. Provider lives in AppearanceProvider.tsx. */

export interface AppearanceApi {
  /** Live state — applied to <body> immediately, saved only on `save()`. */
  appearance: AppearanceState;
  customTheme: CustomTheme;
  /** True when the live state differs from what's in localStorage. */
  dirty: boolean;
  setAppearance: (patch: Partial<AppearanceState>) => void;
  setCustomTheme: (next: CustomTheme) => void;
  /** Persist the live state (the Appearance tab's "Save Appearance"). */
  save: () => void;
  /** Restore every appearance key to its default and persist that. */
  reset: () => void;
  /** Restore only the custom colour stops, persisting them immediately. */
  resetCustomColours: () => void;
  /** Per-token colour overrides (see lib/uiOverrides). Applied only on plans with customAppearance. */
  uiOverrides: UiOverrides;
  /** Set one token's colour, or pass null to return it to the preset. */
  setUiOverride: (prop: string, value: string | null) => void;
  resetUiOverrides: () => void;
}

export const AppearanceContext = createContext<AppearanceApi | null>(null);

export function useAppearance(): AppearanceApi {
  const ctx = useContext(AppearanceContext);
  if (!ctx)
    throw new Error("useAppearance must be used inside <AppearanceProvider>");
  return ctx;
}
