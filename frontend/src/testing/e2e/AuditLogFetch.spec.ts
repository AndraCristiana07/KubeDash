import { test, expect, _electron as electron } from "@playwright/test";

const mockAuditLogs = {
  logs: [
    {
      id: 101,
      pod_name: "kubedash-backend-7f85",
      namespace: "kube-system",
      message: "Core engine container initialized",
      level: "Normal",
      created_at: "2026-06-15T08:30:00Z",
    },
  ],
  total_items: 1,
  current_page: 1,
};

test("Verify audit log view queries backend endpoints with parameters", async () => {
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

  let interceptedUrl = "";

  // set up API call
  await window.route("**/api/logs*", async (route) => {
    interceptedUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockAuditLogs),
    });
  });

  await window.reload({ waitUntil: "domcontentloaded" });
  await window.waitForSelector("body");

  // go to audit logs page
  const navButton = window
    .locator(
      "button:has-text('Audit Logs'), a:has-text('Audit Logs'), [role='tab']:has-text('Logs')",
    )
    .first();
  await expect(navButton).toBeVisible({ timeout: 15000 });
  await navButton.click({ force: true });

  const componentHeader = window.locator(
    "h2:has-text('Cluster Audit Log History')",
  );
  await expect(componentHeader).toBeVisible({ timeout: 10000 });

  // assert initial query structure
  await expect.poll(() => interceptedUrl).toContain("limit=50&page=1");

  // verify dataset is on page
  const logMessageCell = window.locator(
    "text=/Core engine container initialized/i",
  );
  await expect(logMessageCell).toBeVisible({ timeout: 5000 });
  await expect(
    window.locator("td:has-text('kubedash-backend-7f85')"),
  ).toBeVisible();

  //confirm pagination info display correct totals
  const pageLabel = window.locator("text=/Showing 1 of 1 audit events/i");
  await expect(pageLabel).toBeVisible();

  await electronApp.close();
});
