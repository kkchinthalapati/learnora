/* The test account's password comes from the environment, never the source:
   this repo is public. Run with LEARNORA_TEST_PASSWORD set. */
function livePassword(): string {
  const value = process.env.LEARNORA_TEST_PASSWORD;
  if (!value) throw new Error("Set LEARNORA_TEST_PASSWORD to run the live tests.");
  return value;
}

import { chromium } from "playwright";

async function listMisconceptions() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("https://learnora-app.vercel.app/app/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("learnoratesting@gmail.com");
  await page.getByLabel("Password", { exact: true }).fill(livePassword());
  await page.getByRole("button", { name: /Log In|Sign In/i }).click();
  await page.waitForTimeout(4000);

  const rows = await page.evaluate(async () => {
    const keys = Object.keys(localStorage);
    const sbKey = keys.find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    const auth = JSON.parse(localStorage.getItem(sbKey || "") || "{}");
    const token = auth.access_token;
    const url = "https://mlvgqwqiynpwpwzqufdf.supabase.co";
    const apikey = "sb_publishable_mN1UvxPjHhn6L583LjrSFw_FWY8kRrt";
    const res = await fetch(`${url}/rest/v1/misconceptions?select=id,concept,summary,status,provisional,retest_due_at,repaired_at,last_seen_at`, {
      headers: { apikey, Authorization: `Bearer ${token}` },
    });
    return res.json();
  });

  console.log("Found", rows.length, "misconceptions:");
  for (const r of rows) {
    console.log(`- ID: ${r.id} | Concept: ${r.concept} | Status: ${r.status} | Repaired: ${r.repaired_at} | Due: ${r.retest_due_at} | Summary: ${r.summary?.slice(0, 60)}...`);
  }

  await browser.close();
}

listMisconceptions().catch(console.error);
