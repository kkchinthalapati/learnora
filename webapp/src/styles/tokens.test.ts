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

describe("Visual Design System Tokens", () => {
  it("defines modern radii scale tokens", () => {
    const tokens = parseDeclarations(blockOf(tokensCss, ":root"));
    expect(tokens.get("--r-xs")).toBe("4px");
    expect(tokens.get("--r-sm")).toBe("8px");
    expect(tokens.get("--r-md")).toBe("12px");
    expect(tokens.get("--r-lg")).toBe("16px");
    expect(tokens.get("--r-xl")).toBe("20px");
    expect(tokens.get("--r-2xl")).toBe("24px");
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
    expect(darkTokens.get("--bg")).toBe("#090b0e");
    expect(darkTokens.get("--surface")).toBe("#111419");
    expect(darkTokens.get("--surface-2")).toBe("#161a20");
    expect(darkTokens.get("--surface-hover")).toBe("#1c2129");
    expect(darkTokens.get("--surface-active")).toBe("#232a34");
    expect(darkTokens.get("--text")).toBe("#f3f4f6");
    expect(darkTokens.get("--text-muted")).toBe("#94a3b8");
    expect(darkTokens.get("--text-faint")).toBe("#64748b");
  });
});
