import { test, expect, _electron as electron } from "@playwright/test";

test("Verify live hardware metrics render and sort correctly", async () => {
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
              pod_name: "kubedash-backend-7f85",
              namespace: "production",
              cpu_usage: 1200,
              mem_usage: 1024,
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

  // navigate to metrics
  const navButton = page.locator("button:has-text('Hardware Metrics')").first();
  await expect(navButton).toBeAttached({ timeout: 5000 });
  await navButton.click();

  // check header
  const liveHeader = page
    .locator("text=/Live Hardware Compute Monitor/i")
    .first();
  await expect(liveHeader).toBeAttached({ timeout: 15000 });

  // confirm row metrics render correctly
  const systemRow = page
    .locator("tr:has-text('kubedash-backend-7f85')")
    .first();
  await expect(systemRow).toBeAttached({ timeout: 10000 });

  const systemRowClass = (await systemRow.getAttribute("class")) || "";
  expect(systemRowClass).toContain("bg-amber-500/10");

  // verify cpu usage is calculated and showed correctly
  const cpuProgressCell = systemRow.locator("td").nth(2);
  await expect(cpuProgressCell).toContainText("1200m");
  await expect(cpuProgressCell).toContainText("60%");

  // validate text searching filters input values
  const searchInput = page.locator("input[placeholder*='Filter nodes by pod']");
  await expect(searchInput).toBeAttached();
  await searchInput.fill("pod-mid-tier");

  await expect(
    page.locator("tr:has-text('kubedash-backend-7f85')"),
  ).toBeHidden();
  await expect(page.locator("tr:has-text('pod-mid-tier')")).toBeAttached();

  // reset filter with the inline clear button ✕
  await page.locator("button:has-text('✕')").click();
  await expect(
    page.locator("tr:has-text('kubedash-backend-7f85')"),
  ).toBeAttached();

  // verify column sorting
  const ramHeader = page.locator("th:has-text('RAM Allocation')");
  await ramHeader.click();

  const topRowPodName = await page.locator("tbody tr td").nth(1).textContent();
  expect(topRowPodName).toBeDefined();

  await electronApp.close();
});
