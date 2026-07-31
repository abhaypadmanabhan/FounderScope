import { defineConfig } from "vitest/config";
import path from "node:path";

// Evalite reads this file too — its `@` alias is how eval files resolve
// `@/lib/...`. Eval-specific settings belong in evals/, not here: an eval env
// var leaking into the unit suite would hand a hung unit test a long leash.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
