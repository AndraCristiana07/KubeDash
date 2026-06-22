import { test, expect, _electron as electron } from "@playwright/test";

test("Verify automated pod identity name input sanitization formats correctly", async () => {
  const electronApp = await electron.launch({
    args: [
      ".",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--no-sandbox",
    ],
  });

  const window = await electronApp.firstWindow();
  await window.setViewportSize({ width: 1440, height: 900 });

  // cold-start engine
  await window.reload({ waitUntil: "domcontentloaded" });
  await window.waitForSelector("body");

  const deployButton = window.locator("button:has-text('Deploy New Pod')");
  await expect(deployButton).toBeVisible({ timeout: 15000 });
  await deployButton.click({ force: true });

  const input = window.locator("input[placeholder*='custom-web-server']");
  await expect(input).toBeVisible();

  // input "bad" pod name
  await input.fill("INVALID_pod Name!");

  // verify sanitizer transforms it to lowercase alphanumeric
  await expect(input).toHaveValue("invalid-podname", { timeout: 5000 });

  await window.locator("button:has-text('Cancel')").click({ force: true });
  await electronApp.close();
});
