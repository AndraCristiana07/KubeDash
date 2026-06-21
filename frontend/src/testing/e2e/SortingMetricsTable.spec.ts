import { test, expect, _electron as electron } from "@playwright/test";

test("Verify metrics data grid multi-type column sorting toggles and page resets", async () => {
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

        // 12 pods
        const telemetryFrames = [
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "alpha-pod",
              namespace: "development",
              cpu_usage: 150,
              mem_usage: 900,
              gpu_usage: 0,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "omega-pod",
              namespace: "production",
              cpu_usage: 1500,
              mem_usage: 300,
              gpu_usage: 10,
            },
          },
          {
            type: "metrics_telemetry",
            data: {
              pod_name: "beta-pod",
              namespace: "staging",
              cpu_usage: 600,
              mem_usage: 600,
              gpu_usage: 5,
            },
          },
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
        ];

        telemetryFrames.forEach((frame, idx) => {
          setTimeout(() => {
            if (typeof self.onmessage === "function") {
              self.onmessage({ data: JSON.stringify(frame) });
            }
          }, idx * 2);
        });
      }, 50);

      return self;
    };
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body");

  // navigate to metrics page
  const metricsTabButton = page.locator("button:has-text('Metrics')").first();
  await expect(metricsTabButton).toBeAttached({ timeout: 5000 });
  await metricsTabButton.click({ force: true });

  const dataRows = page.locator("tr").filter({ hasText: "-pod" });
  await expect(dataRows.first()).toBeVisible({ timeout: 10000 });

  // visible pods on curr page
  const getRenderedPodOrder = async () => {
    return await dataRows.evaluateAll((elements) =>
      elements
        .map((el) => el.textContent || "")
        .map((txt) => {
          if (txt.includes("alpha-pod")) return "alpha-pod";
          if (txt.includes("beta-pod")) return "beta-pod";
          if (txt.includes("omega-pod")) return "omega-pod";
          return "";
        })
        .filter(Boolean),
    );
  };

  // check numerical sorting
  const cpuHeaderCell = page
    .locator("th, td, span, button")
    .filter({ hasText: /^CPU Load/ })
    .first();
  await cpuHeaderCell.click({ force: true });

  let currentOrder = await getRenderedPodOrder();
  expect(currentOrder).toContain("omega-pod");
  expect(currentOrder).toContain("beta-pod");

  await cpuHeaderCell.click({ force: true });
  currentOrder = await getRenderedPodOrder();
  expect(currentOrder).toContain("alpha-pod");

  // check alphabetical sorting
  const namespaceHeaderCell = page.locator("th:has-text('Namespace')").first();
  await namespaceHeaderCell.click({ force: true });

  await namespaceHeaderCell.click({ force: true });
  currentOrder = await getRenderedPodOrder();
  expect(currentOrder).toContain("beta-pod");
  expect(currentOrder).toContain("omega-pod");

  // click next button
  const nextButton = page.locator("button:has-text('NEXT')").first();
  await expect(nextButton).toBeEnabled();
  await nextButton.click({ force: true });

  // check it went to the page
  const pageTracker = page.locator("text=PAGE 2 OF 2");
  await expect(pageTracker).toBeVisible();

  // go back
  await cpuHeaderCell.click({ force: true });

  await expect(page.locator("text=PAGE 1 OF 2")).toBeVisible();

  await electronApp.close();
});
