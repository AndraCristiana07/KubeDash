import { test, expect, _electron as electron } from "@playwright/test";

test("Verify historical timelines sub-tab loads and draws charts", async () => {
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

  // mock API route
  await page.route("**/api/cluster/metrics/history", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        history: [
          { timestamp: 1719100000, cpu_usage: 300, mem_usage: 512 },
          { timestamp: 1719100010, cpu_usage: 800, mem_usage: 600 },
          { timestamp: 1719100020, cpu_usage: 450, mem_usage: 550 },
        ],
      }),
    });
  });

  // navigate to metrics
  const metricsTabButton = page.locator("button:has-text('Metrics')").first();
  await metricsTabButton.scrollIntoViewIfNeeded();
  await metricsTabButton.click({ force: true });

  // click the charts tab
  const timelineSubTab = page
    .locator("button:has-text('Timeline'), button:has-text('History')")
    .first();
  await expect(timelineSubTab).toBeVisible({ timeout: 5000 });
  await timelineSubTab.click({ force: true });

  // await the text to be visible
  const cpuHeading = page.locator(
    "text=Aggregate Cluster CPU Allocation (Millicores)",
  );
  await expect(cpuHeading).toBeVisible({ timeout: 10000 });

  const ramHeading = page.locator("text=Aggregate Cluster RAM Footprint (MiB)");
  await expect(ramHeading).toBeVisible({ timeout: 5000 });

  // parent layout containers
  const cpuChartSvg = page
    .locator("div", { hasText: "Aggregate Cluster CPU Allocation" })
    .locator("svg")
    .first();
  const ramChartSvg = page
    .locator("div", { hasText: "Aggregate Cluster RAM Footprint" })
    .locator("svg")
    .first();

  await expect(cpuChartSvg).toBeVisible({ timeout: 5000 });
  await expect(ramChartSvg).toBeVisible({ timeout: 5000 });

  // look inside the chart container for drawing paths ('d' attributes)
  const cpuDataPath = cpuChartSvg.locator("path[d]");
  const ramDataPath = ramChartSvg.locator("path[d]");

  await expect(cpuDataPath.first()).toBeAttached({ timeout: 5000 });
  await expect(ramDataPath.first()).toBeAttached({ timeout: 5000 });

  await electronApp.close();
});
