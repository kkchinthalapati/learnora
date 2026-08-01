import { beforeEach, describe, expect, it } from "vitest";
import {
  APPEARANCE_DEFAULTS,
  CUSTOM_THEME_KEY,
  addCustomColour,
  applyAppearanceToDom,
  defaultCustomTheme,
  deriveCustomThemeVars,
  normalizeCustomTheme,
  persistAppearance,
  readStoredAppearance,
  readStoredCustomTheme,
  removeCustomColour,
  resolveDark,
  surpriseCustomTheme,
  type CustomTheme,
} from "./appearance";
import { Storage } from "./storage";

describe("readStoredAppearance", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("falls back to the documented defaults when nothing is stored", () => {
    expect(readStoredAppearance()).toEqual(APPEARANCE_DEFAULTS);
  });

  it("prefers learnora_mode over the resolved learnora_theme value", () => {
    /* The vanilla writes both: `learnora_mode` is the preference the user
       picked, `learnora_theme` the light/dark it currently resolves to. */
    Storage.set("learnora_mode", "system");
    Storage.set("learnora_theme", "dark");
    expect(readStoredAppearance().mode).toBe("system");
  });

  it("falls back to learnora_theme when only that key exists", () => {
    Storage.set("learnora_theme", "light");
    expect(readStoredAppearance().mode).toBe("light");
  });

  it("rejects a value outside the allowed set instead of trusting storage", () => {
    Storage.set("learnora_mode", "chartreuse");
    Storage.set("learnora_font", "comic-sans");
    Storage.set("learnora_size", "xxl");
    const state = readStoredAppearance();
    expect(state.mode).toBe("dark");
    expect(state.font).toBe("jakarta");
    expect(state.size).toBe("md");
  });

  it("survives a corrupt JSON payload", () => {
    localStorage.setItem("learnora_accent", "{not json");
    expect(readStoredAppearance().accent).toBe("default");
  });
});

describe("readStoredCustomTheme", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("drops unparseable colours and normalises the survivors", () => {
    Storage.set(CUSTOM_THEME_KEY, {
      colors: ["#abc", "not-a-colour", "#00FF00"],
      intensity: 40,
    });
    expect(readStoredCustomTheme()).toEqual({
      colors: ["#AABBCC", "#00FF00"],
      intensity: 40,
      activeIndex: 0,
    });
  });

  it("clamps an out-of-range intensity", () => {
    Storage.set(CUSTOM_THEME_KEY, { colors: ["#123456"], intensity: 900 });
    expect(readStoredCustomTheme().intensity).toBe(100);
  });

  it("falls back to the default stop when every stored colour is junk", () => {
    Storage.set(CUSTOM_THEME_KEY, { colors: ["nope", 42], intensity: "abc" });
    expect(readStoredCustomTheme()).toEqual(defaultCustomTheme());
  });

  it("keeps at most three stops", () => {
    Storage.set(CUSTOM_THEME_KEY, {
      colors: ["#111111", "#222222", "#333333", "#444444"],
      intensity: 50,
    });
    expect(readStoredCustomTheme().colors).toHaveLength(3);
  });
});

describe("deriveCustomThemeVars", () => {
  const theme = (colors: string[], intensity: number): CustomTheme => ({
    colors,
    intensity,
    activeIndex: 0,
  });

  it("reproduces the picked hex untouched at 100% intensity", () => {
    /* Both the saturation and brightness curves reach exactly 1 at k=1, which
       is the property that makes "100%" mean "my colour, unmodified". */
    const vars = deriveCustomThemeVars(theme(["#5865F2"], 100));
    expect(vars["--custom-accent"]).toBe("#5865F2");
  });

  it("keeps the hue but drops chroma as intensity falls", () => {
    const muted = deriveCustomThemeVars(theme(["#5865F2"], 0));
    expect(muted["--custom-accent"]).not.toBe("#5865F2");
    // Still blue-ish: the blue channel stays the largest.
    const hex = muted["--custom-accent"];
    const r = parseInt(hex.slice(1, 3), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    expect(b).toBeGreaterThan(r);
  });

  it("picks a dark on-accent colour for a pale accent and white for a dark one", () => {
    expect(
      deriveCustomThemeVars(theme(["#FFFFFF"], 100))["--custom-accent-on"],
    ).toBe("#10151f");
    expect(
      deriveCustomThemeVars(theme(["#101010"], 100))["--custom-accent-on"],
    ).toBe("#ffffff");
  });

  it("builds a two-stop gradient from a single colour", () => {
    const vars = deriveCustomThemeVars(theme(["#5865F2"], 100));
    expect(vars["--custom-gradient"]).toMatch(
      /^linear-gradient\(135deg, #[0-9A-F]{6}, #[0-9A-F]{6}\)$/,
    );
  });

  it("uses every stop when the user added more", () => {
    const vars = deriveCustomThemeVars(
      theme(["#FF0000", "#00FF00", "#0000FF"], 100),
    );
    expect(vars["--custom-gradient"]).toBe(
      "linear-gradient(135deg, #FF0000, #00FF00, #0000FF)",
    );
  });

  it("falls back to the default stop rather than throwing on an empty theme", () => {
    expect(() => deriveCustomThemeVars(theme([], 74))).not.toThrow();
  });
});

describe("applyAppearanceToDom", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = "";
    document.body.removeAttribute("style");
  });

  it("writes the same body attributes the vanilla app reads", () => {
    applyAppearanceToDom(
      {
        mode: "light",
        accent: "ocean",
        sidebar: "solid",
        bg: "mesh",
        font: "mono",
        size: "lg",
      },
      defaultCustomTheme(),
    );
    expect(document.body.classList.contains("dark-theme")).toBe(false);
    expect(document.body.getAttribute("data-theme-color")).toBe("ocean");
    expect(document.body.getAttribute("data-sidebar-style")).toBe("solid");
    expect(document.body.getAttribute("data-bg-texture")).toBe("mesh");
    expect(document.body.getAttribute("data-font-family")).toBe("mono");
    expect(document.body.getAttribute("data-font-size")).toBe("lg");
  });

  it("sets the --custom-* variables only while the custom accent is selected", () => {
    applyAppearanceToDom(
      { ...APPEARANCE_DEFAULTS, accent: "custom" },
      defaultCustomTheme(),
    );
    expect(document.body.style.getPropertyValue("--custom-accent")).not.toBe(
      "",
    );

    applyAppearanceToDom(
      { ...APPEARANCE_DEFAULTS, accent: "ocean" },
      defaultCustomTheme(),
    );
    expect(document.body.style.getPropertyValue("--custom-accent")).toBe("");
  });
});

describe("persistAppearance", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores the resolved light/dark under learnora_theme for system mode", () => {
    /* The vanilla app paints from `learnora_theme` before any JS decides what
       "system" means, so it must never contain the literal "system". */
    persistAppearance(
      { ...APPEARANCE_DEFAULTS, mode: "system" },
      defaultCustomTheme(),
    );
    expect(Storage.get<string>("learnora_mode")).toBe("system");
    expect(["dark", "light"]).toContain(Storage.get<string>("learnora_theme"));
  });

  it("round-trips through readStoredAppearance", () => {
    const state = {
      mode: "light",
      accent: "ruby",
      sidebar: "transparent",
      bg: "noise",
      font: "inter",
      size: "sm",
    } as const;
    persistAppearance(state, defaultCustomTheme());
    expect(readStoredAppearance()).toEqual(state);
  });
});

describe("custom theme mutations", () => {
  it("adds a stop up to the three-colour cap, then stops", () => {
    let theme = defaultCustomTheme();
    theme = addCustomColour(theme);
    theme = addCustomColour(theme);
    expect(theme.colors).toHaveLength(3);
    expect(theme.activeIndex).toBe(2);

    const capped = addCustomColour(theme);
    expect(capped).toBe(theme);
  });

  it("refuses to remove the last remaining stop", () => {
    const theme = defaultCustomTheme();
    expect(removeCustomColour(theme, 0)).toBe(theme);
  });

  it("keeps activeIndex inside the list after a removal", () => {
    let theme = addCustomColour(defaultCustomTheme());
    expect(theme.activeIndex).toBe(1);
    theme = removeCustomColour(theme, 1);
    expect(theme.colors).toHaveLength(1);
    expect(theme.activeIndex).toBe(0);
  });

  it("normalises junk colours and an out-of-range activeIndex", () => {
    expect(
      normalizeCustomTheme({
        colors: ["#fff", "bogus"],
        intensity: 1000,
        activeIndex: 9,
      }),
    ).toEqual({ colors: ["#FFFFFF"], intensity: 100, activeIndex: 0 });
  });

  it("generates between one and three legible stops", () => {
    /* Seeded so the assertion is about the shape of the output, not luck. */
    const values = [0.99, 0.5, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.1];
    let i = 0;
    const theme = surpriseCustomTheme(() => values[i++ % values.length]);
    expect(theme.colors.length).toBeGreaterThanOrEqual(1);
    expect(theme.colors.length).toBeLessThanOrEqual(3);
    expect(theme.intensity).toBeGreaterThanOrEqual(55);
    expect(theme.intensity).toBeLessThanOrEqual(100);
    theme.colors.forEach((c) => expect(c).toMatch(/^#[0-9A-F]{6}$/));
  });
});

describe("resolveDark", () => {
  it("maps explicit modes without consulting the media query", () => {
    expect(resolveDark("dark")).toBe(true);
    expect(resolveDark("light")).toBe(false);
  });
});
