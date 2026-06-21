import { test, expect, _electron as electron } from "@playwright/test";

test("Verify empty form state validation rules and modal closure", async () => {
  const electronApp = await electron.launch({
    args: [
      ".",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--no-sandbox",
    ],
  });
  const window = await electronApp.firstWindow();

  await window.reload({ waitUntil: "domcontentloaded" });
  await window.waitForSelector("body");

  // open the deploy pod and YAML modals
  await window
    .locator("button:has-text('Deploy New Pod')")
    .click({ force: true });
  await window
    .locator("button:has-text('Apply YAML Manifest')")
    .click({ force: true });

  // confirm target text area is visible
  const textarea = window.locator("textarea[placeholder*='apiVersion']");
  await expect(textarea).toBeVisible();

  // clear button should be disabled when the editor frame is empty
  const clearButton = window.locator("button:has-text('Clear')");
  await expect(clearButton).toBeDisabled();

  // trigger submission on an empty field to test validation notification
  const executeButton = window.locator("button:has-text('Execute Apply')");
  await expect(executeButton).toBeDisabled(); // disabled

  // verify manual cancel action
  const cancelButton = window.locator("button:has-text('Cancel')");
  await cancelButton.click({ force: true });

  const modalHeader = window.locator("h3:has-text('Manifest Deployment')");
  await expect(modalHeader).toBeHidden({ timeout: 5000 });

  await electronApp.close();
});
