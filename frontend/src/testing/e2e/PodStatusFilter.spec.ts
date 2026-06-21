import { test, expect, _electron as electron } from "@playwright/test";

test("Verify status filter badges isolate rows by lifecycle phase and clear cleanly", async () => {
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

  const mockFilteredPods = [
    {
      name: "pod-running-1",
      namespace: "default",
      status: "Running",
      image: "nginx",
      restart_count: 0,
      age_seconds: 100,
      linked_configs: [],
    },
    {
      name: "pod-running-2",
      namespace: "default",
      status: "Running",
      image: "redis",
      restart_count: 1,
      age_seconds: 200,
      linked_configs: [],
    },
    {
      name: "pod-pending",
      namespace: "default",
      status: "Pending",
      image: "busybox",
      restart_count: 0,
      age_seconds: 10,
      linked_configs: [],
    },
    {
      name: "pod-failed",
      namespace: "default",
      status: "Failed",
      image: "postgres",
      restart_count: 5,
      age_seconds: 500,
      linked_configs: [],
    },
  ];

  // mock API routes
  await page.route(/\/api\/cluster\/pods/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ pods: mockFilteredPods }),
    });
  });

  await page.route(/\/api\/cluster\/summary/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        podsCount: 4,
        nodesTotal: 1,
        clusterStatus: "Warning",
      }),
    });
  });

  await page.reload({ waitUntil: "domcontentloaded" });

  const podsTabButton = page.locator("button:has-text('Pods')").first();
  await podsTabButton.click({ force: true });

  const runningRow = page
    .locator("tr")
    .filter({ hasText: "pod-running-1" })
    .first();
  const pendingRow = page
    .locator("tr")
    .filter({ hasText: "pod-pending" })
    .first();
  const failedRow = page
    .locator("tr")
    .filter({ hasText: "pod-failed" })
    .first();

  // check pods are visible before filtering
  await expect(runningRow).toBeVisible({ timeout: 5000 });
  await expect(pendingRow).toBeVisible();
  await expect(failedRow).toBeVisible();

  // click failed badge to filter pods
  const failedBadge = page
    .locator("button:has-text('Failed'), [role='button']:has-text('Failed')")
    .first();
  await expect(failedBadge).toBeVisible();
  await failedBadge.click({ force: true });
  await page.waitForTimeout(150);

  await expect(failedRow).toBeVisible();
  await expect(runningRow).toBeHidden();
  await expect(pendingRow).toBeHidden();

  // click pending badge to filter pods
  const pendingBadge = page
    .locator("button:has-text('Pending'), [role='button']:has-text('Pending')")
    .first();
  await pendingBadge.click({ force: true });
  await page.waitForTimeout(150);

  await expect(pendingRow).toBeVisible();
  await expect(failedRow).toBeHidden();
  await expect(runningRow).toBeHidden();

  // click all badge to show all pods
  const allBadge = page
    .locator("button:has-text('All'), [role='button']:has-text('All')")
    .first();

  if (await allBadge.isVisible()) {
    await allBadge.click({ force: true });
  } else {
    await pendingBadge.click({ force: true });
  }
  await page.waitForTimeout(150);

  await expect(runningRow).toBeVisible();
  await expect(pendingRow).toBeVisible();
  await expect(failedRow).toBeVisible();

  await electronApp.close();
});
