import { test, expect, loginAs, undersizedTapTargets } from "../e2e/support/fixtures";
import { StudentLog } from "./support/record";

/* Journey 13 — the phone-sized P3 fixes.
 *
 * Tap targets are the one class of finding that cannot be checked in
 * jsdom: nothing there has a size. The Solver's example chips measured
 * 26px against the 44px floor, sitting directly under the field the
 * student is aiming for, so a near-miss types into the wrong place.
 */

test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

test("the Solver's example chips are thumb-sized on a phone", async ({ page }) => {
  const log = new StudentLog("13-p3-mobile", page);

  await loginAs(page);
  await page.goto("solver");
  await page.waitForTimeout(2000);

  const chips = page.locator('[data-testid^="preset-btn-"]');
  await chips.first().waitFor({ state: "visible", timeout: 10_000 });

  const sizes = await chips.evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return {
        label: (node.textContent ?? "").trim().slice(0, 30),
        height: Math.round(box.height),
        width: Math.round(box.width),
      };
    }),
  );
  log.saw(`Example chips: ${JSON.stringify(sizes)}`);

  const tooShort = sizes.filter((s) => s.height < 44);
  log.saw(`Below the 44px floor: ${tooShort.length} of ${sizes.length}`);

  /* And the page as a whole, so raising the chips has not pushed anything
     off the side. */
  const offenders = await undersizedTapTargets(page, 44);
  log.saw(`Other undersized targets on screen: ${JSON.stringify(offenders)}`);

  log.write({ sizes, tooShort });

  expect(sizes.length).toBeGreaterThan(0);
  expect(
    tooShort,
    `chips under 44px: ${JSON.stringify(tooShort)}`,
  ).toEqual([]);
});
