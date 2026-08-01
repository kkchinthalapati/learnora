import { describe, expect, it } from "vitest";
import { translate, translations } from "./i18n";

describe("translate", () => {
  it("returns the string for a known language and key", () => {
    expect(translate("es", "nav_dashboard")).toBe("Tablero");
  });

  it("falls back to English when the language is unknown", () => {
    expect(translate("kl", "nav_dashboard")).toBe("Dashboard");
  });

  it("every language has every English key", () => {
    // Guarantees translate()'s per-key fallback never actually has to fire
    // for a shipped language — a translation this flat has no acceptable
    // partial dict.
    const enKeys = Object.keys(translations.en).sort();
    for (const [lang, dict] of Object.entries(translations)) {
      expect(Object.keys(dict).sort(), lang).toEqual(enKeys);
    }
  });

  it("contains no HTML in any translation string", () => {
    // Mirrors the vanilla app's tests/i18n-labels.test.js guarantee.
    for (const dict of Object.values(translations)) {
      for (const value of Object.values(dict)) {
        expect(value).not.toMatch(/<[a-z][\s\S]*>/i);
      }
    }
  });
});
