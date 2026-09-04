import {
  test,
  expect,
  loginAs,
  hasHorizontalOverflow,
  undersizedTapTargets,
} from "./support/fixtures";
import type { Row } from "./support/mockBackend";

/* Layout under a phone.
 *
 * These run in their own Playwright project (see playwright.config.ts) at a
 * Pixel 7's viewport and device pixel ratio rather than resizing mid-test: the
 * app reads the viewport when it mounts to decide between the sidebar and the
 * drawer, so a resize after load tests a state no real phone is ever in.
 *
 * What is being defended is specific: a student on a bus, one-handed, on a
 * 6-inch screen. Everything they must press has to be big enough to hit, and
 * nothing may push the page sideways.
 */

const MIN_TAP_TARGET = 44;

function quizRow(): Row {
  return {
    id: "quiz-1",
    title: "Biology basics",
    folder_id: null,
    material_id: null,
    created_at: "2026-09-01T00:00:00Z",
    questions_json: [
      {
        question: "Powerhouse of the cell?",
        choices: ["Nucleus", "Mitochondria", "Ribosome", "Golgi"],
        correctIndex: 1,
        topic: "Cells",
      },
    ],
  };
}

test.describe("Mobile", () => {
  test("every tap target on the dashboard is at least 44x44", async ({ page }) => {
    await loginAs(page);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    const offenders = await undersizedTapTargets(page, MIN_TAP_TARGET);

    /* WCAG 2.5.5 / Apple's HIG both land on 44px. Reported with sizes so a
       failure names the control rather than just the count. */
    expect(
      offenders,
      `Undersized tap targets: ${JSON.stringify(offenders, null, 2)}`,
    ).toEqual([]);
  });

  test("the dashboard does not scroll sideways", async ({ page }) => {
    await loginAs(page);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    expect(await hasHorizontalOverflow(page)).toBe(false);
  });

  test("the library fits the screen with content in it", async ({ page, backend }) => {
    backend.seed("folders", [
      { id: "f1", name: "Molecular Biology and Genetics", color: "#76d7b0", created_at: "2026-08-01T00:00:00Z" },
    ]);
    backend.seed("quizzes", [quizRow()]);
    await loginAs(page);
    await page.goto("library/quizzes");

    await expect(page.getByText("Biology basics")).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });

  test("navigation is reachable on a small screen", async ({ page }) => {
    await loginAs(page);

    /* The sidebar collapses on a phone; whatever replaces it has to actually
       open and take the student somewhere. */
    const menu = page
      .getByRole("button", { name: /menu|navigation|open sidebar/i })
      .first();
    await menu.click();

    const tasks = page.getByRole("link", { name: "Tasks" });
    await expect(tasks).toBeVisible();

    const box = await tasks.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TAP_TARGET);

    await tasks.click();
    await expect(page).toHaveURL(/\/tasks/);
  });

  test("quiz answers are tappable and on screen", async ({ page, backend }) => {
    backend.seed("quizzes", [quizRow()]);
    await loginAs(page);
    await page.goto("quiz/quiz-1");

    await expect(page.getByText("Question 1 of 1")).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);

    /* Four answer buttons a student has to hit while holding the phone —
       the single most tap-sensitive screen in the app. */
    for (const label of ["Nucleus", "Mitochondria", "Ribosome", "Golgi"]) {
      const choice = page.getByRole("button", { name: label, exact: true });
      const box = await choice.boundingBox();
      expect(box, `${label} has no box`).not.toBeNull();
      expect(box!.height, `${label} is ${box!.height}px tall`).toBeGreaterThanOrEqual(
        MIN_TAP_TARGET,
      );
      expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }

    await page.getByRole("button", { name: "Mitochondria", exact: true }).click();
    await expect(page.getByRole("button", { name: /See results/ })).toBeVisible();
  });
});
