/* The test account's password comes from the environment, never the source:
   this repo is public. Run with LEARNORA_TEST_PASSWORD set. */
function livePassword(): string {
  const value = process.env.LEARNORA_TEST_PASSWORD;
  if (!value) throw new Error("Set LEARNORA_TEST_PASSWORD to run the live tests.");
  return value;
}

import { chromium } from "playwright";

async function checkProfile() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("https://learnora-app.vercel.app/app/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("learnoratesting@gmail.com");
  await page.getByLabel("Password", { exact: true }).fill(livePassword());
  await page.getByRole("button", { name: /Log In|Sign In/i }).click();
  await page.waitForTimeout(4000);

  const profileData = await page.evaluate(async () => {
    const keys = Object.keys(localStorage);
    const sbKey = keys.find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    const auth = JSON.parse(localStorage.getItem(sbKey || "") || "{}");
    const token = auth.access_token;
    const url = "https://mlvgqwqiynpwpwzqufdf.supabase.co";
    const apikey = "sb_publishable_mN1UvxPjHhn6L583LjrSFw_FWY8kRrt";
    const res = await fetch(`${url}/rest/v1/profiles?select=id,plan,plan_status,plan_renews_at,plan_cancel_at_period_end`, {
      headers: { apikey, Authorization: `Bearer ${token}` },
    });
    return res.json();
  });

  console.log("Profile data:", JSON.stringify(profileData, null, 2));
  await browser.close();
}

checkProfile().catch(console.error);
