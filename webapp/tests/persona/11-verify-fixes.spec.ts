import { test, expect, loginAs } from "../e2e/support/fixtures";
import { StudentLog } from "./support/record";

/* Journey 11 — did the fixes land, from the student's side.
 *
 * Re-checks the two things journey 02 could not do: find the tutor without
 * knowing a keyboard shortcut, and come back to a conversation after a
 * reload.
 */

test("a student can find the tutor without knowing any shortcut", async ({ page }) => {
  const log = new StudentLog("11-ask-entry", page);

  await loginAs(page);
  await page.waitForTimeout(1200);

  const ask = page.getByRole("button", { name: /ask/i }).first();
  const visible = await ask.isVisible({ timeout: 3000 }).catch(() => false);
  log.saw(`Is there a visible "Ask" control on the landing screen? ${visible}`);
  await log.shot("today-with-ask");

  log.did("Clicked it, the way a student who just wants to ask a question would");
  await ask.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);

  const input = page.getByRole("textbox").filter({ hasNot: page.locator("[readonly]") });
  const panelText = await log.visibleText(500);
  log.saw(`After clicking:\n${panelText}`);
  const canType = await input
    .last()
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  log.saw(`Somewhere to type a question? ${canType}`);
  await log.shot("chat-open");

  log.write({ askVisible: visible, canType });
  expect(visible).toBe(true);
});

test("the conversation is still there after a reload", async ({ page, backend }) => {
  const log = new StudentLog("11-chat-persist", page);

  backend.aiReply = () => "Osmosis is water moving through a membrane.";

  await loginAs(page);
  await page.waitForTimeout(1000);

  log.did("Opened the tutor and asked something");
  await page
    .getByRole("button", { name: /ask/i })
    .first()
    .click({ timeout: 5000 })
    .catch(() => {});
  await page.waitForTimeout(800);

  /* By its own label. A placeholder match picked up a different field on
     the page behind the panel and typed the question into thin air. */
  const box = page.getByLabel("AI chat input");
  await box.fill("what is osmosis");
  await box.press("Enter");
  await page.waitForTimeout(3000);

  const before = await log.visibleText(1200);
  log.saw(`Before reloading:\n${before}`);
  const askedBefore = before.includes("what is osmosis");
  log.saw(`My question is on screen: ${askedBefore}`);
  const stored = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.includes("chat"))
      .map((k) => `${k} => ${(localStorage.getItem(k) ?? "").slice(0, 120)}`),
  );
  log.saw(`Chat keys in storage before reload: ${JSON.stringify(stored)}`);
  await log.shot("before-reload");

  /* A full navigation to "/app/" rather than page.reload(): the app's home
     URL has no trailing slash, and the dev server 404s that with a base-URL
     notice. Production rewrites it (vercel.json), so reloading the bare
     path would be testing the dev server, not the app. This still tears
     down and rebuilds the JS context, which is what the check is about. */
  log.did("Reloaded the page, the way you do when something looks stuck");
  await page.goto("/app/");
  await page.waitForTimeout(3000);

  /* The panel does not reopen by itself; what matters is that reopening it
     shows the conversation rather than a blank slate. */
  await page
    .getByRole("button", { name: /ask/i })
    .first()
    .click({ timeout: 5000 })
    .catch(() => {});
  await page.waitForTimeout(1500);

  const after = await log.visibleText(1200);
  log.saw(`After reloading and reopening:\n${after}`);
  const survived = after.includes("what is osmosis");
  log.saw(`My question survived the reload: ${survived}`);
  await log.shot("after-reload");

  log.write({ askedBefore, survived });
  expect(askedBefore).toBe(true);
  expect(survived).toBe(true);
});
