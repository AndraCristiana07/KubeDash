import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src/testing/e2e",
  testMatch: /\.spec\.(ts|tsx)$/,
  testIgnore: ["**/*.test.ts", "**/*.test.tsx"],
  timeout: process.env.CI ? 60000 : 30000,
  expect: {
    /* max an expect() assertion like toBeVisible() will wait for an element */
    timeout: process.env.CI ? 15000 : 5000,
  },

  workers: 1,
  fullyParallel: false,

  reporter: process.env.CI ? "list" : "html",

  use: {
    actionTimeout: process.env.CI ? 15000 : 0,
    trace: "on-first-retry",
  },
});
