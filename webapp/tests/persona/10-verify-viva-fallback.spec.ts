import { test, expect, loginAs } from "../e2e/support/fixtures";
import { StudentLog } from "./support/record";

/* Journey 10 — verification of the two most serious claims in the pass.
 *
 * (a) "/viva crashes." The reported trigger was a misconception row with no
 *     `last_seen_at`. The live schema has that column NOT NULL with a
 *     `now()` default, so a real row always carries it. Both cases are
 *     therefore run: a clean account, and an account with a well-formed
 *     ledger row. If neither crashes, the crash is a fixture artefact and
 *     must be reported as fragility, not as a bug a student can hit.
 *
 * (b) "When the AI fails, the Solver invents a diagnosis and says nothing."
 *     `aiDebugger.ts` calls `createFallbackDiagnosis` inside `catch` with
 *     only a console.warn, so this is checked from the student's side: does
 *     anything on screen distinguish a real answer from the stand-in?
 */

test("viva loads on a clean account and with a well-formed ledger row", async ({
  page,
  backend,
}) => {
  const log = new StudentLog("10-verify-viva", page);

  log.did("Opened Viva practice on a brand new account with no history");
  await loginAs(page);
  await page.goto("viva");
  await page.waitForTimeout(2500);
  const cleanText = await log.visibleText(700);
  const cleanCrashed = /something went wrong|unexpected error/i.test(cleanText);
  log.saw(`Clean account — crashed? ${cleanCrashed}`);
  log.saw(`Screen:\n${cleanText}`);
  await log.shot("viva-clean");

  /* Now with a ledger row shaped the way the database actually stores one. */
  backend.seed("misconceptions", [
    {
      id: "mc-1",
      user_id: backend.user.id,
      subject: "Biology",
      concept: "Osmosis direction",
      concept_key: "osmosis direction",
      summary: "Thinks water moves toward low concentration",
      status: "open",
      severity: "moderate",
      origin_tool: "quiz",
      times_observed: 2,
      times_corrected: 0,
      first_seen_at: "2026-09-10T00:00:00Z",
      last_seen_at: "2026-09-17T00:00:00Z",
      resolved_at: null,
      created_at: "2026-09-10T00:00:00Z",
      updated_at: "2026-09-17T00:00:00Z",
    },
  ]);

  log.did("Reloaded Viva, now with one real misconception on record");
  await page.reload();
  await page.waitForTimeout(3000);
  const seededText = await log.visibleText(700);
  const seededCrashed = /something went wrong|unexpected error/i.test(seededText);
  log.saw(`Valid ledger row — crashed? ${seededCrashed}`);
  log.saw(`Screen:\n${seededText}`);
  await log.shot("viva-valid-ledger");

  /* And the malformed row that was blamed, to confirm the mechanism. */
  backend.seed("misconceptions", [
    {
      id: "mc-2",
      user_id: backend.user.id,
      subject: "Biology",
      concept: "Broken row",
      concept_key: "broken row",
      summary: "No last_seen_at on this one",
      status: "open",
      severity: "moderate",
      origin_tool: "quiz",
      times_observed: 1,
      times_corrected: 0,
      created_at: "2026-09-10T00:00:00Z",
    },
  ]);
  log.did("Reloaded again with a row missing last_seen_at (not possible in the real DB)");
  await page.reload();
  await page.waitForTimeout(3000);
  const brokenText = await log.visibleText(500);
  const brokenCrashed = /something went wrong|unexpected error/i.test(brokenText);
  log.saw(`Malformed row — crashed? ${brokenCrashed}`);
  await log.shot("viva-malformed-ledger");

  log.write({ cleanCrashed, seededCrashed, brokenCrashed });
  expect(page.url()).toContain("/app");
});

test("does the Solver admit it when the AI call failed", async ({
  page,
  backend,
}) => {
  const log = new StudentLog("10-verify-fallback", page);

  backend.stub("learnora-ai", 500, { error: "server exploded" });

  await loginAs(page);
  log.did("Opened the Step-by-Step Solver while the AI backend is down");
  await page.goto("solver");
  await page.waitForTimeout(2000);

  const box = page.locator("textarea, input[type=text]").first();
  await box.fill("i keep messing up algebra fractions idk why").catch(() => {});
  const go = page
    .getByRole("button", { name: /diagnose|find|start|analy/i })
    .first();
  await go.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(4000);

  const after = await log.visibleText(2000);
  log.saw(`What the student sees after the AI failed:\n${after}`);
  await log.shot("solver-ai-down");

  /* The student's question: is there anything at all telling me this is not
     a real answer? */
  const admits =
    /couldn'?t reach|offline|failed|try again|error|unavailable|problem|check your connection/i.test(
      after,
    );
  log.saw(`Does the screen admit anything went wrong? ${admits}`);
  const looksLikeDiagnosis = /layer|root|cause|prerequisite|step/i.test(after);
  log.saw(`Does it still present a confident diagnosis? ${looksLikeDiagnosis}`);

  log.write({ admits, looksLikeDiagnosis });
  expect(page.url()).toContain("/app");
});
