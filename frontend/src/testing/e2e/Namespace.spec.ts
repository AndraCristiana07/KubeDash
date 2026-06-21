import { test, expect, _electron as electron } from "@playwright/test";

test("Verify changing the namespace inside settings dynamically updates cross-tab API requests", async () => {
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
    if (mainWindow) {
      mainWindow.maximize();
    }
  });

  const page = await electronApp.firstWindow();

  // mock API routes
  await page.route(/\/api\/cluster\/pods/, async (route) => {
    const url = route.request().url();

    if (url.includes("namespace=production")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pods: [
            {
              name: "production-core-service",
              namespace: "production",
              status: "Running",
              image: "nginx:alpine",
              restart_count: 0,
              age_seconds: 50000,
              linked_configs: [],
            },
          ],
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pods: [
            {
              name: "default-sandbox-pod",
              namespace: "default",
              status: "Running",
              image: "redis:latest",
              restart_count: 1,
              age_seconds: 1200,
              linked_configs: [],
            },
          ],
        }),
      });
    }
  });

  await page.route(/\/api\/cluster\/summary/, async (route) => {
    const url = route.request().url();

    if (url.includes("namespace=production")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          podsCount: 15,
          nodesTotal: 3,
          clusterStatus: "Healthy",
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          podsCount: 1,
          nodesTotal: 1,
          clusterStatus: "Healthy",
        }),
      });
    }
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
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body");

  // locate total pods card
  const workloadsCard = page
    .locator("div.bg-\\[\\#E7E1B1\\]\\/40")
    .filter({ hasText: "Total Workloads" })
    .first();
  const refreshMetricsButton = page
    .locator("button:has-text('Refresh Metrics')")
    .first();

  await refreshMetricsButton.click({ force: true });
  // there should be 1 pod running
  await expect(workloadsCard).toContainText("1 Pods Running", {
    timeout: 5000,
  });

  // go to pods management page and see pod
  const podsTabButton = page.locator("button:has-text('Pods')").first();
  await podsTabButton.click({ force: true });

  const defaultRow = page
    .locator("tr")
    .filter({ hasText: "default-sandbox-pod" })
    .first();
  await expect(defaultRow).toBeVisible({ timeout: 5000 });

  // go to settings
  const settingsTabButton = page.locator("button:has-text('Settings')").first();
  await settingsTabButton.click({ force: true });

  const namespaceInput = page.locator("input[type='text']").first();

  await expect(namespaceInput).toBeVisible({ timeout: 5000 });

  // change namespace name
  await expect(namespaceInput).toBeAttached();
  await namespaceInput.clear();
  await namespaceInput.fill(" PRODUCTION ");
  await expect(namespaceInput).toHaveValue("production");

  await podsTabButton.click({ force: true });

  await expect(defaultRow).toBeHidden({ timeout: 5000 });

  // see new pod that is in the production namespace
  const productionRow = page
    .locator("tr")
    .filter({ hasText: "production-core-service" })
    .first();
  await expect(productionRow).toBeVisible({ timeout: 5000 });

  // go back to overview and see 15 pods in the new namespace
  const overviewTabButton = page
    .locator("button:has-text('Overview'), button:has-text('Dashboard')")
    .first();
  await overviewTabButton.click({ force: true });

  await expect(workloadsCard).toContainText("15 Pods Running", {
    timeout: 5000,
  });

  await electronApp.close();
});
