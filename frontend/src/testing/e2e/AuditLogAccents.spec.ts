import { test, expect, _electron as electron } from "@playwright/test";

const mockAuditLogs = {
  logs: [
    {
      id: 101,
      pod_name: "kubedash-backend-7f85", // should trigger highlight
      namespace: "kube-system",
      message: "Core engine initialized cleanly",
      level: "Normal",
      created_at: "2026-06-15T08:30:00Z",
    },
    {
      id: 102,
      pod_name: "payment-gateway-pod", // normal (no highlight)
      namespace: "production",
      message: "Database driver timeout warning encountered",
      level: "Warning",
      created_at: "2026-06-15T08:35:12Z",
    },
  ],
  total_items: 2,
  current_page: 1,
};

test("Verify audit log view highlights core system rows", async () => {
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

  await window.route("**/api/logs*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockAuditLogs),
    });
  });

  await window.reload({ waitUntil: "domcontentloaded" });
  await window.waitForSelector("body");

  //navigate to audit logs
  const navButton = window
    .locator(
      "button:has-text('Audit Logs'), a:has-text('Audit Logs'), [role='tab']:has-text('Logs')",
    )
    .first();
  await expect(navButton).toBeVisible({ timeout: 15000 });
  await navButton.click({ force: true });
  // locate individual row
  const systemCoreRow = window.locator("tr:has-text('kubedash-backend-7f85')");
  const standardUserRow = window.locator("tr:has-text('payment-gateway-pod')");

  await expect(systemCoreRow).toBeVisible({ timeout: 5000 });

  // extract className string values from DOM elements
  const coreClassList = (await systemCoreRow.getAttribute("class")) || "";
  const userClassList = (await standardUserRow.getAttribute("class")) || "";

  // check style
  expect(coreClassList).toContain("bg-amber-500/10");
  expect(coreClassList).toContain("border-l-amber-500");

  expect(userClassList).toContain("border-l-transparent");

  await electronApp.close();
});
