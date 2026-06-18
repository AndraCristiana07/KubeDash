import { test, expect, _electron as electron } from "@playwright/test";

test("Verify metrics data grid goes to no metrics found when searching non existent pod", async () => {
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

  // mock websocket
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
        self.readyState = 1;
        if (typeof self.onopen === "function") self.onopen();

        const telemetryFrames = [
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "production-api-pod",
              namespace: "production",
              cpu_usage: 400,
              mem_usage: 300,
              gpu_usage: 0,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "production-worker-pod",
              namespace: "production",
              cpu_usage: 800,
              mem_usage: 500,
              gpu_usage: 0,
            },
          },
        ];

        telemetryFrames.forEach((frame, idx) => {
          setTimeout(() => {
            if (typeof self.onmessage === "function") {
              self.onmessage({ data: JSON.stringify(frame) });
            }
          }, idx * 5);
        });
      }, 50);

      return self;
    };
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body");

  // navigate to metrics
  const metricsTabButton = page.locator("button:has-text('Metrics')").first();
  await expect(metricsTabButton).toBeAttached({ timeout: 5000 });
  await metricsTabButton.click();

  // check data rows exist
  const dataRowItem = page
    .locator("tr")
    .filter({ hasText: "production-api-pod" })
    .first();
  await expect(dataRowItem).toBeVisible({ timeout: 10000 });

  // locate the search input
  const searchInput = page.locator("input[placeholder*='Filter']").first();
  await expect(searchInput).toBeVisible();

  // input a pod that doesn't exist
  await searchInput.fill("non-existent-pod");

  await expect(dataRowItem).toBeHidden();

  // locate no match text
  const noMatchMsg = page.locator("text=No matching pods rows found").first();

  await expect(noMatchMsg).toBeVisible({ timeout: 5000 });

  // erase filter input to go back to existing pods rows
  await searchInput.fill("");

  await expect(dataRowItem).toBeVisible({ timeout: 5000 });

  // no match text should dissapear
  await expect(noMatchMsg).toBeHidden();

  // close
  await electronApp.close();
});
