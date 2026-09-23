import { test, expect, loginAs } from "../e2e/support/fixtures";
import { StudentLog } from "./support/record";

/* Journey 4 — the four Study tools, driven by a distracted 14-year-old.
 *
 * Nothing here judges what the AI *says* (the model is stubbed). It records
 * whether a student can get in, what the screen asks of them before it does
 * anything, what empty and lazy input do, how long the wait is, whether work
 * survives navigating away, and what a failed AI call looks like. */

test("study lab: try all four tools like a kid who does not read", async ({
  page,
  backend,
}) => {
  test.setTimeout(1_500_000);
  const log = new StudentLog("04-study-lab", page);
  page.setDefaultTimeout(15_000);
  const settle = async () => {
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
  };
  const t0 = Date.now();
  const elapsed = () => Math.round((Date.now() - t0) / 1000);
  let clicks = 0;

  const safe = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      log.saw(`!! ${label} blew up: ${(err as Error).message.slice(0, 300)}`);
      await log.shot(`broke-${label}`);
    }
  };

  const snapshot = async (label: string, limit = 1600) => {
    log.saw(`[${label}] screen:\n${await log.visibleText(limit)}`);
    log.saw(`[${label}] clickable: ${(await log.affordances()).join(" | ")}`);
    await log.shot(label);
  };

  try {
  await log.timed("sign in", async () => {
    await loginAs(page);
  });

  /* ------------------------------------------------------- 1. the hub */

  log.did("Went to Study tools");
  await log.timed("open /study", async () => {
    await page.goto("study");
    await settle();
  });
  await snapshot("hub", 2200);
  log.thought(
    "My actual problem is 'I failed a maths question and don't know why'. " +
      "Which of these is that?",
  );

  /* ------------------------------------------------ 2. Step-by-Step Solver */

  log.did("Clicked the first card (Step-by-Step Solver)");
  await safe("open-solver", async () => {
    await log.timed("open /solver", async () => {
      await page.getByRole("link", { name: /Step-by-Step Solver/i }).first().click();
      await settle();
    });
  });
  await snapshot("solver-empty", 1800);

  log.did("Hit the big button straight away without typing anything");
  await safe("solver-empty-submit", async () => {
    const submit = page.getByTestId("diagnose-submit-btn");
    const disabled = await submit.isDisabled().catch(() => null);
    log.saw(`Submit button disabled with empty fields? ${String(disabled)}`);
    await submit.click({ timeout: 3000 });
    log.saw("The click went through");
  });
  log.saw(`After clicking with nothing typed: ${await log.visibleText(500)}`);
  log.saw(
    `Any validation message on screen? ${
      (await page.locator("[role=alert]").allInnerTexts().catch(() => [])).join(" / ") ||
      "(none found)"
    }`,
  );
  await log.shot("solver-after-empty-click");

  log.did("Typed something vague and sloppy");
  await safe("solver-vague", async () => {
    await page
      .getByTestId("mistake-input")
      .fill("i keep messing up algebra fractions idk why");
    const submit = page.getByTestId("diagnose-submit-btn");
    log.saw(`Now is the button enabled? ${String(!(await submit.isDisabled()))}`);
    await log.timed("solver: click to something on screen (default prose stub)", async () => {
      await submit.click();
      await page
        .getByTestId("root-cause-summary-card")
        .waitFor({ state: "visible", timeout: 20_000 });
    });
  });
  await snapshot("solver-result-prose-stub", 2400);
  log.thought(
    "The stub AI returns plain prose, not JSON. Recording exactly what the " +
      "app showed me when it could not read the model's answer.",
  );

  /* 6. Abandon halfway and come back — does the solver remember? */
  log.did("Got bored, clicked away to Study tools, then came back to the Solver");
  await safe("solver-abandon", async () => {
    await page.goto("study");
    await settle();
    await page.goto("solver");
    await settle();
  });
  await snapshot("solver-after-coming-back", 1800);
  const mistakeStillThere = await page
    .getByTestId("mistake-input")
    .inputValue()
    .catch(() => "(no field)");
  log.saw(`Is what I typed still in the box? "${mistakeStillThere}"`);
  const resultStillThere = await page
    .getByTestId("root-cause-summary-card")
    .isVisible()
    .catch(() => false);
  log.saw(`Is my answer still on screen after coming back? ${String(resultStillThere)}`);
  const historyBtn = page.getByTestId("open-history-btn");
  log.saw(
    `Is there a way back to it (history button)? ${String(
      await historyBtn.isVisible().catch(() => false),
    )} — label: ${await historyBtn.innerText().catch(() => "(none)")}`,
  );

  /* 7. Make the AI fail, right here in the solver. */
  log.did("Tried again, but this time the AI service is broken (500)");
  await safe("solver-ai-500", async () => {
    backend.stub("learnora-ai", 500, { error: "boom" });
    await page.getByTestId("mistake-input").fill("why do i get minus signs wrong");
    await log.timed("solver: click to something on screen (AI returns 500)", async () => {
      await page.getByTestId("diagnose-submit-btn").click();
      await page
        .getByTestId("root-cause-summary-card")
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => {});
    });
  });
  await snapshot("solver-ai-failed", 2200);
  log.saw(
    `Did anything look like an error to a student? body contains 'error': ${String(
      (await log.visibleText(4000)).toLowerCase().includes("error"),
    )}`,
  );

  /* Happy path: give the solver the JSON it actually wants. */
  log.did("(tester) Pointed the stub at well-formed JSON and ran the solver again");
  await safe("solver-happy", async () => {
    backend.stub("learnora-ai", 200, {
      text: JSON.stringify({
        rootCauseSummary:
          "You are treating the fraction bar as if it only divides the first term.",
        layers: [
          {
            level: 3,
            concept: "Simplifying algebraic fractions",
            status: "severed",
            explanation: "You cancel a term that is added, not multiplied.",
            prerequisiteOf: "Solving rational equations",
          },
          {
            level: 2,
            concept: "Factorising before cancelling",
            status: "shaky",
            explanation: "You skip factorising the numerator.",
          },
          {
            level: 1,
            concept: "What the fraction bar means",
            status: "severed",
            explanation: "The whole numerator is divided, not just part of it.",
          },
        ],
      }),
    });
    await page.goto("solver");
    await settle();
    await page.getByTestId("mistake-input").fill("algebra fractions keep going wrong");
    await log.timed("solver: click to something on screen (valid JSON reply)", async () => {
      await page.getByTestId("diagnose-submit-btn").click();
      await page
        .getByTestId("root-cause-summary-card")
        .waitFor({ state: "visible", timeout: 20_000 });
    });
  });
  await snapshot("solver-happy-path", 2600);

  log.did("Clicked 'Fix it in 60 seconds' to see what the follow-up is");
  await safe("solver-micro-repair", async () => {
    await log.timed("solver: micro-repair opens", async () => {
      await page.getByTestId("launch-micro-repair-btn").click();
      await page.waitForTimeout(2500);
    });
  });
  await snapshot("solver-micro-repair", 1800);

  /* ------------------------------------------------------ 3. Feynman */

  log.did("Went to 'Explain it simply'");
  await safe("open-feynman", async () => {
    await log.timed("open /feynman", async () => {
      await page.goto("feynman");
      await settle();
    });
  });
  await snapshot("feynman-hub", 2600);
  log.saw(
    `How many text boxes does it want before I can start? ${await page
      .locator("input[type=text], input:not([type]), textarea")
      .count()
      .catch(() => -1)}`,
  );

  log.did("Tried to press Start teaching with nothing filled in");
  await safe("feynman-empty-start", async () => {
    const start = page.getByTestId("start-arena-btn");
    log.saw(`Start button disabled when empty? ${String(await start.isDisabled())}`);
    await start.click({ timeout: 3000 });
    log.saw("The empty click went through");
  });
  await log.shot("feynman-empty-click");

  log.saw(`Where did the empty click take me? ${new URL(page.url()).pathname}`);
  await safe("feynman-start", async () => {
    await log.timed("feynman: start to something on screen (default stub)", async () => {
      await page
        .getByTestId("teaching-textarea")
        .waitFor({ state: "visible", timeout: 25_000 });
    });
  });
  await snapshot("feynman-studio", 2600);

  log.did("Wrote a short lazy explanation, one sentence");
  await safe("feynman-lazy-answer", async () => {
    await page.getByTestId("teaching-textarea").fill("plants make food from sun");
    await log.timed("feynman: submit to reply on screen", async () => {
      await page.getByTestId("submit-explanation-btn").click();
      await page
        .getByTestId("apprentice-turn-bubble")
        .first()
        .waitFor({ state: "visible", timeout: 25_000 })
        .catch(() => {});
    });
  });
  await snapshot("feynman-after-lazy-answer", 2800);

  log.did("Left mid-session to the hub, then came back to /feynman");
  await safe("feynman-abandon", async () => {
    await page.goto("study");
    await settle();
    await page.goto("feynman");
    await settle();
  });
  await snapshot("feynman-after-coming-back", 2200);
  log.saw(
    `Is there a way to resume? 'Carry on' button visible: ${String(
      await page.getByTestId("resume-session-btn").first().isVisible().catch(() => false),
    )}`,
  );
  await safe("feynman-resume", async () => {
    const resume = page.getByTestId("resume-session-btn").first();
    if (await resume.isVisible().catch(() => false)) {
      log.did("Clicked 'Carry on'");
      await resume.click();
      await page.waitForTimeout(3000);
      log.saw(`After 'Carry on' I am on: ${new URL(page.url()).pathname}`);
      await snapshot("feynman-resumed", 2000);
      log.saw(
        `Is my earlier sentence still in the conversation? ${String(
          (await log.visibleText(5000)).includes("plants make food from sun"),
        )}`,
      );
    }
  });

  /* ------------------------------------------------------- 4. Viva */

  log.did("Went to Viva practice");
  await safe("open-viva", async () => {
    await log.timed("open /viva", async () => {
      await page.goto("viva");
      await settle();
    });
  });
  await snapshot("viva-setup", 2600);
  log.saw(
    `Second look — did /viva show the crash screen? ${String(
      (await log.visibleText(400)).includes("Something went wrong"),
    )}`,
  );
  log.did("Tried 'Try again' on the crash screen, like a student would");
  await safe("viva-try-again", async () => {
    const again = page.getByRole("button", { name: /Try again/i }).first();
    if (await again.isVisible().catch(() => false)) {
      await again.click();
      await page.waitForTimeout(3000);
      await snapshot("viva-after-try-again", 1200);
    }
  });
  log.did("Reloaded /viva from scratch to see if the crash happens again");
  await safe("viva-reload", async () => {
    await page.goto("viva");
    await settle();
    await page.waitForTimeout(2000);
  });
  log.saw(
    `Reload #2 of /viva — crash screen again? ${String(
      (await log.visibleText(400)).includes("Something went wrong"),
    )}`,
  );
  await log.shot("viva-second-visit");
  log.saw(
    `Does the setup screen mention a microphone anywhere? ${String(
      /mic|microphone|speak|out loud|voice/i.test(await log.visibleText(6000)),
    )}`,
  );
  log.saw(
    `Does the browser even have speech recognition here? ${await page.evaluate(
      () =>
        String(
          "SpeechRecognition" in window || "webkitSpeechRecognition" in window,
        ),
    )}`,
  );

  log.did("Filled the topic and started the viva, never granting a mic");
  await safe("viva-start", async () => {
    const topic = page.getByPlaceholder(/Newton's Third Law/i).first();
    if (await topic.isVisible().catch(() => false)) {
      await topic.fill("photosynthesis");
    }
    const startCandidates = [/^start\b/i, /begin/i];
    let clicked = false;
    for (const name of startCandidates) {
      const button = page.getByRole("button", { name }).first();
      if (await button.isVisible().catch(() => false)) {
        log.did(`Clicked the button called "${await button.innerText()}"`);
        await log.timed("viva: start to something on screen", async () => {
          await button.click();
          await page.waitForTimeout(6000);
        });
        clicked = true;
        break;
      }
    }
    if (!clicked) log.saw("I could not find anything that obviously said 'start'");
  });
  await snapshot("viva-started", 2600);
  log.saw(
    `Is a typing box offered? ${String(
      await page
        .getByPlaceholder(/type your explanation/i)
        .first()
        .isVisible()
        .catch(() => false),
    )}`,
  );
  await safe("viva-find-typing", async () => {
    const typeToggle = page
      .getByRole("button", { name: /type|keyboard|text/i })
      .first();
    if (await typeToggle.isVisible().catch(() => false)) {
      log.did(`Clicked "${await typeToggle.innerText()}" to try typing instead`);
      await typeToggle.click();
      await page.waitForTimeout(1500);
      await snapshot("viva-typing-mode", 2000);
    } else {
      log.saw("No obvious 'type instead' button on the call screen");
    }
  });

  /* ------------------------------------------------- 5. Exam detective */

  log.did("Went to Exam traps, wanting the timed sprint");
  await safe("open-detective", async () => {
    await log.timed("open /exam-detective", async () => {
      await page.goto("exam-detective");
      await settle();
    });
  });
  await snapshot("detective-hub", 2600);

  await safe("detective-sprint", async () => {
    const sprintTab = page.getByRole("button", { name: /sprint|practice|timed/i }).first();
    if (await sprintTab.isVisible().catch(() => false)) {
      log.did(`Clicked tab "${await sprintTab.innerText()}"`);
      clicks += 1;
      await sprintTab.click();
      await page.waitForTimeout(1200);
      await snapshot("detective-sprint-tab", 2000);
    }
    const start = page.getByRole("button", { name: /Start practice/i }).first();
    if (await start.isVisible().catch(() => false)) {
      log.did("Clicked 'Start practice' without touching the subject box");
      clicks += 1;
      await log.timed("detective: start to first question on screen", async () => {
        await start.click();
        await page.waitForTimeout(1200);
      });
      log.saw(`Right after clicking, screen says: ${await log.visibleText(1200)}`);
      await log.shot("detective-right-after-start");
      await page.waitForTimeout(4000);
    }
    /* If that did nothing, do what the screen asked and type a subject. */
    if (await start.isVisible().catch(() => false)) {
      log.did("Nothing happened, so I typed a subject and pressed it again");
      const subjectBox = page.getByPlaceholder(/Organic chemistry/i).first();
      if (await subjectBox.isVisible().catch(() => false)) {
        await subjectBox.fill("maths");
        clicks += 1;
      }
      await log.timed("detective: start #2 to first question on screen", async () => {
        await start.click();
        await page.waitForTimeout(4000);
      });
      log.saw(
        `Am I actually in the sprint now? 'Start practice' still on screen: ${String(
          await start.isVisible().catch(() => false),
        )}`,
      );
    } else {
      log.saw("No 'Start practice' button found on the sprint tab");
    }
  });
  await snapshot("detective-sprint-running", 2600);
  log.saw(`Clicks from landing on Exam traps to the sprint: ${clicks}`);

  } finally {
  log.saw(`Whole journey took ${elapsed()}s of dev-server wall clock`);
  log.write({
    finalUrl: page.url(),
    unhandledBackendCalls: [...new Set(backend.unhandled)],
    clicksToSprint: clicks,
  });
  }

  expect(page.url()).toContain("/app");
});
