import { test, expect, _electron as electron } from "@playwright/test";

type MockTriggerFn = (mockPayload: Record<string, unknown>) => void;

interface MockToastSocket {
  url: string;
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send: () => void;
  close: () => void;
}

interface CustomToastWindow extends Omit<Window, "WebSocket"> {
  mockSocketTriggers: MockTriggerFn[];
  WebSocket: (url: string) => MockToastSocket;
}

test("Verify WebSocket toast alerts cap visible notifications to 4", async () => {
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

  // mock API routes
  await page.route(/\/api\/cluster\/pods/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ pods: [] }),
    });
  });

  await page.route(/\/api\/cluster\/summary/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        podsCount: 0,
        nodesTotal: 1,
        clusterStatus: "Healthy",
      }),
    });
  });

  // mock websocket
  await page.addInitScript(() => {
    window.confirm = () => true;

    (window as unknown as CustomToastWindow).mockSocketTriggers = [];

    (window as unknown as CustomToastWindow).WebSocket = function (
      url: string,
    ) {
      const socketInstance: MockToastSocket = {
        url: url,
        readyState: 1, // open
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,

        send: function () {},
        close: function () {},
      };

      (window as unknown as CustomToastWindow).mockSocketTriggers.push(
        (mockPayload: Record<string, unknown>) => {
          if (socketInstance.onmessage) {
            socketInstance.onmessage({ data: JSON.stringify(mockPayload) });
          }
        },
      );

      setTimeout(() => {
        if (socketInstance.onopen) socketInstance.onopen();
      }, 50);

      return socketInstance;
    };
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body");

  // send 6 errors so it can catch in the websocket and show toasts
  for (let i = 1; i <= 6; i++) {
    await page.evaluate((id) => {
      const trigger = (window as unknown as CustomToastWindow)
        .mockSocketTriggers[0];
      if (trigger) {
        trigger({
          type: "notification",
          level: "Warning",
          namespace: "production",
          pod_name: `crash-loop-pod-${id}`,
          message: `Back-off restarting failed container runtime environment error instance ref: ${id}`,
        });
      }
    }, i);

    await page.waitForTimeout(100);
  }

  await page.waitForTimeout(400);

  const visibleToasts = page.locator(".animate-enter");

  await expect(visibleToasts.first()).toBeVisible({ timeout: 5000 });

  // count and check toasts to be 4 max at a time
  const finalActiveToastCount = await visibleToasts.count();

  expect(finalActiveToastCount).toBeLessThanOrEqual(4);

  await electronApp.close();
});
