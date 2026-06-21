import { test, expect, _electron as electron } from "@playwright/test";

test("Verify batch checkbox selects all visible workloads and fires bulk deletion", async () => {
  const electronApp = await electron.launch({
    args: [
      ".",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--no-sandbox",
    ],
  });

  await electronApp.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) mainWindow.maximize();
  });

  const page = await electronApp.firstWindow();

  let mockPodsList = [
    {
      name: "batch-pod-alpha",
      namespace: "production",
      status: "Running",
      image: "nginx",
      restart_count: 0,
      age_seconds: 300,
      linked_configs: [],
    },
    {
      name: "batch-pod-beta",
      namespace: "production",
      status: "Running",
      image: "redis",
      restart_count: 0,
      age_seconds: 400,
      linked_configs: [],
    },
    {
      name: "batch-pod-omega",
      namespace: "production",
      status: "Running",
      image: "node",
      restart_count: 0,
      age_seconds: 500,
      linked_configs: [],
    },
  ];

  // mock API routes
  await page.route(/\/api\/cluster\/pods/, async (route) => {
    const method = route.request().method();

    if (method === "DELETE") {
      const requestData = route.request().postDataJSON();
      console.log("Captured Batch Deletion Payload:", requestData);

      mockPodsList = [];

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Batch resources evicted cleanly",
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ pods: mockPodsList }),
      });
    }
  });

  await page.route(/\/api\/cluster\/summary/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        podsCount: mockPodsList.length,
        nodesTotal: 1,
        clusterStatus: "Healthy",
      }),
    });
  });

  await page.addInitScript(() => {
    window.confirm = () => true;
    (window as any).WebSocket = function (url: string) {
      return {
        url,
        readyState: 0,
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        send() {},
        close() {},
      };
    };
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body");

  // navigate to pods page
  const podsTabButton = page.locator("button:has-text('Pods')").first();
  await podsTabButton.click({ force: true });

  await expect(page.locator("tbody tr")).toHaveCount(3, { timeout: 10000 });

  const firstRow = page
    .locator("tr")
    .filter({ hasText: "batch-pod-alpha" })
    .first();
  await expect(firstRow).toBeVisible({ timeout: 5000 });

  // locate and click master checkbox
  const masterCheckbox = page
    .locator("thead input[type='checkbox'], th input[type='checkbox']")
    .first();
  await expect(masterCheckbox).toBeVisible();

  // await masterCheckbox.click();
  await masterCheckbox.click({ force: true });
  // await page.waitForTimeout(150);

  const rowCheckboxes = page.locator("tbody input[type='checkbox']");
  await expect(rowCheckboxes.first()).toBeChecked({ timeout: 5000 });

  const checkedCount = await rowCheckboxes.evaluateAll(
    (inputs: HTMLInputElement[]) =>
      inputs.filter((input) => input.checked).length,
  );

  expect(checkedCount).toBe(3);

  const bulkDeleteButton = page
    .locator("button:has-text('Mass Delete')")
    .first();

  await expect(bulkDeleteButton).toBeVisible({ timeout: 3000 });

  // force Playwright to scroll the element fully into the viewport
  // container before executing click
  await bulkDeleteButton.scrollIntoViewIfNeeded();
  await bulkDeleteButton.click({ force: true });

  await expect(firstRow).toBeHidden({ timeout: 10000 });

  await expect(
    page.locator("tr").filter({ hasText: "batch-pod-beta" }).first(),
  ).toBeHidden({ timeout: 5000 });

  await expect(
    page.locator("tr").filter({ hasText: "batch-pod-omega" }).first(),
  ).toBeHidden({ timeout: 5000 });

  await electronApp.close();
});
