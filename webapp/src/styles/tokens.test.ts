import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Visual Design System tokens test suite: validates that design tokens across
 * tokens.css and themes.css adhere to Phase 1 specs for radii, glass lighting,
 * multi-stop shadows, typography tracking, and dark mode palette.
 */

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const tokensCss = read("./tokens.css");
const themesCss = read("./themes.css");

function blockOf(css: string, selector: string): string {
  const match = css.match(
    new RegExp(selector.replace(/[[\]]/g, "\\$&") + "\\s*\\{([^}]*)\\}"),
  );
  if (!match) throw new Error(`selector not found: ${selector}`);
  return match[1];
}

function parseDeclarations(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(
      m[1],
      m[2]
        .replace(/\s+/g, " ")
        .replace(/\(\s+/g, "(")
        .replace(/\s+\)/g, ")")
        .trim(),
    );
  }
  return map;
}


/* --- contrast plumbing, for the semantic --*-text tokens below ------------
   These tokens exist only to hold a contrast floor, so the test has to
   actually measure one rather than assert a hex string: a future palette
   change should be free to move the value and only fail if it moves the
   *contrast*. WCAG 2.1 relative luminance + contrast ratio. */

function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  const chan = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = rgbOf(hex);
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite an rgba() wash over an opaque backdrop. */
function over(fg: string, alpha: number, backdrop: string): string {
  const F = rgbOf(fg);
  const B = rgbOf(backdrop);
  return (
    "#" +
    [0, 1, 2]
      .map((i) =>
        Math.round(F[i] * alpha + B[i] * (1 - alpha))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

const AA_NORMAL = 4.5;

describe("Visual Design System Tokens", () => {
  it("defines modern radii scale tokens", () => {
    const tokens = parseDeclarations(blockOf(tokensCss, ":root"));
    expect(tokens.get("--r-xs")).toBe("2px");
    expect(tokens.get("--r-sm")).toBe("5px");
    expect(tokens.get("--r-md")).toBe("8px");
    expect(tokens.get("--r-lg")).toBe("12px");
    expect(tokens.get("--r-xl")).toBe("16px");
    expect(tokens.get("--r-2xl")).toBe("20px");
    expect(tokens.get("--r-pill")).toBe("999px");
  });

  it("defines modern glass highlights and eliminates glass-inner-bottom", () => {
    const rootTokens = parseDeclarations(blockOf(tokensCss, ":root"));
    const darkTokens = parseDeclarations(blockOf(themesCss, "body\\.dark-theme"));

    expect(rootTokens.get("--glass-inner")).toBe("inset 0 1px 0 rgba(255, 255, 255, 0.08)");
    expect(darkTokens.get("--glass-inner")).toBe("inset 0 1px 0 rgba(255, 255, 255, 0.08)");
    expect(rootTokens.has("--glass-inner-bottom")).toBe(false);
    expect(darkTokens.has("--glass-inner-bottom")).toBe(false);
  });

  it("defines multi-stop shadow tokens", () => {
    const tokens = parseDeclarations(blockOf(tokensCss, ":root"));
    expect(tokens.get("--shadow-sm")).toBeDefined();
    expect(tokens.get("--shadow-md")).toBeDefined();
    expect(tokens.get("--shadow-lg")).toBeDefined();
  });

  it("defines typography tracking tokens", () => {
    const tokens = parseDeclarations(blockOf(tokensCss, ":root"));
    expect(tokens.get("--tracking-tight")).toBe("-0.015em");
    expect(tokens.get("--tracking-normal")).toBe("0em");
    expect(tokens.get("--tracking-wide")).toBe("0.025em");
    expect(tokens.get("--tracking-wider")).toBe("0.05em");
    expect(tokens.get("--tracking-widest")).toBe("0.09em");
  });

  it("defines dark mode surface palette and clean text tokens", () => {
    const darkTokens = parseDeclarations(blockOf(themesCss, "body\\.dark-theme"));
    expect(darkTokens.get("--bg")).toBe("#0d0c0a");
    expect(darkTokens.get("--surface")).toBe("#141310");
    expect(darkTokens.get("--surface-2")).toBe("#1b1916");
    expect(darkTokens.get("--surface-hover")).toBe("#22201c");
    expect(darkTokens.get("--surface-active")).toBe("#2a2723");
    expect(darkTokens.get("--text")).toBe("#f0ece4");
    expect(darkTokens.get("--text-muted")).toBe("#a8a094");
    expect(darkTokens.get("--text-faint")).toBe("#8a8175");
  });

  /* The --*-text split exists because a fill and a label are held to
     different contrast floors (3:1 vs 4.5:1), and the semantic fills were
     being used as both. Light-mode --warning scored 2.93:1 as text and
     --success 4.09:1; dark-mode --danger scored 3.76:1. The worst backdrop
     any of them actually lands on is its own --*-soft wash composited over
     the darkest (light) / lightest (dark) opaque surface, so that is what
     these measure. Assert the floor, not the hex. */
  describe("semantic --*-text tokens clear AA on their worst real backdrop", () => {
    const lightSurfaces = ["#ffffff", "#f7f5f0", "#f0ede5", "#e8e4da", "#ded9cc"];
    const darkSurfaces = ["#0d0c0a", "#141310", "#1b1916", "#22201c", "#2a2723"];

    const cases = [
      { tone: "success", softAlpha: 0.12 },
      { tone: "warning", softAlpha: 0.14 },
      { tone: "danger", softAlpha: 0.12 },
    ];

    it.each(cases)("light mode: --$tone-text", ({ tone, softAlpha }) => {
      const tokens = parseDeclarations(blockOf(tokensCss, ":root"));
      const text = tokens.get(`--${tone}-text`);
      const fill = tokens.get(`--${tone}`);
      expect(text, `--${tone}-text must be a literal hex`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(fill).toMatch(/^#[0-9a-f]{6}$/i);

      /* Darkest backdrop = the soft wash over the darkest opaque surface. */
      const backdrops = lightSurfaces.map((s) => over(fill!, softAlpha, s));
      for (const bd of [...lightSurfaces, ...backdrops]) {
        expect(
          contrast(text!, bd),
          `--${tone}-text on ${bd}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });

    it.each(cases)("dark mode: --$tone-text", ({ tone, softAlpha }) => {
      const darkTokens = parseDeclarations(blockOf(themesCss, "body\\.dark-theme"));
      const raw = darkTokens.get(`--${tone}-text`);
      expect(raw, `--${tone}-text must be defined in dark mode`).toBeDefined();

      /* Dark mode points success/warning back at the fill via var(); resolve
         that one hop so the measurement is on a real colour either way. */
      const fill = darkTokens.get(`--${tone}`)!;
      const text = raw!.startsWith("var(") ? fill : raw!;
      expect(text).toMatch(/^#[0-9a-f]{6}$/i);

      const backdrops = darkSurfaces.map((s) => over(fill, softAlpha, s));
      for (const bd of [...darkSurfaces, ...backdrops]) {
        expect(
          contrast(text, bd),
          `--${tone}-text on ${bd}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });
  });
});
