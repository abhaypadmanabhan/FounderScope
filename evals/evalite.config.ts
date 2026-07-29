import { defineConfig } from "evalite/config";

/**
 * Evalite runner config. Evalite loads evalite.config.* from the project root;
 * this file lives under evals/ until a root symlink is added post-merge.
 * Defaults here apply when imported; `npm run eval` uses Evalite CLI defaults
 * (include: **/*.eval.ts, exclude from vitest via vitest.config.ts).
 */
export default defineConfig({
  testTimeout: 600_000,
  maxConcurrency: 2,
  hideTable: false,
  scoreThreshold: 0,
});
