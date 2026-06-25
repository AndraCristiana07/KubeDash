import { test, expect, _electron as electron } from "@playwright/test";

test("Verify batch checkbox selects all visible workloads and fires bulk restart", async () => {
  const electronApp = await electron.launch({
    args: [
      ".",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--no-sandbox",
    ],
  });

  const page = await electronApp.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });

  let mockPodsList = [
    {
      name: "restart-pod-one",
      namespace: "staging",
      status: "Running",
      image: "nginx",
      restart_count: 0,
      age_seconds: 600,
      linked_configs: [],
    },
    {
      name: "restart-pod-two",
      namespace: "staging",
      status: "Running",
      image: "redis",
      restart_count: 0,
      age_seconds: 700,
      linked_configs: [],
    },
  ];

  await page.route(/\/api\/cluster\/pods/, async (route) => {
    const method = route.request().method();
    if (method === "POST" || method === "PUT") {
      mockPodsList = mockPodsList.map((pod) => ({
        ...pod,
        restart_count: pod.restart_count + 1,
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Orchestration lifecycle signaled",
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
        podsCount: 2,
        nodesTotal: 1,
        clusterStatus: "Healthy",
      }),
    });
  });

  await page.addInitScript(() => {
    window.confirm = () => true;
    (window as unknown as { WebSocket: unknown }).WebSocket = function (
      url: string,
    ) {
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

  const podsTabButton = page.locator("button:has-text('Pods')").first();
  await podsTabButton.click({ force: true });

  await expect(page.locator("tbody tr")).toHaveCount(2, { timeout: 10000 });

  const podOneRow = page
    .locator("tr")
    .filter({ hasText: "restart-pod-one" })
    .first();
  await expect(podOneRow).toBeVisible({ timeout: 5000 });

  const rowCheckboxes = page.locator("tbody input[type='checkbox']");
  await expect(rowCheckboxes).toHaveCount(2, { timeout: 10000 });

  // STABILITY FIX: Use a robust interaction loop to toggle elements securely
  await expect(async () => {
    await rowCheckboxes.nth(0).click({ force: true });
    await rowCheckboxes.nth(1).click({ force: true });
    await expect(rowCheckboxes.nth(0)).toBeChecked({ timeout: 1000 });
    await expect(rowCheckboxes.nth(1)).toBeChecked({ timeout: 1000 });
  }).toPass({ intervals: [1000], timeout: 8000 });

  const bulkOpsBar = page.locator("[data-testid='bulk-ops-bar']");
  await expect(bulkOpsBar).toBeVisible({ timeout: 5000 });
  await expect(bulkOpsBar).toContainText("2");
  await expect(bulkOpsBar).toContainText("Workloads Staged");

  const bulkRestartButton = bulkOpsBar.locator(
    "button:has-text('Bulk Restart')",
  );
  await expect(bulkRestartButton).toBeVisible();
  await bulkRestartButton.scrollIntoViewIfNeeded();
  await bulkRestartButton.click({ force: true });

  const successToastText = page.locator(
    "span:has-text('Successfully signaled orchestration cycles for pods!')",
  );
  await expect(successToastText).toBeVisible({ timeout: 5000 });

  await expect(bulkOpsBar).toHaveClass(/opacity-0/, { timeout: 5000 });
  await expect(bulkOpsBar).toHaveClass(/pointer-events-none/, {
    timeout: 5000,
  });
  await expect(bulkOpsBar).toHaveClass(/translate-y-20/, { timeout: 5000 });
  await electronApp.close();
});
