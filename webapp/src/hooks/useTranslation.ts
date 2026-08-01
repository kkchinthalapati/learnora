import { useCallback } from "react";
import { useSettings } from "../context/settings";
import { translate, type TranslationKey } from "../lib/i18n";

/* Port of js/ui.js's applyTranslations (ui.js:1109-1131) as a hook rather
 * than a DOM walk: `t(key)` reads the *current* `settings.uiLanguage`
 * straight from SettingsProvider, so it re-renders on every keystroke in the
 * Preferences tab's language picker rather than waiting for "Save
 * Preferences" the way the vanilla's DOM walk did. That's a byproduct of
 * reading reactive state instead of an explicit design choice — not worth
 * fighting. */
export function useTranslation(): (key: TranslationKey) => string {
  const { settings } = useSettings();
  return useCallback(
    (key: TranslationKey) => translate(settings.uiLanguage, key),
    [settings.uiLanguage],
  );
}
