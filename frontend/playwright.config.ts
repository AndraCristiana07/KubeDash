import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src/testing/e2e",
  testMatch: /\.spec\.(ts|tsx)$/,
  testIgnore: ["**/*.test.ts", "**/*.test.tsx"],

  use: {
    trace: "on-first-retry",
  },
});
