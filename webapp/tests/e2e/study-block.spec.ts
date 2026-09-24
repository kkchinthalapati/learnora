import { test, expect, loginAs } from "./support/fixtures";
import type { MockBackend } from "./support/mockBackend";
import * as fx from "../../src/dev/fixtures";

/* The core study loop, end to end: Today names a topic, "Start 45 min"
 * starts a real 45-minute block, and when it ends the student is offered the
 * four-question check that feeds the forecast.
 *
 * The audit could only test the first half — nobody waits 45 minutes — so
 * the promise at the end ("The block ends with a four-question check") was
 * unverified. Playwright's clock jumps the page forward instead.
 *
 * Seeded from the dev harness fixtures (a Biology exam in six days, an
 * Enzymes deck with cards due) re-owned by the mock backend's user, so the
 * app's `user_id` filters match. */

function seedStudent(backend: MockBackend) {
  const own = <T extends object>(rows: readonly T[]) =>
    rows.map((row) => ({ ...row, user_id: backend.user.id }));
  backend.seed("folders", own(fx.folders));
  backend.seed("exams", own(fx.exams));
  backend.seed("flashcard_decks", own(fx.decks));
  backend.seed("flashcards", own(fx.flashcards));
  backend.seed("study_sessions", own(fx.sessions));
  backend.seed("tasks", own(fx.tasks));
}

test("Start 45 min runs the block, and its end offers the quick check", async ({
  page,
  backend,
}) => {
  seedStudent(backend);
  await page.clock.install();
  await loginAs(page);

  const hero = page.getByRole("region", { name: /Study .* next/ });
  await expect(hero).toBeVisible();
  const topic = (await hero.getByRole("heading", { level: 1 }).innerText())
    .replace(/^Study /, "")
    .replace(/ next$/, "");
  await hero.getByRole("button", { name: /^Start 45 min on / }).click();

  // "Start" means start: the clock is already running on arrival.
  await expect(page).toHaveURL(/\/timer$/);
  const clockBefore = await page.getByText(/^\d\d:\d\d$/).first().innerText();
  await page.clock.fastForward("00:05");
  await expect
    .poll(async () => page.getByText(/^\d\d:\d\d$/).first().innerText())
    .not.toBe(clockBefore);

  // The whole block: the timer page itself offers the check when it ends.
  await page.clock.fastForward("45:30");
  const done = page.getByRole("dialog", { name: "Lock in what you learned" });
  await expect(
    done.getByRole("heading", { name: `Session complete: ${topic}` }),
  ).toBeVisible();

  await done.getByRole("button", { name: "Start quick check" }).click();
  await expect(page.getByText(/Question 1 of \d/)).toBeVisible();
  expect(backend.callsTo("/functions/v1/learnora-ai").length).toBeGreaterThan(0);
});

test("Only have 20 min? starts a 20-minute block on the same topic", async ({
  page,
  backend,
}) => {
  seedStudent(backend);
  await loginAs(page);

  await page.getByRole("button", { name: "Only have 20 min?" }).click();
  await expect(page).toHaveURL(/\/timer$/);
  await expect(page.getByText(/^(19|20):\d\d$/).first()).toBeVisible();
});
