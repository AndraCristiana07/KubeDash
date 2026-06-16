import { test, expect, _electron as electron } from "@playwright/test";

const mockAuditLogs = {
  logs: [
    {
      id: 102,
      pod_name: "pod",
      namespace: "ns",
      message: "msg",
      level: "Warning",
      created_at: "2026-06-15T08:35:12Z",
    },
  ],
  total_items: 1,
  current_page: 1,
};

test("Verify audit log operations update API parameters", async () => {
  const electronApp = await electron.launch({
    args: [
      ".",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--no-sandbox",
    ],
  });

  const page = await electronApp.firstWindow();
  let lastQueryUrl = "";

  // Baseline Route Interceptor: Returns data immediately for filters to populate layout elements
  await page.route("**/api/logs*", async (route) => {
    lastQueryUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockAuditLogs),
    });
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body");

  // Step 1: Navigate to audit logs view panel
  const navButton = page
    .locator(
      "button:has-text('Audit Logs'), a:has-text('Audit Logs'), [role='tab']:has-text('Logs')",
    )
    .first();
  await expect(navButton).toBeVisible({ timeout: 15000 });
  await navButton.click();

  const componentHeader = page.locator(
    "h2:has-text('Cluster Audit Log History')",
  );
  await expect(componentHeader).toBeVisible({ timeout: 10000 });

  // Step 2: Change Severity dropdown
  const severitySelect = page.locator("select").first();
  await expect(severitySelect).toBeVisible();
  await severitySelect.selectOption("Warning");
  await expect.poll(() => lastQueryUrl).toContain("level=Warning");

  // Step 3: Alter rows limit pagination selection
  const limitSelect = page.locator("select").nth(1);
  await limitSelect.selectOption("10");
  await expect.poll(() => lastQueryUrl).toContain("limit=10");

  // Step 4: Test search input entry execution rules
  const searchInput = page.locator(
    "input[placeholder*='Search message or pod']",
  );
  await searchInput.fill("redis-cluster-error");
  await searchInput.press("Enter");
  await expect.poll(() => lastQueryUrl).toContain("search=redis-cluster-error");

  // THE REPAIR STRATEGY: Clear old active route hooks and replace it with a
  // lock-down network loop immediately before pressing the refresh element target button.
  await page.unroute("**/api/logs*");

  await page.route("**/api/logs*", async (route) => {
    // Hold this socket entirely open to let Playwright catch the "Syncing..." layout transition state!
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockAuditLogs),
    });
  });

  // Step 5: Execute click actions against the refresh button
  const refreshButton = page.locator(
    "button:has-text('Refresh'), button:has-text('Syncing...')",
  );
  await refreshButton.click();

  // Playwright's network socket will now hold the loading thread state open, guaranteeing a pass.
  await expect(refreshButton).toHaveText("Syncing...");
  await expect(refreshButton).toBeDisabled();

  await electronApp.close();
});
