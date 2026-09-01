import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/*
 * Focus-indicator guard.
 *
 * A module that writes `outline: none` on an input has taken over
 * responsibility for showing focus, and module-CSS specificity beats the
 * global `:focus-visible` fallback — so forgetting the replacement doesn't
 * degrade the indicator, it deletes it. Three fields shipped that way (the
 * custom-theme hex input, the notebook hub search and studio chat boxes, and
 * the command palette search on Shift+Tab back), and a fourth site drew its
 * halo in `--surface`, the same colour as the card behind it.
 *
 * These assertions are on CSS source text rather than rendered styles because
 * jsdom doesn't apply stylesheets — same reason contrast.test.ts and
 * drift.test.ts read the files directly.
 */

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return readFileSync(join(srcDir, rel), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
}

/** Every declaration block whose selector list names `selector`, joined —
 *  so an assertion can only be satisfied by a rule that actually applies to
 *  that selector, not by one further down the file. A selector can appear in
 *  more than one rule (`.cell:focus-visible` shares one with `:hover` and has
 *  another of its own), so all of them count. */
function ruleBody(css: string, selector: string): string {
  const bodies: string[] = [];
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const names = selectors.split(",").map((name) => name.trim());
    if (names.includes(selector)) bodies.push(body);
  }
  return bodies.join("\n");
}

describe("focus indicators", () => {
  const cases: Array<{ file: string; selector: string; label: string }> = [
    {
      file: "views/settings/appearance.module.css",
      selector: ".hexRow:focus-within",
      label: "custom theme hex input",
    },
    {
      file: "views/notebooks/notebooks.module.css",
      selector: ".searchBar:focus-within",
      label: "notebook hub search",
    },
    {
      file: "views/notebooks/notebooks.module.css",
      selector: ".chatInputRow:focus-within",
      label: "notebook studio chat box",
    },
    {
      file: "components/command/CommandPalette.module.css",
      selector: ".searchWrapper:focus-within",
      label: "command palette search",
    },
  ];

  for (const { file, selector, label } of cases) {
    it(`${label} shows an accent ring when focused (${selector})`, () => {
      const body = ruleBody(read(file), selector);
      expect(
        body,
        `${file} has no ${selector} rule. The input inside it sets ` +
          `outline: none, so without this the focus indicator is gone.`,
      ).not.toBe("");
      expect(body).toMatch(/--accent/);
    });
  }

  it("the analytics heatmap draws its focus ring in --accent, not --surface", () => {
    /* The grid is a real role="gridcell" grid with roving tabIndex, so
       keyboard navigation is a supported flow. Its only :focus-visible style
       used to be a 1.5px --surface halo shared with :hover — the same colour
       as the card behind the cell, and therefore invisible. */
    const css = read("views/analytics/analytics.module.css");
    const body = ruleBody(css, ".cell:focus-visible");
    expect(body).not.toBe("");
    expect(body).toMatch(/outline:[^;]*var\(--accent\)/);
  });
});
