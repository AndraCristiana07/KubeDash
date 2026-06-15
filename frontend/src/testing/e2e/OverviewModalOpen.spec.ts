import { test, expect, _electron as electron } from "@playwright/test";

test("Verify clicking deployment action opens modal successfully", async () => {
  const electronApp = await electron.launch({
    args: [
      ".",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--no-sandbox",
    ],
  });

  const window = await electronApp.firstWindow();

  // cold-start engine
  await window.reload({ waitUntil: "domcontentloaded" });
  await window.waitForSelector("body");

  // click deploy button
  const deployButton = window.locator("button:has-text('Deploy New Pod')");
  await expect(deployButton).toBeVisible({ timeout: 15000 });
  await deployButton.click();

  // check modal opened
  const modalHeader = window.locator(
    "h3:has-text('Deploy New Workspace Workload')",
  );
  await expect(modalHeader).toBeVisible({ timeout: 5000 });

  await window.locator("button:has-text('Cancel')").click();
  await expect(modalHeader).toBeHidden();

  await electronApp.close();
});
