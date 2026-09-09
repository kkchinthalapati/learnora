import { describe, expect, it } from "vitest";
import {
  scoreVoice,
  findBestVoice,
  getDefaultSpeechLocale,
} from "./useSpeechSynthesis";

describe("useSpeechSynthesis voice ranking and selection", () => {
  it("detects default speech locale", () => {
    const locale = getDefaultSpeechLocale();
    expect(typeof locale).toBe("string");
    expect(locale).toBeTruthy();
  });

  it("prioritizes natural and neural voices matching target locale", () => {
    const mockVoices: SpeechSynthesisVoice[] = [
      {
        voiceURI: "legacy-voice",
        name: "Standard Robot Voice",
        lang: "en-US",
        localService: true,
        default: false,
      },
      {
        voiceURI: "edge-natural",
        name: "Microsoft Jenny Online (Natural) - English (United States)",
        lang: "en-US",
        localService: false,
        default: false,
      },
      {
        voiceURI: "other-lang",
        name: "Google voice FR",
        lang: "fr-FR",
        localService: false,
        default: false,
      },
    ];

    const standardScore = scoreVoice(mockVoices[0], "en-US");
    const naturalScore = scoreVoice(mockVoices[1], "en-US");
    const mismatchScore = scoreVoice(mockVoices[2], "en-US");

    expect(naturalScore).toBeGreaterThan(standardScore);
    expect(standardScore).toBeGreaterThan(mismatchScore);

    const best = findBestVoice(mockVoices, "en-US", "alex");
    expect(best).not.toBeNull();
    expect(best?.name).toContain("Natural");
  });

  it("handles empty voice list gracefully", () => {
    const best = findBestVoice([], "en-US");
    expect(best).toBeNull();
  });
});
