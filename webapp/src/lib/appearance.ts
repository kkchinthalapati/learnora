/* Port of js/ui.js's appearance + custom-theme engine (:144-165, :698-1063).
 *
 * Split deliberately into pure state/derivation (here) and React wiring
 * (context/AppearanceProvider.tsx). The vanilla kept `_activeAppearanceState`
 * on the UI singleton and repainted the DOM and the settings widgets from the
 * same method; in React the widgets re-render from state on their own, so all
 * that's left down here is: read storage, derive CSS values, write the body
 * attributes.
 *
 * Storage keys and body attribute names are identical to the vanilla app's —
 * the two apps share a theme while they run side by side, so a mode picked in
 * one has to survive a navigation into the other. */

import {
  clamp,
  hsvToHex,
  hsvToRgb,
  luminance,
  parseHex,
  rgbToHex,
  rgbToHsv,
  rgbaStr,
} from "./color";
import { Storage } from "./storage";

export const THEME_KEY = "learnora_theme";
export const CUSTOM_THEME_KEY = "learnora_custom_theme";
export const CUSTOM_THEME_MAX_COLORS = 3;

export const CUSTOM_THEME_DEFAULTS = Object.freeze({
  colors: ["#5865F2"] as readonly string[],
  intensity: 74,
});

export type Mode = "dark" | "light" | "system";
export type FontFamily = "jakarta" | "outfit" | "inter" | "mono" | "dyslexic";
export type FontSize = "sm" | "md" | "lg";
export type SidebarStyle = "glass" | "solid" | "transparent";
export type BgTexture = "none" | "noise" | "mesh";

export interface AppearanceState {
  mode: Mode;
  accent: string;
  sidebar: SidebarStyle;
  bg: BgTexture;
  font: FontFamily;
  size: FontSize;
}

export interface CustomTheme {
  colors: string[];
  intensity: number;
  activeIndex: number;
}

export const APPEARANCE_DEFAULTS: AppearanceState = Object.freeze({
  mode: "dark",
  accent: "default",
  sidebar: "glass",
  bg: "none",
  font: "jakarta",
  size: "md",
});

/* The 13 curated presets, in the order the vanilla renders them
 * (index.html:1172-1264). Swatch colours stay in CSS — one source of truth
 * per theme — so this only carries identity and label. */
export const THEME_PRESETS: ReadonlyArray<{ id: string; name: string }> = [
  { id: "default", name: "Scholar Teal" },
  { id: "original", name: "Oxford Navy" },
  { id: "minimal", name: "Nordic Paper" },
  { id: "monochrome", name: "Obsidian Slate" },
  { id: "ocean", name: "Pacific Deep" },
  { id: "breeze", name: "Arctic Glade" },
  { id: "forest", name: "Botanical Sage" },
  { id: "hacker", name: "Terminal Green" },
  { id: "lavender", name: "Amethyst Haze" },
  { id: "cyberpunk", name: "Neon Velvet" },
  { id: "ruby", name: "Crimson Velvet" },
  { id: "warm", name: "Warm Terracotta" },
  { id: "sunset", name: "Sunset Amber" },
];

const CUSTOM_VAR_NAMES = [
  "--custom-accent",
  "--custom-accent-hover",
  "--custom-accent-press",
  "--custom-accent-soft",
  "--custom-accent-ring",
  "--custom-accent-glow",
  "--custom-accent-on",
  "--custom-tint-1",
  "--custom-tint-2",
  "--custom-gradient",
] as const;

/* ------------------------------------------------------------------ *
 * Reading persisted state
 * ------------------------------------------------------------------ */

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function readStoredAppearance(): AppearanceState {
  /* `learnora_mode` is the live preference; THEME_KEY holds the *resolved*
     light/dark value the vanilla writes alongside it so a cold boot can paint
     before JS decides what "system" means. Read mode first, fall back to the
     resolved value, then to the default — same precedence as the vanilla
     applyAppearance (:718). */
  const storedMode =
    Storage.get<string>("learnora_mode") ?? Storage.get<string>(THEME_KEY);

  return {
    mode: oneOf<Mode>(
      storedMode,
      ["dark", "light", "system"],
      APPEARANCE_DEFAULTS.mode,
    ),
    accent: Storage.get<string>("learnora_accent", APPEARANCE_DEFAULTS.accent),
    sidebar: oneOf<SidebarStyle>(
      Storage.get<string>("learnora_sidebar"),
      ["glass", "solid", "transparent"],
      APPEARANCE_DEFAULTS.sidebar,
    ),
    bg: oneOf<BgTexture>(
      Storage.get<string>("learnora_bg"),
      ["none", "noise", "mesh"],
      APPEARANCE_DEFAULTS.bg,
    ),
    font: oneOf<FontFamily>(
      Storage.get<string>("learnora_font"),
      ["jakarta", "outfit", "inter", "mono", "dyslexic"],
      APPEARANCE_DEFAULTS.font,
    ),
    size: oneOf<FontSize>(
      Storage.get<string>("learnora_size"),
      ["sm", "md", "lg"],
      APPEARANCE_DEFAULTS.size,
    ),
  };
}

export function readStoredCustomTheme(): CustomTheme {
  const stored = Storage.get<{ colors?: unknown; intensity?: unknown }>(
    CUSTOM_THEME_KEY,
  );
  const colors = Array.isArray(stored?.colors)
    ? (stored.colors as unknown[])
        .filter((c) => parseHex(c))
        .slice(0, CUSTOM_THEME_MAX_COLORS)
        .map((c) => rgbToHex(parseHex(c)!))
    : [];
  const intensity = Number(stored?.intensity);

  return {
    colors: colors.length ? colors : [...CUSTOM_THEME_DEFAULTS.colors],
    intensity: Number.isFinite(intensity)
      ? clamp(Math.round(intensity), 0, 100)
      : CUSTOM_THEME_DEFAULTS.intensity,
    activeIndex: 0,
  };
}

/* ------------------------------------------------------------------ *
 * Derivation
 * ------------------------------------------------------------------ */

export function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Resolve "system" to the concrete light/dark the body should wear. */
export function resolveDark(mode: Mode): boolean {
  return mode === "system" ? prefersDark() : mode === "dark";
}

/* Direct port of applyCustomTheme (:767-803) with the DOM write lifted out,
 * so the derivation is testable without a body. Intensity mostly scales
 * chroma with a light touch on brightness, so 0% settles into a muted tone of
 * the same hue rather than washing out to near-white; both curves reach
 * exactly 1 at k=1, so 100% reproduces the picked hex untouched. */
export function deriveCustomThemeVars(
  theme: CustomTheme,
): Record<string, string> {
  const base =
    parseHex(theme.colors[0]) ?? parseHex(CUSTOM_THEME_DEFAULTS.colors[0])!;
  const k = theme.intensity / 100;

  const { h, s, v } = rgbToHsv(base);
  const sat = s * (0.15 + 0.85 * k);
  const val = v * (0.8 + 0.2 * k);
  const accentRgb = hsvToRgb(h, sat, val);

  const secondRgb = parseHex(theme.colors[1]) ?? hsvToRgb(h + 40, sat, val);

  const stops =
    theme.colors.length > 1
      ? theme.colors.map((hex) => {
          const c = rgbToHsv(parseHex(hex)!);
          return hsvToHex(c.h, c.s * (0.15 + 0.85 * k), c.v * (0.8 + 0.2 * k));
        })
      : [rgbToHex(accentRgb), hsvToHex(h, sat, val * 0.86)];

  return {
    "--custom-accent": rgbToHex(accentRgb),
    "--custom-accent-hover": hsvToHex(h, sat, val * 0.86),
    "--custom-accent-press": hsvToHex(h, sat, val * 0.74),
    "--custom-accent-soft": rgbaStr(accentRgb, 0.06 + 0.12 * k),
    "--custom-accent-ring": rgbaStr(accentRgb, 0.16 + 0.24 * k),
    "--custom-accent-glow": rgbaStr(accentRgb, 0.18 + 0.32 * k),
    "--custom-accent-on": luminance(accentRgb) > 0.5 ? "#10151f" : "#ffffff",
    "--custom-tint-1": rgbaStr(accentRgb, 0.04 + 0.08 * k),
    "--custom-tint-2": rgbaStr(secondRgb, 0.03 + 0.06 * k),
    "--custom-gradient": `linear-gradient(135deg, ${stops.join(", ")})`,
  };
}

/* ------------------------------------------------------------------ *
 * DOM application
 * ------------------------------------------------------------------ */

export function applyAppearanceToDom(
  state: AppearanceState,
  customTheme: CustomTheme,
): void {
  const body = document.body;
  body.classList.toggle("dark-theme", resolveDark(state.mode));
  body.setAttribute("data-theme-color", state.accent);
  body.setAttribute("data-sidebar-style", state.sidebar);
  body.setAttribute("data-bg-texture", state.bg);
  body.setAttribute("data-font-family", state.font);
  body.setAttribute("data-font-size", state.size);

  if (state.accent === "custom") {
    const vars = deriveCustomThemeVars(customTheme);
    for (const [prop, value] of Object.entries(vars)) {
      body.style.setProperty(prop, value);
    }
    /* The SV field paints its own hue from this, so it has to track the
     *picked* colour rather than the intensity-damped accent. */
    const active = parseHex(customTheme.colors[customTheme.activeIndex]);
    if (active) {
      body.style.setProperty(
        "--custom-sv-hue",
        String(Math.round(rgbToHsv(active).h)),
      );
    }
  } else {
    clearCustomThemeVars();
  }
}

export function clearCustomThemeVars(): void {
  for (const prop of CUSTOM_VAR_NAMES) {
    document.body.style.removeProperty(prop);
  }
}

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

export function persistAppearance(
  state: AppearanceState,
  customTheme: CustomTheme,
): void {
  Storage.set("learnora_mode", state.mode);
  /* THEME_KEY holds the resolved value so the vanilla app's pre-paint read
     never has to evaluate a media query (js/ui.js:1031). */
  Storage.set(
    THEME_KEY,
    state.mode === "system"
      ? resolveDark(state.mode)
        ? "dark"
        : "light"
      : state.mode,
  );
  Storage.set("learnora_accent", state.accent);
  Storage.set("learnora_sidebar", state.sidebar);
  Storage.set("learnora_bg", state.bg);
  Storage.set("learnora_font", state.font);
  Storage.set("learnora_size", state.size);
  Storage.set(CUSTOM_THEME_KEY, {
    colors: customTheme.colors,
    intensity: customTheme.intensity,
  });
}

export function persistAppearanceDefaults(): void {
  Storage.remove(CUSTOM_THEME_KEY);
  Storage.set("learnora_mode", APPEARANCE_DEFAULTS.mode);
  Storage.set(THEME_KEY, APPEARANCE_DEFAULTS.mode);
  Storage.set("learnora_accent", APPEARANCE_DEFAULTS.accent);
  Storage.set("learnora_sidebar", APPEARANCE_DEFAULTS.sidebar);
  Storage.set("learnora_bg", APPEARANCE_DEFAULTS.bg);
  Storage.set("learnora_font", APPEARANCE_DEFAULTS.font);
  Storage.set("learnora_size", APPEARANCE_DEFAULTS.size);
}

/* Clear all appearance settings from localStorage (used on logout/user switch). */
export function clearAppearance(): void {
  Storage.remove("learnora_mode");
  Storage.remove(THEME_KEY);
  Storage.remove("learnora_accent");
  Storage.remove("learnora_sidebar");
  Storage.remove("learnora_bg");
  Storage.remove("learnora_font");
  Storage.remove("learnora_size");
  Storage.remove(CUSTOM_THEME_KEY);
}

/* ------------------------------------------------------------------ *
 * Custom-theme mutations (pure — each returns the next theme)
 * ------------------------------------------------------------------ */

export function normalizeCustomTheme(theme: CustomTheme): CustomTheme {
  const colors = theme.colors
    .map((c) => (parseHex(c) ? rgbToHex(parseHex(c)!) : null))
    .filter((c): c is string => c !== null)
    .slice(0, CUSTOM_THEME_MAX_COLORS);
  const safeColors = colors.length ? colors : [...CUSTOM_THEME_DEFAULTS.colors];
  return {
    colors: safeColors,
    intensity: clamp(Math.round(theme.intensity), 0, 100),
    activeIndex: clamp(theme.activeIndex, 0, safeColors.length - 1),
  };
}

export function addCustomColour(theme: CustomTheme): CustomTheme {
  if (theme.colors.length >= CUSTOM_THEME_MAX_COLORS) return theme;
  const { h, s, v } = rgbToHsv(
    parseHex(theme.colors[theme.colors.length - 1])!,
  );
  const colors = [
    ...theme.colors,
    hsvToHex(h + 45, Math.max(s, 0.55), Math.max(v, 0.6)),
  ];
  return normalizeCustomTheme({
    ...theme,
    colors,
    activeIndex: colors.length - 1,
  });
}

export function removeCustomColour(
  theme: CustomTheme,
  index: number,
): CustomTheme {
  if (theme.colors.length <= 1) return theme;
  const colors = theme.colors.filter((_, i) => i !== index);
  return normalizeCustomTheme({
    ...theme,
    colors,
    activeIndex: Math.min(theme.activeIndex, colors.length - 1),
  });
}

/* Spread the extra stops around the wheel so pairings stay legible instead of
   collapsing into two near-identical colours (js/ui.js:956-970). */
export function surpriseCustomTheme(
  random: () => number = Math.random,
): CustomTheme {
  const count = 1 + Math.floor(random() * CUSTOM_THEME_MAX_COLORS);
  const baseHue = random() * 360;
  const colors = Array.from({ length: count }, (_, i) =>
    hsvToHex(
      baseHue + i * (35 + random() * 55),
      0.55 + random() * 0.4,
      0.72 + random() * 0.25,
    ),
  );
  return {
    colors,
    activeIndex: 0,
    intensity: 55 + Math.round(random() * 45),
  };
}

export function defaultCustomTheme(): CustomTheme {
  return {
    colors: [...CUSTOM_THEME_DEFAULTS.colors],
    intensity: CUSTOM_THEME_DEFAULTS.intensity,
    activeIndex: 0,
  };
}
