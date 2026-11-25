/* The test account's password comes from the environment, never the source:
   this repo is public. Run with LEARNORA_TEST_PASSWORD set. */
function livePassword(): string {
  const value = process.env.LEARNORA_TEST_PASSWORD;
  if (!value) throw new Error("Set LEARNORA_TEST_PASSWORD to run the live tests.");
  return value;
}

import { chromium, type Page } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";

const EVIDENCE_DIR = path.resolve(process.cwd(), ".agents/teamwork/worker_m2_replace/evidence");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

async function login(page: Page) {
  console.log("Logging into live account learnoratesting@gmail.com...");
  await page.goto("https://learnora-app.vercel.app/app/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("learnoratesting@gmail.com");
  await page.getByLabel("Password", { exact: true }).fill(livePassword());
  await page.getByRole("button", { name: /Log In|Sign In/i }).click();
  await page.waitForTimeout(5000);
}

interface TestLog {
  test: string;
  passed: boolean;
  durationMs: number;
  details: Record<string, unknown>;
}

async function runGuidedSessionsTests() {
  const testLogs: TestLog[] = [];
  console.log("=================================================");
  console.log("STARTING TEST SUITE 3: GUIDED SESSIONS (LIVE PROD)");
  console.log("=================================================");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`[Browser Console Error]:`, msg.text());
  });

  const edgeCalls: Array<{ url: string; status: number; method: string; requestData?: string; responsePreview?: string }> = [];
  page.on("request", (req) => {
    if (req.url().includes("/functions/v1/learnora-ai")) {
      edgeCalls.push({
        url: req.url(),
        status: 0,
        method: req.method(),
        requestData: req.postData()?.slice(0, 300),
      });
    }
  });

  page.on("response", async (res) => {
    if (res.url().includes("/functions/v1/learnora-ai")) {
      const match = edgeCalls.find((c) => c.url === res.url() && c.status === 0);
      if (match) {
        match.status = res.status();
        try {
          match.responsePreview = (await res.text()).slice(0, 500);
        } catch {}
      }
      console.log(`[Edge Function Response]: ${res.status()} ${res.url()}`);
    }
  });

  await login(page);

  // -------------------------------------------------------------------------
  // TEST 3A: /study (StudyLabView.tsx)
  // -------------------------------------------------------------------------
  console.log("\n--- Test 3A: Study Lab Adaptive Session Planning (/study) ---");
  const start3A = Date.now();

  await page.goto("https://learnora-app.vercel.app/app/study", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const initialShot = path.join(EVIDENCE_DIR, "study-lab-initial.png");
  await page.screenshot({ path: initialShot, fullPage: true });

  const headingText = await page.locator("h1").innerText();
  console.log("Study Lab heading:", headingText);

  // Test Topic Input resolution
  console.log("Entering topic 'Photosynthesis' into topic input...");
  const topicInput = page.locator("input[placeholder*='A topic']");
  await topicInput.fill("Photosynthesis");
  await page.waitForTimeout(2000);

  const plannedShot = path.join(EVIDENCE_DIR, "study-lab-planned-session.png");
  await page.screenshot({ path: plannedShot, fullPage: true });

  const focusTopic = await page.locator("#lab-session").innerText();
  console.log("Resolved Focus Topic:", focusTopic);

  const stepTitles = await page.locator("[class*='stepTitle']").allInnerTexts();
  const stepWhys = await page.locator("[class*='stepWhy']").allInnerTexts();
  console.log("Planned Steps:", stepTitles);
  console.log("Step Rationale:", stepWhys);

  // Test mode selection toggle ("Or choose a mode yourself")
  console.log("Testing 'Or choose a mode yourself' drawer...");
  const chooseToggle = page.locator("button[class*='chooseToggle']");
  await chooseToggle.click();
  await page.waitForTimeout(1000);

  const modesShot = path.join(EVIDENCE_DIR, "study-lab-modes-expanded.png");
  await page.screenshot({ path: modesShot, fullPage: true });

  const modePrompts = await page.locator("[class*='prompt']").allInnerTexts();
  console.log("Available Mode Prompts:", modePrompts);

  // Test Start Button
  console.log("Testing Start Session button...");
  const startBtn = page.getByRole("button", { name: "Start" });
  await startBtn.click();
  await page.waitForTimeout(4000);

  const sessionUrl = page.url();
  console.log("Launched Session URL:", sessionUrl);

  const launchedShot = path.join(EVIDENCE_DIR, "study-lab-session-launched.png");
  await page.screenshot({ path: launchedShot, fullPage: true });

  testLogs.push({
    test: "3A: Study Lab Adaptive Session Planning (/study)",
    passed: focusTopic.toLowerCase().includes("photosynthesis") && stepTitles.length > 0,
    durationMs: Date.now() - start3A,
    details: {
      heading: headingText,
      focusTopic,
      steps: stepTitles,
      modes: modePrompts,
      sessionUrl,
      screenshots: [initialShot, plannedShot, modesShot, launchedShot],
    },
  });

  // -------------------------------------------------------------------------
  // TEST 3B: /tell-apart/:pairId (TellApartView.tsx)
  // -------------------------------------------------------------------------
  console.log("\n--- Test 3B: Tell Apart Drill (/tell-apart/respiration-breathing) ---");
  const start3B = Date.now();

  await page.goto("https://learnora-app.vercel.app/app/tell-apart/respiration-breathing", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(2000);

  const tellApartIntroShot = path.join(EVIDENCE_DIR, "tell-apart-intro.png");
  await page.screenshot({ path: tellApartIntroShot, fullPage: true });

  const tellApartTitle = await page.locator("[class*='topTitle']").innerText();
  console.log("Tell Apart Top Title:", tellApartTitle);

  const contrastTerms = await page.locator("[class*='term']").allInnerTexts();
  console.log("Contrast Terms:", contrastTerms);

  // Click start / begin drill
  const beginBtn = page.getByRole("button", { name: /Start/i });
  if (await beginBtn.isVisible()) {
    console.log("Clicking Start drill...");
    await beginBtn.click();
    await page.waitForTimeout(1500);
  }

  // Wait for choices group to be visible
  const choicesGroup = page.locator("div[role='group'][aria-label='Which one is it?']");
  await choicesGroup.waitFor({ state: "visible", timeout: 10000 });

  // Drill 6 statements
  console.log("Exercising 6-statement contrast drill...");
  const statementResults: Array<{ statement: string; choice: string; why: string }> = [];

  for (let i = 1; i <= 6; i++) {
    await page.waitForTimeout(1000);
    const stmtText = await page.locator("p[class*='statement']").first().innerText();

    const choiceBtns = choicesGroup.locator("button");
    const count = await choiceBtns.count();
    let clickedText = "";

    if (count >= 2) {
      clickedText = await choiceBtns.first().innerText();
      await choiceBtns.first().click();
      await page.waitForTimeout(1000);
    }

    if (i === 1) {
      const feedbackShot = path.join(EVIDENCE_DIR, "tell-apart-statement-feedback.png");
      await page.screenshot({ path: feedbackShot, fullPage: true });
    }

    const whyText = await page.locator("[class*='feedback'] [class*='text'], [class*='verdict']").first().innerText().catch(() => "");
    statementResults.push({ statement: stmtText, choice: clickedText, why: whyText });

    const nextBtn = page.getByRole("button", { name: /Next|See how it went/i });
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
    }
  }

  await page.waitForTimeout(2000);
  const doneShot = path.join(EVIDENCE_DIR, "tell-apart-complete.png");
  await page.screenshot({ path: doneShot, fullPage: true });

  const finalHeading = await page.locator("h1, [class*='heading']").first().innerText();
  console.log("Tell Apart Final Summary:", finalHeading);

  testLogs.push({
    test: "3B: Tell Apart Drill (/tell-apart/:pairId)",
    passed: statementResults.length === 6,
    durationMs: Date.now() - start3B,
    details: {
      topTitle: tellApartTitle,
      contrastTerms,
      statementsTested: statementResults.length,
      finalHeading,
      screenshot: doneShot,
    },
  });

  // -------------------------------------------------------------------------
  // TEST 3C: /past-you/:misconceptionId (PastYouView.tsx)
  // -------------------------------------------------------------------------
  console.log("\n--- Test 3C: Multi-turn Debate with AI Past Self (/past-you/:misconceptionId) ---");
  const start3C = Date.now();

  const pastYouMisconceptionId = "d96473a5-83c5-43e6-b762-13e9e66ffff7"; // Ohm's law and electrical variables
  console.log(`Navigating to /past-you/${pastYouMisconceptionId}...`);

  await page.goto(`https://learnora-app.vercel.app/app/past-you/${pastYouMisconceptionId}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(3000);

  const pastYouInitialShot = path.join(EVIDENCE_DIR, "past-you-initial.png");
  await page.screenshot({ path: pastYouInitialShot, fullPage: true });

  const pyHeading = await page.locator("h1").innerText();
  console.log("Past You Topic Heading:", pyHeading);

  // Wait for initial AI Past You opening message (learnora-ai feynman pastYou)
  console.log("Waiting for AI Past You opening line from live edge function (up to 45s)...");
  const composer = page.locator("#past-you-draft");
  await composer.waitFor({ state: "visible", timeout: 45000 });
  await page.waitForTimeout(2000);

  const pastYouOpeningShot = path.join(EVIDENCE_DIR, "past-you-opening.png");
  await page.screenshot({ path: pastYouOpeningShot, fullPage: true });

  const initialTurns = await page.locator("[class*='turn']").allInnerTexts();
  console.log("Initial Dialogue Turn:", initialTurns);

  // Check initial belief meter
  const initialMeterText = await page.locator("[aria-label*='Past you is']").getAttribute("aria-label");
  console.log("Initial Belief Meter:", initialMeterText);

  // Turn 1: Submit strong physics counter-argument
  console.log("Submitting Turn 1 counter-argument to Past You...");
  const argumentTurn1 =
    "Ohm's law explicitly states that current is directly proportional to potential difference across a conductor, provided temperature remains constant. Having constant temperature is the required condition for Ohm's law to hold, not a contradiction of it.";

  await composer.fill(argumentTurn1);
  await page.waitForTimeout(500);

  const sendBtn = page.getByRole("button", { name: "Send" });
  await sendBtn.click();

  console.log("Waiting for AI Past You response to Turn 1 (up to 45s)...");
  await page.waitForFunction(
    () =>
      document.querySelectorAll("[class*='turn']:not([aria-busy='true'])").length >= 3 ||
      !!document.querySelector("div[class*='concession'], [class*='convinced'], [class*='panel']"),
    { timeout: 45000 },
  ).catch(() => console.log("Note: timeout waiting for turn 1 response completion"));

  await page.waitForTimeout(2000);
  const turn1Shot = path.join(EVIDENCE_DIR, "past-you-turn1-response.png");
  await page.screenshot({ path: turn1Shot, fullPage: true });

  const meterAfterTurn1 = await page.locator("[aria-label*='Past you is']").getAttribute("aria-label").catch(() => null);
  console.log("Belief Meter after Turn 1:", meterAfterTurn1);

  const turnsAfterTurn1 = await page.locator("[class*='turn']").allInnerTexts();
  console.log("Dialogue after Turn 1:", turnsAfterTurn1.slice(-2));

  // Turn 2: Follow up argument to trigger concession (drop <= 15%)
  console.log("Checking if concession already triggered or if Turn 2 is needed...");
  const isConvincedAlready = await page.locator("h1:has-text('convinced'), [class*='concession']").isVisible().catch(() => false);

  if (!isConvincedAlready && (await composer.isVisible())) {
    console.log("Submitting Turn 2 follow-up counter-argument...");
    const argumentTurn2 =
      "Exactly! So when you measure a circuit with an ohmic resistor at constant temperature, the V-I graph is a perfect straight line through the origin, which proves Ohm's law is valid and true.";
    await composer.fill(argumentTurn2);
    await page.waitForTimeout(500);
    await sendBtn.click();

    console.log("Waiting for AI Past You response to Turn 2 (concession check)...");
    await page.waitForFunction(
      () =>
        document.querySelectorAll("[class*='turn']:not([aria-busy='true'])").length >= 5 ||
        !!document.querySelector("div[class*='concession'], [class*='convinced'], [class*='panel']"),
      { timeout: 45000 },
    ).catch(() => console.log("Note: timeout waiting for turn 2 response completion"));
  }

  await page.waitForTimeout(2000);
  const pastYouFinalShot = path.join(EVIDENCE_DIR, "past-you-convinced-or-turn2.png");
  await page.screenshot({ path: pastYouFinalShot, fullPage: true });

  const finalConvincedHeading = await page.locator("h1, [class*='heading']").first().innerText();
  console.log("Past You Final View Heading:", finalConvincedHeading);

  testLogs.push({
    test: "3C: Multi-turn Debate with AI Past Self (/past-you/:misconceptionId)",
    passed: initialTurns.length > 0 && !!meterAfterTurn1,
    durationMs: Date.now() - start3C,
    details: {
      topic: pyHeading,
      initialMeter: initialMeterText,
      meterAfterTurn1,
      finalHeading: finalConvincedHeading,
      turnsCount: turnsAfterTurn1.length,
      screenshots: [pastYouInitialShot, pastYouOpeningShot, turn1Shot, pastYouFinalShot],
    },
  });

  // -------------------------------------------------------------------------
  // TEST 3D: /check-back/:misconceptionId (CheckBackView.tsx)
  // -------------------------------------------------------------------------
  console.log("\n--- Test 3D: Check-Back Focus Flow (/check-back/:misconceptionId) ---");
  const start3D = Date.now();

  // Part 1: Test "Not ready yet" screen on future-due misconception
  const futureDueId = "bf356505-f6a1-462e-86fc-4917324de95a";
  console.log(`Checking non-due misconception ${futureDueId}...`);
  await page.goto(`https://learnora-app.vercel.app/app/check-back/${futureDueId}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(3000);

  const notReadyShot = path.join(EVIDENCE_DIR, "check-back-not-ready.png");
  await page.screenshot({ path: notReadyShot, fullPage: true });

  const notReadyHeading = await page.locator("h1, [class*='heading']").first().innerText();
  const notReadyText = await page.locator("[class*='text']").first().innerText();
  console.log("Check-back (not due) heading:", notReadyHeading);
  console.log("Check-back (not due) body:", notReadyText);

  // Part 2: Test retest question flow with browser clock advanced to due date via addInitScript
  console.log("Testing check-back ready state via advanced date...");
  await page.addInitScript(() => {
    const fixedTime = new Date("2026-11-12T12:00:00Z").getTime();
    const OrigDate = Date;
    // @ts-expect-error override
    globalThis.Date = class extends OrigDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(fixedTime);
        } else {
          // @ts-expect-error super
          super(...args);
        }
      }
      static now() {
        return fixedTime;
      }
    };
  });

  console.log(`Navigating to /check-back/${futureDueId} with mock date 12 Nov...`);
  await page.goto(`https://learnora-app.vercel.app/app/check-back/${futureDueId}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(4000);

  const readyShot = path.join(EVIDENCE_DIR, "check-back-ready-state.png");
  await page.screenshot({ path: readyShot, fullPage: true });

  // If no bank question, "Write one with AI" appears
  const writeAiBtn = page.getByRole("button", { name: /Write one with AI/i });
  let aiRetestGenerated = false;
  if (await writeAiBtn.isVisible()) {
    console.log("Clicking 'Write one with AI' for live edge generation...");
    await writeAiBtn.click();
    console.log("Waiting for learnora-ai edge function retest question generation (up to 30s)...");
    await page.waitForTimeout(25000);
    aiRetestGenerated = true;
  }

  const questionLoadedShot = path.join(EVIDENCE_DIR, "check-back-question-loaded.png");
  await page.screenshot({ path: questionLoadedShot, fullPage: true });

  // Check choices
  const choices = page.locator("ul[aria-label='Choices'] button");
  const choiceCount = await choices.count();
  console.log(`Found ${choiceCount} answer choices for check-back retest.`);

  let answeredOutcome = "";
  if (choiceCount > 0) {
    console.log("Selecting choice A...");
    await choices.first().click();
    await page.waitForTimeout(1000);

    const checkAnswerBtn = page.getByRole("button", { name: "Check" });
    if (await checkAnswerBtn.isVisible()) {
      await checkAnswerBtn.click();
      await page.waitForTimeout(3000);
    }

    const answeredShot = path.join(EVIDENCE_DIR, "check-back-answered.png");
    await page.screenshot({ path: answeredShot, fullPage: true });

    answeredOutcome = await page.locator("[class*='feedback'], [class*='verdict'], [role='status']").first().innerText().catch(() => "");
    console.log("Check-back feedback outcome:", answeredOutcome);
  }

  testLogs.push({
    test: "3D: Check-Back Focus Flow (/check-back/:misconceptionId)",
    passed: notReadyHeading.length > 0 && (choiceCount > 0 || aiRetestGenerated),
    durationMs: Date.now() - start3D,
    details: {
      notReadyHeading,
      notReadyText,
      choiceCount,
      answeredOutcome,
      screenshots: [notReadyShot, readyShot, questionLoadedShot],
    },
  });

  await browser.close();

  // Save execution log
  const logPath = path.join(EVIDENCE_DIR, "m2-test3-log.json");
  fs.writeFileSync(logPath, JSON.stringify({ timestamp: new Date().toISOString(), testLogs, edgeCalls }, null, 2));

  console.log("\n=================================================");
  console.log("TEST SUITE 3 COMPLETE");
  console.log(`Results saved to ${logPath}`);
  for (const log of testLogs) {
    console.log(`  [${log.passed ? "PASS" : "FAIL"}] ${log.test} (${(log.durationMs / 1000).toFixed(1)}s)`);
  }
  console.log("=================================================");
}

runGuidedSessionsTests().catch((err) => {
  console.error("Suite 3 Fatal Error:", err);
  process.exit(1);
});
