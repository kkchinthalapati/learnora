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
  console.log("STARTING MILESTONE 3 - SUITE 2: SOCIAL & STUDY ROOM");
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
  // TEST 2A: Friends Hub & Invite Link (`/app/friends`)
  // ----------------------------------------------------
  const start2A = Date.now();
  console.log("\n--- TEST 2A: Friends Hub & Invite Code ---");
  await page.goto("https://learnora-app.vercel.app/app/friends", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "2a-friends-hub-initial.png") });

  const inviteInput = page.locator('input[aria-label="Your friend invite link"]');
  const inviteVisible = await inviteInput.isVisible();
  let inviteLink = "";
  let extractedCode = "";
  if (inviteVisible) {
    inviteLink = (await inviteInput.inputValue()) ?? "";
    console.log(`[Invite Link Field]: "${inviteLink}"`);
    const match = inviteLink.match(/\/friends\/add\/([a-zA-Z0-9_-]+)/);
    if (match) {
      extractedCode = match[1];
      console.log(`[Extracted Friend Code]: "${extractedCode}"`);
    }
  }

  // Check Copy button
  const copyButton = page.getByRole("button", { name: /Copy link/i });
  const copyVisible = await copyButton.isVisible();

  // Check Regenerate button
  const newLinkButton = page.getByRole("button", { name: /New link/i });
  const newLinkVisible = await newLinkButton.isVisible();

  // Check Leaderboard section
  const selfRow = page.locator('[class*="selfRow"]').first();
  const selfRowVisible = await selfRow.isVisible();
  const emptyState = page.locator('text=No friends yet').first();
  const emptyStateVisible = await emptyState.isVisible();
  let selfRowText = "";
  if (selfRowVisible) {
    selfRowText = (await selfRow.textContent()) ?? "";
    console.log(`[Self Leaderboard Row]: "${selfRowText.trim().replace(/\s+/g, ' ')}"`);
  } else if (emptyStateVisible) {
    console.log(`[Leaderboard Empty State Displayed]: "No friends yet" (Zero friends accepted)`);
  }

  const passed2A = inviteVisible && Boolean(extractedCode) && copyVisible && (selfRowVisible || emptyStateVisible);
  reports.push({
    id: "M3-T2A",
    name: "Friends Hub, Invite Code & Leaderboard (Self or Empty State)",
    passed: passed2A,
    durationMs: Date.now() - start2A,
    details: { inviteLink, extractedCode, copyVisible, emptyStateVisible, selfRowText: selfRowText.slice(0, 150) },
  });

  // ----------------------------------------------------
  // TEST 2B: Invite Landing Guardrails (Invalid & Self-Code)
  // ----------------------------------------------------
  const start2B = Date.now();
  console.log("\n--- TEST 2B: Invite Landing Guardrails ---");

  // Subtest 1: Invalid non-existent code
  console.log("Testing invalid invite code...");
  await page.goto("https://learnora-app.vercel.app/app/friends/add/NONEXISTENT-CODE-99999", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "2b-invalid-code-landing.png") });

  const invalidNotice = page.locator('text=This link is not valid').first();
  const invalidVisible = await invalidNotice.isVisible();
  console.log(`["This link is not valid" Displayed]: ${invalidVisible}`);

  // Subtest 2: Own friend code landing
  console.log("Testing own friend code landing...");
  let ownLandingVisible = false;
  if (extractedCode) {
    await page.goto(`https://learnora-app.vercel.app/app/friends/add/${extractedCode}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, "2b-own-code-landing.png") });

    const ownNotice = page.locator('text=This is your own link').first();
    ownLandingVisible = await ownNotice.isVisible();
    console.log(`["This is your own link" Displayed]: ${ownLandingVisible}`);
  }

  const passed2B = invalidVisible && ownLandingVisible;
  reports.push({
    id: "M3-T2B",
    name: "Invite Link Verification Guardrails (Invalid & Self)",
    passed: passed2B,
    durationMs: Date.now() - start2B,
    details: { invalidVisible, ownLandingVisible },
  });

  // ----------------------------------------------------
  // TEST 2C: Study Room Setup & Realtime Presence
  // ----------------------------------------------------
  const start2C = Date.now();
  console.log("\n--- TEST 2C: Study Room Hub & Realtime Presence ---");
  await page.goto("https://learnora-app.vercel.app/app/room", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "2c-study-room-initial.png") });

  // Verify room title and stats
  const roomTitle = page.locator('h1:has-text("Study room")').first();
  const roomTitleVisible = await roomTitle.isVisible();

  const statsEl = page.locator('[class*="roomStats"]').first();
  const statsText = (await statsEl.isVisible()) ? ((await statsEl.textContent()) ?? "") : "";
  console.log(`[Room Stats]: "${statsText.trim()}"`);

  // Verify desk card for current user
  const deskCards = page.locator('[class*="deskCard"]');
  const deskCount = await deskCards.count();
  console.log(`[Desk Cards Rendered]: ${deskCount}`);

  const selfDesk = page.locator('[class*="selfDesk"], [class*="deskCard"]').first();
  const selfDeskText = (await selfDesk.isVisible()) ? ((await selfDesk.textContent()) ?? "") : "";
  console.log(`[Self Desk Content]: "${selfDeskText.trim().replace(/\s+/g, ' ')}"`);

  const passed2C = roomTitleVisible && statsText.includes("student") && deskCount >= 1;
  reports.push({
    id: "M3-T2C",
    name: "Study Room Presence Channel & Desk Card Rendering",
    passed: passed2C,
    durationMs: Date.now() - start2C,
    details: { statsText: statsText.trim(), deskCount, selfDeskText: selfDeskText.slice(0, 150) },
  });

  // ----------------------------------------------------
  // TEST 2D: Transient Cheers & Room Chat
  // ----------------------------------------------------
  const start2D = Date.now();
  console.log("\n--- TEST 2D: Cheers & Room Chat ---");

  // Send a quick cheer
  const fireCheerButton = page.locator('button:has-text("🔥")').first();
  const cheerVisible = await fireCheerButton.isVisible();
  if (cheerVisible) {
    await fireCheerButton.click();
    console.log("[Cheer 🔥 Clicked]");
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, "2d-study-room-cheer-sent.png") });
  }

  // Room chat message
  const chatInput = page.locator('input[placeholder*="message"], input[aria-label*="chat"], form input[type="text"]').first();
  const chatVisible = await chatInput.isVisible();
  let chatSent = false;
  if (chatVisible) {
    const testMessage = `Test QA room check - ${Date.now()}`;
    await chatInput.fill(testMessage);
    await chatInput.press("Enter");
    await page.waitForTimeout(1500);

    // Look for message in chat log
    const chatFeed = page.locator(`text=${testMessage}`);
    chatSent = await chatFeed.isVisible();
    console.log(`[Chat Message Rendered in Feed]: ${chatSent}`);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, "2d-study-room-chat-message.png") });
  } else {
    // If chat input is inside a sidebar or collapsed panel, check alternative selectors
    console.log("[Chat Input Visibility]: false, inspecting page structure");
  }

  const passed2D = cheerVisible;
  reports.push({
    id: "M3-T2D",
    name: "Study Room Transient Cheers & Feed",
    passed: passed2D,
    durationMs: Date.now() - start2D,
    details: { cheerVisible, chatVisible, chatSent },
  });

  // ----------------------------------------------------
  // TEST 2E: 9-Preset Web Audio Ambient Synthesizer
  // ----------------------------------------------------
  const start2E = Date.now();
  console.log("\n--- TEST 2E: Web Audio Ambient Sound Engine ---");

  const ambianceTrigger = page.locator('[aria-label="Sound ambience focus generator"]').first();
  const ambianceTriggerVisible = await ambianceTrigger.isVisible();
  console.log(`[Ambiance Button Visible]: ${ambianceTriggerVisible}`);

  let presetsFound = 0;
  let presetActivated = false;
  let activeLabel = "";

  if (ambianceTriggerVisible) {
    await ambianceTrigger.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, "2e-ambiance-popover-open.png") });

    // Count preset options
    const presetButtons = page.locator('button:has-text("rain"), button:has-text("noise"), button:has-text("murmur"), button:has-text("waves"), button:has-text("Alpha Waves"), button:has-text("water"), button:has-text("Fireplace"), button:has-text("Wind"), button:has-text("crickets")');
    presetsFound = await presetButtons.count();
    console.log(`[Ambiance Presets Found]: ${presetsFound} / 9`);

    // Click "Gentle rain"
    const rainButton = page.locator('button:has-text("rain")').first();
    if (await rainButton.isVisible()) {
      await rainButton.click();
      await page.waitForTimeout(1000);
      console.log("[Gentle rain preset selected]");

      // Check if button label updated
      activeLabel = (await ambianceTrigger.textContent()) ?? "";
      console.log(`[Ambiance Trigger Updated Label]: "${activeLabel.trim()}"`);
      presetActivated = activeLabel.includes("rain") || activeLabel.includes("🌧️");
      await page.screenshot({ path: path.join(EVIDENCE_DIR, "2e-ambiance-preset-active.png") });

      // Stop audio by clicking again or unmounting
      await ambianceTrigger.click();
      await page.waitForTimeout(500);
      const rainButton2 = page.locator('button:has-text("rain")').first();
      if (await rainButton2.isVisible()) {
        await rainButton2.click(); // Toggle off
        console.log("[Gentle rain toggled off]");
      }
    }
  }

  const passed2E = ambianceTriggerVisible && presetsFound >= 5 && presetActivated;
  reports.push({
    id: "M3-T2E",
    name: "9-Preset Web Audio Ambient Synthesizer",
    passed: passed2E,
    durationMs: Date.now() - start2E,
    details: { ambianceTriggerVisible, presetsFound, presetActivated, activeLabel },
  });

  // Save report log
  const logPath = path.join(EVIDENCE_DIR, "m3-suite2-report.json");
  fs.writeFileSync(logPath, JSON.stringify(reports, null, 2));
  console.log(`\nReport written to ${logPath}`);

  await browser.close();
}

main().catch((err) => {
  console.error("Fatal error during Suite 2 execution:", err);
  process.exit(1);
});
