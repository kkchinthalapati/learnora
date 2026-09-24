import { test, expect, loginAs } from "./support/fixtures";
import type { Page } from "@playwright/test";

/* Oral practice without a microphone, and without the AI.
 *
 * Real speech recognition cannot run in a headless browser (Chrome's needs
 * Google's servers), so these cover what a student on a school laptop or a
 * locked-down browser actually meets: no speech API at all. They also pin the
 * rule that a built-in stand-in must say it is one, and must never write the
 * local checker's guesses into the learning evidence or the misconception
 * ledger. */

async function withoutSpeechApi(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
  });
}

async function startOn(page: Page, topic: string) {
  await page.goto("viva");
  await page.getByPlaceholder(/Newton's third law/i).fill(topic);
  await page.getByRole("button", { name: "Start challenge" }).click();
}

test("works with no speech recognition: the mic explains, typing answers", async ({
  page,
  backend,
}) => {
  await withoutSpeechApi(page);
  await loginAs(page);
  await startOn(page, "Photosynthesis");

  await expect(page.getByLabel("Type response")).toBeVisible();
  await page.getByRole("button", { name: "Start speaking response" }).click();
  await expect(
    page.getByText(/Speech recognition is not supported in this browser/),
  ).toBeVisible();

  await page.getByLabel("Type response").fill(
    "Plants use light energy to turn carbon dioxide and water into glucose and oxygen.",
  );
  await page.getByRole("button", { name: "Submit" }).click();
  await expect
    .poll(() => backend.callsTo("/functions/v1/learnora-ai").length)
    .toBeGreaterThanOrEqual(2);
  /* The AI answered, so no stand-in notice. */
  await expect(page.getByText(/built-in practice questions/)).toHaveCount(0);
});

test("says so when the AI is down, and keeps the stand-in out of the ledger", async ({
  page,
  backend,
}) => {
  backend.stub("learnora-ai", 400, { error: "AI is temporarily unavailable." });
  await withoutSpeechApi(page);
  await loginAs(page);
  await startOn(page, "Photosynthesis");

  await expect(page.getByText(/AI isn't available right now/)).toBeVisible();
  await page.getByLabel("Type response").fill(
    "Plants use light energy to make glucose from carbon dioxide and water.",
  );
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByLabel("Type response")).toHaveValue("");

  /* Give any stray write time to land before asserting there was none. */
  await page.waitForTimeout(1500);
  const writes = (path: string) =>
    backend.callsTo(path).filter((c) => c.method !== "GET");
  expect(writes("/rest/v1/learning_events")).toHaveLength(0);
  expect(writes("/rest/v1/misconceptions")).toHaveLength(0);
});

test("a student who said Not now to AI is told why, and where to change it", async ({
  page,
  backend,
}) => {
  backend.user.aiConsent = false;
  await withoutSpeechApi(page);
  await loginAs(page);
  await startOn(page, "Photosynthesis");

  await page.getByRole("alertdialog").getByRole("button", { name: "Not now" }).click();
  await expect(
    page.getByText(/haven't allowed Learnora's AI to use your study data/),
  ).toBeVisible();
  await page.getByRole("link", { name: "Turn on AI in Settings" }).click();
  await expect(page.getByRole("tab", { name: /Privacy/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(backend.callsTo("/functions/v1/learnora-ai")).toHaveLength(0);
});
