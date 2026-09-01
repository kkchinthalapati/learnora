import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/*
 * Touch-target guard.
 *
 * tokens.css declares `--touch-target-min: 44px` and says it applies
 * "globally", but nothing enforced it. Two of the most-used controls in the
 * app missed: the settings toggle at 44x24, and every modal's close button at
 * roughly 34px square.
 *
 * The toggle is the interesting case — growing the track to 44px tall would
 * wreck the switch's proportions, so the *hit area* is stretched past the
 * visible track with a pseudo-element instead. That is easy to lose in a
 * later cleanup ("this ::after has no styles, delete it"), which is exactly
 * what this test is here to catch.
 *
 * Source text rather than rendered styles, for the same reason as
 * drift.test.ts and focusVisible.test.ts: jsdom applies no stylesheets.
 */

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return readFileSync(join(srcDir, rel), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
}

function ruleBody(css: string, selector: string): string {
  const bodies: string[] = [];
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const names = selectors.split(",").map((name) => name.trim());
    if (names.includes(selector)) bodies.push(body);
  }
  return bodies.join("\n");
}

describe("touch targets", () => {
  it("the settings toggle stretches its hit area to the 44px floor", () => {
    const css = read("components/ToggleSwitch.module.css");
    const body = ruleBody(css, ".toggleSlider::after");
    expect(
      body,
      "ToggleSwitch has no .toggleSlider::after rule. The visible track is " +
        "44x24; without this the tappable area is 24px tall, under the " +
        "--touch-target-min the app commits to.",
    ).not.toBe("");
    expect(body).toMatch(/--touch-target-min/);
  });

  it("the modal close button meets the floor in both dimensions", () => {
    const body = ruleBody(read("components/Modal.module.css"), ".close");
    expect(body).toMatch(/min-width:\s*var\(--touch-target-min\)/);
    expect(body).toMatch(/min-height:\s*var\(--touch-target-min\)/);
  });

  it("a disabled toggle looks disabled", () => {
    /* The component accepts `disabled` and had no style for it, so a locked
       switch was pixel-identical to a live one — users clicked repeatedly
       with nothing to tell them why nothing happened. */
    const css = read("components/ToggleSwitch.module.css");
    const body = ruleBody(css, ".toggleSwitch input:disabled + .toggleSlider");
    expect(body).not.toBe("");
    expect(body).toMatch(/opacity/);
    expect(body).toMatch(/cursor:\s*not-allowed/);
  });
});
