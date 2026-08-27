import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/*
 * Ratchet guard for the UI revamp (see webapp/DESIGN.md).
 *
 * Every view/component `*.module.css` should consume the design tokens in
 * `tokens.css` / `themes.css` rather than re-declaring raw values — raw hex and
 * hardcoded `rgba(16, 185, 129)` (Tailwind emerald) don't follow dark mode or
 * the 15 accent presets; raw `font-size` bypasses the `--fs-*` scale; raw
 * `box-shadow` bypasses `--shadow-*`; raw `blur()` bypasses `--glass-blur`.
 *
 * `drift.baseline.json` freezes the count of each pattern per file at the start
 * of the revamp. This test fails if any file EXCEEDS its baseline, so the
 * numbers can only ever go down. When a view is de-drifted, lower its entry
 * (or delete it once it hits all zeros).
 *
 * `appearance.module.css` (the theme studio) is exempt entirely: literal
 * colours, gradients and the hue-wheel are its actual content, not drift.
 */

const EXEMPT = new Set(["views/settings/appearance.module.css"]);

// `fileURLToPath(import.meta.url)` rather than `new URL("./file", import.meta.url)`:
// Vite statically rewrites the string-literal form into an asset reference whose
// URL is no longer `file:` scheme, which breaks `fileURLToPath`. The sibling
// tests here sidestep it by passing a variable; resolving from the module path
// is clearer.
const stylesDir = dirname(fileURLToPath(import.meta.url));
const srcDir = join(stylesDir, "..");
const baseline = JSON.parse(
  readFileSync(join(stylesDir, "drift.baseline.json"), "utf8"),
) as Record<string, Counts>;

type Metric = "hex" | "rawFontSize" | "rawShadow" | "rawBlur" | "emerald";
type Counts = Record<Metric, number>;

const PATTERNS: Record<Metric, RegExp> = {
  hex: /#[0-9a-fA-F]{3,8}\b/g,
  rawFontSize: /font-size:\s*(?!var\()[0-9.]+(?:px|rem|em)/g,
  rawShadow: /box-shadow:[^;]*\b\d+px[^;]*rgba?\(/g,
  rawBlur: /blur\(\s*\d/g,
  emerald: /16,\s*185,\s*129/g,
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith(".module.css") ? [p] : [];
  });
}

function count(file: string): Counts {
  const css = readFileSync(file, "utf8")
    // Comments first — several explain a colour choice and name a hex.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Then url(...) so data-URI SVGs with fill='%23xxxxxx' don't register as hex.
    .replace(/url\([^)]*\)/g, "");
  const out = {} as Counts;
  for (const [metric, rx] of Object.entries(PATTERNS) as [Metric, RegExp][]) {
    out[metric] = (css.match(rx) ?? []).length;
  }
  return out;
}

const files = walk(srcDir).sort();

describe("CSS token-drift ratchet", () => {
  it("scans a stable set of module files", () => {
    // Guard against the glob silently matching nothing after a refactor.
    expect(files.length).toBeGreaterThan(40);
  });

  for (const file of files) {
    const rel = file.slice(srcDir.length + 1).replaceAll("\\", "/");
    if (EXEMPT.has(rel)) continue;
    const allowed: Counts = baseline[rel] ?? {
      hex: 0,
      rawFontSize: 0,
      rawShadow: 0,
      rawBlur: 0,
      emerald: 0,
    };

    it(`${rel} does not exceed its drift baseline`, () => {
      const actual = count(file);
      for (const metric of Object.keys(PATTERNS) as Metric[]) {
        expect(
          actual[metric],
          `${rel} — ${metric}: ${actual[metric]} now vs ${allowed[metric]} allowed. ` +
            `Raw values regressed; replace with a token or lower the baseline only when reducing.`,
        ).toBeLessThanOrEqual(allowed[metric]);
      }
    });
  }

  it("baseline has no stale entries", () => {
    const present = new Set(
      files.map((f) => f.slice(srcDir.length + 1).replaceAll("\\", "/")),
    );
    const stale = Object.keys(baseline).filter(
      (k) => !k.startsWith("_") && !present.has(k),
    );
    expect(stale, `remove these from drift.baseline.json`).toEqual([]);
  });
});
