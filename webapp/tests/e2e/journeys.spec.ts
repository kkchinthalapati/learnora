import { test, expect, loginAs } from "./support/fixtures";
import type { MockBackend } from "./support/mockBackend";
import * as fx from "../../src/dev/fixtures";

/* Journeys the persona audit found no test for: a whole flashcard review to
 * its recap, sitting a mock exam to its score, and coming back to the app
 * after days away. Each one broke at least once in that audit — the mock
 * exam fixture had no questions, and a returning student's old tasks read
 * as due today — so they stay covered end to end. */

function seedStudent(backend: MockBackend) {
  const own = <T extends object>(rows: readonly T[]) =>
    rows.map((row) => ({ ...row, user_id: backend.user.id }));
  backend.seed("folders", own(fx.folders));
  backend.seed("exams", own(fx.exams));
  backend.seed("flashcard_decks", own(fx.decks));
  backend.seed("flashcards", own(fx.flashcards));
  backend.seed("study_sessions", own(fx.sessions));
  backend.seed("tasks", own(fx.tasks));
  backend.seed("quizzes", own(fx.quizzes));
  backend.seed("quiz_attempts", own(fx.quizAttempts));
  backend.seed("materials", own(fx.materials));
}

test("a flashcard review runs from the first card to the recap", async ({
  page,
  backend,
}) => {
  seedStudent(backend);
  await loginAs(page);
  await page.goto("review/d-bio");

  await page.getByRole("button", { name: "Start review" }).click();

  for (let i = 0; i < 20; i++) {
    const recap = page.getByRole("heading", { name: /Review Complete/ });
    if (await recap.isVisible()) break;
    await page.getByRole("button", { name: "Flip card to see the answer" }).click();
    await page.getByRole("button", { name: "Good (3)" }).click();
  }

  await expect(page.getByRole("heading", { name: /Review Complete/ })).toBeVisible();
  expect(Number(await page.getByLabel("Good count").innerText())).toBeGreaterThan(0);
});

test("a mock exam can be sat to its score", async ({ page, backend }) => {
  seedStudent(backend);
  await loginAs(page);
  await page.goto("quiz/q-1/mock-exam");

  await page.getByRole("button", { name: /Begin Mock Exam/ }).click();
  await expect(page.getByText(/Question 1 of \d+/)).toBeVisible();

  /* The fixture's two questions, answered right then wrong. */
  await page.getByRole("button", { name: "Catalysts" }).click();
  await expect(page.getByText("Question 2 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Speed it up forever" }).click();

  await expect(page.getByRole("heading", { name: "Exam Complete!" })).toBeVisible();
  await expect(page.getByText("1 / 2 correct")).toBeVisible();
});

test("coming back after five days, old tasks read as overdue, not due today", async ({
  page,
  backend,
}) => {
  seedStudent(backend);
  const later = new Date();
  later.setDate(later.getDate() + 5);
  later.setHours(17, 0, 0, 0);
  await page.clock.install({ time: later });
  await loginAs(page);

  await expect(
    page.getByText(/Overdue since/).first(),
  ).toBeVisible();
});
