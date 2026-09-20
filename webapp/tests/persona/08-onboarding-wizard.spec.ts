import { test, expect, loginAs } from "../e2e/support/fixtures";
import { StudentLog } from "./support/record";

/* Journey 8 — the first-run setup wizard.
 *
 * Journey 7 proved a real sign-up ends at "check your email", so the wizard
 * is unreachable that way in a mocked run. The app decides to show it from
 * the session's own `created_at` and `user_metadata.onboarding`
 * (src/lib/onboarding.ts, `shouldOnboard`), and the mock's canned account is
 * dated 2026-01-01 — before the feature shipped — so it is grandfathered
 * past the wizard.
 *
 * Rewriting the auth responses to an account created just now is therefore
 * not cheating the test; it is the only way to stand where a real new
 * student stands. Nothing about the wizard itself is faked.
 */

test("first-run setup wizard, as an impatient new student", async ({
  page,
  backend,
}) => {
  test.setTimeout(240_000);
  const log = new StudentLog("08-onboarding-wizard", page);

  /* Make the signed-in account look brand new: created now, never onboarded. */
  const freshUser = () => {
    const base = backend.authUser() as Record<string, unknown>;
    return {
      ...base,
      created_at: new Date().toISOString(),
      user_metadata: { full_name: "Kai Mensah", dob: "2011-05-02", consent_given: true },
    };
  };
  backend.intercept(async ({ url, route, method }) => {
    if (!url.pathname.startsWith("/auth/v1/")) return false;
    const endpoint = url.pathname.replace("/auth/v1/", "");
    if (endpoint === "token") {
      const session = backend.session() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ ...session, user: freshUser() }),
      });
      return true;
    }
    if (endpoint === "user" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(freshUser()),
      });
      return true;
    }
    return false;
  });

  log.did("Signed in for the very first time");
  await log.timed("login as new account", async () => {
    await page.goto("login");
    await page.getByLabel("Email").fill("kai.student@example.com");
    await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
    await page.getByRole("button", { name: /Log In|Sign In/i }).click();
    await page.waitForTimeout(2500);
  });

  const landed = new URL(page.url()).pathname;
  log.saw(`A brand new account lands on: ${landed}`);
  await log.shot("landed");

  if (!landed.includes("welcome")) {
    log.saw("Was NOT sent into setup automatically; going there directly");
    await page.goto("welcome").catch(() => {});
    await page.waitForTimeout(1200);
  }

  log.saw(`Setup screen 1:\n${await log.visibleText(1200)}`);
  log.saw(`What I can tap: ${(await log.affordances()).join(" | ")}`);
  await log.shot("wizard-1");

  const skip = page.getByRole("button", { name: /skip/i }).first();
  const hasSkip = await skip.isVisible().catch(() => false);
  log.saw(hasSkip ? "There is a Skip option" : "No Skip option visible");

  /* Walk it the way someone who is not reading does: take the first offered
     answer on each step and keep pressing forward. Hard deadline, because a
     step that never advances is itself the finding — and a timed-out run
     writes no evidence at all. */
  const headings: string[] = [];
  let clicks = 0;
  let stuck = false;
  const deadline = Date.now() + 45_000;
  for (let i = 0; i < 14; i += 1) {
    if (Date.now() > deadline) {
      stuck = true;
      log.saw("Gave up: still in setup after 45 seconds of pressing forward");
      break;
    }
    if (!page.url().includes("welcome")) break;

    const heading = await page
      .getByRole("heading")
      .first()
      .innerText()
      .catch(() => "");
    const clean = heading.replace(/\s+/g, " ").slice(0, 70);
    if (clean && headings[headings.length - 1] !== clean) headings.push(clean);

    /* Pick an answer if the step offers choices, then advance. Every query
       is given a short explicit timeout: the default would spend ten seconds
       per miss and the run would die before writing anything down. */
    const quick = { timeout: 1500 } as const;
    const option = page
      .locator("button, [role=radio], [role=checkbox]")
      .filter({ hasNotText: /skip|back|next|continue|finish|log ?out|theme|collapse|expand/i })
      .first();
    if (await option.isVisible(quick).catch(() => false)) {
      await option.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(200);
    }

    /* Anchored: an earlier run matched the "Direct coach" answer, whose
       description ends "...and what to do next", and pressed it fourteen
       times instead of advancing. The forward control is its own short
       label, so require the whole name to be one. */
    const next = page
      .getByRole("button", {
        name: /^\s*(next|continue|finish|done|let's go|get started|let's set it up|create it and finish)\s*$/i,
      })
      .first();
    if (await next.isVisible(quick).catch(() => false)) {
      const label = await next.innerText(quick).catch(() => "");
      await next.click({ timeout: 3000 }).catch(() => {});
      log.did(`Pressed "${label.replace(/\s+/g, " ").trim()}"`);
      clicks += 1;
    } else if (await option.isVisible(quick).catch(() => false)) {
      clicks += 1;
    } else {
      log.saw("No way forward I could find on this step");
      break;
    }
    await page.waitForTimeout(400);
  }

  log.saw(`Setup steps: ${headings.join(" -> ") || "(none seen)"}`);
  log.saw(`Number of steps: ${headings.length}, clicks to get through: ${clicks}`);
  log.saw(`Setup finished on: ${new URL(page.url()).pathname}`);
  await log.shot("wizard-done");
  log.saw(`The app after setup:\n${await log.visibleText(1400)}`);
  log.thought(
    "Setup asked me things — did the app actually change because of my answers?",
  );

  /* Coming back: does a finished wizard stay finished, or nag again? */
  log.did("Refreshed the page to see if it makes me do setup again");
  await page.reload().catch(() => {});
  await page.waitForTimeout(1500);
  log.saw(`After refresh I'm on: ${new URL(page.url()).pathname}`);
  await log.shot("after-refresh");

  log.write({
    landedOn: landed,
    hasSkip,
    stepHeadings: headings,
    clicks,
    stuck,
    finalUrl: page.url(),
    unhandledBackendCalls: [...new Set(backend.unhandled)],
  });

  expect(page.url()).toContain("/app");
});
