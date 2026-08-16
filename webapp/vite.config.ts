/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* `base` is the piece Step 7 identified as missing and is what makes the
 * path-prefix cutover possible at all.
 *
 * Without it the build emits `/assets/index-<hash>.js`, which collides with the
 * vanilla app's root and 404s once this app is served from a subpath. With it,
 * every emitted URL — scripts, CSS, the imported logo — is prefixed, and
 * `import.meta.env.BASE_URL` carries the same value into runtime code that has
 * to build absolute URLs (the router's basename, Supabase's email redirects).
 *
 * The other half of Step 7's problem, that the vanilla app is hash-routed and
 * so a rewrite can never intercept `#settings`, is not solved by a config
 * value: a prefix sidesteps it. `/app/*` and `/#settings` cannot collide,
 * because the vanilla's routes live entirely in a fragment the server never
 * sees. Cutting a route over is then a redirect the vanilla app issues, not a
 * rewrite Vercel does — see vercel.json. */
const BASE = "/app/";

export default defineConfig({
  base: BASE,
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    /* Node 22+ ships its own global `localStorage`/`sessionStorage` (Web
     * Storage API), on by default since Node 24. It defines `localStorage`
     * on globalThis *before* the jsdom environment sets up window's version,
     * so without a `--localstorage-file` path it wins as a non-functional
     * stub — every test hits "localStorage.clear is not a function" instead
     * of ever reaching jsdom's real Storage implementation. Disabling Node's
     * own copy for the test worker processes is what lets jsdom's take over. */
    execArgv: ["--no-experimental-webstorage"],
    /* Vitest's 5s default is tight for this suite. A single test here mounts
     * jsdom, the whole provider stack and an MSW interceptor, then drives it
     * with userEvent — several already sit near 600ms on an idle machine, and
     * files run in parallel, so under load the slowest ones were tripping the
     * limit and failing for no reason other than contention. The undo-window
     * test in views/tasks also legitimately waits out a real 4s timer.
     *
     * This is a ceiling for pathological hangs, not a target: nothing should
     * come close to it, and a test that does is a bug worth looking at. */
    testTimeout: 20000,
    hookTimeout: 20000,
    maxWorkers: 4,
  },
});
