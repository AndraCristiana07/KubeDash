import { test, expect, _electron as electron } from "@playwright/test";

test("Verify loading state flags and backend API exception handling", async () => {
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

  const mockErrorMessage =
    "Deployment constraints violated: invalid cluster cluster-role mapping";

  await window.route("**/api/cluster/manifests/apply", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: mockErrorMessage }),
    });
  });

  // open both deploy pod and YAML modal
  await window
    .locator("button:has-text('Deploy New Pod')")
    .click({ force: true });
  await window
    .locator("button:has-text('Apply YAML Manifest')")
    .click({ force: true });

  // populate configuration text data
  const textarea = window.locator("textarea[placeholder*='apiVersion']");
  await textarea.fill(
    "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: target-error-pod",
  );

  // define buttons relative to their container layout
  const modalFooter = window.locator("div.bg-\\[\\#E7E1B1\\]\\/20");
  const cancelButton = modalFooter
    .locator("button")
    .filter({ hasText: "Cancel" });

  // find the submit button by looking for the last button inside the container
  const executeButton = modalFooter.locator("button").last();

  // click button
  await executeButton.click({ force: true });

  // verify loading states during loadinf
  await expect(executeButton).toHaveText("Orchestrating...");
  await expect(executeButton).toBeDisabled();
  await expect(cancelButton).toBeDisabled();

  // verify error toast exists
  const modalHeader = window.locator("h3:has-text('Manifest Deployment')");
  await expect(modalHeader).toBeVisible({ timeout: 10000 });

  // verify the error notification maps accurately inside viewport frames
  await expect(window.locator(`text=/${mockErrorMessage}/i`)).toBeVisible({
    timeout: 5000,
  });

  await electronApp.close();
});
