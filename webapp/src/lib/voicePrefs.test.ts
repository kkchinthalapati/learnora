import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_VOICE_PREFS,
  loadVoicePrefs,
  pickVoice,
  readVoicePrefs,
  saveVoicePrefs,
  voiceChoices,
  voiceLabel,
} from "./voicePrefs";

const voice = (name: string, lang: string, voiceURI = name) => ({ name, lang, voiceURI }) as SpeechSynthesisVoice;

describe("voice prefs", () => {
  beforeEach(() => localStorage.clear());

  it("starts from the best match at normal speed", () => {
    expect(loadVoicePrefs()).toEqual(DEFAULT_VOICE_PREFS);
  });

  it("keeps a choice made in one place for every other place", () => {
    saveVoicePrefs({ tutorVoice: "aria", listenRate: 1.3 });
    expect(loadVoicePrefs()).toMatchObject({ tutorVoice: "aria", listenRate: 1.3, hostVoice: null });
    saveVoicePrefs({ hostVoice: "guy" });
    expect(loadVoicePrefs()).toMatchObject({ tutorVoice: "aria", hostVoice: "guy" });
  });

  it("rejects speeds it does not offer, and junk", () => {
    expect(readVoicePrefs({ tutorRate: 9, listenRate: "fast", tutorVoice: 3 })).toEqual(DEFAULT_VOICE_PREFS);
  });
});

describe("pickVoice", () => {
  const voices = [voice("Aria", "en-US"), voice("Guy", "en-GB")];

  it("uses the chosen voice when this device has it", () => {
    expect(pickVoice(voices, "Guy")?.name).toBe("Guy");
  });

  it("falls back to the best match when it does not", () => {
    expect(pickVoice(voices, "Siri")).toBeUndefined();
    expect(pickVoice(voices, null)).toBeUndefined();
  });
});

describe("voiceChoices", () => {
  it("lists the student's language first", () => {
    const out = voiceChoices([voice("Amélie", "fr-FR"), voice("Zoe", "en-GB"), voice("Aria", "en-US")], "en-GB");
    expect(out.map((v) => v.name)).toEqual(["Aria", "Zoe", "Amélie"]);
  });

  it("shortens a voice's name for a menu", () => {
    expect(voiceLabel(voice("Microsoft Aria Online (Natural) - English (United States)", "en-US"))).toBe(
      "Aria (natural) - English (United States) · en-US",
    );
  });
});
