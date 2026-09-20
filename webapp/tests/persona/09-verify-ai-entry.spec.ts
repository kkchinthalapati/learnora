import { test, expect, loginAs } from "../e2e/support/fixtures";
import { StudentLog } from "./support/record";

/* Journey 9 — verification pass.
 *
 * Two headline claims from the chat journey are serious enough to check
 * independently before they go in a report:
 *
 *   (a) a student cannot reach the AI chat from anything visible;
 *   (b) the dashboard's "What next?" AI card is absent.
 *
 * (b) is worth doubting in particular, because the repo's own e2e helper
 * `openDashboardAiActions` clicks the "Activity & Peers" tab and expects
 * "What next?" to be there — so either the card is conditional on having
 * data, or the helper is stale. Both accounts are therefore tested: an empty
 * one and a populated one.
 */

async function everyVisibleControl(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      "button, a[href], [role=button], [role=tab], [role=menuitem]",
    )) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const name =
        el.getAttribute("aria-label") ||
        el.textContent?.trim().replace(/\s+/g, " ").slice(0, 50) ||
        "";
      if (name) out.push(name);
    }
    return [...new Set(out)];
  });
}

test("can a student find the AI at all — empty account", async ({ page }) => {
  const log = new StudentLog("09-verify-ai-empty", page);

  await loginAs(page);
  await page.waitForTimeout(1200);

  const onToday = await everyVisibleControl(page);
  log.saw(`Controls on Today: ${onToday.join(" | ")}`);
  const aiish = onToday.filter((n) => /ai|ask|chat|tutor|assistant|what next/i.test(n));
  log.saw(`Anything that reads as AI on Today: ${aiish.join(" | ") || "NOTHING"}`);

  /* The dashboard, every tab. */
  await page.goto("dashboard");
  await page.waitForTimeout(1500);
  const tabs = await page.getByRole("tab").allInnerTexts().catch(() => []);
  log.saw(`Dashboard tabs: ${tabs.join(" | ")}`);

  const perTab: Record<string, string[]> = {};
  for (const tab of tabs) {
    await page
      .getByRole("tab", { name: tab })
      .click({ timeout: 3000 })
      .catch(() => {});
    await page.waitForTimeout(900);
    const controls = await everyVisibleControl(page);
    perTab[tab] = controls.filter((n) =>
      /ai|ask|chat|tutor|assistant|what next|quiz me/i.test(n),
    );
    log.saw(`Tab "${tab}" AI-ish controls: ${perTab[tab].join(" | ") || "NONE"}`);
  }
  await log.shot("dashboard-empty-account");

  log.write({ onToday: aiish, perTab });
  expect(page.url()).toContain("/app");
});

test("can a student find the AI at all — account with real data", async ({
  page,
  backend,
}) => {
  const log = new StudentLog("09-verify-ai-seeded", page);

  /* A student who has actually used the app: subjects, notes, a quiz with an
     attempt, decks, sessions, tasks, an exam. If the AI card is conditional
     on having something to talk about, this is the account that gets it. */
  backend.seed("folders", [
    { id: "f-bio", name: "Biology", user_id: backend.user.id, created_at: "2026-09-01T00:00:00Z" },
  ]);
  backend.seed("materials", [
    {
      id: "m-cells",
      title: "Chapter 3 - Cells",
      folder_id: "f-bio",
      user_id: backend.user.id,
      content: "Cells are the basic unit of life.",
      created_at: "2026-09-02T00:00:00Z",
    },
  ]);
  backend.seed("quizzes", [
    {
      id: "q-1",
      title: "Cells quiz",
      folder_id: "f-bio",
      material_id: "m-cells",
      questions_json: [
        { question: "Powerhouse?", choices: ["Nucleus", "Mitochondria"], correctIndex: 1, topic: "Cells" },
      ],
      created_at: "2026-09-03T00:00:00Z",
    },
  ]);
  backend.seed("quiz_attempts", [
    {
      id: "a-1",
      quiz_id: "q-1",
      score: 0,
      total: 1,
      weak_topics: ["Cells"],
      created_at: "2026-09-15T00:00:00Z",
      answers_json: [{ questionId: 0, chosenIndex: 0, correct: false, topic: "Cells" }],
    },
  ]);
  backend.seed("study_sessions", [
    {
      id: "s-1",
      user_id: backend.user.id,
      duration_minutes: 25,
      subject: "Biology",
      created_at: "2026-09-17T00:00:00Z",
    },
  ]);
  /* Column names matter here. An earlier run seeded `title`/`subject`, which
     the mock store happily accepted, and the Today route then died in
     `cleanDemandLabel` on `undefined.replace` — a crash produced entirely by
     the fixture. The live schema (checked) has tasks.text and exams.exam_name
     as NOT NULL, so real rows always carry them. */
  backend.seed("tasks", [
    {
      id: 1,
      user_id: backend.user.id,
      text: "Finish Biology notes",
      is_done: false,
      due_date: "2026-09-20",
    },
  ]);
  backend.seed("exams", [
    {
      id: 1,
      user_id: backend.user.id,
      exam_name: "Biology",
      exam_date: "2026-11-19",
      difficulty: "Medium",
      status: null,
    },
  ]);

  await loginAs(page);
  await page.waitForTimeout(1500);
  const onToday = (await everyVisibleControl(page)).filter((n) =>
    /ai|ask|chat|tutor|assistant|what next/i.test(n),
  );
  log.saw(`AI-ish controls on Today (seeded): ${onToday.join(" | ") || "NONE"}`);

  await page.goto("dashboard");
  await page.waitForTimeout(1800);
  const tabs = await page.getByRole("tab").allInnerTexts().catch(() => []);
  const perTab: Record<string, string[]> = {};
  for (const tab of tabs) {
    await page
      .getByRole("tab", { name: tab })
      .click({ timeout: 3000 })
      .catch(() => {});
    await page.waitForTimeout(1000);
    const controls = await everyVisibleControl(page);
    perTab[tab] = controls.filter((n) =>
      /ai|ask|chat|tutor|assistant|what next|quiz me/i.test(n),
    );
    log.saw(`Tab "${tab}" AI-ish controls: ${perTab[tab].join(" | ") || "NONE"}`);
  }
  await log.shot("dashboard-seeded-account");

  /* And the palette: does it offer the AI without knowing the `ai:` trick? */
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(900);
  const paletteText = await log.visibleText(900);
  log.saw(`Command palette on open:\n${paletteText}`);
  await log.shot("palette-open");

  await page.keyboard.type("ask");
  await page.waitForTimeout(800);
  log.saw(`Palette after typing "ask":\n${await log.visibleText(700)}`);
  await log.shot("palette-ask");

  log.write({ onToday, perTab });
  expect(page.url()).toContain("/app");
});
