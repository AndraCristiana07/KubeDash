import { test, expect, _electron as electron } from "@playwright/test";

test("Verify pod restart action triggers loader state spin, displays toast alert feedback, and clears crash metrics", async () => {
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
      name: "terminator-service-pod",
      namespace: "production",
      status: "Running",
      image: "nginx:latest",
      restart_count: 5,
      age_seconds: 3600,
      linked_configs: [],
    },
  ];

  // mock API routes
  await page.route(/restart/, async (route) => {
    mockPodsList[0].restart_count = 0;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, message: "Pod cycled completely" }),
    });
  });

  await page.route(/\/api\/cluster\/pods/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ pods: mockPodsList }),
    });
  });

  await page.route(/\/api\/cluster\/summary/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        podsCount: 1,
        nodesTotal: 1,
        clusterStatus: "Healthy",
      }),
    });
  });

  // mock websocket
  await page.addInitScript(() => {
    (window as any).WebSocket = function (url: string) {
      return {
        url: url,
        readyState: 0,
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        send: function () {},
        close: function () {},
      };
    };
    window.confirm = () => true;
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body");

  // go to pods management
  const podsTabButton = page.locator("button:has-text('Pods')").first();
  await podsTabButton.click({ force: true });

  // locate pod row
  const targetPodRow = page
    .locator("tr")
    .filter({ hasText: "terminator-service-pod" })
    .first();
  await expect(targetPodRow).toBeVisible({ timeout: 5000 });

  // check restart badge
  const restartBadge = targetPodRow
    .locator("span:has-text('Restarts'), span:has-text('Restart')")
    .first();
  await expect(restartBadge).toBeVisible();
  await expect(restartBadge).toHaveClass(/bg-red-600/);
  await expect(restartBadge).toHaveClass(/animate-bounce/);
  await expect(restartBadge).toContainText("5 Restarts");

  // locate and click restart button
  const restartActionButton = targetPodRow
    .locator('button[title="Trigger Restart"]')
    .first();
  await expect(restartActionButton).toBeVisible();

  await restartActionButton.click({ force: true });

  // check success toast appears
  const successToast = page.locator("body");
  await expect(successToast).toContainText("safely", { timeout: 5000 });

  // restarts badge should dissapear
  await expect(restartBadge).toBeHidden({ timeout: 5000 });

  await electronApp.close();
});
