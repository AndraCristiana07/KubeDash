import { test, expect, _electron as electron } from "@playwright/test";
test("Verify live hardware summary specs", async () => {
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
              pod_name: "kubedash-backend-7f85",
              namespace: "production",
              cpu_usage: 100,
              mem_usage: 1024,
              gpu_usage: 0,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "pod-mega-hog",
              namespace: "production",
              cpu_usage: 200,
              mem_usage: 120,
              gpu_usage: 45,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "pod-mid-tier",
              namespace: "production",
              cpu_usage: 200,
              mem_usage: 3500,
              gpu_usage: 85,
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
  const navButton = page.locator("button:has-text('Hardware Metrics')").first();
  await expect(navButton).toBeAttached({ timeout: 5000 });
  await navButton.click({ force: true });

  const podsCountCard = page.locator("div:has-text('Managed Pods')").first();
  await expect(podsCountCard).toContainText("4", { timeout: 10000 });

  const cpuLoadCard = page
    .locator("div:has-text('Aggregated CPU Engine Load')")
    .first();

  await expect(cpuLoadCard).toContainText("900", { timeout: 10000 });

  const ramAllocationCard = page
    .locator("div:has-text('Total RAM Allocation')")
    .first();
  await expect(ramAllocationCard).toContainText("4.65", { timeout: 10000 });

  const gpuMetricsCars = page
    .locator("div:has-text('NVIDIA GPU Matrix Compute')")
    .first();
  await expect(gpuMetricsCars).toContainText("65%", { timeout: 10000 });
  await electronApp.close();
});
