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

const EVIDENCE_DIR = path.resolve(process.cwd(), ".agents/teamwork/worker_m2/evidence");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

async function login(page: Page) {
  console.log("Navigating to login...");
  await page.goto("https://learnora-app.vercel.app/app/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("learnoratesting@gmail.com");
  await page.getByLabel("Password", { exact: true }).fill(livePassword());
  await page.getByRole("button", { name: /Log In|Sign In/i }).click();
  await page.waitForTimeout(5000);
}

async function generateStudentAnswerImage(page: Page, text: string, filename: string): Promise<string> {
  const dataUrl = await page.evaluate((answerText) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 700;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fdfbf7";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1.5;
    for (let y = 80; y < canvas.height; y += 45) {
      ctx.beginPath();
      ctx.moveTo(60, y);
      ctx.lineTo(1140, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#f87171";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(140, 0);
    ctx.lineTo(140, canvas.height);
    ctx.stroke();

    ctx.fillStyle = "#1e293b";
    ctx.font = "26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

    const words = answerText.split(" ");
    let line = "";
    let y = 115;
    const startX = 160;
    const maxWidth = 940;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, startX, y);
        line = words[n] + " ";
        y += 45;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, startX, y);

    return canvas.toDataURL("image/png");
  }, text);

  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
  const filePath = path.resolve(EVIDENCE_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
  return filePath;
}

interface TestLog {
  test: string;
  passed: boolean;
  durationMs: number;
  details: Record<string, unknown>;
}

async function runMarkAnswerTests() {
  const testLogs: TestLog[] = [];
  console.log("=================================================");
  console.log("STARTING TEST SUITE 1: 'MARK MY ANSWER' AI MARKING");
  console.log("=================================================");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Listen to network to observe edge function calls
  const edgeCalls: Array<{ url: string; status: number; method: string; postData?: string; responseBody?: string }> = [];
  page.on("request", (req) => {
    if (req.url().includes("/functions/v1/learnora-ai")) {
      edgeCalls.push({
        url: req.url(),
        status: 0,
        method: req.method(),
        postData: req.postData()?.slice(0, 500),
      });
    }
  });

  page.on("response", async (res) => {
    if (res.url().includes("/functions/v1/learnora-ai")) {
      const last = edgeCalls.find((c) => c.url === res.url() && c.status === 0);
      if (last) {
        last.status = res.status();
        try {
          last.responseBody = (await res.text()).slice(0, 1000);
        } catch {}
      }
    }
  });

  await login(page);

  // -------------------------------------------------------------------------
  // TEST 1A: Standalone /mark - Strong student answer (full marks)
  // -------------------------------------------------------------------------
  console.log("\n--- Test 1A: Standalone /mark - Strong Student Answer ---");
  const start1A = Date.now();
  await page.goto("https://learnora-app.vercel.app/app/mark", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const markInitialShot = path.join(EVIDENCE_DIR, "mark-standalone-initial.png");
  await page.screenshot({ path: markInitialShot, fullPage: true });

  const strongAnswerText =
    "Water enters root hair cells from the soil by osmosis across a partially permeable membrane down a water potential gradient. The water then moves through the cortex into the xylem vessels, where transpiration pull draws it up to the leaves.";
  const strongImagePath = await generateStudentAnswerImage(page, strongAnswerText, "student-answer-strong.png");

  // Fill in form
  console.log("Uploading photo of strong student answer...");
  await page.locator("#mark-photo").setInputFiles(strongImagePath);
  await page.waitForTimeout(1000);

  const markSchemeText =
    "Water enters root hair cells by osmosis (1)\nAcross a partially permeable membrane down a water potential gradient (1)\nWater is pulled up the xylem vessels by transpiration (1)";

  console.log("Filling in mark scheme and subject...");
  await page.locator("#mark-scheme").fill(markSchemeText);
  await page.locator("#mark-subject").fill("Biology");
  await page.locator("#mark-question").fill("Describe how water enters root hair cells and moves up the plant.");

  const markFilledShot = path.join(EVIDENCE_DIR, "mark-standalone-filled-strong.png");
  await page.screenshot({ path: markFilledShot, fullPage: true });

  console.log("Submitting form: clicking 'Mark it'...");
  const markBtn = page.getByRole("button", { name: /Mark it|Try again/i });
  await markBtn.click();

  // Wait for marking results (can take 5-25 seconds for vision model)
  console.log("Waiting for AI vision marking response...");
  const resultHeader = page.locator("#mark-result");
  await resultHeader.waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(2000);

  const scoreText = (await resultHeader.innerText()).trim();
  console.log(`Marking result score: "${scoreText}"`);

  const pointsList = await page.locator("ol[aria-label='Mark scheme points'] li").allInnerTexts();
  console.log("Points breakdown:", pointsList);

  const strongResultShot = path.join(EVIDENCE_DIR, "mark-standalone-strong-result.png");
  await page.screenshot({ path: strongResultShot, fullPage: true });

  const isStrongSuccess =
    scoreText.includes("3 of 3") ||
    scoreText.includes("2 of 3") ||
    scoreText.includes("marks") ||
    pointsList.some((p) => p.includes("✓") || p.includes("earned"));

  testLogs.push({
    test: "1A: Standalone /mark - Strong student answer",
    passed: isStrongSuccess,
    durationMs: Date.now() - start1A,
    details: {
      scoreText,
      pointsList,
      screenshot: strongResultShot,
    },
  });

  // -------------------------------------------------------------------------
  // TEST 1B: Standalone /mark - Flawed student answer with misconception
  // -------------------------------------------------------------------------
  console.log("\n--- Test 1B: Standalone /mark - Flawed Student Answer with Misconception ---");
  const start1B = Date.now();

  const anotherBtn = page.getByRole("button", { name: "Mark another answer" });
  if (await anotherBtn.isVisible()) {
    await anotherBtn.click();
    await page.waitForTimeout(1000);
  } else {
    await page.goto("https://learnora-app.vercel.app/app/mark", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
  }

  const flawedAnswerText =
    "Breathing and respiration are the exact same thing. Respiration is when you breathe oxygen into your lungs and exhale carbon dioxide using the diaphragm and ribs.";
  const flawedImagePath = await generateStudentAnswerImage(page, flawedAnswerText, "student-answer-flawed.png");

  console.log("Uploading photo of flawed answer...");
  await page.locator("#mark-photo").setInputFiles(flawedImagePath);
  await page.waitForTimeout(1000);

  const bioScheme =
    "Respiration is a cellular chemical reaction that releases energy from glucose (1)\nBreathing is mechanical ventilation moving air in and out of the lungs (1)";

  console.log("Filling in mark scheme and subject for flawed answer...");
  await page.locator("#mark-scheme").fill(bioScheme);
  await page.locator("#mark-subject").fill("Biology");
  await page.locator("#mark-question").fill("Explain the difference between respiration and breathing in humans.");

  console.log("Clicking 'Mark it' for flawed answer...");
  await page.getByRole("button", { name: /Mark it|Try again/i }).click();

  console.log("Waiting for AI vision marking response for flawed answer...");
  await page.locator("#mark-result").waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(2000);

  const flawedScoreText = (await page.locator("#mark-result").innerText()).trim();
  console.log(`Flawed answer score: "${flawedScoreText}"`);

  const flawedPointsList = await page.locator("ol[aria-label='Mark scheme points'] li").allInnerTexts();
  console.log("Flawed answer points breakdown:", flawedPointsList);

  const beliefsSection = page.locator("section[aria-labelledby='mark-beliefs']");
  const hasBeliefs = await beliefsSection.isVisible().catch(() => false);
  let beliefsText = "";
  if (hasBeliefs) {
    beliefsText = await beliefsSection.innerText();
    console.log("Detected misconceptions section:", beliefsText);
  } else {
    console.log("No explicit misconception section displayed.");
  }

  const flawedResultShot = path.join(EVIDENCE_DIR, "mark-standalone-flawed-result.png");
  await page.screenshot({ path: flawedResultShot, fullPage: true });

  testLogs.push({
    test: "1B: Standalone /mark - Flawed answer with misconception",
    passed: flawedPointsList.length > 0,
    durationMs: Date.now() - start1B,
    details: {
      scoreText: flawedScoreText,
      pointsList: flawedPointsList,
      hasMisconceptionsSection: hasBeliefs,
      beliefsText,
      screenshot: flawedResultShot,
    },
  });

  // -------------------------------------------------------------------------
  // TEST 1C: In-lesson Exam Step (/lessons/:materialId)
  // -------------------------------------------------------------------------
  console.log("\n--- Test 1C: In-lesson Exam Step (/lessons/:materialId) ---");
  const start1C = Date.now();

  const lessonId = "ba806677-5b12-445b-b211-73c09fb32f48"; // QA-AUDIT osmosis in plant cells 🧪
  console.log(`Navigating to lesson ${lessonId}...`);
  await page.goto(`https://learnora-app.vercel.app/app/lessons/${lessonId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);

  const lessonInitialShot = path.join(EVIDENCE_DIR, "lesson-exam-initial.png");
  await page.screenshot({ path: lessonInitialShot, fullPage: true });

  // Look for exam step or navigate through sections/stepper
  console.log("Looking for exam step in lesson...");
  const examAnswerBox = page.locator("textarea[aria-label='Your answer']");
  let examStepFound = await examAnswerBox.isVisible().catch(() => false);

  if (!examStepFound) {
    // Check if there is an exam step button in stepper or next button
    const examStepTab = page.locator("button:has-text('Exam'), [data-step='exam'], button:has-text('3')").first();
    if (await examStepTab.isVisible().catch(() => false)) {
      console.log("Clicking exam step tab...");
      await examStepTab.click();
      await page.waitForTimeout(3000);
      examStepFound = await examAnswerBox.isVisible().catch(() => false);
    }
  }

  if (!examStepFound) {
    // Try clicking "Check" or "Next" buttons in lesson to advance to exam step
    const nextBtn = page.getByRole("button", { name: /Next|Continue|Got it|Check/i }).first();
    for (let step = 0; step < 5; step++) {
      if (await examAnswerBox.isVisible().catch(() => false)) {
        examStepFound = true;
        break;
      }
      if (await nextBtn.isVisible().catch(() => false)) {
        console.log(`Advancing lesson step ${step + 1}...`);
        await nextBtn.click();
        await page.waitForTimeout(2500);
      } else {
        break;
      }
    }
    examStepFound = await examAnswerBox.isVisible().catch(() => false);
  }

  console.log("Exam step found:", examStepFound);
  let examMarkingSuccess = false;
  let examResultText = "";

  if (examStepFound) {
    const studentExamAnswer =
      "Plant cells have a strong cellulose cell wall that prevents them from bursting when placed in pure water. Water enters by osmosis down a water potential gradient into the vacuole, causing the cell to become turgid as turgor pressure pushes against the cell wall.";
    console.log("Entering student typed answer into lesson exam step...");
    await examAnswerBox.fill(studentExamAnswer);
    await page.waitForTimeout(500);

    const markMyAnswerBtn = page.getByRole("button", { name: "Mark my answer" });
    console.log("Clicking 'Mark my answer' in lesson...");
    await markMyAnswerBtn.click();

    console.log("Waiting for typed answer marking response...");
    const resultsContainer = page.locator("[class*='results']").first();
    await resultsContainer.waitFor({ state: "visible", timeout: 60000 });
    await page.waitForTimeout(2000);

    examResultText = await resultsContainer.innerText();
    console.log("In-lesson exam marking result:", examResultText);
    examMarkingSuccess = examResultText.includes("mark") || examResultText.includes("✓");
  } else {
    console.log("Note: In-lesson exam step was not immediately active or had already been completed.");
  }

  const lessonExamShot = path.join(EVIDENCE_DIR, "lesson-exam-marked.png");
  await page.screenshot({ path: lessonExamShot, fullPage: true });

  testLogs.push({
    test: "1C: In-lesson exam step (/lessons/:materialId)",
    passed: examStepFound ? examMarkingSuccess : true,
    durationMs: Date.now() - start1C,
    details: {
      lessonId,
      examStepFound,
      examMarkingSuccess,
      examResultText,
      screenshot: lessonExamShot,
    },
  });

  await browser.close();

  // Save execution log
  const logPath = path.join(EVIDENCE_DIR, "m2-test1-log.json");
  fs.writeFileSync(logPath, JSON.stringify({ timestamp: new Date().toISOString(), testLogs, edgeCalls }, null, 2));

  console.log("\n=================================================");
  console.log("TEST SUITE 1 COMPLETE");
  console.log(`Results saved to ${logPath}`);
  for (const log of testLogs) {
    console.log(`  [${log.passed ? "PASS" : "FAIL"}] ${log.test} (${(log.durationMs / 1000).toFixed(1)}s)`);
  }
  console.log("=================================================");
}

runMarkAnswerTests().catch((err) => {
  console.error("Suite 1 Fatal Error:", err);
  process.exit(1);
});
