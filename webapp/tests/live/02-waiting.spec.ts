import { test, expect, signIn, dismissActionPrompt, LiveTranscript } from "./support/liveFixtures";

/* Live journey 2 — what the wait looks like.
 *
 * The measured first answer is about thirty seconds, roughly ten of it web
 * research. This checks the student is told which half they are in, and
 * that Stop both appears and actually ends the request.
 *
 * It has to be live: against a stub the reply lands in ~30ms and the wait
 * states never render at all.
 */

test("a long wait explains itself and can be stopped", async ({ page, live }) => {
  const t0 = Date.now();
  const transcript = new LiveTranscript("02-waiting");

  await signIn(page, live);
  await page.getByRole("button", { name: /ask/i }).first().click();
  await page.waitForTimeout(1500);
  await dismissActionPrompt(page);

  const box = page.getByLabel("AI chat input");
  const send = page.getByRole("button", { name: "Send message" });

  /* The dead-looking control from the report: pressable with nothing typed,
     doing nothing when pressed. */
  await expect(send, "send is offered with an empty box").toBeDisabled();

  await box.fill("explain refraction of light for my physics test");
  await expect(send).toBeEnabled();
  await box.press("Enter");

  /* Early in the wait it should name the step rather than show bare dots. */
  await page.waitForTimeout(2500);
  const earlyLabel = await page
    .locator("[class*=thinkingLabel]")
    .first()
    .innerText({ timeout: 2000 })
    .catch(() => "");
  const sendDisabledInFlight = await send.isDisabled().catch(() => false);

  /* Stop is deliberately withheld until the wait is worth abandoning. */
  const stopEarly = await page
    .getByRole("button", { name: "Stop" })
    .isVisible()
    .catch(() => false);

  /* Wait for one of two outcomes rather than assuming the request is still
     running at a fixed moment. Only the first question of a session takes
     ~30s (cold, plus web research); follow-ups land in 8-11s, so a hard
     11-second checkpoint raced the answer and the first run of this test
     failed on its own premise rather than on the product. */
  const stopLate = page.getByRole("button", { name: "Stop" });
  const pendingLabel = page.locator("[class*=thinkingLabel]");
  const deadline = Date.now() + 25_000;
  let stopShown = false;
  let answeredFirst = false;

  while (Date.now() < deadline) {
    if (await stopLate.isVisible().catch(() => false)) {
      stopShown = true;
      break;
    }
    if ((await pendingLabel.count().catch(() => 0)) === 0) {
      answeredFirst = true;
      break;
    }
    await page.waitForTimeout(500);
  }
  const lateLabel = await pendingLabel
    .first()
    .innerText({ timeout: 2000 })
    .catch(() => "");

  transcript.record({
    step: "during the wait",
    asked: "explain refraction of light for my physics test",
    answered: `early label: "${earlyLabel}" | late label: "${lateLabel}" | send disabled in flight: ${sendDisabledInFlight} | Stop at 2.5s: ${stopEarly} | Stop before answer: ${stopShown} | answered before 10s: ${answeredFirst}`,
    waitedMs: 11_500,
  });

  if (stopShown) {
    await stopLate.click();
    await page.waitForTimeout(2500);
    const after = await page
      .locator("[class*=aiBubble]")
      .last()
      .innerText({ timeout: 2000 })
      .catch(() => "");
    transcript.record({
      step: "after pressing Stop",
      asked: "(pressed Stop)",
      answered: after,
      waitedMs: 2500,
    });
    /* Stopping must end the wait, not hide it — and must not leave the
       student looking at something dressed up as a failure. */
    await expect(page.locator("[class*=thinkingLabel]")).toHaveCount(0);
    expect(after.toLowerCase()).toContain("stopped");
    await expect(send).toBeEnabled();
  }

  transcript.write();
  /* The two guarantees that hold however fast the model is. */
  expect(earlyLabel.length, "the wait showed no explanation at all").toBeGreaterThan(0);
  expect(sendDisabledInFlight, "send stayed pressable mid-request").toBe(true);

  /* Stop is only promised on a wait long enough to deserve one. If the
     answer beat the threshold there is nothing to assert, and saying so is
     better than failing the product for being fast. */
  if (answeredFirst) {
    test.info().annotations.push({
      type: "note",
      description: "answered inside 10s, so the Stop path was not exercised",
    });
  } else {
    expect(stopShown, "Stop never appeared on a long wait").toBe(true);
  }

  console.log(`[live] body finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
});
