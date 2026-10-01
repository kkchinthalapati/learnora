import { describe, expect, it } from "vitest";
import { getDefaultSpeechLocale } from "./useSpeechRecognition";

describe("useSpeechRecognition helper and configuration", () => {
  it("detects browser locale when navigator is available", () => {
    const locale = getDefaultSpeechLocale();
    expect(typeof locale).toBe("string");
    expect(locale.length).toBeGreaterThan(0);
  });
});
