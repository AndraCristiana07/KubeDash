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

  await electronApp.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) mainWindow.maximize();
  });

  const page = await electronApp.firstWindow();

  // mock running pods
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

  // mock API routes
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

  // mock websocket
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

  // navigate to pods management page
  const podsTabButton = page.locator("button:has-text('Pods')").first();
  await podsTabButton.click({ force: true });

  // locate pod row
  const podOneRow = page
    .locator("tr")
    .filter({ hasText: "restart-pod-one" })
    .first();
  await expect(podOneRow).toBeVisible({ timeout: 5000 });

  // locate and click master checkbox
  const masterCheckbox = page
    .locator("thead input[type='checkbox'], th input[type='checkbox']")
    .first();
  await masterCheckbox.click({ force: true });
  await page.waitForTimeout(150);

  // check bulk ops bar appears correctly
  const bulkOpsBar = page.locator("[data-testid='bulk-ops-bar']");
  await expect(bulkOpsBar).toBeVisible({ timeout: 3000 });
  await expect(bulkOpsBar).toContainText("2");
  await expect(bulkOpsBar).toContainText("Workloads Staged");

  const bulkRestartButton = bulkOpsBar.locator(
    "button:has-text('Bulk Restart')",
  );
  await expect(bulkRestartButton).toBeVisible();
  await bulkRestartButton.click({ force: true });

  // check success toast appears on screen with correct messsage
  const successToastText = page.locator(
    "span:has-text('Successfully signaled orchestration cycles for pods!')",
  );
  await expect(successToastText).toBeVisible({ timeout: 4000 });
  console.log(
    "Verified: Custom bulk success notification mounted cleanly onto the screen layout window.",
  );

  await expect(bulkOpsBar).toHaveClass(/opacity-0/);
  await expect(bulkOpsBar).toHaveClass(/pointer-events-none/);
  await expect(bulkOpsBar).toHaveClass(/translate-y-20/);

  await electronApp.close();
});
