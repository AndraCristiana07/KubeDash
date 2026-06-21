import { test, expect, _electron as electron } from "@playwright/test";

test("Verify Resource Hogs Panel sorting, data limits, and live streaming updates work", async () => {
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

  // navigate to metrics
  const metricsTabButton = page.locator("button:has-text('Metrics')").first();
  await expect(metricsTabButton).toBeAttached({ timeout: 5000 });
  await metricsTabButton.click({ force: true });

  // locate cpu hogs panel
  const cpuHeading = page.locator("h4:has-text('CPU Resource Dominators')");
  await expect(cpuHeading).toBeVisible({ timeout: 10000 });

  // locate containeer
  const cpuRowsContainer = page.locator(
    "div:has(> h4:has-text('CPU Resource Dominators')) + div.space-y-2",
  );
  await expect(cpuRowsContainer).toBeVisible({ timeout: 5000 });

  // asserting exact text match orders
  const firstCpuEntry = cpuRowsContainer
    .locator("div")
    .filter({ hasText: "#1" })
    .first();
  await expect(firstCpuEntry).toContainText("pod-mega-hog");
  await expect(firstCpuEntry).toContainText("1200m");

  const secondCpuEntry = cpuRowsContainer
    .locator("div")
    .filter({ hasText: "#2" })
    .first();
  await expect(secondCpuEntry).toContainText("pod-mid-tier");
  await expect(secondCpuEntry).toContainText("600m");

  // check that any overflow items past the top 3 items are hidden from display
  await expect(cpuRowsContainer.locator("text=#4")).toBeHidden();

  const memHeading = page.locator("h4:has-text('Memory Allocation Hogs')");
  await expect(memHeading).toBeVisible({ timeout: 5000 });

  const memRowsContainer = page.locator(
    "div:has(> h4:has-text('Memory Allocation Hogs')) + div.space-y-2",
  );
  await expect(memRowsContainer).toBeVisible({ timeout: 5000 });

  // verify internal memory allocation ordering card rows
  const firstMemEntry = memRowsContainer
    .locator("div")
    .filter({ hasText: "#1" })
    .first();
  await expect(firstMemEntry).toContainText("pod-low-cpu");
  await expect(firstMemEntry).toContainText("800 MB");

  // verify overflow item "pod-overflow-edge" not in container
  await expect(memRowsContainer).not.toContainText("pod-overflow-edge");

  await electronApp.close();
});
