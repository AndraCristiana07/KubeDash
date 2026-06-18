import { test, expect, _electron as electron } from "@playwright/test";

test("Verify log stream modal catches abrupt socket disconnections", async () => {
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

  // mock API route for pods
  await page.route("**/api/cluster/pods*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pods: [
          {
            name: "auth-service-v1-7f4c",
            namespace: "production",
            status: "Running",
            image: "nginx:latest",
            restart_count: 0,
            age_seconds: 3600,
            linked_configs: [
              "configmap:app-feature-flags",
              "secret:database-credentials",
            ],
          },
        ],
      }),
    });
  });

  // mock websocket
  await page.addInitScript(() => {
    (window as any).WebSocket = function (url: string) {
      const self = {
        url: url,
        readyState: 0, // CONNECTING
        onopen: null as any,
        onmessage: null as any,
        onclose: null as any,
        onerror: null as any,

        send: function (data: any) {},
        close: function () {
          self.readyState = 3; // CLOSED
          if (typeof self.onclose === "function") {
            self.onclose();
          }
        },
      };

      (window as any).mockLogSocket = self;

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

  // locate pod row
  const targetPodRow = page
    .locator("tr:has-text('auth-service-v1-7f4c')")
    .first();
  await expect(targetPodRow).toBeVisible({ timeout: 10000 });

  // locate and click logs button
  const openLogsButton = targetPodRow
    .locator("button:has-text('Logs')")
    .first();
  await expect(openLogsButton).toBeAttached({ timeout: 5000 });
  await openLogsButton.click();

  const consoleStatus = page.locator("text=STREAMING ACTIVE");
  await expect(consoleStatus).toBeVisible({ timeout: 5000 });
  await expect(page.locator("text=Buffer Limit: 2 loaded")).toBeVisible();

  // disconnect socket
  await page.evaluate(() => {
    if (
      (window as any).mockLogSocket &&
      typeof (window as any).mockLogSocket.close === "function"
    ) {
      (window as any).mockLogSocket.close();
    }
  });

  // check stream disconnected message appears
  const closedStreamNotice = page
    .locator("div, span")
    .filter({ hasText: "Stream disconnected safely" })
    .last();
  await expect(closedStreamNotice).toBeVisible({ timeout: 5000 });

  await expect(page.locator("text=Buffer Limit: 3 loaded")).toBeVisible();

  await electronApp.close();
});
