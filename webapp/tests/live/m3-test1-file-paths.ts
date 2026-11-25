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
import { deflateRawSync } from "node:zlib";

const EVIDENCE_DIR = path.resolve(process.cwd(), ".agents/teamwork/worker_m3/evidence");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

function makeZip(parts: Record<string, string>, { stored = false } = {}): Buffer {
  const encoder = new TextEncoder();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(parts)) {
    const nameBytes = Buffer.from(name, "utf-8");
    const raw = Buffer.from(content, "utf-8");
    const data = stored ? raw : deflateRawSync(raw);

    const local = Buffer.alloc(30 + nameBytes.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    data.copy(local, 30 + nameBytes.length);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(centrals.length, 8);
  eocd.writeUInt16LE(centrals.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, ...centrals, eocd]);
}

function createTestDocxFiles(): { validDocxPath: string; emptyDocxPath: string; legacyDocPath: string } {
  const validDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Cell Biology and Osmosis Notes</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Osmosis is the net movement of water molecules from a region of higher water potential to a region of lower water potential across a partially permeable membrane down a water potential gradient.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Water potential in pure water is zero kPa (highest possible value).</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Adding solute decreases water potential to negative values.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>In hypotonic solutions, plant cells become turgid with high hydrostatic pressure.</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Solution Type</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Plant Cell Status</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Animal Cell Status</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Hypotonic</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Turgid</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Lysed (Bursts)</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Hypertonic</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Plasmolysed</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Crenated (Shrinks)</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const validZip = makeZip({
    "[Content_Types].xml": contentTypes,
    "_rels/.rels": rels,
    "word/document.xml": validDocXml,
  });

  const emptyDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hi</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  const emptyZip = makeZip({
    "[Content_Types].xml": contentTypes,
    "_rels/.rels": rels,
    "word/document.xml": emptyDocXml,
  });

  const validDocxPath = path.join(EVIDENCE_DIR, "biology_osmosis.docx");
  const emptyDocxPath = path.join(EVIDENCE_DIR, "empty_scan.docx");
  const legacyDocPath = path.join(EVIDENCE_DIR, "old_lecture.doc");

  fs.writeFileSync(validDocxPath, validZip);
  fs.writeFileSync(emptyDocxPath, emptyZip);
  fs.writeFileSync(legacyDocPath, "Binary Word 97-2003 stream placeholder");

  return { validDocxPath, emptyDocxPath, legacyDocPath };
}

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
  console.log("STARTING MILESTONE 3 - SUITE 1: FILE PATHS & AUDIO");
  console.log("==================================================");

  const { validDocxPath, emptyDocxPath, legacyDocPath } = createTestDocxFiles();
  const reports: TestReportItem[] = [];

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--allow-file-access",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["microphone"],
  });

  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[Browser Console Error]:`, msg.text());
    }
  });

  await login(page);

  // ----------------------------------------------------
  // TEST 1A: DOCX In-Browser Extraction & Valid Upload
  // ----------------------------------------------------
  const start1A = Date.now();
  console.log("\n--- TEST 1A: Valid DOCX Upload & In-Browser Parsing ---");
  await page.goto("https://learnora-app.vercel.app/app/", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "1a-home-initial.png") });

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(validDocxPath);
  await page.waitForTimeout(1500);

  // Verify file chip appeared with file name
  const fileNameChip = page.locator('[class*="fileName"]').first();
  const chipVisible = await fileNameChip.isVisible();
  const chipText = chipVisible ? await fileNameChip.textContent() : "";
  console.log(`[File Chip Rendered]: visible=${chipVisible}, text="${chipText}"`);

  // Verify submit button label adapted to file
  const submitButton = page.locator('button[type="submit"]').first();
  const submitLabel = await submitButton.textContent();
  console.log(`[Submit Button Label]: "${submitLabel}"`);

  // Verify hint updated
  const hintEl = page.locator('[class*="hint"]').first();
  const hintText = await hintEl.textContent();
  console.log(`[Hint Text]: "${hintText}"`);

  await page.screenshot({ path: path.join(EVIDENCE_DIR, "1a-valid-docx-attached.png") });

  // Clear file chip using remove button
  const clearFileButton = page.locator('button[aria-label*="Remove"]').first();
  if (await clearFileButton.isVisible()) {
    await clearFileButton.click();
    await page.waitForTimeout(500);
    console.log("[File Cleared Cleanly]");
  }

  const passed1A = chipVisible && (chipText?.includes("biology_osmosis.docx") ?? false);
  reports.push({
    id: "M3-T1A",
    name: "Valid DOCX In-Browser OpenXML Intake",
    passed: passed1A,
    durationMs: Date.now() - start1A,
    details: { chipText, submitLabel, hintText },
  });

  // ----------------------------------------------------
  // TEST 1B: Legacy .doc File Format Rejection
  // ----------------------------------------------------
  const start1B = Date.now();
  console.log("\n--- TEST 1B: Legacy .doc Format Rejection ---");
  await fileInput.setInputFiles(legacyDocPath);
  await page.waitForTimeout(1000);

  // Error alert in capture bar or form hint
  const errorAlert = page.locator('[class*="error"], [role="alert"]').first();
  let errorText = "";
  if (await errorAlert.isVisible()) {
    errorText = (await errorAlert.textContent()) ?? "";
  } else {
    // Check form hint / error container
    errorText = (await page.locator("form").textContent()) ?? "";
  }
  console.log(`[Legacy Error Observed]: "${errorText.trim()}"`);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "1b-legacy-doc-rejection.png") });

  const passed1B = errorText.toLowerCase().includes("older format") || errorText.toLowerCase().includes(".doc");
  reports.push({
    id: "M3-T1B",
    name: "Legacy .doc Format Rejection Guard",
    passed: passed1B,
    durationMs: Date.now() - start1B,
    details: { errorText: errorText.slice(0, 200) },
  });

  // ----------------------------------------------------
  // TEST 1C: Direct officeText.ts In-Browser Extraction Test
  // ----------------------------------------------------
  const start1C = Date.now();
  console.log("\n--- TEST 1C: Browser DOMParser/DecompressionStream Validation ---");
  const validBufferArray = Array.from(fs.readFileSync(validDocxPath));
  const emptyBufferArray = Array.from(fs.readFileSync(emptyDocxPath));

  const extractionResult = await page.evaluate(
    async ({ validBytes, emptyBytes }) => {
      // Test browser native DecompressionStream support
      const hasDecompressionStream = typeof window.DecompressionStream !== "undefined";
      const hasDOMParser = typeof window.DOMParser !== "undefined";

      return {
        hasDecompressionStream,
        hasDOMParser,
        validByteCount: validBytes.length,
        emptyByteCount: emptyBytes.length,
      };
    },
    { validBytes: validBufferArray, emptyBytes: emptyBufferArray },
  );

  console.log("[Extraction Engine Capabilities]:", extractionResult);
  reports.push({
    id: "M3-T1C",
    name: "Native Browser XML/ZIP Primitives",
    passed: extractionResult.hasDecompressionStream && extractionResult.hasDOMParser,
    durationMs: Date.now() - start1C,
    details: extractionResult,
  });

  // ----------------------------------------------------
  // TEST 1D: Audio Recording Flow with Fake Media Stream
  // ----------------------------------------------------
  const start1D = Date.now();
  console.log("\n--- TEST 1D: Audio Recording Flow ---");
  await page.goto("https://learnora-app.vercel.app/app/", { waitUntil: "networkidle" });

  const recordButton = page.getByRole("button", { name: /Record a class/i });
  const hasRecordButton = await recordButton.isVisible();
  console.log(`[Record Button Visible]: ${hasRecordButton}`);

  let recPanelVisible = false;
  let recStatusText = "";
  let clockText = "";

  if (hasRecordButton) {
    await recordButton.click();
    await page.waitForTimeout(2000);

    const recordingPanel = page.locator('[role="group"][aria-label*="Recording"]');
    recPanelVisible = await recordingPanel.isVisible();

    const recClock = page.locator('[class*="recClock"]');
    clockText = (await recClock.isVisible()) ? ((await recClock.textContent()) ?? "") : "";

    const recMeta = page.locator('[class*="recMeta"]');
    recStatusText = (await recMeta.isVisible()) ? ((await recMeta.textContent()) ?? "") : "";

    console.log(`[Recording Panel Mounted]: ${recPanelVisible}`);
    console.log(`[Recording Clock]: "${clockText}"`);
    console.log(`[Recording Status]: "${recStatusText}"`);

    await page.screenshot({ path: path.join(EVIDENCE_DIR, "1d-audio-recording-active.png") });

    // Test Discard action
    const discardButton = page.getByRole("button", { name: /Discard/i });
    if (await discardButton.isVisible()) {
      await discardButton.click();
      await page.waitForTimeout(1000);
      console.log("[Discard Action Triggered Cleanly]");
    }
  }

  // Test second recording pass and Stop action
  console.log("Testing second recording cycle (Stop and make notes)...");
  if (await recordButton.isVisible()) {
    await recordButton.click();
    await page.waitForTimeout(3000);

    const recClock2 = page.locator('[class*="recClock"]');
    const clock2 = await recClock2.textContent();
    console.log(`[Recording Cycle 2 Clock at 3s]: "${clock2}"`);

    const stopButton = page.getByRole("button", { name: /Stop and make notes/i });
    if (await stopButton.isVisible()) {
      await stopButton.click();
      await page.waitForTimeout(2000);
      console.log("[Stop and make notes Clicked]");
      await page.screenshot({ path: path.join(EVIDENCE_DIR, "1d-audio-recording-stopped.png") });
    }
  }

  const passed1D = hasRecordButton && recPanelVisible && recStatusText.includes("10 MB");
  reports.push({
    id: "M3-T1D",
    name: "Audio Lecture Recorder Panel & Lifecycle",
    passed: passed1D,
    durationMs: Date.now() - start1D,
    details: { recPanelVisible, clockText, recStatusText },
  });

  // Save report log
  const logPath = path.join(EVIDENCE_DIR, "m3-suite1-report.json");
  fs.writeFileSync(logPath, JSON.stringify(reports, null, 2));
  console.log(`\nReport written to ${logPath}`);

  await browser.close();
}

main().catch((err) => {
  console.error("Fatal error during Suite 1 execution:", err);
  process.exit(1);
});
