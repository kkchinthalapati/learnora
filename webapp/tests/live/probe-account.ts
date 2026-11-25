/* The test account's password comes from the environment, never the source:
   this repo is public. Run with LEARNORA_TEST_PASSWORD set. */
function livePassword(): string {
  const value = process.env.LEARNORA_TEST_PASSWORD;
  if (!value) throw new Error("Set LEARNORA_TEST_PASSWORD to run the live tests.");
  return value;
}

import { chromium } from "playwright";

async function probe() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log("Navigating to login...");
  await page.goto("https://learnora-app.vercel.app/app/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("learnoratesting@gmail.com");
  await page.getByLabel("Password", { exact: true }).fill(livePassword());
  await page.getByRole("button", { name: /Log In|Sign In/i }).click();

  console.log("Waiting for navigation after login...");
  await page.waitForTimeout(6000);

  const url = page.url();
  console.log("Current URL after login:", url);

  const contextData = await page.evaluate(async () => {
    // Check supabase session in localStorage
    const keys = Object.keys(localStorage);
    const sbKey = keys.find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    let tokenData = null;
    if (sbKey) {
      try {
        tokenData = JSON.parse(localStorage.getItem(sbKey) || "{}");
      } catch (e) {}
    }

    return {
      keys,
      user: tokenData?.user?.email ?? null,
      userId: tokenData?.user?.id ?? null,
    };
  });

  console.log("Auth user:", contextData.user, "ID:", contextData.userId);

  // Navigate to /library to see existing materials
  await page.goto("https://learnora-app.vercel.app/app/library", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const libraryItems = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a, button, li, h3"))
      .map((el) => el.textContent?.trim())
      .filter((t): t is string => !!t && t.length < 80);
  });
  console.log("Sample Library items found:", libraryItems.slice(0, 20));

  // Check today / home view to inspect mistake loop / ledger items
  await page.goto("https://learnora-app.vercel.app/app/", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const homeText = await page.evaluate(() => document.body.innerText);
  console.log("Home page snippet (first 300 chars):", homeText.slice(0, 300).replace(/\n+/g, " "));

  await browser.close();
}

probe().catch((err) => {
  console.error("Probe error:", err);
  process.exit(1);
});
