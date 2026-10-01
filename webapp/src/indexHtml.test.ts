import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/* Production serves the app with a Content-Security-Policy that has no
 * 'unsafe-inline' (vercel.json), so an inline event handler in index.html is
 * silently blocked there while working everywhere else — dev, tests, preview
 * builds. That is how the web fonts went unloaded in production: the font
 * stylesheet's onload never ran. Comments are stripped first, since the one
 * explaining this names the old handler. */
describe("index.html", () => {
  const html = readFileSync(resolve(__dirname, "../index.html"), "utf8").replace(
    /<!--[\s\S]*?-->/g,
    "",
  );

  it("has no inline event handlers, which the CSP would block", () => {
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it("has no inline scripts, which the CSP would block", () => {
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((m) => m[1].trim())
      .filter(Boolean);
    expect(inline).toEqual([]);
  });
});
