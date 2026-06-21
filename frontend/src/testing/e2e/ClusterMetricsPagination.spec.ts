import { test, expect, _electron as electron } from "@playwright/test";

test("Verify metrics dashboard pagination works", async () => {
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
          if (typeof self.onclose === "function") self.onclose();
        },
      };

      setTimeout(() => {
        self.readyState = 1; // OPEN
        if (typeof self.onopen === "function") self.onopen();

        const telemetryFrames = [
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "pod-low-cpu",
              namespace: "production",
              cpu_usage: 150,
              mem_usage: 800,
              gpu_usage: 0,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "pod-mega-hog",
              namespace: "production",
              cpu_usage: 1200,
              mem_usage: 450,
              gpu_usage: 45,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "pod-mid-tier",
              namespace: "production",
              cpu_usage: 600,
              mem_usage: 650,
              gpu_usage: 12,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "pod-overflow-edge",
              namespace: "production",
              cpu_usage: 400,
              mem_usage: 120,
              gpu_usage: 0,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "pod-new-cpu",
              namespace: "production",
              cpu_usage: 170,
              mem_usage: 800,
              gpu_usage: 0,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "new-pod",
              namespace: "production",
              cpu_usage: 250,
              mem_usage: 800,
              gpu_usage: 0,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "lowcpu",
              namespace: "production",
              cpu_usage: 100,
              mem_usage: 800,
              gpu_usage: 0,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "pod-low-cpu2",
              namespace: "production",
              cpu_usage: 150,
              mem_usage: 800,
              gpu_usage: 0,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "pod-low-cpu3",
              namespace: "production",
              cpu_usage: 150,
              mem_usage: 800,
              gpu_usage: 0,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "pod-low-cpu4",
              namespace: "production",
              cpu_usage: 150,
              mem_usage: 800,
              gpu_usage: 0,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "pod-low-cpu5",
              namespace: "production",
              cpu_usage: 150,
              mem_usage: 800,
              gpu_usage: 0,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "pod-low-cpu6",
              namespace: "production",
              cpu_usage: 150,
              mem_usage: 800,
              gpu_usage: 0,
            },
          },
        ];

        telemetryFrames.forEach((frame, idx) => {
          setTimeout(() => {
            if (typeof self.onmessage === "function") {
              self.onmessage({ data: JSON.stringify(frame) });
            }
          }, idx * 60);
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

  const targetCell = page.locator("td:has-text('pod-low-cpu')").first();
  await expect(targetCell).toBeAttached({ timeout: 15000 });

  const metricsTable = page
    .locator("table")
    .filter({ hasText: "Namespace" })
    .first();
  await expect(metricsTable).toBeAttached();

  // confirm pagination labels split correctly
  const paginationLabel = page.locator("text=/Showing 1-10 of 12/i").first();
  await expect(paginationLabel).toBeAttached({ timeout: 15000 });

  const activeTableRows = page.locator("tbody tr");
  await expect(activeTableRows).toHaveCount(10);

  // locate next and prev buttons
  const nextButton = page.locator("button:has-text('NEXT')");
  const prevButton = page.locator("button:has-text('PREV')");

  await expect(prevButton).toBeDisabled();
  await expect(nextButton).toBeEnabled();

  // move forward to page 2
  await nextButton.click({ force: true });
  await expect(page.locator("text=/PAGE 2 OF 2/i").first()).toBeAttached();
  await expect(page.locator("tbody tr")).toHaveCount(2);

  // return to page 1
  await prevButton.scrollIntoViewIfNeeded();
  await prevButton.click({ force: true });
  await expect(page.locator("text=/PAGE 1 OF 2/i").first()).toBeAttached();
  await expect(page.locator("tbody tr")).toHaveCount(10);

  await electronApp.close();
});
