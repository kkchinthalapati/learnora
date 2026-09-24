import { test, expect } from "../e2e/support/fixtures";
import { StudentLog } from "./support/record";

/* Journey 7 — "my mate said try this, I've never seen it before."
 *
 * The genuine first contact: a Grade 9 student creating an account from
 * scratch and meeting the onboarding wizard, which journey 1 skipped by
 * signing into an account that already existed.
 *
 * Empty-field feedback is checked through the DOM's own validity state, not
 * by reading the page text: the form uses native `required`, and the
 * browser's validation bubble never appears in innerText — so a text-only
 * check would report "no feedback at all" about a form that does in fact
 * complain. That distinction is the difference between a real finding and a
 * fabricated one.
 */

/** A real Grade 9 student's date of birth: 14 years ago today. */
function dobAged(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

test("brand new student signs up and meets onboarding", async ({
  page,
  backend,
}) => {
  const log = new StudentLog("07-brand-new", page);

  log.did("Went to the app and looked for how to make an account");
  await log.timed("load signup", async () => {
    await page.goto("signup");
    await page.waitForLoadState("networkidle").catch(() => {});
  });
  await log.shot("signup");
  log.saw(`Sign-up screen asks for:\n${await log.visibleText(700)}`);

  /* How much is demanded before a student can get in at all. */
  const fieldCount = await page.locator("form input").count();
  log.saw(`Number of inputs on the sign-up form: ${fieldCount}`);

  log.did("Pressed 'Create Account' straight away with everything empty");
  const submit = page.getByRole("button", { name: /create account/i }).first();
  await submit.click().catch(() => {});
  await page.waitForTimeout(600);

  /* What the browser itself says, which is what the student actually sees as
     a bubble next to the first empty field. */
  const validity = await page.evaluate(() => {
    const out: { label: string; message: string }[] = [];
    for (const el of document.querySelectorAll<HTMLInputElement>("form input")) {
      if (!el.checkValidity()) {
        const label =
          document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`)
            ?.innerText ??
          el.getAttribute("aria-label") ??
          el.type;
        out.push({ label: label.replace(/\s+/g, " ").trim(), message: el.validationMessage });
      }
    }
    return out;
  });
  log.saw(
    `Browser blocked the submit on ${validity.length} field(s): ` +
      validity.map((v) => `${v.label} -> "${v.message}"`).join(" ; "),
  );
  log.saw(`Still on: ${new URL(page.url()).pathname}`);
  await log.shot("empty-submit");

  log.did("Filled it in the way a 14-year-old would, weak password first");
  await page.getByLabel("Full name").fill("Kai Mensah").catch(() => {});
  await page.getByLabel("Email").fill("kai.student@example.com").catch(() => {});
  await page.getByLabel("Date of birth").fill(dobAged(14)).catch(() => {});
  await page.getByLabel("Password", { exact: true }).fill("pass").catch(() => {});
  await page.waitForTimeout(400);
  log.saw(
    `Password hint with 'pass': ${await page
      .locator("form")
      .innerText()
      .then((t) => t.split("\n").find((l) => /weak|fair|strong|8\+/i.test(l)) ?? "(none)")
      .catch(() => "(unreadable)")}`,
  );

  log.did("Used a proper password and confirmed it");
  await page
    .getByLabel("Password", { exact: true })
    .fill("correct-horse-battery")
    .catch(() => {});
  await page
    .getByLabel("Confirm password")
    .fill("correct-horse-battery")
    .catch(() => {});

  /* AI consent moved out of sign-up (it is asked at first AI use), so there
     is no box to tick here any more. Record that, then submit once. */
  const consentBoxes = await page.locator('form input[type="checkbox"]').count();
  log.saw(`Consent checkboxes on the sign-up form: ${consentBoxes}`);
  log.did("Submitted the form");
  await log.timed("submit signup", async () => {
    await submit.click().catch(() => {});
    await page.waitForTimeout(3000);
  });
  log.saw(`After signing up: ${new URL(page.url()).pathname}`);
  log.saw(`Screen says:\n${await log.visibleText(900)}`);
  await log.shot("after-signup");

  /* Whether a fresh account is actually walked into setup, or dropped into
     an empty app to work it out alone. */
  const onWelcome = page.url().includes("welcome");
  log.saw(
    onWelcome
      ? "I was taken into a setup wizard automatically"
      : `I was NOT taken to setup; I'm on ${new URL(page.url()).pathname}`,
  );

  if (!onWelcome) {
    log.did("Went looking for the setup thing myself");
    await page.goto("welcome").catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
  }
  await log.shot("welcome-step-1");
  log.saw(`Setup screen 1:\n${await log.visibleText(1000)}`);
  log.saw(`My options: ${(await log.affordances()).join(" | ")}`);

  const skip = page.getByRole("button", { name: /skip/i }).first();
  log.saw(
    (await skip.isVisible().catch(() => false))
      ? "There IS a way to skip setup"
      : "No skip button visible on setup screen 1",
  );

  /* Count the screens between "I signed up" and "I can use the thing",
     clicking the first plausible option each time the way someone who is not
     reading does. */
  let clicks = 0;
  const headings: string[] = [];
  for (let i = 0; i < 15; i += 1) {
    if (!page.url().includes("welcome")) break;
    const heading = await page
      .getByRole("heading")
      .first()
      .innerText()
      .catch(() => "");
    if (heading && headings[headings.length - 1] !== heading) {
      headings.push(heading.replace(/\s+/g, " ").slice(0, 70));
    }

    const next = page
      .getByRole("button", { name: /next|continue|finish|done|let's go|start/i })
      .first();
    if (await next.isVisible().catch(() => false)) {
      await next.click().catch(() => {});
    } else {
      /* No explicit next: pick an answer, which is what these steps want. */
      const option = page
        .getByRole("button")
        .filter({ hasNotText: /skip|back|log ?out|collapse|expand|theme/i })
        .first();
      if (!(await option.isVisible().catch(() => false))) break;
      await option.click().catch(() => {});
    }
    clicks += 1;
    await page.waitForTimeout(500);
  }
  log.saw(`Setup screens I passed: ${headings.join(" -> ") || "(none)"}`);
  log.saw(`Clicks to finish setup: ${clicks}`);
  log.saw(`Setup dropped me on: ${new URL(page.url()).pathname}`);
  await log.shot("after-wizard");
  log.saw(`The app now shows me:\n${await log.visibleText(1200)}`);
  log.thought("Did all that setup actually get me anything useful?");

  log.write({
    unhandledBackendCalls: [...new Set(backend.unhandled)],
    finalUrl: page.url(),
    signupFieldCount: fieldCount,
    emptySubmitBlockedFields: validity,
    setupClicks: clicks,
    setupHeadings: headings,
  });

  expect(page.url()).toContain("/app");
});
