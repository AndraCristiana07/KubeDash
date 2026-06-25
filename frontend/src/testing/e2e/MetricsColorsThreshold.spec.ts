import { test, expect, _electron as electron } from "@playwright/test";

test("Verify UI progress bar colors based on levels", async () => {
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

  // mock websocket
  await page.addInitScript(() => {
    (window as unknown as { WebSocket: unknown }).WebSocket = function (
      url: string,
    ) {
      const self = {
        url: url,
        readyState: 0,
        onopen: null as (() => void) | null,
        onmessage: null as ((event: { data: string }) => void) | null,
        onclose: null as (() => void) | null,
        onerror: null as (() => void) | null,

        send: function () {},
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
              pod_name: "pod-safe-level",
              namespace: "production",
              cpu_usage: 400, // low level: <= 50%
              mem_usage: 200, // low level: <= 50%
              gpu_usage: 0,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "pod-warn-level",
              namespace: "production",
              cpu_usage: 1300, // Warning level: 51% - 80%
              mem_usage: 650, // Warning level: 51% - 80%
              gpu_usage: 0,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "pod-crit-level",
              namespace: "production",
              cpu_usage: 1900, // Critical level: > 80%
              mem_usage: 950, // Critical level: > 80%
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
  await metricsTabButton.click({ force: true });

  // check metrics rows populate
  const safeCell = page
    .locator("tr")
    .filter({ hasText: "pod-safe-level" })
    .first();
  await expect(safeCell).toBeVisible({ timeout: 10000 });

  // verify safe level
  const safeRow = page
    .locator("tr")
    .filter({ hasText: "pod-safe-level" })
    .first();

  const safeIndicator = safeRow
    .locator("[class*='text-emerald-'], .text-emerald-600")
    .first();
  await expect(safeIndicator).toBeVisible();
  await expect(safeIndicator).toHaveClass(/text-emerald-600/);

  // verify warning level
  const warnRow = page
    .locator("tr")
    .filter({ hasText: "pod-warn-level" })
    .first();

  const warnIndicator = warnRow
    .locator("[class*='text-amber-'], .text-amber-600")
    .first();
  await expect(warnIndicator).toBeVisible();
  await expect(warnIndicator).toHaveClass(/text-amber-600/);

  // verify pulse animation
  const critRow = page
    .locator("tr")
    .filter({ hasText: "pod-crit-level" })
    .first();

  const critIndicator = critRow
    .locator("[class*='text-red-'], .text-red-500")
    .first();
  await expect(critIndicator).toBeVisible();

  await expect(critIndicator).toHaveClass(/text-red-500/);
  await expect(critIndicator).toHaveClass(/animate-pulse/);

  await electronApp.close();
});
