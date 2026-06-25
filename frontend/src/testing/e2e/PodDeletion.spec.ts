import { test, expect, _electron as electron } from "@playwright/test";

test("Verify pod deletion removes table rows and dynamically updates metrics", async () => {
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

  let currentPodCount = 1;
  let mockPodsList = [
    {
      name: "terminator-service-pod",
      namespace: "production",
      status: "Running",
      image: "nginx:latest",
      restart_count: 0,
      age_seconds: 3600,
      linked_configs: [],
    },
  ];

  await page.route("*/**/api/cluster/pods*", async (route) => {
    const method = route.request().method();

    if (method === "DELETE") {
      currentPodCount = 0;
      mockPodsList = [];

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ pods: mockPodsList }),
      });
    }
  });

  await page.route("*/**/api/cluster/summary*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        podsCount: currentPodCount,
        nodesTotal: 1,
        clusterStatus: "Healthy",
      }),
    });
  });

  await page.addInitScript(() => {
    (window as unknown as { WebSocket: unknown }).WebSocket = function (
      url: string,
    ) {
      return {
        url: url,
        readyState: 0,
        onopen: null as (() => void) | null,
        onmessage: null as ((event: { data: string }) => void) | null,
        onclose: null as (() => void) | null,
        onerror: null as (() => void) | null,

        send: function () {},
        close: function () {},
      };
    };

    window.confirm = () => true;
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body");

  const workloadsCard = page
    .locator("div.bg-\\[\\#E7E1B1\\]\\/40")
    .filter({ hasText: "Total Workloads" })
    .first();
  const refreshMetricsButton = page
    .locator("button:has-text('Refresh Metrics')")
    .first();

  await expect(refreshMetricsButton).toBeVisible();
  await refreshMetricsButton.click({ force: true });
  await expect(workloadsCard).toContainText("1 Pods Running", {
    timeout: 5000,
  });

  const podsTabButton = page.locator("button:has-text('Pods')").first();
  await podsTabButton.click({ force: true });

  const targetPodRow = page
    .locator("tr")
    .filter({ hasText: "terminator-service-pod" })
    .first();
  await expect(targetPodRow).toBeVisible({ timeout: 5000 });

  const deleteActionButton = targetPodRow
    .locator("button:has-text('Del'), button.text-red-700")
    .first();

  await deleteActionButton.click({ force: true });

  await expect(targetPodRow).toBeHidden({ timeout: 5000 });

  const overviewTabButton = page
    .locator("button:has-text('Overview'), button:has-text('Dashboard')")
    .first();
  await overviewTabButton.click({ force: true });

  await expect(workloadsCard).toContainText("0 Pods Running", {
    timeout: 5000,
  });

  await electronApp.close();
});
