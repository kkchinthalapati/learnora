import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Parity guard: tokens.css / themes.css are 1:1 ports of the vanilla app's
 * style.css token blocks, and both apps run side-by-side until the last route
 * cuts over. If a token or theme preset is added or renamed in style.css,
 * these tests fail until the port is updated (and vice versa when style.css
 * finally goes away, this whole file goes with it).
 */

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const vanilla = read("../../../style.css");
const tokensCss = read("./tokens.css");
const themesCss = read("./themes.css");

function blockOf(css: string, selector: string): string {
  const match = css.match(
    new RegExp(selector.replace(/[[\]]/g, "\\$&") + "\\s*\\{([^}]*)\\}"),
  );
  if (!match) throw new Error(`selector not found: ${selector}`);
  return match[1];
}

function tokenNames(block: string): string[] {
  return [...block.matchAll(/--[\w-]+(?=\s*:)/g)].map((m) => m[0]);
}

describe("token parity with the vanilla app", () => {
  it("ports every :root token", () => {
    const wanted = tokenNames(blockOf(vanilla, ":root"));
    expect(wanted.length).toBeGreaterThan(50);
    const ported = new Set(tokenNames(blockOf(tokensCss, ":root")));
    expect(wanted.filter((t) => !ported.has(t))).toEqual([]);
  });

  it("ports every dark-theme override", () => {
    const wanted = tokenNames(blockOf(vanilla, "body\\.dark-theme"));
    expect(wanted.length).toBeGreaterThan(20);
    const ported = new Set(tokenNames(blockOf(themesCss, "body\\.dark-theme")));
    expect(wanted.filter((t) => !ported.has(t))).toEqual([]);
  });

  it("ports every accent preset", () => {
    const presets = [
      ...vanilla.matchAll(/body\[data-theme-color="([\w-]+)"\]/g),
    ].map((m) => m[1]);
    expect(presets.length).toBeGreaterThan(10);
    for (const preset of new Set(presets)) {
      expect(themesCss).toContain(`body[data-theme-color="${preset}"]`);
    }
  });

  it("declares identical values for every :root token", () => {
    const parse = (block: string) => {
      const map = new Map<string, string>();
      for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
        // Collapse all whitespace (including Prettier's wrapping inside
        // parentheses) so only the actual value is compared.
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
    };
    const wanted = parse(blockOf(vanilla, ":root"));
    const ported = parse(blockOf(tokensCss, ":root"));
    for (const [name, value] of wanted) {
      expect(ported.get(name), name).toBe(value);
    }
  });
});
