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

interface CspViolation {
  blockedURI?: string;
  violatedDirective?: string;
  effectiveDirective?: string;
  originalPolicy?: string;
  sample?: string;
}

interface TestResult {
  step: string;
  passed: boolean;
  details: any;
}

const OUT_DIR = path.resolve(process.cwd(), "webapp/tests/live/out");
const EVIDENCE_DIR = path.resolve(process.cwd(), ".agents/teamwork/worker_m1/evidence");
const REMEDIATE_EVIDENCE_DIR = path.resolve(process.cwd(), ".agents/teamwork/worker_m1_remediate/evidence");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.mkdirSync(REMEDIATE_EVIDENCE_DIR, { recursive: true });

async function setupCspListener(page: Page) {
  await page.addInitScript(() => {
    (window as any).__csp_violations = [];
    window.addEventListener("securitypolicyviolation", (e: SecurityPolicyViolationEvent) => {
      (window as any).__csp_violations.push({
        blockedURI: e.blockedURI,
        violatedDirective: e.violatedDirective,
        effectiveDirective: e.effectiveDirective,
        originalPolicy: e.originalPolicy,
        sample: e.sample,
      });
    });
  });
}

async function login(page: Page) {
  console.log("Navigating to login...");
  await page.goto("https://learnora-app.vercel.app/app/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("learnoratesting@gmail.com");
  await page.getByLabel("Password", { exact: true }).fill(livePassword());
  await page.getByRole("button", { name: /Log In|Sign In/i }).click();
  await page.waitForTimeout(5000);
}

async function runVerification() {
  const results: TestResult[] = [];
  const consoleLogs: Array<{ type: string; text: string }> = [];

  console.log("=================================================");
  console.log("STARTING LIVE PR #168 VERIFICATION SUITE");
  console.log("Target: https://learnora-app.vercel.app/app/");
  console.log("=================================================");

  // =========================================================================
  // TASK 1: Live HTTP Response Headers & CSP Inspection
  // =========================================================================
  console.log("\n--- Task 1: Inspecting Live Vercel Status & CSP Headers ---");
  const trailingSlashUrl = "https://learnora-app.vercel.app/app/";
  const bareAppUrl = "https://learnora-app.vercel.app/app";

  console.log(`Checking trailing slash URL: ${trailingSlashUrl}`);
  const resSlash = await fetch(trailingSlashUrl, { redirect: "manual" });
  const statusSlash = resSlash.status;
  const cspSlash = resSlash.headers.get("content-security-policy") || "";
  const serverSlash = resSlash.headers.get("server") || "";
  const vercelIdSlash = resSlash.headers.get("x-vercel-id") || "";
  const hstsSlash = resSlash.headers.get("strict-transport-security") || "";
  const xContentTypeSlash = resSlash.headers.get("x-content-type-options") || "";
  const xFrameSlash = resSlash.headers.get("x-frame-options") || "";

  console.log(`[Slash /app/] HTTP Status: ${statusSlash}`);
  console.log(`[Slash /app/] Server: ${serverSlash} (${vercelIdSlash})`);
  console.log(`[Slash /app/] CSP: ${cspSlash}`);

  console.log(`\nChecking bare app URL: ${bareAppUrl}`);
  const resBare = await fetch(bareAppUrl, { redirect: "manual" });
  const statusBare = resBare.status;
  const cspBare = resBare.headers.get("content-security-policy") || "";
  const serverBare = resBare.headers.get("server") || "";
  const vercelIdBare = resBare.headers.get("x-vercel-id") || "";

  console.log(`[Bare /app] HTTP Status: ${statusBare}`);
  console.log(`[Bare /app] Server: ${serverBare} (${vercelIdBare})`);
  console.log(`[Bare /app] CSP: ${cspBare}`);

  // Assertions for /app/ (with trailing slash)
  const slashNoUnsafeEval = !cspSlash.includes("'unsafe-eval'");
  const slashScriptSrcValid = cspSlash.includes(
    "script-src 'self' https://accounts.google.com https://apis.google.com https://www.gstatic.com"
  );
  const slashHasOpenUiSha = cspSlash.includes("'sha256-vai9tBS1dbqDlLt2vYYQwJl16j1hMfOCO5KhCK8LRBg='");
  const slashNoUnsafeInline = !cspSlash.match(/style-src[^;]*'unsafe-inline'/);
  const slashStrictPass =
    statusSlash === 200 && slashNoUnsafeEval && slashScriptSrcValid && slashHasOpenUiSha && !!slashNoUnsafeInline;

  // Assertions for /app (bare route without trailing slash)
  const bareHasUnsafeEval = cspBare.includes("'unsafe-eval'");
  const bareHasUnsafeInline = !!cspBare.match(/style-src[^;]*'unsafe-inline'/);
  const bareRouteGapFindingF18 = bareHasUnsafeEval || bareHasUnsafeInline;

  console.log(`\nSlash route /app/ strict CSP verdict: ${slashStrictPass ? "PASS" : "FAIL"}`);
  console.log(
    `Bare route /app permissive CSP fallback (Finding F-18): ${bareRouteGapFindingF18 ? "CONFIRMED (FAIL)" : "PASS"}`
  );

  results.push({
    step: "1. Vercel Deploy & CSP Headers",
    passed: slashStrictPass && !bareRouteGapFindingF18,
    details: {
      trailingSlash: {
        url: trailingSlashUrl,
        status: statusSlash,
        server: serverSlash,
        vercelId: vercelIdSlash,
        hsts: hstsSlash,
        xContentType: xContentTypeSlash,
        xFrame: xFrameSlash,
        hasNoUnsafeEval: slashNoUnsafeEval,
        hasScriptSrcValid: slashScriptSrcValid,
        hasOpenUiSha: slashHasOpenUiSha,
        hasNoUnsafeInlineStyle: slashNoUnsafeInline,
        cspHeader: cspSlash,
        verdict: slashStrictPass ? "PASS" : "FAIL",
      },
      bareApp: {
        url: bareAppUrl,
        status: statusBare,
        server: serverBare,
        vercelId: vercelIdBare,
        hasUnsafeEval: bareHasUnsafeEval,
        hasUnsafeInlineStyle: bareHasUnsafeInline,
        cspHeader: cspBare,
        verdict: bareRouteGapFindingF18 ? "FAIL" : "PASS",
        finding: "Finding F-18 [P2]: Bare /app falls back to root /(.*) permissive CSP containing 'unsafe-eval' and 'unsafe-inline'",
      },
    },
  });

  // Launch Playwright Browser for Tasks 2, 3, 4
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
  });
  const page = await context.newPage();

  page.on("console", (msg) => {
    const entry = { type: msg.type(), text: msg.text() };
    consoleLogs.push(entry);
    if (msg.type() === "error" || msg.text().includes("Refused") || msg.text().includes("CSP")) {
      console.log(`[BROWSER CONSOLE ${msg.type().toUpperCase()}]:`, msg.text());
    }
  });

  page.on("pageerror", (err) => {
    consoleLogs.push({ type: "pageerror", text: err.message });
    console.log(`[PAGE ERROR]:`, err.message);
  });

  await setupCspListener(page);
  await login(page);

  // =========================================================================
  // TASK 2: Flashcard Maths Rendering (MathML / KaTeX)
  // =========================================================================
  console.log("\n--- Task 2: Verifying Flashcard Maths Rendering ---");
  const decksToTest = [
    {
      name: "Missed Questions",
      deckId: "b34fdab2-76e0-440d-8312-b19c984fffc0",
      url: "https://learnora-app.vercel.app/app/review/b34fdab2-76e0-440d-8312-b19c984fffc0",
      description: "Deck containing multi-line LaTeX formulas, parameters, and F=ma equations",
      expectedClean: true,
    },
    {
      name: "Ohms Law",
      deckId: "dac8a2b2-e5e3-4433-af6e-00bf0253a034",
      url: "https://learnora-app.vercel.app/app/review/dac8a2b2-e5e3-4433-af6e-00bf0253a034",
      description: "Deck containing I = V/R, V = IR, and Omega calculations (Legacy DB deck with doubled backslashes)",
      expectedClean: false,
    },
  ];

  const mathDeckResults: any[] = [];

  for (const deck of decksToTest) {
    console.log(`\nNavigating to deck review: ${deck.name} (${deck.url})...`);
    await page.goto(deck.url, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    const startBtn = page.getByRole("button", { name: /Start review|Practise all/i });
    if (await startBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      console.log(`Clicking Start review for ${deck.name}...`);
      await startBtn.click();
      await page.waitForTimeout(2000);
    }

    let deckFoundMath = false;

    // Step through cards in this deck until we locate and verify the card with math expressions
    for (let c = 1; c <= 8; c++) {
      const cardContainer = page.locator("button._card_bktqe_291, button[class*='card_']").first();
      if (!(await cardContainer.isVisible({ timeout: 5000 }).catch(() => false))) {
        break;
      }

      // Step A: CAPTURE FRONT FACE BEFORE FLIPPING
      // In ReviewView.tsx, clicking the card is a one-way flip: onClick={() => setFlipped(true)}.
      // Taking frontShot here guarantees we capture the genuine question face before any flip.
      const frontText = (await cardContainer.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      const frontMathCount = await cardContainer.locator("math").count();

      const frontShot = path.join(EVIDENCE_DIR, `math-${deck.name.replace(/\s+/g, "_")}-card${c}-front.png`);
      const frontShotRemediate = path.join(
        REMEDIATE_EVIDENCE_DIR,
        `math-${deck.name.replace(/\s+/g, "_")}-card${c}-front.png`
      );
      await page.screenshot({ path: frontShot });
      await page.screenshot({ path: frontShotRemediate });

      // Step B: FLIP CARD (one-way transition to back face)
      await cardContainer.click();
      await page.waitForTimeout(1000);

      // Step C: CAPTURE BACK FACE AFTER FLIPPING
      const backText = (await cardContainer.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
      const backMathCount = await cardContainer.locator("math").count();

      const backShot = path.join(EVIDENCE_DIR, `math-${deck.name.replace(/\s+/g, "_")}-card${c}-back.png`);
      const backShotRemediate = path.join(
        REMEDIATE_EVIDENCE_DIR,
        `math-${deck.name.replace(/\s+/g, "_")}-card${c}-back.png`
      );
      await page.screenshot({ path: backShot });
      await page.screenshot({ path: backShotRemediate });

      const totalMathCount = frontMathCount + backMathCount;

      if (totalMathCount > 0 || /I\s*=|Parameters/i.test(frontText + " " + backText)) {
        deckFoundMath = true;
        const mathElements = await page.locator("math").all();
        const firstMathHtml = mathElements.length > 0 ? await mathElements[0].evaluate((el) => el.outerHTML) : "";

        // SEMANTIC MATHML ASSERTIONS
        const mfracCount = await page.locator("math mfrac").count();
        const omegaCount = await page.locator("math").evaluateAll((elements) =>
          elements.filter((el) => /Ω|\u03A9|&Omega;|&#x3A9;/.test(el.innerHTML)).length
        );
        const newlineMspaceCount = await page.locator("math mspace[linebreak='newline']").count();
        const semanticsCount = await page.locator("math semantics").count();
        const annotationCount = await page.locator("math annotation[encoding='application/x-tex']").count();
        const katexErrors = await page.locator(".katex-error").all();

        // Leaked raw LaTeX tokens in visible text
        const hasRawDfrac = /\b(dfrac)\b/i.test(backText);
        const hasRawTextMacro = /\b(text[VA]|text)\b/i.test(backText);
        const hasRawOmegaWord = /\b(Omega)\b/i.test(backText);
        const hasBrokenControlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(frontText + " " + backText);

        let cardPassed = false;
        let cardFinding: string | null = null;

        if (deck.name === "Missed Questions") {
          // Newly created cards (Missed Questions): Should have clean MathML, annotation, semantics, 0 katex errors
          cardPassed =
            totalMathCount > 0 &&
            semanticsCount > 0 &&
            annotationCount > 0 &&
            katexErrors.length === 0 &&
            !hasRawDfrac &&
            !hasBrokenControlChars;
          console.log(
            `Missed Questions Card ${c}: ${totalMathCount} MathML elements, semantics=${semanticsCount}, annotations=${annotationCount}, passed=${cardPassed}`
          );
        } else if (deck.name === "Ohms Law") {
          // Pre-existing production cards (Ohms Law):
          // Formula is $I = \dfrac{12\text{ V}}{4\Omega} = 3\text{ A}$.
          // In clean MathML, this requires <mfrac> and an Omega symbol.
          // Because the database row retains double backslashes, KaTeX renders <mspace linebreak='newline'/>
          // and literal text 'dfrac12textV4Omega = 3textA' without <mfrac> or Omega symbol.
          const hasProperFraction = mfracCount > 0;
          const hasProperOmega = omegaCount > 0;
          cardPassed = hasProperFraction && hasProperOmega && !hasRawDfrac && katexErrors.length === 0;

          if (!cardPassed) {
            cardFinding =
              "Finding F-17 [P2]: Legacy Ohms Law card retains double-escaped backslashes in database ($I = \\\\dfrac...). KaTeX renders <mspace linebreak='newline'/> and literal text 'dfrac12textV4Omega = 3textA' with no <mfrac> fraction bar and no Omega symbol.";
            console.log(
              `Ohms Law Card ${c} semantic check: mfracCount=${mfracCount}, omegaCount=${omegaCount}, hasRawDfrac=${hasRawDfrac}, newlineMspace=${newlineMspaceCount} -> FAIL (Finding F-17 confirmed)`
            );
          }
        }

        mathDeckResults.push({
          deckName: deck.name,
          deckId: deck.deckId,
          cardIndex: c,
          passed: cardPassed,
          totalMathCount,
          semanticChecks: {
            mfracCount,
            omegaCount,
            newlineMspaceCount,
            semanticsCount,
            annotationCount,
            katexErrorCount: katexErrors.length,
            hasRawDfrac,
            hasRawTextMacro,
            hasRawOmegaWord,
            hasBrokenControlChars,
          },
          mathHtmlSample: firstMathHtml.slice(0, 300),
          frontTextSample: frontText.slice(0, 160),
          backTextSample: backText.slice(0, 160),
          frontScreenshot: frontShot,
          backScreenshot: backShot,
          finding: cardFinding,
        });
        break;
      }

      // Advance to next card if not found yet
      const rateBtn = page.getByRole("button", { name: /Good|Easy|Again|Hard/i }).first();
      if (await rateBtn.isVisible().catch(() => false)) {
        await rateBtn.click();
        await page.waitForTimeout(1500);
      } else {
        break;
      }
    }

    if (!deckFoundMath) {
      mathDeckResults.push({
        deckName: deck.name,
        passed: false,
        error: "No math cards encountered within search limit",
      });
    }
  }

  const allDecksPassed = mathDeckResults.length > 0 && mathDeckResults.every((d) => d.passed);
  results.push({
    step: "2. Flashcard Maths Rendering",
    passed: allDecksPassed, // false due to Ohms Law legacy double backslash bug (F-17)
    details: mathDeckResults,
  });

  // =========================================================================
  // TASK 3: script-src CSP Violations Check
  // =========================================================================
  console.log("\n--- Task 3: Verifying Zero CSP Violations Across Lesson Views ---");
  const ohmsLawLessonUrl = "https://learnora-app.vercel.app/app/lessons/71316034-f4dc-4ebd-823e-36765ef19125";
  console.log(`Navigating to lesson: ${ohmsLawLessonUrl}...`);
  await page.goto(ohmsLawLessonUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Check 1: Learn View
  console.log("Testing Learn tab...");
  const learnTabBtn = page.getByRole("button", { name: "Learn", exact: true });
  if (await learnTabBtn.isVisible().catch(() => false)) {
    await learnTabBtn.click();
    await page.waitForTimeout(2000);
  }

  // Check 2: Notes View
  console.log("Testing Notes tab...");
  const notesTabBtn = page.getByRole("button", { name: "Notes", exact: true });
  if (await notesTabBtn.isVisible().catch(() => false)) {
    await notesTabBtn.click();
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(1000);
  }

  // Check 3: Tutor View in Lesson
  console.log("Testing Tutor tab...");
  const tutorTabBtn = page.getByRole("button", { name: "Tutor", exact: true });
  if (await tutorTabBtn.isVisible().catch(() => false)) {
    await tutorTabBtn.click();
    await page.waitForTimeout(2000);
  }

  // Check 4: Global Ask Tutor Drawer from top bar
  console.log("Testing Global Ask Tutor drawer...");
  const askBtn = page.getByRole("button", { name: "Ask", exact: true }).first();
  if (await askBtn.isVisible().catch(() => false)) {
    await askBtn.click();
    await page.waitForTimeout(2000);
    const closeBtn = page.getByRole("button", { name: /close|dismiss/i }).first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click().catch(() => {});
    }
  }

  // Collect CSP Violations from page window
  const cspViolations: CspViolation[] = await page.evaluate(() => {
    return (window as any).__csp_violations || [];
  });
  console.log(`Recorded securitypolicyviolation events: ${cspViolations.length}`);

  const evalErrors = consoleLogs.filter(
    (l) =>
      l.text.includes("EvalError") ||
      l.text.includes("Refused to evaluate a string as JavaScript") ||
      (l.text.includes("Content Security Policy") && l.type === "error")
  );
  console.log(`Recorded console eval errors: ${evalErrors.length}`);

  const t3Passed = cspViolations.length === 0 && evalErrors.length === 0;
  results.push({
    step: "3. script-src CSP Violations Check",
    passed: t3Passed,
    details: {
      cspViolationCount: cspViolations.length,
      cspViolations,
      evalErrorsCount: evalErrors.length,
      evalErrors,
    },
  });

  // =========================================================================
  // TASK 4: Saved Theme Persistence Across Page Reload
  // =========================================================================
  console.log("\n--- Task 4: Verifying Saved Theme Persistence Across Reload ---");
  await page.goto("https://learnora-app.vercel.app/app/settings?tab=appearance", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Read raw storage helper
  const readStorage = async (key: string) => {
    return page.evaluate((k) => {
      try {
        const raw = localStorage.getItem(k);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return localStorage.getItem(k);
      }
    }, key);
  };

  // Select Dark Mode
  console.log("Selecting 'Dark mode'...");
  const darkModeOption = page.getByRole("button", { name: /Dark mode/i });
  await darkModeOption.click();
  await page.waitForTimeout(1000);

  // Select Accent Colour: "Pacific Deep" (ocean)
  console.log("Selecting 'Pacific Deep' (ocean) preset...");
  const oceanPreset = page.locator("button[data-theme='ocean']");
  if (await oceanPreset.isVisible().catch(() => false)) {
    await oceanPreset.click();
    await page.waitForTimeout(1000);
  }

  // Click "Save appearance"
  console.log("Clicking 'Save appearance'...");
  const saveBtn = page.getByRole("button", { name: "Save appearance" });
  await saveBtn.click();
  await page.waitForTimeout(2000);

  // Check state right after save
  const savedModePreReload = await readStorage("learnora_mode");
  const savedAccentPreReload = await readStorage("learnora_accent");
  const hasDarkClassPreReload = await page.evaluate(() => document.body.classList.contains("dark-theme"));
  const accentAttrPreReload = await page.evaluate(() => document.body.getAttribute("data-theme-color"));
  console.log(
    `Pre-reload: mode = ${savedModePreReload}, accent = ${savedAccentPreReload}, dark class = ${hasDarkClassPreReload}, data-theme-color = ${accentAttrPreReload}`
  );

  const settingsPreReloadShot = path.join(EVIDENCE_DIR, "theme-saved-pre-reload.png");
  const settingsPreReloadShotRemediate = path.join(REMEDIATE_EVIDENCE_DIR, "theme-saved-pre-reload.png");
  await page.screenshot({ path: settingsPreReloadShot });
  await page.screenshot({ path: settingsPreReloadShotRemediate });

  // PERFORM FULL PAGE RELOAD
  console.log("Performing FULL PAGE RELOAD...");
  await page.reload({ waitUntil: "networkidle" });
  console.log("Waiting 5 seconds for auth to settle and appearance state to evaluate...");
  await page.waitForTimeout(5000);

  // Check state AFTER reload
  const savedModePostReload = await readStorage("learnora_mode");
  const savedAccentPostReload = await readStorage("learnora_accent");
  const hasDarkClassPostReload = await page.evaluate(() => document.body.classList.contains("dark-theme"));
  const accentAttrPostReload = await page.evaluate(() => document.body.getAttribute("data-theme-color"));
  console.log(
    `Post-reload: mode = ${savedModePostReload}, accent = ${savedAccentPostReload}, dark class = ${hasDarkClassPostReload}, data-theme-color = ${accentAttrPostReload}`
  );

  const settingsPostReloadShot = path.join(EVIDENCE_DIR, "theme-saved-post-reload.png");
  const settingsPostReloadShotRemediate = path.join(REMEDIATE_EVIDENCE_DIR, "theme-saved-post-reload.png");
  await page.screenshot({ path: settingsPostReloadShot });
  await page.screenshot({ path: settingsPostReloadShotRemediate });

  const themePersisted =
    savedModePostReload === "dark" &&
    hasDarkClassPostReload === true &&
    savedAccentPostReload === "ocean" &&
    accentAttrPostReload === "ocean";

  results.push({
    step: "4. Saved Theme Persistence Across Reload",
    passed: themePersisted,
    details: {
      preReload: {
        mode: savedModePreReload,
        accent: savedAccentPreReload,
        hasDarkClass: hasDarkClassPreReload,
        themeAttr: accentAttrPreReload,
      },
      postReload: {
        mode: savedModePostReload,
        accent: savedAccentPostReload,
        hasDarkClass: hasDarkClassPostReload,
        themeAttr: accentAttrPostReload,
      },
      persisted: themePersisted,
      preScreenshot: settingsPreReloadShot,
      postScreenshot: settingsPostReloadShot,
    },
  });

  // Revert back cleanly to standard light/default mode
  console.log("Reverting appearance back to Light mode...");
  const lightModeOption = page.getByRole("button", { name: /Light mode/i });
  if (await lightModeOption.isVisible().catch(() => false)) {
    await lightModeOption.click();
    await page.waitForTimeout(500);
    const defaultPreset = page.locator("button[data-theme='default']");
    if (await defaultPreset.isVisible().catch(() => false)) {
      await defaultPreset.click();
      await page.waitForTimeout(500);
    }
    await saveBtn.click();
    await page.waitForTimeout(1000);
  }

  await browser.close();

  // Write out full execution results JSON to both evidence locations
  const payload = JSON.stringify({ timestamp: new Date().toISOString(), results, consoleLogs }, null, 2);
  const summaryJsonPath = path.join(EVIDENCE_DIR, "verification-summary.json");
  const summaryJsonPathRemediate = path.join(REMEDIATE_EVIDENCE_DIR, "verification-summary.json");
  fs.writeFileSync(summaryJsonPath, payload, "utf8");
  fs.writeFileSync(summaryJsonPathRemediate, payload, "utf8");

  console.log("\n=================================================");
  console.log("VERIFICATION COMPLETE");
  console.log(`Results saved to ${summaryJsonPath} and ${summaryJsonPathRemediate}`);
  console.log("Summary of Checks:");
  for (const r of results) {
    console.log(`  [${r.passed ? "PASS" : "FAIL"}] ${r.step}`);
  }
  console.log("=================================================");
}

runVerification().catch((err) => {
  console.error("FATAL ERROR during verification:", err);
  process.exit(1);
});
