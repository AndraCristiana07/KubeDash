import { test, expect, _electron as electron } from "@playwright/test";

test("Verify Deploy Workload Modal form entries and submit triggers", async () => {
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

  await window.reload({ waitUntil: "domcontentloaded" });
  await window.waitForSelector("body");

  // catchall API calls
  await window.route("**/api/cluster/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, applied: ["test-app-node99"] }),
    });
  });

  // open deploy pod modal
  const deployButton = window.locator("button:has-text('Deploy New Pod')");
  await deployButton.click({ force: true });

  const modalHeader = window.locator(
    "h3:has-text('Deploy New Workspace Workload')",
  );
  await expect(modalHeader).toBeVisible({ timeout: 5000 });

  // test input sanitization
  const nameInput = window.locator("input[placeholder*='custom-web-server']");
  await nameInput.fill("TEST_App_Node#99!");
  await expect(nameInput).toHaveValue("test-app-node99");

  // populate image field
  const imageInput = window.locator("input[placeholder*='nginx:alpine']");
  await imageInput.fill("nginx:latest");

  // locate buttons inside form layout
  const form = window.locator("form");
  const launchButton = form.locator("button[type='submit']");
  const cancelButton = form.locator("button[type='button']").first();

  // execute form submit
  await launchButton.click({ force: true });

  // verify loading state
  await expect(launchButton).toHaveText("Deploying...");
  await expect(launchButton).toBeDisabled();

  await expect(cancelButton).toBeEnabled();

  await electronApp.close();
});
