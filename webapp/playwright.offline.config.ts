import { defineConfig, devices } from "@playwright/test";

/* Offline flashcard review, end to end, against a PRODUCTION build.
 *
 * Kept apart from playwright.config.ts on purpose: that suite drives the
 * vite dev server, where modules are served one by one from /src and the
 * service worker's caching never sees a real build — an offline test there
 * would prove nothing about what students get. This builds the app and
 * serves it with `vite preview` under /app/, exactly as deployed, so the
 * real public/sw.js installs, caches the real hashed bundles, and serves the
 * app with the network switched off.
 *
 *   npx playwright test -c playwright.offline.config.ts
 *
 * The backend is the same in-browser mock the e2e suite uses
 * (tests/e2e/support/mockBackend.ts): nothing reaches a real Supabase. */

const PORT = Number(process.env.OFFLINE_E2E_PORT ?? 4174);
const BASE_URL = `http://127.0.0.1:${PORT}/app/`;
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: "./tests/offline",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    serviceWorkers: "allow",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
