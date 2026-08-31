import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.test.ts"],
    setupFiles: ["./tests/e2e/setup.mjs"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    teardownTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": root,
    },
  },
});
