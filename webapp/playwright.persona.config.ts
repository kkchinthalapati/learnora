import { defineConfig, devices } from "@playwright/test";

/* Scratch config for the student-persona usability pass (tests/persona).
 * Temporary: delete along with tests/persona when the report is written.
 *
 * Points at an already-running dev server on 5199 (localhost, not 127.0.0.1 —
 * vite binds ::1 here) so several persona journeys can share one compile. */

const PORT = Number(process.env.PERSONA_PORT ?? 5199);
const BASE_URL = `http://localhost:${PORT}/app/`;

export default defineConfig({
  testDir: "./tests/persona",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "off",
    screenshot: "off",
    video: "off",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
