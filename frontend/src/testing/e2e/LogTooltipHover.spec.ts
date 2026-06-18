import { test, expect, _electron as electron } from "@playwright/test";

test("Verify log stream window resource track tooltip hover card state transitions", async () => {
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

  await page.route("**/api/cluster/pods*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pods: [
          {
            name: "auth-service-v1",
            namespace: "production",
            status: "Running",
            image: "nginx:latest",
            restart_count: 0,
            age_seconds: 3600,
            linked_configs: [],
          },
        ],
      }),
    });
  });

  await page.addInitScript(() => {
    (window as any).WebSocket = function (url: string) {
      const self = {
        url: url,
        readyState: 0,
        onopen: null as any,
        onmessage: null as any,
        onclose: null as any,
        onerror: null as any,
        send: function (data: any) {},
        close: function () {
          self.readyState = 3;
          if (typeof self.onclose === "function") self.onclose();
        },
      };

      setTimeout(() => {
        self.readyState = 1; // OPEN
        if (typeof self.onopen === "function") {
          self.onopen();
        }

        if (typeof self.onmessage === "function") {
          self.onmessage({
            data: "INFO: Initializing container runtime engine.\nINFO: Core systems online.\n",
          });
        }
      }, 50);

      return self;
    };
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body");

  // navigate to pods management
  const podsTabButton = page.locator("button:has-text('Pods')").first();
  await expect(podsTabButton).toBeAttached({ timeout: 5000 });
  await podsTabButton.click();

  // open log terminal modal window
  const targetPodRow = page.locator("tr:has-text('auth-service-v1')").first();

  // locate and click logs button
  const openLogsButton = targetPodRow
    .locator("button:has-text('Logs')")
    .first();
  await expect(openLogsButton).toBeAttached({ timeout: 5000 });
  await openLogsButton.click();

  const consoleStatus = page.locator("text=STREAMING ACTIVE");
  await expect(consoleStatus).toBeVisible({ timeout: 5000 });

  // hover over name to show it
  const hoverTriggerBadge = page
    .locator("span", { hasText: "production/auth-service-v1" })
    .first();
  await expect(hoverTriggerBadge).toBeVisible();

  const tooltipHeaderLabel = page.locator("text=Resource Track:").first();

  // title hidden while not hovering
  await expect(tooltipHeaderLabel).toBeHidden();

  await hoverTriggerBadge.hover();

  await expect(tooltipHeaderLabel).toBeVisible({ timeout: 2000 });

  const popoverValueNode = page
    .locator("div")
    .filter({ hasText: /^production\/auth-service-v1$/ })
    .last();
  await expect(popoverValueNode).toBeVisible();

  await page.mouse.move(0, 0);

  await expect(tooltipHeaderLabel).toBeHidden({ timeout: 2000 });

  await electronApp.close();
});
