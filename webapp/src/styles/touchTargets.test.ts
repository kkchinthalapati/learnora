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

  /* A phone sweep across twenty signed-in routes found nine more controls
     under the floor, none of them caught by the two cases above: the
     dashboard's own tab strip at 33px, the onboarding card's dismiss at 42,
     the timer's soundscape toggles at 34, the notebook subject filters at 28,
     the leaderboard's range tabs at 29, the debugger's presets at 26, and the
     suggested-topic chips in Feynman and Viva at 24 — the smallest live
     buttons in the app.

     They are hand-rolled pills rather than the shared Chip, which does set the
     floor, so each carries its own `pointer: coarse` rule. Asserting on the
     CSS text keeps them from being lost the next time one of these modules is
     tidied; the phone-viewport sweep in tests/e2e/mobile.spec.ts is what
     measures the rendered result. */
  const coarseFloors: [string, string][] = [
    ["views/dashboard/dashboard.module.css", ".tabBtn"],
    ["views/timer/timer.module.css", ".soundButton"],
    ["views/friends/friends.module.css", ".periodTab"],
    ["views/notebooks/notebooks.module.css", ".filterPill"],
    ["views/debugger/CognitiveDebuggerView.module.css", ".presetPill"],
    ["views/feynman/FeynmanHubView.module.css", ".topicChip"],
    ["views/sparring/sparring.module.css", ".chipBtn"],
    ["views/sparring/sparring.module.css", ".audioToggleBtn"],
  ];

  it.each(coarseFloors)(
    "%s gives %s the 44px floor on a touch screen",
    (file, selector) => {
      const css = read(file);
      const coarse = /@media \(pointer:\s*coarse\)\s*\{([\s\S]*)\}/.exec(css);
      expect(coarse, `${file} has no (pointer: coarse) block`).not.toBeNull();
      expect(ruleBody(coarse![1], selector)).toMatch(
        /min-height:\s*var\(--touch-target-min\)/,
      );
    },
  );

  it("the onboarding card's dismiss button is sized from the token", () => {
    /* It was 42px square — near enough to look deliberate, and still under the
       floor, on the one control whose whole job is to be tapped once. */
    const body = ruleBody(
      read("views/dashboard/dashboard.module.css"),
      ".dismissBtn",
    );
    expect(body).toMatch(/width:\s*var\(--touch-target-min\)/);
    expect(body).toMatch(/height:\s*var\(--touch-target-min\)/);
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
