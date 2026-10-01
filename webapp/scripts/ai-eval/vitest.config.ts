import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../vite.config";

/* The app's own test environment (jsdom, MSW, setup file), pointed at the
   harness instead of src/. */
export default mergeConfig(
  base,
  defineConfig({ test: { include: ["scripts/ai-eval/**/*.eval.ts"], exclude: [] } }),
);
