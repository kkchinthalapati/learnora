import { beforeEach, describe, expect, it } from "vitest";
import {
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
});
