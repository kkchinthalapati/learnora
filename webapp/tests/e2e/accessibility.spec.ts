import AxeBuilder from "@axe-core/playwright";
import { test, expect, loginAs } from "./support/fixtures";
import type { MockBackend } from "./support/mockBackend";
import * as fx from "../../src/dev/fixtures";

/* WCAG 2.1 A/AA on every main screen, with realistic data in it, plus a
 * keyboard-only walk through Today.
 *
 * The first scan of this suite found nested controls (task rows and calendar
 * days that were buttons containing buttons), an invalid list, and two
 * contrast failures; all fixed. This keeps it that way. */

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
  backend.seed("notebooks", own(fx.notebooks));
  backend.seed("materials", own(fx.materials));
}

async function expectNoViolations(page: import("@playwright/test").Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    where: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
  }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
}

for (const path of ["landing", "login", "signup"]) {
  test(`signed out: /${path} has no WCAG A/AA violations`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoViolations(page);
  });
}

const SIGNED_IN = [
  "",
  "library",
  "library/notebooks",
  "plan",
  "my-week",
  "exams",
  "tasks",
  "timer",
  "analytics",
  "trajectory",
  "dashboard",
  "study",
  "feynman",
  "viva",
  "solver",
  "exam-detective",
  "settings",
  "friends",
  "room",
  "quiz/q-1",
  "review/d-bio",
];

for (const path of SIGNED_IN) {
  test(`signed in: /${path} has no WCAG A/AA violations`, async ({ page, backend }) => {
    seedStudent(backend);
    await loginAs(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await expectNoViolations(page);
  });
}

test("keyboard only: Today can be walked with Tab, and focus is always visible", async ({
  page,
  backend,
}) => {
  seedStudent(backend);
  await loginAs(page);
  await page.waitForLoadState("networkidle");

  /* First stop is the skip link, so keyboard users can jump the sidebar. */
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();

  const problems: string[] = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const indicator =
        (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) ||
        cs.boxShadow !== "none";
      return {
        name: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40),
        visible: box.width > 0 && box.height > 0 && cs.visibility !== "hidden",
        indicator,
      };
    });
    if (!info) continue;
    if (!info.visible) problems.push(`invisible element focused: ${info.name}`);
    if (!info.indicator) problems.push(`no focus indicator: ${info.name}`);
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
