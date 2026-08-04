/* Port of js/ui.js's settings state (:148, :158-165, :1074-1107).
 *
 * Same `learnora_settings` key and same shape as the vanilla app, so
 * preferences set in one app are honoured by the other while both are
 * live. Unknown keys in storage are dropped rather than merged through —
 * the vanilla spread `{...DEFAULT_SETTINGS, ...stored}` would happily
 * carry junk forward. */

import { Storage } from "./storage";

export const SETTINGS_KEY = "learnora_settings";

export type AiPersona = "tutor" | "coach" | "buddy" | "professor";
export type AiConciseness = "short" | "medium" | "detailed";

export interface Settings {
  aiPersona: AiPersona;
  aiConciseness: AiConciseness;
  uiLanguage: string;
  aiLanguage: string;
  timezone: string;
  notifyStudyReminders: boolean;
  notifyTimerAlerts: boolean;
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  aiPersona: "tutor",
  aiConciseness: "medium",
  uiLanguage: "en",
  aiLanguage: "English",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  notifyStudyReminders: true,
  notifyTimerAlerts: true,
});

export const AI_PERSONA_OPTIONS: ReadonlyArray<{
  value: AiPersona;
  label: string;
}> = [
  { value: "tutor", label: "Tutor (Patient & Explanatory)" },
  { value: "coach", label: "Coach (Strict & Tough Love)" },
  { value: "buddy", label: "Buddy (Casual & Friendly)" },
  { value: "professor", label: "Professor (Formal & Precise)" },
];

/* The Create dialog's quiz-generation flow has its own, richer "AI Host
 * Personality" picker (components/create/MaterialPanel.tsx) — four options
 * with the same underlying idea as aiPersona but a separate free-string
 * vocabulary the global setting never fed into, so a student who set their
 * assistant to "Coach" in Preferences still got a quiz hosted by the
 * hardcoded "Friendly Tutor" default every time. This is the map that ties
 * them together: MaterialPanel seeds its initial selection from here rather
 * than a fixed default, so the two surfaces agree unless the student
 * deliberately picks something different for one quiz. The value on the
 * right is unchanged from before — it's the literal string
 * `buildQuizPrompt` interpolates as "AI Host Personality: …", so this is
 * additive (a new source for an initial value), not a breaking rename. */
export const AI_PERSONA_QUIZ_HOST: Record<AiPersona, string> = {
  tutor: "Friendly Tutor",
  coach: "Strict Coach",
  buddy: "Sarcastic Buddy",
  professor: "Academic Professor",
};

export const AI_LENGTH_OPTIONS: ReadonlyArray<{
  value: AiConciseness;
  label: string;
}> = [
  { value: "short", label: "Short & Concise" },
  { value: "medium", label: "Medium (Balanced)" },
  { value: "detailed", label: "Detailed & Comprehensive" },
];

export const UI_LANGUAGE_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "en", label: "English" },
  { value: "es", label: "Español (Spanish)" },
  { value: "fr", label: "Français (French)" },
  { value: "hi", label: "हिन्दी (Hindi)" },
];

export const AI_LANGUAGE_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "English", label: "English" },
  { value: "Spanish", label: "Español (Spanish)" },
  { value: "French", label: "Français (French)" },
  { value: "Hindi", label: "हिन्दी (Hindi)" },
];

function pick<T extends string>(
  value: unknown,
  allowed: readonly { value: T }[],
  fallback: T,
): T {
  return allowed.some((o) => o.value === value) ? (value as T) : fallback;
}

export function loadSettings(): Settings {
  const stored = Storage.get<Partial<Settings>>(SETTINGS_KEY, {});
  return {
    aiPersona: pick(
      stored.aiPersona,
      AI_PERSONA_OPTIONS,
      DEFAULT_SETTINGS.aiPersona,
    ),
    aiConciseness: pick(
      stored.aiConciseness,
      AI_LENGTH_OPTIONS,
      DEFAULT_SETTINGS.aiConciseness,
    ),
    uiLanguage: pick(
      stored.uiLanguage,
      UI_LANGUAGE_OPTIONS,
      DEFAULT_SETTINGS.uiLanguage,
    ),
    aiLanguage: pick(
      stored.aiLanguage,
      AI_LANGUAGE_OPTIONS,
      DEFAULT_SETTINGS.aiLanguage,
    ),
    timezone: stored.timezone || DEFAULT_SETTINGS.timezone,
    notifyStudyReminders:
      typeof stored.notifyStudyReminders === "boolean"
        ? stored.notifyStudyReminders
        : DEFAULT_SETTINGS.notifyStudyReminders,
    notifyTimerAlerts:
      typeof stored.notifyTimerAlerts === "boolean"
        ? stored.notifyTimerAlerts
        : DEFAULT_SETTINGS.notifyTimerAlerts,
  };
}

export function saveSettings(settings: Settings): void {
  Storage.set(SETTINGS_KEY, settings);
}
