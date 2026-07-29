/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
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
  },
});
