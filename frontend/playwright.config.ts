import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src/testing/e2e",
  testMatch: /\.spec\.(ts|tsx)$/,
  testIgnore: ["**/*.test.ts", "**/*.test.tsx"],

  workers: 1,
  fullyParallel: false,

  use: {
    trace: "on-first-retry",
    headless: true,
    launchOptions: {
      args: ["--disable-gpu", "--disable-software-rasterizer", "--no-sandbox"],
    },
  },
});
