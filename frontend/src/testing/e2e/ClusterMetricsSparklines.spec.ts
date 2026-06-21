import { test, expect, _electron as electron } from "@playwright/test";

test("Verify timeline trend subtabs display sparklines metrics", async () => {
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
          }, idx * 10);
        });
      }, 50);

      return self;
    };
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body");

  // navigate to pods metrics panel
  const metricsTabButton = page.locator("button:has-text('Metrics')").first();
  await expect(metricsTabButton).toBeAttached({ timeout: 5000 });
  await metricsTabButton.click({ force: true });

  // toggle subtab to go to sparklines table
  const trendTabButton = page.locator("button:has-text('Historical Trends')");
  await expect(trendTabButton).toBeAttached();
  await trendTabButton.click({ force: true });

  // confirm subtitle text element exists
  const trendsSubTitle = page
    .locator("div:has-text('Timeline Velocity Vector Matrices')")
    .first();
  await expect(trendsSubTitle).toBeAttached({ timeout: 10000 });

  // locate target row
  const targetRow = page
    .locator("tr")
    .filter({ hasText: "pod-low-cpu" })
    .first();
  // await expect(targetRow).toBeVisible({ timeout: 4000 });

  await page.waitForSelector("tr:has-text('pod-low-cpu')", {
    state: "visible",
    timeout: 15000,
  });
  await expect(targetRow).toBeVisible();

  // locate the SVG container that MUI X Charts uses
  const sparklineSvg = targetRow.locator("svg").first();
  await expect(sparklineSvg).toBeVisible();

  // MUI X Charts renders the trend line inside a standard <path> element
  const chartPath = sparklineSvg.locator("path").first();
  await expect(chartPath).toBeAttached();

  // retrieve generated drawing attribute containing coordinates computed by MUI
  const pathAttribute = await chartPath.getAttribute("d");

  // check that drawing vector is not empty
  expect(pathAttribute).not.toBeNull();
  expect(pathAttribute?.length).toBeGreaterThan(0);

  // 'M' stands for "Move to" in SVG path syntax
  expect(pathAttribute).toContain("M");
  console.log(
    `Successfully verified MUI SparkLineChart SVG path attribute: "${pathAttribute}"`,
  );

  await electronApp.close();
});
