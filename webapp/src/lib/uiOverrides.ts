import { Storage } from "./storage";

/* Colour overrides for any token in the registry below. The accent presets
 * pick a whole palette; these let a Plus or Pro student change one surface,
 * one ink or one margin colour on top of whichever preset is active.
 *
 * Adding a colour to Settings is one entry in UI_COLOUR_TOKENS: the registry
 * drives the Settings controls, the storage check and what reaches <body>.
 *
 * Gating lives with the caller (AppearanceProvider only applies overrides
 * when the plan allows `customAppearance`), so this module stays a plain
 * store. A stored value that doesn't match the registry or isn't a hex colour
 * is dropped on read, so a tampered or stale entry can't reach the page. */

export const UI_OVERRIDES_KEY = "learnora_ui_overrides";

export interface UiColourToken {
  /** The CSS custom property this overrides, e.g. "--surface". */
  prop: string;
  label: string;
  hint: string;
}

export const UI_COLOUR_TOKENS: readonly UiColourToken[] = [
  { prop: "--bg", label: "Page", hint: "The background behind everything." },
  { prop: "--surface", label: "Cards and lists", hint: "Lists, cards and the capture box." },
  { prop: "--text", label: "Text", hint: "Headings and body text." },
  { prop: "--recall", label: "Due and memory", hint: "Cards due, mistakes to retest." },
  { prop: "--margin-rule", label: "Margin line", hint: "The line down lists and the capture box." },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const KNOWN = new Set(UI_COLOUR_TOKENS.map((t) => t.prop));

export type UiOverrides = Partial<Record<string, string>>;

export function sanitizeUiOverrides(raw: unknown): UiOverrides {
  if (!raw || typeof raw !== "object") return {};
  const out: UiOverrides = {};
  for (const [prop, value] of Object.entries(raw as Record<string, unknown>)) {
    if (KNOWN.has(prop) && typeof value === "string" && HEX.test(value)) {
      out[prop] = value.toLowerCase();
    }
  }
  return out;
}

export function readUiOverrides(): UiOverrides {
  return sanitizeUiOverrides(Storage.get<unknown>(UI_OVERRIDES_KEY, {}));
}

export function writeUiOverrides(overrides: UiOverrides): void {
  const clean = sanitizeUiOverrides(overrides);
  if (Object.keys(clean).length === 0) {
    Storage.remove(UI_OVERRIDES_KEY);
  } else {
    Storage.set(UI_OVERRIDES_KEY, clean);
  }
}

/** Puts every override on <body>, and removes any token no longer overridden. */
export function applyUiOverrides(overrides: UiOverrides): void {
  const body = document.body;
  for (const { prop } of UI_COLOUR_TOKENS) {
    const value = overrides[prop];
    if (value) body.style.setProperty(prop, value);
    else body.style.removeProperty(prop);
  }
}
