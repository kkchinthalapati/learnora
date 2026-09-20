import { test, expect, loginAs } from "../e2e/support/fixtures";
import { StudentLog } from "./support/record";

/* Journey 12 — one finished session should be one logged session.
 *
 * Journey 03 recorded a single stopwatch run writing two rows, the second
 * with its note dropped, which double-counted the minutes and replaced the
 * completion screen with the note-less copy that offers no quick check.
 *
 * This has to run in a real browser: both paths that log a session schedule
 * the write from inside a `setState` updater, and it is StrictMode's
 * double-invocation of updaters — present in the dev build the student uses
 * and absent in jsdom — that turns one run into two rows. The jsdom test in
 * TimerView.test.tsx passes either way and says so in its own comment.
 *
 * The clock is seeded with three banked minutes rather than waiting out a
 * real minute: "Stop & log" appears once a whole minute is on it, and what
 * is under test is the logging, not the counting.
 */

test("a single stopwatch run logs exactly one session, keeping its note", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const log = new StudentLog("12-timer-log", page);

  await loginAs(page);

  log.did("Opened the Focus timer with three minutes already banked");
  await page.evaluate(() => {
    localStorage.setItem(
      "timer_state",
      JSON.stringify({
        type: "stopwatch",
        mode: "Focus",
        isRunning: false,
        elapsed: 180,
        countUpBase: 180,
        config: {},
      }),
    );
    localStorage.removeItem("sessions");
  });
  await page.goto("timer");
  await page.waitForTimeout(2500);

  log.did("Typed what I covered, so the session carries a note");
  await page
    .getByPlaceholder("e.g. Ch. 4 equilibrium problems 1–12")
    .fill("Photosynthesis")
    .catch(() => {});
  await page.waitForTimeout(300);

  const stop = page.getByRole("button", { name: "Stop & log" }).first();
  await stop.waitFor({ state: "visible", timeout: 20_000 });

  log.did("Pressed Stop & log, once");
  await stop.click();
  await page.waitForTimeout(3000);

  const sessions = await page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem("sessions") ?? "[]") as Array<
        Record<string, unknown>
      >;
    } catch {
      return [];
    }
  });

  log.saw(`Sessions written for one run: ${sessions.length}`);
  log.saw(
    `Rows: ${JSON.stringify(sessions.map((s) => ({ minutes: s.minutes, notes: s.notes })))}`,
  );
  await log.shot("after-stop-and-log");
  log.saw(`The completion screen:\n${await log.visibleText(600)}`);

  log.write({ sessionCount: sessions.length, sessions });

  expect(sessions).toHaveLength(1);
  /* The note surviving is the point: the duplicate was the row that lost it,
     and the completion panel reads the newest row. */
  expect(sessions[0]?.notes).toBe("Photosynthesis");
});
