/* The test account's password comes from the environment, never the source:
   this repo is public. Run with LEARNORA_TEST_PASSWORD set. */
function livePassword(): string {
  const value = process.env.LEARNORA_TEST_PASSWORD;
  if (!value) throw new Error("Set LEARNORA_TEST_PASSWORD to run the live tests.");
  return value;
}

import { chromium } from "playwright";

async function probeMisconceptions() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log("Navigating to login...");
  await page.goto("https://learnora-app.vercel.app/app/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("learnoratesting@gmail.com");
  await page.getByLabel("Password", { exact: true }).fill(livePassword());
  await page.getByRole("button", { name: /Log In|Sign In/i }).click();

  await page.waitForTimeout(5000);

  // Navigate to /progress to see misconceptions and learning stats
  await page.goto("https://learnora-app.vercel.app/app/progress", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const progressData = await page.evaluate(async () => {
    // Let's inspect the page content or call Supabase directly using stored auth token
    const keys = Object.keys(localStorage);
    const sbKey = keys.find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    if (!sbKey) return { error: "No sb token found" };
    const auth = JSON.parse(localStorage.getItem(sbKey) || "{}");
    const token = auth.access_token;
    const url = "https://mlvgqwqiynpwpwzqufdf.supabase.co";

    const apikey = "sb_publishable_mN1UvxPjHhn6L583LjrSFw_FWY8kRrt";
    const resM = await fetch(`${url}/rest/v1/misconceptions?select=*`, {
      headers: {
        apikey,
        Authorization: `Bearer ${token}`,
      },
    });
    const misconceptions = await resM.json();

    // fetch materials (lessons)
    const resL = await fetch(`${url}/rest/v1/materials?select=id,title,folder_id,created_at`, {
      headers: {
        apikey,
        Authorization: `Bearer ${token}`,
      },
    });
    const lessons = await resL.json();

    return { misconceptions, lessons };
  });

  console.log("=== Existing Lessons on Test Account ===");
  console.log(JSON.stringify(progressData.lessons, null, 2));

  console.log("=== Existing Misconceptions on Test Account ===");
  console.log(JSON.stringify(progressData.misconceptions, null, 2));

  await browser.close();
}

probeMisconceptions().catch(console.error);
