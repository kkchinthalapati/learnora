import { test, expect, loginAs } from "../e2e/support/fixtures";
import { StudentLog } from "./support/record";

/* Journey 3 — "I have a test soon, quiz me."
 *
 * An impatient Grade 9 student who cares about marks. Everything here is
 * observation: the assertions are the bare minimum needed to keep the run
 * moving, and every risky interaction is wrapped so the log always gets
 * written.
 *
 * The AI is stubbed, so nothing in the log says anything about the quality of
 * generated questions — only about the interface around them.
 */

const log = { current: null as StudentLog | null };

/* networkidle never fires against a Vite dev server with an open HMR socket,
 * so each wait would burn its full 30s timeout. A short settle is enough. */
async function settle(page: import("@playwright/test").Page, ms = 900) {
  await page.waitForTimeout(ms);
}

async function textOf(page: import("@playwright/test").Page, sel: string) {
  return page
    .locator(sel)
    .first()
    .innerText()
    .catch(() => "(not present)");
}

/* ------------------------------------------------------- 1. finding a quiz */

test("finding a quiz, taking it badly, and reading the result", async ({
  page,
  backend,
}) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(8_000);
  page.setDefaultNavigationTimeout(20_000);
  const l = new StudentLog("03-quiz", page);
  log.current = l;

  l.did("Logged in — I've got a bio test tomorrow and I want to be quizzed.");
  await l.timed("sign in", () => loginAs(page));
  await settle(page);

  l.saw(`Landing screen:\n${await l.visibleText(1200)}`);
  const first = await l.affordances();
  l.saw(`Everything clickable on the landing screen: ${first.join(" | ")}`);
  const quizish = first.filter((a) => /quiz|test|practice|check/i.test(a));
  l.saw(
    quizish.length
      ? `Things with "quiz/test/practice/check" in them: ${quizish.join(" | ")}`
      : "NOTHING on the landing screen has the word quiz/test/practice/check in it.",
  );
  await l.shot("today");

  /* The impatient move: hit the big Create button in the sidebar and see if a
     quiz is on offer, rather than reading the nav. */
  l.did("Clicked the big Create button in the sidebar, hoping for 'quiz'.");
  try {
    await page.getByRole("button", { name: /^Create/i }).first().click();
    await page.waitForTimeout(800);
    l.saw(`Create panel:\n${await l.visibleText(1200)}`);
    l.saw(`Create panel options: ${(await l.affordances()).join(" | ")}`);
    await l.shot("create-modal");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  } catch (e) {
    l.saw(`Couldn't open the Create panel: ${String(e).slice(0, 200)}`);
  }

  l.did("Gave up on that and clicked 'Library' in the sidebar.");
  try {
    await page.getByRole("link", { name: "Library", exact: true }).first().click();
    await settle(page);
    l.saw(`Library screen (${new URL(page.url()).pathname}):\n${await l.visibleText(1200)}`);
    l.saw(`Library options: ${(await l.affordances()).join(" | ")}`);
    await l.shot("library");
  } catch (e) {
    l.saw(`Library link didn't work: ${String(e).slice(0, 200)}`);
  }

  l.did("Looked for anything called Quizzes and clicked it.");
  let reachedQuizzes = false;
  for (const name of [/^Quizzes$/i, /Quizzes/i]) {
    const candidate = page.getByRole("link", { name }).first();
    const tab = page.getByRole("tab", { name }).first();
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click().catch(() => {});
      reachedQuizzes = true;
      break;
    }
    if (await tab.isVisible().catch(() => false)) {
      await tab.click().catch(() => {});
      reachedQuizzes = true;
      break;
    }
  }
  await settle(page);
  l.saw(
    reachedQuizzes
      ? `Clicked through to ${new URL(page.url()).pathname}`
      : "Could not find a Quizzes link/tab by name; typing the URL instead.",
  );
  if (!new URL(page.url()).pathname.includes("quiz")) {
    await page.goto("library/quizzes");
    await settle(page);
    l.did("Typed /library/quizzes into the address bar (a student can't do this).");
  }
  l.saw(`Quizzes screen:\n${await l.visibleText(1200)}`);
  l.saw(`Quizzes screen options: ${(await l.affordances()).join(" | ")}`);
  await l.shot("quizzes-empty");

  /* ------------------------------------------------- 2. generating a quiz */

  l.did("Clicked 'Create a quiz'.");
  let generated = false;
  try {
    await page.getByRole("button", { name: /Create a quiz/i }).first().click();
    const wizard = page.getByRole("dialog");
    await wizard.waitFor({ timeout: 10_000 });
    l.saw(`Quiz creation panel:\n${(await wizard.innerText()).slice(0, 1200)}`);
    l.saw(`Panel options: ${(await l.affordances()).join(" | ")}`);
    await l.shot("create-quiz-panel");

    l.did("Picked the 'Topic' tab and typed 'Photosynthesis'.");
    await wizard.getByRole("tab", { name: /Topic/ }).click();
    await wizard.getByLabel("Topic").fill("Photosynthesis");
    l.saw(`After typing a topic:\n${(await wizard.innerText()).slice(0, 900)}`);

    l.did("Hit the submit button.");
    await l.timed("generate quiz (stubbed AI)", async () => {
      await wizard.getByRole("button", { name: /Generate Study Resources|Create my study kit/i }).click();
      await expect
        .poll(() => backend.table("quizzes").length, { timeout: 45_000 })
        .toBeGreaterThan(0);
    });
    /* What the screen showed while waiting is the interesting part. */
    l.saw(`Right after submitting:\n${await l.visibleText(900)}`);
    await page.waitForTimeout(1500);
    generated = true;
  } catch (e) {
    l.saw(`Quiz generation path failed: ${String(e).slice(0, 300)}`);
  }

  let quizId = "quiz-1";
  let questions: {
    question: string;
    choices: string[];
    correctIndex: number;
    topic?: string;
  }[] = [];

  if (generated && backend.table("quizzes").length > 0) {
    const row = backend.table("quizzes")[0] as Record<string, unknown>;
    quizId = String(row.id);
    questions = (row.questions_json as typeof questions) ?? [];
    l.saw(
      `The app saved a quiz titled "${String(row.title)}" with ${questions.length} question(s).`,
    );
    l.saw(`After generating I'm on: ${new URL(page.url()).pathname}`);
    await l.shot("after-generate");
  } else {
    l.saw("Falling back to a pre-made quiz so the rest of the journey can run.");
    questions = [
      {
        question: "Powerhouse of the cell?",
        choices: ["Nucleus", "Mitochondria", "Ribosome", "Golgi"],
        correctIndex: 1,
        topic: "Cells",
      },
      {
        question: "DNA is short for?",
        choices: ["Deoxyribonucleic acid", "Dinitroamine", "Dual nucleic acid", "None"],
        correctIndex: 0,
        topic: "Genetics",
      },
    ];
    backend.seed("quizzes", [
      {
        id: "quiz-1",
        title: "Biology basics",
        folder_id: null,
        material_id: null,
        questions_json: questions,
        created_at: "2026-09-01T00:00:00Z",
      },
    ]);
  }

  if (!page.url().includes(`/quiz/${quizId}`)) {
    await page.goto(`quiz/${quizId}`);
    await settle(page);
    l.did(`Opened the quiz myself at /quiz/${quizId}.`);
  }

  l.saw(`Quiz screen, question 1:\n${await l.visibleText(1200)}`);
  l.saw(`Quiz screen options: ${(await l.affordances()).join(" | ")}`);
  await l.shot("question-1");

  /* --------------------------------- 3. skipping / submitting nothing / back */

  l.did("Before answering: looked for a way to skip this question.");
  const skipish = (await l.affordances()).filter((a) =>
    /skip|pass|don't know|next|back|previous/i.test(a),
  );
  l.saw(
    skipish.length
      ? `Skip-ish buttons available BEFORE answering: ${skipish.join(" | ")}`
      : "There is NO skip / next / back button before you answer. The only way forward is to pick an answer.",
  );

  l.did("Tried pressing Enter without choosing anything, to move on.");
  await page.keyboard.press("Enter").catch(() => {});
  await page.waitForTimeout(400);
  l.saw(`After pressing Enter with nothing chosen: ${await textOf(page, "main")}`.slice(0, 500));

  /* --------------------------------------- 4. deliberately getting it wrong */

  const wrongIndex = (q: { choices: string[]; correctIndex: number }) =>
    q.correctIndex === 0 ? 1 : 0;

  const q1 = questions[0];
  l.did(
    `Deliberately picked a wrong answer on Q1: "${q1.choices[wrongIndex(q1)]}" (the right one is "${q1.choices[q1.correctIndex]}").`,
  );
  await page
    .getByRole("button", { name: q1.choices[wrongIndex(q1)], exact: true })
    .first()
    .click()
    .catch(async () => {
      await page.locator("button").filter({ hasText: q1.choices[wrongIndex(q1)] }).first().click();
    });
  await page.waitForTimeout(600);

  const wrongScreen = await l.visibleText(1400);
  l.saw(`WHAT THE SCREEN SAYS AFTER A WRONG ANSWER:\n${wrongScreen}`);
  l.saw(`Options after a wrong answer: ${(await l.affordances()).join(" | ")}`);
  await l.shot("wrong-answer");

  /* Does the wrong answer actually name the right answer anywhere in words? */
  const namesCorrect = wrongScreen
    .toLowerCase()
    .includes(q1.choices[q1.correctIndex].toLowerCase());
  l.saw(
    `Is the correct answer's text ("${q1.choices[q1.correctIndex]}") anywhere in the visible text? ${namesCorrect} — note it is also just one of the four buttons, so its presence may only be the button itself.`,
  );
  /* Colour-only signalling check: what classes did the buttons get? */
  const choiceStates = await page
    .evaluate(() => {
      const out: string[] = [];
      for (const b of document.querySelectorAll("main button")) {
        const cls = b.className || "";
        if (!/choice/i.test(cls)) continue;
        out.push(
          `${(b.textContent ?? "").trim().slice(0, 30)} :: ${cls} :: disabled=${(b as HTMLButtonElement).disabled} :: aria=${b.getAttribute("aria-label") ?? b.getAttribute("aria-live") ?? "none"}`,
        );
      }
      return out;
    })
    .catch(() => []);
  l.saw(`Answer buttons after answering:\n${choiceStates.join("\n")}`);

  l.did("Tried to click a different answer after getting it wrong (change my mind).");
  const retry = await page
    .getByRole("button", { name: q1.choices[q1.correctIndex], exact: true })
    .first()
    .isEnabled()
    .catch(() => false);
  l.saw(`Can I still click the correct answer to fix it? enabled=${retry}`);

  l.did("Tried the browser Back button to get to the previous screen.");
  await page.goBack().catch(() => {});
  await page.waitForTimeout(800);
  l.saw(`After Back I'm on ${new URL(page.url()).pathname}:\n${await l.visibleText(600)}`);
  await l.shot("after-back-mid-quiz");
  if (!page.url().includes("/quiz/")) {
    await page.goForward().catch(() => {});
    await page.waitForTimeout(800);
    l.saw(`Pressed Forward to get back in. Now on ${new URL(page.url()).pathname}. Screen:\n${await l.visibleText(700)}`);
    await l.shot("after-forward");
    const resume = page.getByRole("button", { name: /^Resume$/ }).first();
    if (await resume.isVisible().catch(() => false)) {
      l.did("A box popped up asking whether to resume. Clicked 'Resume'.");
      await resume.click().catch(() => {});
      await page.waitForTimeout(800);
      l.saw(`After resuming:\n${await l.visibleText(900)}`);
    }
  }

  /* -------------------------------------------------- 5. finish the quiz */

  for (let i = 0; i < questions.length + 2; i += 1) {
    const done = await page
      .getByRole("heading", { name: /Quiz Complete/i })
      .isVisible()
      .catch(() => false);
    if (done) break;

    const nextBtn = page.getByRole("button", { name: /Next Question|See results/i }).first();
    if (await nextBtn.isVisible().catch(() => false)) {
      const label = await nextBtn.innerText().catch(() => "?");
      l.did(`Clicked "${label.trim()}".`);
      await nextBtn.click().catch(() => {});
      await page.waitForTimeout(600);
      continue;
    }

    /* Unanswered question: pick a wrong one again. */
    const progress = await textOf(page, "main");
    const match = /Question (\d+) of/.exec(progress);
    const qIndex = match ? Number(match[1]) - 1 : 0;
    const q = questions[qIndex] ?? questions[0];
    l.did(`Deliberately wrong again on Q${qIndex + 1}: "${q.choices[wrongIndex(q)]}".`);
    await page
      .getByRole("button", { name: q.choices[wrongIndex(q)], exact: true })
      .first()
      .click({ timeout: 3000 })
      .catch((err: unknown) =>
        l.saw(`Could not click that answer: ${String(err).slice(0, 160)}`),
      );
    await page.waitForTimeout(500);
    l.saw(`Feedback on Q${qIndex + 1}:\n${await l.visibleText(900)}`);
  }

  await page.waitForTimeout(1200);
  const results = await l.visibleText(1600);
  l.saw(`THE RESULTS SCREEN, IN FULL:\n${results}`);
  l.saw(`Results screen buttons/links: ${(await l.affordances()).join(" | ")}`);
  await l.shot("results");

  const attempts = backend.table("quiz_attempts");
  l.saw(
    `Attempts the app saved to the backend: ${attempts.length} — ${JSON.stringify(attempts.map((a) => ({ score: a.score, total: a.total, weak: a.weak_topics })))}`,
  );

  /* --------------------------------- "Review answers" — the fix-it path */

  l.did("Clicked 'Review answers' because I want to know what I got wrong.");
  try {
    await page.getByRole("link", { name: /Review answers/i }).first().click();
    await settle(page, 3500);
    l.saw(`Review-answers screen (${new URL(page.url()).pathname}):\n${await l.visibleText(1600)}`);
    l.saw(`Review screen options: ${(await l.affordances()).join(" | ")}`);
    await l.shot("quiz-review");
  } catch (e) {
    l.saw(`No 'Review answers' link I could click: ${String(e).slice(0, 200)}`);
  }

  /* -------------------------- 8. did any of this show up anywhere after? */

  for (const [label, path] of [
    ["Progress / analytics", "analytics"],
    ["The full dashboard", "dashboard"],
    ["Trajectory", "trajectory"],
    ["Today", ""],
  ] as const) {
    l.did(`Went to ${label} to see if my quiz counted.`);
    await page.goto(path).catch(() => {});
    await settle(page);
    await page.waitForTimeout(1200);
    l.saw(`${label} (${new URL(page.url()).pathname}):\n${await l.visibleText(1500)}`);
    await l.shot(`after-${label.replace(/\W+/g, "-")}`);
  }

  l.write({
    finalUrl: page.url(),
    unhandledBackendCalls: [...new Set(backend.unhandled)],
    savedAttempts: backend.table("quiz_attempts"),
  });
});

/* ------------------------------ 6. Quick Check, reached the way a student would */

test("trying to reach the Quick Check the way a student would", async ({ page }) => {
  /* A real study session has to actually elapse, so this journey needs longer
     than the shared timeout. Set here rather than in the shared config. */
  test.setTimeout(240_000);
  page.setDefaultTimeout(8_000);
  page.setDefaultNavigationTimeout(20_000);
  const l = new StudentLog("03-quiz-quickcheck", page);

  l.did("Logged in and went looking for a 'quick check'.");
  await loginAs(page);
  await settle(page);

  const onToday = await l.affordances();
  l.saw(`Today screen options: ${onToday.join(" | ")}`);
  l.saw(
    onToday.some((a) => /quick check/i.test(a))
      ? "There IS something called Quick Check on Today."
      : "Nothing called 'Quick Check' is visible on Today before studying.",
  );

  l.did("Went to Focus (the timer) because the check is supposed to follow a session.");
  await page.goto("timer");
  await settle(page);
  l.saw(`Timer screen:\n${await l.visibleText(1400)}`);
  l.saw(`Timer options: ${(await l.affordances()).join(" | ")}`);
  await l.shot("timer");

  l.did("Typed what I'm covering into 'What did you cover?' and picked Stopwatch.");
  try {
    await page.getByLabel(/What did you cover/i).fill("Photosynthesis");
  } catch (e) {
    l.saw(`Couldn't fill the session note: ${String(e).slice(0, 200)}`);
  }
  try {
    await page.getByRole("radio", { name: "Stopwatch" }).check();
  } catch (e) {
    l.saw(`Couldn't switch to Stopwatch: ${String(e).slice(0, 200)}`);
  }

  l.did("Pressed Start and actually sat there for a minute (real time).");
  try {
    await page.getByRole("button", { name: /^Start/i }).first().click();
  } catch (e) {
    l.saw(`Start button problem: ${String(e).slice(0, 200)}`);
  }
  await l.timed("waiting out a real 65-second study session", async () => {
    await page.waitForTimeout(65_000);
  });
  l.saw(`Timer after ~65s:\n${await l.visibleText(700)}`);

  l.did("Pressed the stop button to end the session.");
  const stop = page.getByRole("button", { name: /^Stop & log$/ }).first();
  l.saw(`The stop button is labelled: "${await stop.innerText().catch(() => "?")}"`);
  await stop.click().catch(() => {});
  await page.waitForTimeout(1500);
  const afterStop = await l.visibleText(1200);
  l.saw(`Straight after stopping, still on the timer page:\n${afterStop}`);
  l.saw(
    /quick check/i.test(afterStop)
      ? "The timer page itself offers a quick check."
      : "The timer page says NOTHING about a quick check after logging the session.",
  );
  await l.shot("after-stop");

  /* What did that one 65-second stopwatch actually write? */
  const logged = await page
    .evaluate(() => JSON.parse(window.localStorage.getItem("sessions") ?? "[]"))
    .catch(() => []);
  l.saw(
    `Sessions the app recorded for that ONE stopwatch run (newest first): ${JSON.stringify(
      (logged as Record<string, unknown>[]).map((s) => ({
        minutes: s.minutes,
        task: s.task,
        notes: s.notes,
      })),
    )}`,
  );

  l.did("Went back to Today to see if anything happened.");
  await page.goto("");
  await settle(page);
  await page.waitForTimeout(1500);
  const today = await l.visibleText(1600);
  l.saw(`Today after finishing a session:\n${today}`);
  l.saw(`Today options now: ${(await l.affordances()).join(" | ")}`);
  await l.shot("session-complete-panel");

  /* Second attempt: the panel asked for "a topic", so give the timer a real
     task to attach the session to, the way the screen suggests. */
  let startCheck = page.getByRole("button", { name: /Start quick check/i }).first();
  if (!(await startCheck.isVisible().catch(() => false))) {
    l.thought("It told me to pick a topic. Fine — I'll make a task called Photosynthesis and try again.");
    await page.goto("tasks");
    await settle(page, 1500);
    try {
      const taskInput = page
        .getByPlaceholder(/task|add/i)
        .first();
      await taskInput.fill("Photosynthesis");
      await taskInput.press("Enter");
      await settle(page, 1500);
      l.saw(`Tasks page after adding one:\n${await l.visibleText(900)}`);
    } catch (e) {
      l.saw(`Couldn't add a task: ${String(e).slice(0, 200)}`);
    }

    await page.goto("timer");
    await settle(page, 1500);
    l.did("Set 'Current Task' to Photosynthesis, then ran another stopwatch minute.");
    try {
      const combo = page.getByPlaceholder("Search tasks...").first();
      await combo.click();
      await combo.fill("Photo");
      await settle(page, 600);
      await page.getByRole("option", { name: /Photosynthesis/i }).first().click();
      await settle(page, 500);
      l.saw(`Task picker now reads: ${await textOf(page, "main")}`.slice(0, 400));
    } catch (e) {
      l.saw(`Couldn't attach a task to the timer: ${String(e).slice(0, 200)}`);
    }
    await page.getByRole("radio", { name: "Stopwatch" }).check().catch(() => {});
    await page.getByRole("button", { name: /^Start$/ }).first().click().catch(() => {});
    await l.timed("second real 65-second session", async () => {
      await page.waitForTimeout(65_000);
    });
    await page
      .getByRole("button", { name: /^Stop & log$/ })
      .first()
      .click()
      .catch(() => {});
    await settle(page, 2000);
    l.saw(`After the second session:\n${await l.visibleText(1200)}`);
    await l.shot("after-second-session");
    startCheck = page.getByRole("button", { name: /Start quick check/i }).first();
  }

  if (await startCheck.isVisible().catch(() => false)) {
    l.did("Clicked 'Start quick check'.");
    await startCheck.click().catch(() => {});
    await page.waitForTimeout(3000);
    l.saw(`Quick Check screen:\n${await l.visibleText(1400)}`);
    l.saw(`Quick Check options: ${(await l.affordances()).join(" | ")}`);
    await l.shot("quickcheck-q1");

    /* Answer every question deliberately wrong. The choices are stubbed, so
       pick the first button each time and record what comes back — the
       "Correct answer: …" line tells us whether it was wrong. */
    for (let i = 0; i < 6; i += 1) {
      const finishBtn = page.getByRole("button", { name: /^Finish$/ }).first();
      const nextBtn = page.getByRole("button", { name: /^Next$/ }).first();
      const choices = page.locator("[aria-label='Answers'] button");
      const count = await choices.count().catch(() => 0);
      if (count > 0 && (await choices.first().isEnabled().catch(() => false))) {
        l.did("Picked the first answer without thinking.");
        await choices.first().click().catch(() => {});
        await page.waitForTimeout(500);
        l.saw(`After answering:\n${await l.visibleText(1000)}`);
        await l.shot(`quickcheck-answered-${i}`);
      }
      if (await finishBtn.isVisible().catch(() => false)) {
        l.did("Clicked Finish.");
        await finishBtn.click().catch(() => {});
        await page.waitForTimeout(2500);
        break;
      }
      if (await nextBtn.isVisible().catch(() => false)) {
        l.did("Clicked Next.");
        await nextBtn.click().catch(() => {});
        await page.waitForTimeout(600);
        continue;
      }
      break;
    }
    l.saw(`After the Quick Check finished:\n${await l.visibleText(1200)}`);
    l.saw(`Options now: ${(await l.affordances()).join(" | ")}`);
    await l.shot("quickcheck-result");
  } else {
    l.saw("Still no 'Start quick check' button anywhere after two real study sessions.");
    l.saw(`What's on screen instead:\n${await l.visibleText(1200)}`);
  }

  l.write({ finalUrl: page.url() });
});

/* --------------------------------------------- 7. flashcards / review briefly */

test("starting a flashcard review and grading a card", async ({ page, backend }) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(8_000);
  page.setDefaultNavigationTimeout(20_000);
  const l = new StudentLog("03-quiz-flashcards", page);

  const past = new Date(Date.now() - 86_400_000).toISOString();
  backend.seed("flashcard_decks", [
    {
      id: "deck-1",
      user_id: "11111111-1111-4111-8111-111111111111",
      folder_id: null,
      title: "Photosynthesis",
      created_at: "2026-09-01T00:00:00Z",
    },
  ]);
  backend.seed(
    "flashcards",
    [
      ["card-1", "What does chlorophyll do?", "Absorbs light energy."],
      ["card-2", "Where does the light reaction happen?", "The thylakoid membrane."],
    ].map(([id, front, back]) => ({
      id,
      user_id: "11111111-1111-4111-8111-111111111111",
      deck_id: "deck-1",
      front,
      back,
      next_review_date: past,
      srs_interval: 1,
      ease_factor: 2.5,
      created_at: "2026-09-01T00:00:00Z",
    })),
  );

  await loginAs(page);
  l.did("Went to the Library to find my flashcards.");
  await page.goto("library");
  await settle(page);
  await page.waitForTimeout(1200);
  l.saw(`Library:\n${await l.visibleText(1400)}`);
  l.saw(`Library options: ${(await l.affordances()).join(" | ")}`);
  await l.shot("library-with-deck");

  l.did("Clicked the 'Flashcards' tab in the Library.");
  await page.getByRole("tab", { name: /Flashcards/i }).first().click().catch(() => {});
  await settle(page, 1500);
  l.saw(`Flashcards tab:\n${await l.visibleText(1200)}`);
  l.saw(`Flashcards tab options: ${(await l.affordances()).join(" | ")}`);
  await l.shot("library-flashcards-tab");

  l.did("Tried to start reviewing the Photosynthesis deck.");
  let started = false;
  for (const name of [/Review/i, /Study/i, /Photosynthesis/i]) {
    const target = page.getByRole("link", { name }).first();
    if (await target.isVisible().catch(() => false)) {
      await target.click().catch(() => {});
      await settle(page);
      started = page.url().includes("/review/") || page.url().includes("/decks/");
      l.saw(`Clicked a "${String(name)}" link; landed on ${new URL(page.url()).pathname}`);
      if (started) break;
    }
  }
  if (!page.url().includes("/review/")) {
    l.did("Couldn't get there by clicking, so went straight to /review/deck-1.");
    await page.goto("review/deck-1");
    await settle(page);
  }
  await page.waitForTimeout(1500);
  l.saw(`Review screen:\n${await l.visibleText(1400)}`);
  l.saw(`Review options: ${(await l.affordances()).join(" | ")}`);
  await l.shot("review-front");

  const startReview = page.getByRole("button", { name: /^Start review$/i }).first();
  if (await startReview.isVisible().catch(() => false)) {
    l.did("There's a setup screen first. Clicked 'Start review'.");
    await startReview.click().catch(() => {});
    await settle(page, 1500);
    l.saw(`First card:\n${await l.visibleText(1200)}`);
    l.saw(`Card screen options: ${(await l.affordances()).join(" | ")}`);
    await l.shot("review-card-front");
  }

  l.did("Clicked the card to see the answer.");
  await page
    .getByRole("button", { name: /Flip card/i })
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(700);
  const flipped = await l.visibleText(1400);
  l.saw(`After flipping:\n${flipped}`);
  l.saw(`Grading options: ${(await l.affordances()).join(" | ")}`);
  await l.shot("review-flipped");

  /* Do the buttons explain themselves, or is it jargon? Capture any title /
     aria-description / helper text attached to them. */
  const gradeDetail = await page
    .evaluate(() => {
      const out: string[] = [];
      for (const b of document.querySelectorAll("button")) {
        const text = (b.textContent ?? "").trim();
        if (!/^(Again|Hard|Good|Easy)\b/.test(text)) continue;
        out.push(
          `${text} | title=${b.getAttribute("title") ?? "-"} | aria-label=${b.getAttribute("aria-label") ?? "-"} | nearby=${(b.parentElement?.textContent ?? "").trim().slice(0, 120)}`,
        );
      }
      return out;
    })
    .catch(() => []);
  l.saw(`Grading buttons in detail:\n${gradeDetail.join("\n")}`);

  l.did("Clicked 'Again' because I had no idea.");
  await page.getByRole("button", { name: /^Again/ }).first().click().catch(() => {});
  await page.waitForTimeout(1000);
  l.saw(`After grading a card 'Again':\n${await l.visibleText(1200)}`);
  await l.shot("review-after-grade");

  l.write({ finalUrl: page.url(), unhandledBackendCalls: [...new Set(backend.unhandled)] });
});
