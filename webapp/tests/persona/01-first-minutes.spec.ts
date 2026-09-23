import { test, expect, loginAs } from "../e2e/support/fixtures";
import { StudentLog } from "./support/record";

/* Journey 1 — "I just opened this thing."
 *
 * A Grade 9 student lands on Learnora for the first time, signs in, and tries
 * to work out what it is and what to do, without reading anything carefully.
 * Nothing here asserts a product opinion; it drives the app the way a
 * distracted 14-year-old would and records what the screen offered back.
 */

test("first minutes: land, look around, try the most obvious thing", async ({
  page,
}) => {
  const log = new StudentLog("01-first-minutes", page);

  log.did("Opened the app link a friend sent me");
  await log.timed("load login", async () => {
    await page.goto("login");
    await page.waitForLoadState("networkidle").catch(() => {});
  });
  log.saw(`Login screen text: ${await log.visibleText(600)}`);
  log.saw(`Things I could click: ${(await log.affordances()).join(" | ")}`);
  await log.shot("login");

  log.did("Typed my email and password and hit the button");
  await log.timed("sign in", async () => {
    await loginAs(page);
  });
  await log.shot("after-login");

  const landing = await log.visibleText(1800);
  log.saw(`First screen after logging in:\n${landing}`);
  log.saw(`Buttons on the first screen: ${(await log.affordances()).join(" | ")}`);

  /* The actual question a student has in the first ten seconds. Recorded as a
     fact about the screen, not as an assertion: whether a heading tells you
     what to do is a judgement for the report. */
  const heading = await page
    .getByRole("heading")
    .first()
    .innerText()
    .catch(() => "(no heading found)");
  log.saw(`Biggest heading: ${heading}`);

  log.thought("I don't really know what I'm supposed to do first here.");

  /* A 14-year-old clicks the thing that sounds most like what they want,
     which is not necessarily the thing the product wants them to click. */
  const tempting = ["Study tools", "Quiz me", "What next?", "Start", "Create"];
  for (const label of tempting) {
    const button = page.getByRole("button", { name: label }).first();
    const link = page.getByRole("link", { name: label }).first();
    if (await button.isVisible().catch(() => false)) {
      log.saw(`There is a button called "${label}"`);
    } else if (await link.isVisible().catch(() => false)) {
      log.saw(`There is a link called "${label}"`);
    }
  }

  log.did("Clicked Study tools in the sidebar because 'lab' sounded interesting");
  const studyLab = page.getByRole("link", { name: "Study tools" }).first();
  if (await studyLab.isVisible().catch(() => false)) {
    await log.timed("open study lab", async () => {
      await studyLab.click();
      await page.waitForLoadState("networkidle").catch(() => {});
    });
    await log.shot("study-lab");
    log.saw(`Study tools screen:\n${await log.visibleText(1600)}`);
    log.saw(`Study tools options: ${(await log.affordances()).join(" | ")}`);
  } else {
    log.saw("Could not find a Study tools link at all");
  }

  log.did("Hit the browser back button because I changed my mind");
  await page.goBack();
  await page.waitForLoadState("networkidle").catch(() => {});
  log.saw(`After going back I'm on: ${new URL(page.url()).pathname}`);
  await log.shot("after-back");

  log.write({
    finalUrl: page.url(),
    unhandledBackendCalls: [],
  });

  /* The only hard failure this journey claims: the app rendered a signed-in
     screen at all. Everything else is evidence for the report. */
  expect(page.url()).toContain("/app");
});
