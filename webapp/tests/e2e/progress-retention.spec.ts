import { test, expect, loginAs } from "./support/fixtures";

/* Progress › History › Memory & retention, in a real browser: the section
 * renders from seeded flashcards, the per-deck curves draw, and a deck with
 * too few reviews says so instead of showing a number. */

const DAY = 86_400_000;

function reviewed(userId: string, deck: string, daysAgo: number, interval: number) {
  const reviewDay = new Date(Date.now() - daysAgo * DAY);
  reviewDay.setHours(0, 0, 0, 0);
  const due = new Date(reviewDay);
  due.setDate(due.getDate() + interval);
  return {
    id: `${deck}-${daysAgo}-${interval}-${Math.random().toString(36).slice(2)}`,
    user_id: userId,
    deck_id: deck,
    front: "f",
    back: "b",
    next_review_date: due.toISOString(),
    srs_interval: interval,
    ease_factor: 2.5,
    stability: interval,
    difficulty: 5,
    created_at: new Date(Date.now() - 40 * DAY).toISOString(),
  };
}

test("shows retention from the scheduler's own forecast", async ({ page, backend }) => {
  const u = backend.user.id;
  backend.seed("flashcard_decks", [
    { id: "bio", user_id: u, title: "Cell biology", created_at: new Date().toISOString() },
    { id: "hist", user_id: u, title: "WW1 causes", created_at: new Date().toISOString() },
    { id: "chem", user_id: u, title: "Acids and alkalis", created_at: new Date().toISOString() },
  ]);
  backend.seed("flashcards", [
    reviewed(u, "bio", 1, 30),
    reviewed(u, "bio", 3, 21),
    reviewed(u, "bio", 2, 12),
    reviewed(u, "bio", 0, 4),
    reviewed(u, "hist", 9, 2),
    reviewed(u, "hist", 8, 3),
    reviewed(u, "hist", 3, 4),
    reviewed(u, "hist", 1, 2),
    reviewed(u, "chem", 1, 3),
  ]);

  await loginAs(page);
  await page.goto("analytics");
  const section = page.getByRole("region", { name: "Memory & retention" });
  await expect(section).toBeVisible({ timeout: 20_000 });

  await expect(section.getByText("Due now", { exact: true }).locator("..")).toContainText(/overdue/);
  await expect(section.getByRole("img", { name: /^WW1 causes: predicted recall/ })).toBeVisible();
  await expect(section.getByRole("img", { name: /^Cell biology: predicted recall/ })).toBeVisible();
  await expect(
    section.getByRole("row", { name: /Acids and alkalis/ }),
  ).toContainText("Not enough reviews yet (1 of 3)");

  // Hover a curve: the readout appears.
  const curve = section.getByRole("img", { name: /^WW1 causes/ });
  await curve.scrollIntoViewIfNeeded();
  const box = (await curve.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  await expect(section.getByText(/^In 15 days: \d+%$/)).toBeVisible();

  const shots = process.env.SCREENSHOT_DIR;
  if (shots) {
    await section.screenshot({ path: `${shots}/retention-dark.png` });
    await page.evaluate(() => document.body.classList.remove("dark-theme"));
    await section.screenshot({ path: `${shots}/retention-light.png` });
  }
});
