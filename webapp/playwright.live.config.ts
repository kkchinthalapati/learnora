import { defineConfig, devices } from "@playwright/test";

/* Configuration for the live-account pass (tests/live).
 *
 * Separate from playwright.config.ts because almost every setting has to be
 * the opposite of the mocked suite's. There is no webServer here: the target
 * is whatever LEARNORA_BASE_URL points at, normally the deployed site, and
 * starting a dev server would invite a run against the wrong thing.
 *
 * No retries, ever. A retry re-asks a real model, spends another slice of
 * the daily allowance, and produces a different answer — so a "flaky" result
 * here is data about the product, not noise to paper over.
 *
 *   LEARNORA_LIVE=1            required, the deliberate speed bump
 *   LEARNORA_TEST_EMAIL        a throwaway student account, never the owner's
 *   LEARNORA_TEST_PASSWORD
 *   LEARNORA_BASE_URL          defaults to a local dev server on 5199
 *
 * See tests/live/README.md for what this costs and how to clean up after it.
 */

const BASE_URL = process.env.LEARNORA_BASE_URL ?? "http://localhost:5199/app/";

export default defineConfig({
  testDir: "./tests/live",
  /* One at a time. Parallel students would race each other's rows in the
     same account and would burn the per-tool daily allowance in seconds. */
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  /* A model round trip is seconds, and some journeys ask several questions
     in sequence before they assert anything. */
  timeout: 300_000,
  expect: { timeout: 30_000 },

  use: {
    baseURL: BASE_URL,
    /* Kept for every run, not just failures: the recording *is* the result
       of this suite, and a trace is the only way to see what the student
       saw around an answer that read badly. */
    trace: "on",
    screenshot: "on",
    video: "off",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
  },
});
