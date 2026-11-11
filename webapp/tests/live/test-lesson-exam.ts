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
  console.log("Logging into live account...");
  await page.goto("https://learnora-app.vercel.app/app/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("learnoratesting@gmail.com");
  await page.getByLabel("Password", { exact: true }).fill(livePassword());
  await page.getByRole("button", { name: /Log In|Sign In/i }).click();
  await page.waitForTimeout(5000);
}

async function testLessonExam() {
  console.log("=== Testing Natural Student Flow to In-Lesson Exam Question Marking ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  page.on("console", (msg) => console.log(`[Browser Console ${msg.type()}]:`, msg.text()));
  page.on("pageerror", (err) => console.error("[Browser Page Error]:", err));

  page.on("response", async (res) => {
    if (res.url().includes("/functions/v1/learnora-ai")) {
      console.log(`[learnora-ai Response]: ${res.status()}`);
    }
  });

  await login(page);

  const lessonId = "ba806677-5b12-445b-b211-73c09fb32f48";
  console.log(`Navigating to lesson ${lessonId}...`);
  await page.goto(`https://learnora-app.vercel.app/app/lessons/${lessonId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Step 1: Quick Guess
  console.log("Step 1: In Part 1 Quick Guess, picking an option...");
  const firstOption = page.locator("button:has-text('Both water and solute'), button:has-text('Water molecules move')").first();
  if (await firstOption.isVisible()) {
    await firstOption.click();
    await page.waitForTimeout(1000);
  }

  // Step 2: Show me why
  console.log("Step 2: Clicking 'Show me why'...");
  const showMeWhyBtn = page.getByRole("button", { name: "Show me why" });
  if (await showMeWhyBtn.isVisible()) {
    await showMeWhyBtn.click();
    await page.waitForTimeout(2000);
  }

  // Step 3: Teach phase -> Got it, check me
  console.log("Step 3: In Teach phase, clicking 'Got it, check me'...");
  const gotItBtn = page.getByRole("button", { name: "Got it, check me" });
  await gotItBtn.waitFor({ state: "visible", timeout: 15000 });
  await gotItBtn.click();
  await page.waitForTimeout(2000);

  // Step 4: Check phase -> pick option
  console.log("Step 4: In Check phase, picking an option...");
  const checkOptions = page.locator("ul li button").first();
  await checkOptions.waitFor({ state: "visible", timeout: 20000 });
  await checkOptions.click();
  await page.waitForTimeout(2000);

  // Step 5: Look for "Try an exam question" button
  console.log("Step 5: Clicking 'Try an exam question'...");
  const examBtn = page.getByRole("button", { name: /Try an exam question/i });
  await examBtn.waitFor({ state: "visible", timeout: 15000 });
  await examBtn.click();

  const examPreparingShot = path.join(EVIDENCE_DIR, "lesson-exam-question-preparing.png");
  await page.screenshot({ path: examPreparingShot, fullPage: true });

  // Step 6: Wait for AI to write the exam question and render the answer box
  console.log("Step 6: Waiting for AI exam question to be written...");
  const answerTextarea = page.locator("textarea[aria-label='Your answer']");
  await answerTextarea.waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(1000);

  const questionCardText = await page.locator("[class*='turn'] p").allInnerTexts();
  console.log("Generated Exam Question:\n", questionCardText.join("\n"));

  const examQuestionShot = path.join(EVIDENCE_DIR, "lesson-exam-question-ready.png");
  await page.screenshot({ path: examQuestionShot, fullPage: true });

  // Step 7: Enter realistic student answer
  const studentAnswer =
    "Osmosis is the net movement of water molecules from a region of higher water potential (dilute solution) to a region of lower water potential (concentrated solution) through a partially permeable membrane.";
  console.log("Typing student answer...");
  await answerTextarea.fill(studentAnswer);
  await page.waitForTimeout(1000);

  // Step 8: Click "Mark my answer"
  console.log("Step 8: Clicking 'Mark my answer'...");
  const markBtn = page.getByRole("button", { name: "Mark my answer" });
  await markBtn.click();

  console.log("Waiting for AI marking result...");
  const resultContainer = page.locator("[class*='results']").first();
  await resultContainer.waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(2000);

  const markedText = await resultContainer.innerText();
  console.log("In-lesson exam marking result:\n", markedText);

  const markedShot = path.join(EVIDENCE_DIR, "lesson-exam-marked-result.png");
  await page.screenshot({ path: markedShot, fullPage: true });
  console.log("Saved marked screenshot to:", markedShot);

  await browser.close();
  console.log("=== In-lesson Exam Flow Successfully Completed ===");
}

testLessonExam().catch(console.error);
