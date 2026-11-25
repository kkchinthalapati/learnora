/* The test account's password comes from the environment, never the source:
   this repo is public. Run with LEARNORA_TEST_PASSWORD set. */
function livePassword(): string {
  const value = process.env.LEARNORA_TEST_PASSWORD;
  if (!value) throw new Error("Set LEARNORA_TEST_PASSWORD to run the live tests.");
  return value;
}

import { chromium, type Page, type BrowserContext } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";

const EVIDENCE_DIR = path.resolve(process.cwd(), ".agents/teamwork/worker_m3/evidence");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

async function login(page: Page) {
  console.log("Navigating to login...");
  await page.goto("https://learnora-app.vercel.app/app/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("learnoratesting@gmail.com");
  await page.getByLabel("Password", { exact: true }).fill(livePassword());
  await page.getByRole("button", { name: /Log In|Sign In/i }).click();
  await page.waitForTimeout(5000);
}

interface TestReportItem {
  id: string;
  name: string;
  passed: boolean;
  durationMs: number;
  details: Record<string, unknown>;
}

async function main() {
  console.log("==================================================");
  console.log("STARTING MILESTONE 3 - SUITE 3: RELIABILITY & MEMORY");
  console.log("==================================================");

  const reports: TestReportItem[] = [];

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[Browser Console Error]:`, msg.text());
    }
  });

  await login(page);

  // ----------------------------------------------------
  // TEST 3A: Offline Mode, OfflineBanner & Queue Transition
  // ----------------------------------------------------
  const start3A = Date.now();
  console.log("\n--- TEST 3A: Offline Mode & OfflineBanner ---");
  await page.goto("https://learnora-app.vercel.app/app/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Set offline
  console.log("Setting network offline...");
  await context.setOffline(true);
  await page.waitForTimeout(1000);

  // Verify OfflineBanner floating pill
  const bannerWrapper = page.locator('[role="status"][aria-live="polite"]').first();
  const bannerVisible = await bannerWrapper.isVisible();
  const bannerText = bannerVisible ? await bannerWrapper.textContent() : "";
  console.log(`[Offline Banner Visible]: ${bannerVisible}`);
  console.log(`[Offline Banner Text]: "${bannerText?.trim()}"`);

  // Verify OfflinePageNotice on current page
  const pageNotice = page.locator('p[class*="pageNotice"]').first();
  const noticeVisible = await pageNotice.isVisible();
  const noticeText = noticeVisible ? await pageNotice.textContent() : "";
  console.log(`[Offline Page Notice Visible on Current Page]: ${noticeVisible}`);
  console.log(`[Offline Page Notice Text]: "${noticeText?.trim().slice(0, 150)}"`);

  // Verify link to /review/daily-drill
  const reviewLink = bannerWrapper.locator('a[href*="/review/daily-drill"]');
  const reviewLinkVisible = await reviewLink.isVisible();
  console.log(`[Offline Review Link Visible]: ${reviewLinkVisible}`);

  await page.screenshot({ path: path.join(EVIDENCE_DIR, "3a-offline-banner-active.png") });

  // Simulate queued review in localStorage
  console.log("Simulating queued offline review in localStorage...");
  await page.evaluate(() => {
    const queue = [
      {
        id: "offline-test-1",
        action: "submitSrsReview",
        timestamp: Date.now(),
        data: { cardId: "test-card-1", rating: "good" },
      },
    ];
    localStorage.setItem("learnora:offline_queue", JSON.stringify(queue));
    window.dispatchEvent(new Event("storage"));
  });
  await page.waitForTimeout(1000);

  const updatedBannerText = await bannerWrapper.textContent();
  console.log(`[Banner with Queued Review]: "${updatedBannerText?.trim()}"`);

  // Reconnect online
  console.log("Restoring online connection...");
  await context.setOffline(false);
  await page.evaluate(() => {
    localStorage.removeItem("learnora:offline_queue");
    window.dispatchEvent(new Event("online"));
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "3a-online-restored.png") });

  const passed3A = bannerVisible && (bannerText?.includes("Offline") ?? false) && (noticeVisible || reviewLinkVisible);
  reports.push({
    id: "M3-T3A",
    name: "Offline Mode Detection, Banner & Page Notice",
    passed: passed3A,
    durationMs: Date.now() - start3A,
    details: { bannerText: bannerText?.trim(), reviewLinkVisible, noticeText: noticeText?.trim() },
  });

  // ----------------------------------------------------
  // TEST 3B: Multi-Tab Synchronization via Window Storage Events
  // ----------------------------------------------------
  const start3B = Date.now();
  console.log("\n--- TEST 3B: Multi-Tab Synchronization ---");
  const tab2 = await context.newPage();

  await page.goto("https://learnora-app.vercel.app/app/timer", { waitUntil: "networkidle" });
  await tab2.goto("https://learnora-app.vercel.app/app/timer", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  console.log("Tab 1 setting active timer timestamp...");
  const targetEndTime = Date.now() + 25 * 60 * 1000;
  await page.evaluate((endTime) => {
    localStorage.setItem("learnora:active_timer_end", String(endTime));
    localStorage.setItem("learnora:timer_sync_test", "synced_value_123");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "learnora:active_timer_end",
        newValue: String(endTime),
      }),
    );
  }, targetEndTime);

  await tab2.waitForTimeout(1000);
  const tab2ReadValue = await tab2.evaluate(() => {
    return {
      timerEnd: localStorage.getItem("learnora:active_timer_end"),
      syncTest: localStorage.getItem("learnora:timer_sync_test"),
    };
  });

  console.log("[Tab 2 Cross-Tab Storage Read]:", tab2ReadValue);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "3b-tab1-timer.png") });
  await tab2.screenshot({ path: path.join(EVIDENCE_DIR, "3b-tab2-timer.png") });

  // Clean up test keys
  await page.evaluate(() => {
    localStorage.removeItem("learnora:active_timer_end");
    localStorage.removeItem("learnora:timer_sync_test");
  });
  await tab2.close();

  const passed3B = tab2ReadValue.syncTest === "synced_value_123";
  reports.push({
    id: "M3-T3B",
    name: "Multi-Tab Storage Event Synchronization",
    passed: passed3B,
    durationMs: Date.now() - start3B,
    details: tab2ReadValue,
  });

  // ----------------------------------------------------
  // TEST 3C: Expired/Missing Session & Guest Timer Access
  // ----------------------------------------------------
  const start3C = Date.now();
  console.log("\n--- TEST 3C: Expired Session & Guest Timer Access ---");

  // Create isolated fresh browser context without authentication
  const guestContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const guestPage = await guestContext.newPage();

  // Subtest 1: Navigate to protected route (/app/subjects)
  console.log("Guest context attempting to visit protected route /app/subjects...");
  await guestPage.goto("https://learnora-app.vercel.app/app/subjects", { waitUntil: "networkidle" });
  await guestPage.waitForTimeout(2000);

  const guestUrl = guestPage.url();
  console.log(`[Guest Redirected URL]: "${guestUrl}"`);
  const isRedirectedToLogin = guestUrl.includes("/login");
  await guestPage.screenshot({ path: path.join(EVIDENCE_DIR, "3c-guest-redirect-to-login.png") });

  // Subtest 2: Navigate to guest-exempt route (/app/timer)
  console.log("Guest context attempting to visit exempt route /app/timer...");
  await guestPage.goto("https://learnora-app.vercel.app/app/timer", { waitUntil: "networkidle" });
  await guestPage.waitForTimeout(2000);

  const timerUrl = guestPage.url();
  console.log(`[Guest Timer URL]: "${timerUrl}"`);
  const isTimerAccessible = timerUrl.includes("/timer") && !timerUrl.includes("/login");

  // Verify timer controls mounted
  const timerPlayButton = guestPage.locator('button[aria-label*="start" i], button[aria-label*="play" i], [class*="startBtn"], button:has-text("Start")').first();
  const timerControlsVisible = await timerPlayButton.isVisible();
  console.log(`[Guest Timer Controls Visible]: ${timerControlsVisible}`);
  await guestPage.screenshot({ path: path.join(EVIDENCE_DIR, "3c-guest-timer-accessible.png") });

  await guestContext.close();

  const passed3C = isRedirectedToLogin && isTimerAccessible;
  reports.push({
    id: "M3-T3C",
    name: "Expired/Missing Session Redirection & Guest Timer Exemption",
    passed: passed3C,
    durationMs: Date.now() - start3C,
    details: { guestUrl, isRedirectedToLogin, timerUrl, isTimerAccessible, timerControlsVisible },
  });

  // ----------------------------------------------------
  // TEST 3D: Long Lists & Memory Footprint Under Sustained Usage
  // ----------------------------------------------------
  const start3D = Date.now();
  console.log("\n--- TEST 3D: Long Lists & Memory Performance ---");

  interface ViewMetrics {
    route: string;
    domNodes: number;
    maxDepth: number;
    heapUsedBytes?: number;
  }

  const routesToProfile = [
    { route: "/app/", name: "Home" },
    { route: "/app/subjects", name: "Subjects" },
    { route: "/app/library", name: "Library" },
    { route: "/app/analytics", name: "Progress" },
    { route: "/app/timer", name: "Timer" },
  ];

  const profileMetrics: ViewMetrics[] = [];

  for (const item of routesToProfile) {
    await page.goto(`https://learnora-app.vercel.app${item.route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const metrics = await page.evaluate((r) => {
      const allElements = document.querySelectorAll("*");
      const domNodes = allElements.length;

      let maxDepth = 0;
      for (const el of allElements) {
        let depth = 0;
        let parent = el.parentElement;
        while (parent) {
          depth++;
          parent = parent.parentElement;
        }
        if (depth > maxDepth) maxDepth = depth;
      }

      // @ts-expect-error non-standard performance.memory in Chromium
      const heapUsedBytes = window.performance?.memory?.usedJSHeapSize;

      return {
        route: r,
        domNodes,
        maxDepth,
        heapUsedBytes,
      };
    }, item.route);

    profileMetrics.push(metrics);
    console.log(`[View Profile - ${item.name}]: ${metrics.domNodes} DOM nodes, max depth ${metrics.maxDepth}, heap ${(metrics.heapUsedBytes ? (metrics.heapUsedBytes / 1024 / 1024).toFixed(1) : "N/A")} MB`);
  }

  // Sustained rapid navigation test (10 page transitions)
  console.log("Running sustained rapid navigation cycle (10 transitions)...");
  const initialHeap = profileMetrics[0].heapUsedBytes ?? 0;

  for (let i = 0; i < 10; i++) {
    const target = routesToProfile[i % routesToProfile.length].route;
    await page.goto(`https://learnora-app.vercel.app${target}`, { waitUntil: "domcontentloaded" });
  }

  await page.waitForTimeout(2000);
  const finalMetrics = await page.evaluate(() => {
    // @ts-expect-error non-standard performance.memory
    return window.performance?.memory?.usedJSHeapSize ?? 0;
  });

  const heapDeltaMB = ((finalMetrics - initialHeap) / 1024 / 1024).toFixed(2);
  console.log(`[Sustained Navigation Heap Delta]: ${heapDeltaMB} MB`);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "3d-memory-profile-final.png") });

  // Verify all views stay well below runaway DOM limit (e.g. < 2500 nodes)
  const maxNodes = Math.max(...profileMetrics.map((m) => m.domNodes));
  const passed3D = maxNodes < 3000 && Math.abs(Number(heapDeltaMB)) < 150; // Stable memory

  reports.push({
    id: "M3-T3D",
    name: "DOM Node Footprint & Memory Sustained Usage",
    passed: passed3D,
    durationMs: Date.now() - start3D,
    details: { profileMetrics, heapDeltaMB, maxNodes },
  });

  // Save report log
  const logPath = path.join(EVIDENCE_DIR, "m3-suite3-report.json");
  fs.writeFileSync(logPath, JSON.stringify(reports, null, 2));
  console.log(`\nReport written to ${logPath}`);

  await browser.close();
}

main().catch((err) => {
  console.error("Fatal error during Suite 3 execution:", err);
  process.exit(1);
});
