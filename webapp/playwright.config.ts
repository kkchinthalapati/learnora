import { defineConfig, devices } from "@playwright/test";

/* End-to-end configuration for the critical-path suite (tests/e2e).
 *
 * These are the tests that answer "is the product still usable?" — sign-in,
 * paying, generating, taking a quiz, reading a forecast — in a real browser
 * driving the real React app. They are deliberately a small, slow, high-value
 * layer above the 2387 Vitest specs, not a second copy of them.
 *
 * The backend is stubbed at the network boundary rather than hit for real.
 * `src/lib/supabase.ts` hard-codes one project URL, so every call the app
 * makes — PostgREST, GoTrue, edge functions — is interceptable with a single
 * `page.route` pattern (see tests/e2e/support/mockBackend.ts). That buys three
 * things a live Supabase cannot: determinism, no test account writing rows
 * into the production project, and the ability to make the server answer 429,
 * 500 or "never" on demand, which is most of what these tests are for.
 *
 * Browsers: `npx playwright install chromium` once, locally. On CI images that
 * ship their own build, point PLAYWRIGHT_CHROMIUM_PATH at the binary instead —
 * the browser download is deliberately skipped during deploys (scripts/build.sh
 * sets PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD), so nothing pulls ~400MB on Vercel.
 */

const PORT = Number(process.env.E2E_PORT ?? 5173);

/* The app is served under a path prefix in production (vite's `base`), and the
 * router carries the same basename, so every URL in the suite is relative to
 * /app/ — exactly as it is on the deployed site. */
const BASE_URL = `http://127.0.0.1:${PORT}/app/`;

const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: "./tests/e2e",
  /* One worker by default: the suite shares a single vite dev server, and a
     cold-start compile under four parallel workers is slower than running
     them in sequence, not faster. CI can raise it. */
  workers: process.env.CI ? 2 : undefined,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    /* Traces and screenshots only for failures — a green run should leave
       nothing behind to clean up. */
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
      testIgnore: /mobile\.spec\.ts$/,
    },
    {
      /* The mobile checks are about layout under a real small viewport, so
         they get their own project rather than a resize inside a test: the
         app reads the viewport at mount, and CSS media queries only settle
         properly when the page is loaded at that size. */
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /mobile\.spec\.ts$/,
    },
  ],

  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
