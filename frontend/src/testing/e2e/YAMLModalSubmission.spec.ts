import { test, expect, _electron as electron } from "@playwright/test";

test("Verify automated manifest submission and mock response validation", async () => {
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

  // intercept the cluster backend apply routing path
  await window.route("**/api/cluster/manifests/apply", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const payload = request.postDataJSON();

      expect(payload).toHaveProperty("yaml_string");
      expect(payload).toHaveProperty("namespace");

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          applied: ["worker-node-pod-deployment"],
        }),
      });
    }
  });

  // open the deploy modal
  const deployButton = window.locator("button:has-text('Deploy New Pod')");
  await expect(deployButton).toBeVisible({ timeout: 15000 });
  await deployButton.click();

  // open the YAML modal
  const applyYamlButton = window.locator(
    "button:has-text('Apply YAML Manifest')",
  );
  await expect(applyYamlButton).toBeVisible({ timeout: 5000 });
  await applyYamlButton.click();

  // populate manifest values
  const textarea = window.locator("textarea[placeholder*='apiVersion']");
  await textarea.fill(
    "apiVersion: v1\nkind: Pod\nmetadata:\n  name: mock-test",
  );

  // apply YAML code
  const executeButton = window.locator("button:has-text('Execute Apply')");
  await expect(executeButton).toBeEnabled();
  await executeButton.click();

  // close
  const modalHeader = window.locator("h3:has-text('Manifest Deployment')");
  await expect(modalHeader).toBeHidden({ timeout: 7000 });

  await expect(
    window.locator(
      "text=/Successfully deployed pod worker-node-pod-deployment/i",
    ),
  ).toBeVisible({ timeout: 5000 });

  await electronApp.close();
});
