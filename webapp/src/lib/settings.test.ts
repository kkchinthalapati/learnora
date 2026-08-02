import { beforeEach, describe, expect, it } from "vitest";
import {
  AI_PERSONA_OPTIONS,
  AI_PERSONA_QUIZ_HOST,
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  loadSettings,
  saveSettings,
} from "./settings";
import { Storage } from "./storage";

describe("loadSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns the defaults when nothing is stored", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("merges stored values over the defaults", () => {
    Storage.set(SETTINGS_KEY, { aiPersona: "coach", notifyTimerAlerts: false });
    expect(loadSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      aiPersona: "coach",
      notifyTimerAlerts: false,
    });
  });

  it("drops a value that is not one of the offered options", () => {
    /* The vanilla spread `{...DEFAULT_SETTINGS, ...stored}` straight through,
       so a hand-edited localStorage could put an unknown persona into every
       AI prompt. */
    Storage.set(SETTINGS_KEY, { aiPersona: "pirate", uiLanguage: "kl" });
    const settings = loadSettings();
    expect(settings.aiPersona).toBe("tutor");
    expect(settings.uiLanguage).toBe("en");
  });

  it("ignores a non-boolean toggle", () => {
    Storage.set(SETTINGS_KEY, { notifyStudyReminders: "yes" });
    expect(loadSettings().notifyStudyReminders).toBe(true);
  });

  it("survives a corrupt payload", () => {
    localStorage.setItem(SETTINGS_KEY, "}{");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips through saveSettings", () => {
    const next = {
      ...DEFAULT_SETTINGS,
      aiPersona: "buddy" as const,
      aiConciseness: "detailed" as const,
      aiLanguage: "French",
      notifyStudyReminders: false,
    };
    saveSettings(next);
    expect(loadSettings()).toEqual(next);
  });

  it("accepts the professor persona", () => {
    Storage.set(SETTINGS_KEY, { aiPersona: "professor" });
    expect(loadSettings().aiPersona).toBe("professor");
  });
});

/* AI_PERSONA_QUIZ_HOST is what ties the global persona setting to
 * MaterialPanel's separate "AI Host Personality" picker — see its own
 * comment in settings.ts for why the two existed as unrelated vocabularies
 * before this. */
describe("AI_PERSONA_QUIZ_HOST", () => {
  it("has exactly one quiz-host label per persona option", () => {
    for (const { value } of AI_PERSONA_OPTIONS) {
      expect(AI_PERSONA_QUIZ_HOST[value]).toEqual(expect.any(String));
    }
    expect(Object.keys(AI_PERSONA_QUIZ_HOST)).toHaveLength(
      AI_PERSONA_OPTIONS.length,
    );
  });

  it("maps the default persona to the quiz prompt's own default label", () => {
    // aiQuiz.ts's QUIZ_DEFAULTS.personality predates this map and must stay
    // in lockstep with it, or a student who never touched Preferences would
    // see MaterialPanel's picker disagree with what an <ADD_QUIZ> chat tag
    // actually requests.
    expect(AI_PERSONA_QUIZ_HOST[DEFAULT_SETTINGS.aiPersona]).toBe(
      "Friendly Tutor",
    );
  });
});
