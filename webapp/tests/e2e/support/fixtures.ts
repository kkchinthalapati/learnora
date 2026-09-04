import { test as base, expect, type Page } from "@playwright/test";
import { MockBackend, captureStripeRedirects, type SeedUser } from "./mockBackend";

/* The shared world every critical-path test runs in: a mocked backend wired
 * into the page before the app loads, plus the handful of journeys that show
 * up in test after test (sign in, make a quiz, answer it).
 *
 * Helpers here are deliberately thin. A helper that swallows an assertion
 * hides the failure it was supposed to surface, so these navigate and type —
 * the expectations stay in the tests, where a reader can see what is being
 * claimed. */

export interface Fixtures {
  backend: MockBackend;
  stripeRedirects: string[];
}

export const test = base.extend<Fixtures>({
  backend: async ({ page }, use) => {
    const backend = new MockBackend();
    await backend.install(page);
    await use(backend);
  },

  stripeRedirects: async ({ page }, use) => {
    const seen: string[] = [];
    await captureStripeRedirects(page, seen);
    await use(seen);
  },
});

export { expect };
export const TEST_PASSWORD = "correct-horse-battery";

/* --------------------------------------------------------------- journeys */

/** Sign in through the real form, and wait until the app has actually rendered
 *  a signed-in screen.
 *
 * Driving the form rather than injecting a session into localStorage is on
 * purpose: the session shape is supabase-js's private business, and a fixture
 * that guesses it would keep passing after an upgrade changed it while the
 * real sign-in broke. This way every test also re-proves that login works. */
export async function loginAs(
  page: Page,
  email = "free@test.com",
  password: string = TEST_PASSWORD,
): Promise<void> {
  await page.goto("login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /Log In|Sign In/i }).click();
  await expect(page.getByRole("navigation").first()).toBeVisible({ timeout: 20_000 });
}

/** Ask the assistant for something and wait for the round trip to finish.
 *  Returns the text the app displayed, so the caller can assert on it. */
export async function askAssistant(page: Page, prompt: string): Promise<void> {
  const input = page.getByPlaceholder(/ask|message|question/i).first();
  await input.fill(prompt);
  await input.press("Enter");
}

/** Convenience for the mobile checks: every element that a finger has to hit
 *  must be at least 44x44 CSS pixels (WCAG 2.5.5 / Apple HIG). Returns the
 *  ones that are not, with enough detail to fix them. */
export async function undersizedTapTargets(
  page: Page,
  minimum = 44,
): Promise<{ label: string; width: number; height: number }[]> {
  return page.evaluate((min) => {
    const offenders: { label: string; width: number; height: number }[] = [];
    const candidates = document.querySelectorAll<HTMLElement>(
      "button, a[href], input[type=checkbox], input[type=radio], [role=button], [role=tab], [role=switch]",
    );
    for (const element of candidates) {
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        continue;
      }
      const box = element.getBoundingClientRect();
      // Zero-sized elements are not rendered at all (collapsed menus, offscreen
      // panels); an unhittable target is only a defect if it is on screen.
      if (box.width === 0 || box.height === 0) continue;
      if (box.bottom < 0 || box.top > window.innerHeight) continue;

      /* Inline links inside a paragraph are exempt: WCAG 2.5.5's own
         exception for targets in a sentence, where enlarging them would
         break the text they belong to. */
      const parentTag = element.parentElement?.tagName ?? "";
      const isInlineLink =
        element.tagName === "A" && ["P", "LI", "SPAN", "LABEL"].includes(parentTag);
      if (isInlineLink) continue;

      if (box.width < min || box.height < min) {
        offenders.push({
          label:
            element.getAttribute("aria-label") ||
            element.textContent?.trim().slice(0, 40) ||
            `<${element.tagName.toLowerCase()}>`,
          width: Math.round(box.width),
          height: Math.round(box.height),
        });
      }
    }
    return offenders;
  }, minimum);
}

/** True when the document scrolls sideways — the layout defect that makes a
 *  phone user swipe the whole page to read a table. */
export async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    // A pixel of tolerance: sub-pixel rounding on a scaled viewport is not a
    // layout bug, and asserting on an exact equality makes the test flaky.
    return doc.scrollWidth > doc.clientWidth + 1;
  });
}
