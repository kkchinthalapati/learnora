import { test, expect, loginAs } from "../e2e/support/fixtures";
import { StudentLog } from "./support/record";

/* Journey 5 — "Where did my stuff go?"
 *
 * A Grade 9 student who has used Learnora for a couple of weeks comes back
 * after a break and tries to (a) resume last week's work, (b) understand what
 * each sidebar area is for, (c) find one specific note, (d) get un-lost
 * without the browser back button, and (e) survive URLs that don't exist.
 *
 * Nothing here judges AI output — the AI is stubbed. Everything recorded is
 * navigation, findability, persistence and continuity.
 */

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function daysAhead(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The command palette, specifically — Library has its own search boxes whose
 *  placeholders also say "Search", so a placeholder match is not enough. */
function palette(page: import("@playwright/test").Page) {
  return page.getByRole("dialog", { name: "Command Palette" });
}

/** Wait for the route's own content, not just the URL: lazy route chunks mean
 *  the address can change a beat before the screen does. */
async function settle(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(900);
}

/** Run a step, never let it kill the journey — the log must always be written. */
async function step(
  log: StudentLog,
  label: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    log.thought(
      `STEP FAILED (${label}): ${(err as Error).message.split("\n")[0].slice(0, 300)}`,
    );
  }
}

test("coming back after a week: can I find my way around and find my stuff?", async ({
  page,
  backend,
}) => {
  const log = new StudentLog("05-navigation", page);

  /* ------------------------------------------------ a fortnight of school */

  backend.seed("folders", [
    { id: "f-bio", name: "Biology", color: "#4A90E2", created_at: daysAgo(18) },
    { id: "f-maths", name: "Maths", color: "#76d7b0", created_at: daysAgo(17) },
    { id: "f-hist", name: "History", color: "#e2a04a", created_at: daysAgo(12) },
  ]);

  backend.seed("materials", [
    {
      id: "m-cells",
      folder_id: "f-bio",
      title: "Chapter 3 - Cells",
      type: "text",
      raw_content:
        "Cells are the basic unit of life. Mitochondria make ATP. The nucleus stores DNA.",
      storage_path: null,
      created_at: daysAgo(9),
    },
    {
      id: "m-photo",
      folder_id: "f-bio",
      title: "Chapter 4 - Photosynthesis",
      type: "text",
      raw_content: "Chlorophyll absorbs light. Light reactions happen in the thylakoid.",
      storage_path: null,
      created_at: daysAgo(6),
    },
    {
      id: "m-quad",
      folder_id: "f-maths",
      title: "Quadratic equations worksheet",
      type: "text",
      raw_content: "Solve x^2 + 5x + 6 = 0 by factorising.",
      storage_path: null,
      created_at: daysAgo(8),
    },
    {
      id: "m-ww1",
      folder_id: "f-hist",
      title: "Causes of World War 1",
      type: "text",
      raw_content: "Militarism, alliances, imperialism, nationalism.",
      storage_path: null,
      created_at: daysAgo(4),
    },
  ]);

  backend.seed("notes", [
    {
      id: "n-cells",
      material_id: "m-cells",
      markdown_content:
        "# Cells notes\n- Mitochondria = powerhouse\n- Nucleus holds DNA\n- Cell wall only in plants",
      html_content:
        "<h1>Cells notes</h1><ul><li>Mitochondria = powerhouse</li></ul>",
      created_at: daysAgo(9),
    },
    {
      id: "n-quad",
      material_id: "m-quad",
      markdown_content: "# Quadratics\nFactorise, then set each bracket to zero.",
      html_content: "<h1>Quadratics</h1>",
      created_at: daysAgo(8),
    },
  ]);

  backend.seed("quizzes", [
    {
      id: "q-cells",
      title: "Cells quick quiz",
      folder_id: "f-bio",
      material_id: "m-cells",
      questions_json: [
        {
          question: "Powerhouse of the cell?",
          choices: ["Nucleus", "Mitochondria", "Ribosome", "Golgi"],
          correctIndex: 1,
          topic: "Cells",
        },
      ],
      created_at: daysAgo(9),
    },
    {
      id: "q-ww1",
      title: "WW1 causes quiz",
      folder_id: "f-hist",
      material_id: "m-ww1",
      questions_json: [
        {
          question: "Which is NOT a cause of WW1?",
          choices: ["Militarism", "Alliances", "Television", "Nationalism"],
          correctIndex: 2,
          topic: "WW1",
        },
      ],
      created_at: daysAgo(4),
    },
  ]);

  backend.seed("quiz_attempts", [
    {
      id: "a-cells",
      quiz_id: "q-cells",
      score: 1,
      total: 1,
      weak_topics: [],
      created_at: daysAgo(8),
      answers_json: [{ questionId: 0, chosenIndex: 1, correct: true, topic: "Cells" }],
    },
  ]);

  backend.seed("flashcard_decks", [
    { id: "d-bio", folder_id: "f-bio", title: "Biology key words", created_at: daysAgo(9) },
    { id: "d-maths", folder_id: "f-maths", title: "Maths formulas", created_at: daysAgo(7) },
  ]);

  backend.seed("flashcards", [
    { id: "c1", deck_id: "d-bio", front: "Mitochondria", back: "Makes ATP", created_at: daysAgo(9) },
    { id: "c2", deck_id: "d-bio", front: "Chlorophyll", back: "Absorbs light", created_at: daysAgo(9) },
    { id: "c3", deck_id: "d-maths", front: "Area of circle", back: "pi r squared", created_at: daysAgo(7) },
  ]);

  backend.seed("study_sessions", [
    {
      id: "s1",
      task: "Revise Chapter 3 - Cells",
      folder_id: "f-bio",
      minutes: 25,
      timer_type: "pomodoro",
      started_at: daysAgo(8),
      created_at: daysAgo(8),
      notes: "Got through the diagram",
    },
    {
      id: "s2",
      task: "Maths homework",
      folder_id: "f-maths",
      minutes: 40,
      timer_type: "pomodoro",
      started_at: daysAgo(7),
      created_at: daysAgo(7),
      notes: null,
    },
  ]);

  backend.seed("tasks", [
    { id: 1, text: "Maths homework - quadratics sheet", is_done: false, due_date: daysAhead(2) },
    { id: 2, text: "Finish Biology Chapter 3 notes", is_done: false, due_date: daysAhead(1) },
    { id: 3, text: "Read History pages 40-48", is_done: true, due_date: null },
  ]);

  backend.seed("exams", [
    { id: 1, exam_name: "Biology Paper 1", exam_date: daysAhead(21), difficulty: "medium", status: "upcoming" },
    { id: 2, exam_name: "Maths End of Term", exam_date: daysAhead(35), difficulty: "hard", status: "upcoming" },
  ]);

  /* ------------------------------------- 1. log in and try to resume work */

  log.did("Opened Learnora again — I was doing Biology Chapter 3 last week");
  await log.timed("login (rough, dev server)", async () => {
    await loginAs(page);
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  await log.shot("01-landing");

  log.saw(`Landing URL: ${new URL(page.url()).pathname}`);
  const landingText = await log.visibleText(2500);
  log.saw(`Landing screen (Today) says:\n${landingText}`);
  log.saw(`Landing clickables: ${(await log.affordances()).join(" | ")}`);

  for (const clue of [
    "Chapter 3 - Cells",
    "Biology",
    "Maths homework",
    "Continue",
    "Resume",
    "Pick up where you left off",
    "Recent",
    "Jump back in",
  ]) {
    const present = landingText.includes(clue);
    log.saw(`Landing mentions "${clue}": ${present ? "YES" : "no"}`);
  }
  log.thought(
    "Question I actually have: is there anything here that takes me straight back to Chapter 3 - Cells?",
  );

  await step(log, "click a resume-looking control on Today", async () => {
    const resume = page
      .getByRole("link", { name: /Chapter 3|Continue|Resume|Pick up/i })
      .first();
    if (await resume.isVisible().catch(() => false)) {
      const label = (await resume.innerText()).replace(/\s+/g, " ").slice(0, 80);
      log.did(`Clicked "${label}" on Today to get back to last week's work`);
      await resume.click();
      await page.waitForLoadState("networkidle").catch(() => {});
      log.saw(`That took me to: ${new URL(page.url()).pathname}`);
      await log.shot("01b-resume-target");
      await page.goto("./");
      await page.waitForLoadState("networkidle").catch(() => {});
    } else {
      log.saw(
        "No link on Today mentioning Chapter 3 / Continue / Resume / Pick up — nothing offered to resume.",
      );
    }
  });

  /* ------------------------------------------- 2. tour of the six sections */

  const areas: { label: string; expect: string }[] = [
    { label: "Today", expect: "what I have to do today" },
    { label: "Library", expect: "all my notes and files" },
    { label: "Plan", expect: "my timetable / homework list" },
    { label: "Focus timer", expect: "a timer to stop me getting distracted" },
    { label: "Progress", expect: "my scores and how I'm doing" },
    { label: "Study tools", expect: "AI stuff that tests me" },
  ];

  for (const area of areas) {
    await step(log, `visit ${area.label}`, async () => {
      log.did(`Clicked "${area.label}" in the sidebar (I expect: ${area.expect})`);
      const link = page.getByRole("link", { name: area.label, exact: true }).first();
      if (!(await link.isVisible().catch(() => false))) {
        log.saw(`Could not see a sidebar link called exactly "${area.label}"`);
        return;
      }
      await log.timed(`open ${area.label} (rough, dev server)`, async () => {
        await link.click();
        await settle(page);
      });
      await log.shot(`02-${area.label.toLowerCase().replace(/\s+/g, "-")}`);
      log.saw(`${area.label} URL: ${new URL(page.url()).pathname}`);
      const heading = await page
        .getByRole("heading")
        .first()
        .innerText()
        .catch(() => "(no heading)");
      log.saw(`${area.label} biggest heading: ${heading.replace(/\s+/g, " ")}`);
      log.saw(`${area.label} screen:\n${await log.visibleText(1200)}`);
      log.saw(`${area.label} options: ${(await log.affordances()).slice(0, 40).join(" | ")}`);

      /* Which rail item the app thinks is current — a mismatch is the thing
         that makes a student feel lost without knowing why. */
      const current = await page
        .locator("[aria-current='page']")
        .allInnerTexts()
        .catch(() => []);
      log.saw(
        `${area.label}: sidebar highlights ${current.length} item(s): ${current
          .map((t) => t.replace(/\s+/g, " ").trim())
          .join(", ") || "(none)"}`,
      );
    });
  }

  /* -------------------------------- 3. find one specific seeded note/material */

  await step(log, "find Chapter 3 - Cells by clicking only", async () => {
    log.did("Starting from Today, trying to find 'Chapter 3 - Cells' by clicking only");
    await page.goto("./");
    await page.waitForLoadState("networkidle").catch(() => {});
    let clicks = 0;

    await page.getByRole("link", { name: "Library", exact: true }).first().click();
    clicks += 1;
    log.saw(`Immediately after the click the URL is ${new URL(page.url()).pathname}`);
    const instant = await page
      .getByRole("heading", { name: "Your learning" })
      .isVisible()
      .catch(() => false);
    log.saw(
      `Library's own heading "Your learning" painted instantly? ${instant ? "YES" : "NO — the previous page is still on screen for a moment"}`,
    );
    await log.timed("Library content appears (rough, dev server)", async () => {
      await page
        .getByRole("heading", { name: "Your learning" })
        .waitFor({ state: "visible", timeout: 15_000 })
        .catch(() => {});
    });
    await settle(page);
    log.saw(`Click ${clicks}: Library → ${new URL(page.url()).pathname}`);
    log.saw(`Library tabs/options: ${(await log.affordances()).slice(0, 30).join(" | ")}`);

    const filesTab = page.getByRole("tab", { name: /Files & notes/i }).first();
    if (await filesTab.isVisible().catch(() => false)) {
      await filesTab.click();
      clicks += 1;
      await settle(page);
      log.saw(`Click ${clicks}: "Files & notes" tab → ${new URL(page.url()).pathname}`);
    } else {
      log.saw("No tab called 'Files & notes' visible on Library");
    }

    const target = page.getByText("Chapter 3 - Cells").first();
    const found = await target.isVisible().catch(() => false);
    log.saw(`Is "Chapter 3 - Cells" visible now? ${found ? "YES" : "NO"}`);
    await log.shot("03-library-files");
    if (found) {
      await target.click();
      clicks += 1;
      await page.waitForLoadState("networkidle").catch(() => {});
      log.saw(`Click ${clicks}: opened it → ${new URL(page.url()).pathname}`);
      log.saw(`The opened thing shows:\n${await log.visibleText(900)}`);
      await log.shot("03-note-open");
      log.saw(`Total clicks from Today to my note: ${clicks} (no search used)`);
    } else {
      log.saw(`Gave up after ${clicks} clicks without seeing the note.`);
    }
  });

  /* --------------------------------------- 4. the search / command palette */

  await step(log, "command palette via the header button", async () => {
    log.did("Clicked the magnifying-glass / search control in the header");
    const search = page.getByRole("button", { name: "Search and command palette" }).first();
    if (await search.isVisible().catch(() => false)) {
      await search.click();
    } else {
      log.saw("No visible 'Search and command palette' button — using Ctrl+K instead");
      await page.keyboard.press("Control+k");
    }
    await page.waitForTimeout(500);
    await log.shot("04-palette-open");
    log.saw(`Palette opened showing:\n${await log.visibleText(1200)}`);

    log.did("Typed 'cells' to look for my Chapter 3 note");
    await page.keyboard.type("cells");
    await page.waitForTimeout(700);
    await log.shot("04-palette-cells");
    log.saw(`Results for "cells":\n${await log.visibleText(1200)}`);

    log.did("Cleared it and typed 'Maths' instead");
    for (let i = 0; i < 10; i += 1) await page.keyboard.press("Backspace");
    await page.keyboard.type("Maths");
    await page.waitForTimeout(700);
    await log.shot("04-palette-maths");
    log.saw(`Results for "Maths":\n${await log.visibleText(1200)}`);

    log.did("Pressed Escape to close the palette");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const stillOpen = await palette(page)
      .isVisible()
      .catch(() => false);
    log.saw(`Palette still open after Escape? ${stillOpen ? "YES" : "no"}`);
  });

  await step(log, "command palette via Ctrl+K", async () => {
    log.did("Tried the Ctrl+K shortcut a friend told me about");
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(500);
    const open = await palette(page)
      .isVisible()
      .catch(() => false);
    log.saw(`Ctrl+K opened the palette? ${open ? "YES" : "NO"}`);
    if (open) {
      log.did("Typed 'Biology' and pressed Enter on the first result");
      await page.keyboard.type("Biology");
      await page.waitForTimeout(700);
      log.saw(`Results for "Biology":\n${await log.visibleText(1000)}`);
      await page.keyboard.press("Enter");
      await settle(page);
      log.saw(`Enter on first result took me to: ${new URL(page.url()).pathname}`);
      log.saw(`Which shows:\n${await log.visibleText(700)}`);
      await log.shot("04-palette-enter-result");
    }
    await page.keyboard.press("Escape").catch(() => {});
  });

  /* --------------------------------------- 5. deliberately get lost, climb out */

  await step(log, "get lost deep, then climb out without browser back", async () => {
    log.did("Went deep on purpose: Library → Subjects → Biology → a material");
    await page.goto("library/folders");
    await settle(page);
    const bio = page.getByText("Biology", { exact: true }).first();
    if (await bio.isVisible().catch(() => false)) {
      await bio.click();
      await settle(page);
    }
    log.saw(`Now at: ${new URL(page.url()).pathname}`);
    log.saw(`Subject page shows:\n${await log.visibleText(1000)}`);

    const deep = page.getByText("Chapter 4 - Photosynthesis").first();
    if (await deep.isVisible().catch(() => false)) {
      await deep.click();
      await settle(page);
    } else {
      log.saw("Could not see 'Chapter 4 - Photosynthesis' on the Biology subject page");
    }
    const lostAt = new URL(page.url()).pathname;
    log.saw(`Deepest point: ${lostAt}`);
    await log.shot("05-deep");
    log.saw(`Way-out controls on screen: ${(await log.affordances()).slice(0, 40).join(" | ")}`);

    const escapes = ["Back", "Close", "Library", "Today", "Biology", "Learnora"];
    for (const name of escapes) {
      const el = page.getByRole("link", { name, exact: false }).first();
      const btn = page.getByRole("button", { name, exact: false }).first();
      const asLink = await el.isVisible().catch(() => false);
      const asButton = await btn.isVisible().catch(() => false);
      log.saw(`Escape route "${name}": ${asLink ? "link" : asButton ? "button" : "not on screen"}`);
    }

    log.did("Tried to get back to the start using only in-app controls (no browser back)");
    const homeLink = page.getByRole("link", { name: "Today", exact: true }).first();
    if (await homeLink.isVisible().catch(() => false)) {
      await homeLink.click();
      await page.waitForLoadState("networkidle").catch(() => {});
      log.saw(`In-app "Today" got me to: ${new URL(page.url()).pathname} — one tap.`);
    } else {
      log.saw("No 'Today' link visible from the deep page — would have to use browser back.");
    }
    await log.shot("05-back-at-start");
  });

  /* ---------------------------------------------- 6. browser back behaviour */

  await step(log, "browser back after navigating around", async () => {
    log.did("Navigated Today → Library → Focus, then hit browser back twice");
    await page.goto("./");
    await page.getByRole("link", { name: "Library", exact: true }).first().click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByRole("link", { name: "Focus timer", exact: true }).first().click();
    await page.waitForLoadState("networkidle").catch(() => {});
    log.saw(`Before back: ${new URL(page.url()).pathname}`);
    await page.goBack();
    await page.waitForLoadState("networkidle").catch(() => {});
    log.saw(`Back once → ${new URL(page.url()).pathname}`);
    await page.goBack();
    await page.waitForLoadState("networkidle").catch(() => {});
    log.saw(`Back twice → ${new URL(page.url()).pathname}`);
  });

  await step(log, "browser back with the command palette open", async () => {
    log.did("Opened the search palette and then hit browser back (phone habit)");
    await page.goto("library");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(400);
    const before = await palette(page)
      .isVisible()
      .catch(() => false);
    log.saw(`Palette open before back? ${before ? "YES" : "no"}`);
    await page.goBack();
    await page.waitForLoadState("networkidle").catch(() => {});
    const after = await palette(page)
      .isVisible()
      .catch(() => false);
    log.saw(
      `After browser back: URL ${new URL(page.url()).pathname}, palette still open? ${after ? "YES — back did not close it" : "no"}`,
    );
    await log.shot("06-back-with-palette");
    await page.keyboard.press("Escape").catch(() => {});
  });

  await step(log, "browser back after opening a Create modal", async () => {
    log.did("Opened a 'Create'/'New' modal, then hit browser back");
    await page.goto("library");
    await page.waitForLoadState("networkidle").catch(() => {});
    const create = page
      .getByRole("button", { name: /^(Create|New|Add)/i })
      .first();
    if (await create.isVisible().catch(() => false)) {
      const label = (await create.innerText()).replace(/\s+/g, " ").slice(0, 40);
      log.did(`Clicked "${label}"`);
      await create.click();
      await page.waitForTimeout(500);
      const dialogBefore = await page
        .getByRole("dialog")
        .first()
        .isVisible()
        .catch(() => false);
      log.saw(`A dialog opened? ${dialogBefore ? "YES" : "no"}`);
      await log.shot("06-modal-open");
      await page.goBack();
      await page.waitForLoadState("networkidle").catch(() => {});
      const dialogAfter = await page
        .getByRole("dialog")
        .first()
        .isVisible()
        .catch(() => false);
      log.saw(
        `After browser back: URL ${new URL(page.url()).pathname}, dialog still open? ${dialogAfter ? "YES — back left the modal up" : "no"}`,
      );
      await log.shot("06-modal-after-back");
      await page.keyboard.press("Escape").catch(() => {});
    } else {
      log.saw("No Create/New/Add button found on Library to open a modal with");
    }
  });

  await step(log, "browser back from the first app screen", async () => {
    log.did("Hit browser back repeatedly from Today, to see if I fall out of the app");
    await page.goto("./");
    await page.waitForLoadState("networkidle").catch(() => {});
    for (let i = 0; i < 3; i += 1) {
      await page.goBack().catch(() => {});
      await page.waitForLoadState("networkidle").catch(() => {});
      log.saw(`Back #${i + 1} → ${new URL(page.url()).pathname}`);
    }
    log.saw(`Screen after backing out:\n${await log.visibleText(600)}`);
    await log.shot("06-backed-out");
  });

  /* ----------------------------------------- 7. /dashboard vs Today */

  await step(log, "visit /dashboard directly", async () => {
    log.did("Typed /app/dashboard in the address bar (a link someone sent me)");
    await page.goto("dashboard");
    await settle(page);
    await log.shot("07-dashboard");
    log.saw(`Dashboard URL: ${new URL(page.url()).pathname}`);
    const heading = await page
      .getByRole("heading")
      .first()
      .innerText()
      .catch(() => "(no heading)");
    log.saw(`Dashboard heading: ${heading.replace(/\s+/g, " ")}`);
    log.saw(`Dashboard screen:\n${await log.visibleText(1800)}`);
    const current = await page
      .locator("[aria-current='page']")
      .allInnerTexts()
      .catch(() => []);
    log.saw(
      `On /dashboard the sidebar highlights ${current.length} item(s): ${current
        .map((t) => t.replace(/\s+/g, " ").trim())
        .join(", ") || "(none)"}`,
    );
    log.saw(`Sidebar has a link to /dashboard? ${
      (await page
        .locator('nav a[href$="/dashboard"]')
        .count()
        .catch(() => 0)) > 0
        ? "YES"
        : "NO"
    }`);
    log.thought(
      "From the screen alone, can I tell why this is different from Today?",
    );

    /* And the same check on Today itself, for the comparison. */
    await page.goto("./");
    await page.waitForLoadState("networkidle").catch(() => {});
    const todayCurrent = await page
      .locator("[aria-current='page']")
      .allInnerTexts()
      .catch(() => []);
    log.saw(
      `On / (Today) the sidebar highlights: ${todayCurrent
        .map((t) => t.replace(/\s+/g, " ").trim())
        .join(", ") || "(none)"}`,
    );

    log.did("Looked for 'Full dashboard' in the command palette");
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(400);
    await page.keyboard.type("dashboard");
    await page.waitForTimeout(600);
    log.saw(`Palette results for "dashboard":\n${await log.visibleText(900)}`);
    await log.shot("07-palette-dashboard");
    await page.keyboard.press("Escape").catch(() => {});
  });

  /* ------------------------------------------------- 8. URLs that don't exist */

  for (const bad of ["notes/does-not-exist", "totally-fake-page", "library/nonsense"]) {
    await step(log, `bad url ${bad}`, async () => {
      log.did(`Tried a URL that shouldn't work: /app/${bad}`);
      await page.goto(bad);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(800);
      await log.shot(`08-${bad.replace(/\W+/g, "-")}`);
      log.saw(`/app/${bad} shows:\n${await log.visibleText(900)}`);
      log.saw(`/app/${bad} offers: ${(await log.affordances()).slice(0, 25).join(" | ")}`);
      const current = await page
        .locator("[aria-current='page']")
        .allInnerTexts()
        .catch(() => []);
      log.saw(
        `/app/${bad}: sidebar highlights: ${current
          .map((t) => t.replace(/\s+/g, " ").trim())
          .join(", ") || "(none)"}`,
      );
      const wayHome = await page
        .getByRole("link", { name: /home|today|dashboard|back/i })
        .first()
        .isVisible()
        .catch(() => false);
      log.saw(`Is there an obvious way home on this screen? ${wayHome ? "YES" : "not a dedicated one"}`);
    });
  }

  /* ---------------------------------------------- 9. log out and back in */

  await step(log, "log out and back in", async () => {
    log.did("Logged out using the header control");
    await page.goto("./");
    await page.waitForLoadState("networkidle").catch(() => {});
    const logout = page.getByRole("button", { name: /log ?out|sign ?out/i }).first();
    if (await logout.isVisible().catch(() => false)) {
      await logout.click();
    } else {
      log.saw("No visible Log Out control in the header — looking in Settings");
      await page.goto("settings");
      await page.waitForLoadState("networkidle").catch(() => {});
      await page
        .getByRole("button", { name: /log ?out|sign ?out/i })
        .first()
        .click()
        .catch(() => {});
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(800);
    log.saw(`After logging out I'm on: ${new URL(page.url()).pathname}`);
    log.saw(`Logged-out screen:\n${await log.visibleText(600)}`);
    await log.shot("09-logged-out");

    log.did("Logged back in");
    await log.timed("second login (rough, dev server)", async () => {
      await loginAs(page);
    });
    await page.waitForLoadState("networkidle").catch(() => {});
    log.saw(`After logging back in I land on: ${new URL(page.url()).pathname}`);
    const back = await log.visibleText(1800);
    log.saw(`Screen after logging back in:\n${back}`);
    await log.shot("09-logged-back-in");

    log.did("Checked my stuff is still there: Library → Files & notes");
    await page.goto("library/materials");
    await page.waitForLoadState("networkidle").catch(() => {});
    for (const item of [
      "Chapter 3 - Cells",
      "Chapter 4 - Photosynthesis",
      "Quadratic equations worksheet",
    ]) {
      const there = await page
        .getByText(item)
        .first()
        .isVisible()
        .catch(() => false);
      log.saw(`"${item}" still in my Library? ${there ? "YES" : "NO"}`);
    }
    await log.shot("09-library-after-relogin");
  });

  /* ------------------------------------------------ 10. unmodelled endpoints */

  const unhandled = [...new Set(backend.unhandled)];
  log.saw(`backend.unhandled (${unhandled.length}): ${unhandled.join(" | ") || "(none)"}`);

  log.write({
    finalUrl: page.url(),
    unhandledBackendCalls: unhandled,
    seededTables: [
      "folders",
      "materials",
      "notes",
      "quizzes",
      "quiz_attempts",
      "flashcard_decks",
      "flashcards",
      "study_sessions",
      "tasks",
      "exams",
    ],
  });

  /* The only hard claim: the student ended up inside the signed-in app. */
  expect(page.url()).toContain("/app");
});
