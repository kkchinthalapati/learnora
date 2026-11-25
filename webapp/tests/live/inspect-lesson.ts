/* The test account's password comes from the environment, never the source:
   this repo is public. Run with LEARNORA_TEST_PASSWORD set. */
function livePassword(): string {
  const value = process.env.LEARNORA_TEST_PASSWORD;
  if (!value) throw new Error("Set LEARNORA_TEST_PASSWORD to run the live tests.");
  return value;
}

import { chromium } from "playwright";

async function inspectLesson() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("https://learnora-app.vercel.app/app/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("learnoratesting@gmail.com");
  await page.getByLabel("Password", { exact: true }).fill(livePassword());
  await page.getByRole("button", { name: /Log In|Sign In/i }).click();
  await page.waitForTimeout(4000);

  const lessonId = "ba806677-5b12-445b-b211-73c09fb32f48";
  await page.goto(`https://learnora-app.vercel.app/app/lessons/${lessonId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const info = await page.evaluate((id) => {
    const raw = localStorage.getItem(`learnora:learn:v1:${id}`);
    return {
      stored: raw ? JSON.parse(raw) : null,
      pageText: document.body.innerText.slice(0, 500),
    };
  }, lessonId);

  console.log("Lesson info:", JSON.stringify(info, null, 2));
  await browser.close();
}

inspectLesson().catch(console.error);
