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

async function createAnswerImage(page: Page, text: string, filename: string): Promise<string> {
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
    ctx.font = "26px sans-serif";

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

async function testStandaloneMark() {
  console.log("=== Testing Standalone /mark with Full Network & Error Logging ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  page.on("console", (msg) => console.log(`[Browser Console ${msg.type()}]:`, msg.text()));
  page.on("pageerror", (err) => console.error("[Browser Page Error]:", err));

  page.on("request", (req) => {
    if (req.url().includes("/functions/v1/")) {
      console.log(`[Network Request]: ${req.method()} ${req.url()}`);
    }
  });

  page.on("response", async (res) => {
    if (res.url().includes("/functions/v1/")) {
      console.log(`[Network Response]: ${res.status()} ${res.url()}`);
      try {
        const body = await res.text();
        console.log(`[Network Body (first 300 chars)]:`, body.slice(0, 300));
      } catch (e) {
        console.log("[Network Body error]:", e);
      }
    }
  });

  await login(page);

  // Navigate to /mark
  await page.goto("https://learnora-app.vercel.app/app/mark", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Test Flawed Answer directly
  console.log("\n--- Testing Flawed Student Answer (Misconception Detection) ---");
  const flawedText =
    "Breathing and respiration are the exact same thing. Respiration is when you inhale oxygen into your lungs and exhale carbon dioxide using the diaphragm and ribs.";
  const imgPath = await createAnswerImage(page, flawedText, "test-flawed-ans.png");

  console.log("Setting input files on #mark-photo...");
  await page.locator("#mark-photo").setInputFiles(imgPath);
  await page.waitForTimeout(1000);

  const markScheme =
    "Respiration is a cellular chemical reaction that releases energy from glucose (1)\nBreathing is mechanical ventilation of the lungs (1)";

  await page.locator("#mark-scheme").fill(markScheme);
  await page.locator("#mark-subject").fill("Biology");
  await page.locator("#mark-question").fill("Explain the difference between respiration and breathing in humans.");

  console.log("Clicking 'Mark it' button...");
  await page.getByRole("button", { name: "Mark it" }).click();

  console.log("Waiting up to 120 seconds for result or error alert...");
  const resultOrError = await Promise.race([
    page.locator("#mark-result").waitFor({ state: "visible", timeout: 120_000 }).then(() => "result"),
    page.locator("p[role='alert']").waitFor({ state: "visible", timeout: 120_000 }).then(() => "error"),
    page.locator("p[role='status']").waitFor({ state: "visible", timeout: 120_000 }).then(async () => {
      const hint = await page.locator("p[role='status']").innerText();
      return `nudge:${hint}`;
    }),
  ]);

  console.log("Outcome received:", resultOrError);

  if (resultOrError === "result") {
    const score = await page.locator("#mark-result").innerText();
    console.log("Result Score Header:", score);

    const points = await page.locator("ol[aria-label='Mark scheme points'] li").allInnerTexts();
    console.log("Points breakdown:\n", points.join("\n---\n"));

    const hasBeliefs = await page.locator("section[aria-labelledby='mark-beliefs']").isVisible();
    console.log("Has misconceptions section:", hasBeliefs);
    if (hasBeliefs) {
      const beliefs = await page.locator("section[aria-labelledby='mark-beliefs']").innerText();
      console.log("Misconceptions text:\n", beliefs);
    }

    const shotPath = path.join(EVIDENCE_DIR, "mark-standalone-flawed-verified.png");
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log("Saved screenshot:", shotPath);
  } else if (resultOrError === "error") {
    const errorMsg = await page.locator("p[role='alert']").innerText();
    console.log("Error Alert Displayed to Student:", errorMsg);
    const errShot = path.join(EVIDENCE_DIR, "mark-standalone-error.png");
    await page.screenshot({ path: errShot, fullPage: true });
  } else {
    console.log("Nudge / Status message received:", resultOrError);
  }

  await browser.close();
  console.log("=== Standalone Mark Test Finished ===");
}

testStandaloneMark().catch(console.error);
