import { test, expect, signIn } from "./support/liveFixtures";

/* Live journey 0 — plumbing only, and deliberately free.
 *
 * Free-plan chat is fifteen calls a day, so nothing should ask the model
 * until sign-in, onboarding state and the chat panel are known to work.
 * A broken selector discovered during a real journey costs quota that does
 * not come back until midnight.
 *
 * Asks nothing. Spends nothing.
 */

test("the test account signs in and the tutor opens", async ({ page, live }) => {
  await signIn(page, live);

  const landedOn = new URL(page.url()).pathname;
  console.log(`[live] landed on: ${landedOn}`);

  /* A fresh account is sent to the setup wizard, which would swallow every
     later journey's clicks. Worth knowing before, not during. */
  const inSetup = landedOn.includes("welcome");
  console.log(`[live] needs onboarding: ${inSetup}`);

  if (!inSetup) {
    const ask = page.getByRole("button", { name: /ask/i }).first();
    const askVisible = await ask.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[live] Ask AI control present: ${askVisible}`);
    expect(askVisible, "no visible way into the tutor").toBe(true);

    await ask.click();
    await page.waitForTimeout(2000);

    const feed = page.locator("[role=log]").first();
    const input = page.getByLabel("AI chat input");
    const feedReady = await feed.isVisible({ timeout: 5000 }).catch(() => false);
    const inputReady = await input.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[live] transcript container: ${feedReady}, input: ${inputReady}`);

    /* What the panel says before anything is asked — the greeting is part
       of the first impression the rubric's teaching row will judge. */
    console.log(`[live] panel on open:\n${(await feed.innerText().catch(() => "")).slice(0, 400)}`);

    expect(feedReady && inputReady, "chat panel did not open ready to type").toBe(true);
  }

  await page.screenshot({ path: "tests/live/out/00-smoke.png" }).catch(() => {});
});
