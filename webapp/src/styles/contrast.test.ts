import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { THEME_PRESETS } from "../lib/appearance";

/*
 * Contrast guard for the accent ramps.
 *
 * A preset declares one accent hex but wears it in both light and dark mode,
 * and the accent is asked to do two different jobs: it fills the primary
 * button (with --accent-on as the label) and it *is* the text in ~50 other
 * places (--accent-text). Before these tokens existed, one hex had to satisfy
 * both on both backgrounds, and most presets could not — dark mode's default
 * teal read at 3.33:1 and Hacker's green put white text on a green button at
 * 2.28:1.
 *
 * This resolves the same cascade the browser does for each preset × mode and
 * asserts every pairing clears WCAG AA. It fails on a new preset that skips a
 * dark-mode ramp, or on a hand-edit that walks an accent back over the line.
 */

const AA = 4.5;

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const css = read("./tokens.css") + "\n" + read("./themes.css");
const appearanceCss = read("../views/settings/appearance.module.css");

/* --- contrast maths ------------------------------------------------------ */

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* --- a very small slice of the cascade ----------------------------------- */

/**
 * Every `--name: value;` declared by rules whose selector list contains
 * `selector`. Anchored to a line start (the files are Prettier-formatted, so
 * every selector in a group sits on its own line) which is what keeps a search
 * for `body[data-theme-color]` out of `body.dark-theme[data-theme-color]`.
 */
function declarationsFor(selector: string): Map<string, string> {
  const out = new Map<string, string>();
  const pattern = new RegExp(
    `^${selector.replace(/[.[\]()*+?^$|\\/]/g, "\\$&")}\\s*(?:,[^{]*)?\\{([^}]*)\\}`,
    "gm",
  );
  for (const rule of css.matchAll(pattern)) {
    for (const decl of rule[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      out.set(decl[1], decl[2].trim());
    }
  }
  return out;
}

/**
 * Resolve the tokens a body would compute for one preset in one mode, applying
 * the same rules in the same specificity order the browser would.
 */
function tokensFor(preset: string, dark: boolean): Map<string, string> {
  // Ordered by the specificity the browser resolves these at, weakest first:
  // (0,0,1) → (0,1,1) → (0,2,1) → (0,3,1).
  const layers = [
    ":root",
    ...(dark ? ["body.dark-theme"] : []),
    "body[data-theme-color]",
    `body[data-theme-color="${preset}"]`,
    ...(dark
      ? [
          "body.dark-theme[data-theme-color]",
          `body.dark-theme[data-theme-color="${preset}"]`,
          'body.dark-theme[data-theme-color]:not([data-theme-color="custom"])',
        ]
      : []),
  ];
  const merged = new Map<string, string>();
  for (const layer of layers) {
    for (const [k, v] of declarationsFor(layer)) merged.set(k, v);
  }
  return merged;
}

/** Follow `var(--x)` chains down to a literal hex. */
function resolve(tokens: Map<string, string>, name: string): string {
  let value = tokens.get(name);
  for (let hops = 0; hops < 10; hops++) {
    if (!value) break;
    const ref = value.match(/^var\((--[\w-]+)\)$/);
    if (!ref) break;
    value = tokens.get(ref[1]);
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`${name} did not resolve to a hex: ${value ?? "(unset)"}`);
  }
  return value;
}

/* --- the guard ----------------------------------------------------------- */

// "custom" is user-built and derives its own ink at runtime in
// deriveCustomThemeVars, so there is no static ramp here to check.
const presets = THEME_PRESETS.map((p) => p.id).filter((id) => id !== "custom");

describe("accent contrast", () => {
  it("covers every shipped preset", () => {
    expect(presets.length).toBe(13);
  });

  /* The Appearance tab draws each preset's swatch on a body wearing some
     *other* theme, so it cannot read that preset's --accent and has to repeat
     the hex. This is the guard that stops the two copies drifting. */
  it("paints every settings swatch in its preset's own accent", () => {
    for (const preset of presets) {
      const dot = appearanceCss.match(
        new RegExp(
          `\\.swatchCard\\[data-theme="${preset}"\\] \\.swatchDot \\{\\s*background: (#[0-9a-f]{6});`,
        ),
      );
      expect(dot, `no swatch dot for "${preset}"`).not.toBeNull();
      expect(dot![1], preset).toBe(
        resolve(tokensFor(preset, false), "--accent"),
      );
    }
  });

  for (const dark of [false, true]) {
    const mode = dark ? "dark" : "light";

    describe(`${mode} mode`, () => {
      for (const preset of presets) {
        it(`${preset} keeps accent text and button labels readable`, () => {
          const tokens = tokensFor(preset, dark);
          const accent = resolve(tokens, "--accent");
          const accentText = resolve(tokens, "--accent-text");
          const accentOn = resolve(tokens, "--accent-on");
          const surface = resolve(tokens, "--surface");
          const bg = resolve(tokens, "--bg");

          // --accent-text is the accent used as body text, on both the card
          // surface and the page behind it.
          expect(contrast(accentText, surface)).toBeGreaterThanOrEqual(AA);
          expect(contrast(accentText, bg)).toBeGreaterThanOrEqual(AA);
          // --accent-on is the label printed on an --accent fill.
          expect(contrast(accent, accentOn)).toBeGreaterThanOrEqual(AA);
        });
      }
    });
  }
});
