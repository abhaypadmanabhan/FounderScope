import { defineConfig } from "evalite/config";

/**
 * Evalite runner config (project root — required for CLI discovery).
 * Eval files use the .eval.ts suffix and are excluded from npm test via
 * vitest.config.ts, which only includes unit tests under __tests__.
 */
export default defineConfig({
  testTimeout: 600_000,
  maxConcurrency: 2,
  hideTable: false,
  scoreThreshold: 0,
});
