import { test, expect, _electron as electron } from "@playwright/test";

test("Verify log stream auto-scroll pins to bottom and unlocks gracefully on manual scroll up", async () => {
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

  // mock API route call for pods
  await page.route("**/api/cluster/pods*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pods: [
          {
            name: "scroll-test-pod-123",
            namespace: "production",
            status: "Running",
            image: "nginx:latest",
            restart_count: 0,
            age_seconds: 3600,
            linked_configs: [],
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

      (window as any).mockLogSocket = self;

      setTimeout(() => {
        self.readyState = 1;
        if (typeof self.onopen === "function") self.onopen();

        if (typeof self.onmessage === "function") {
          let baselineLogs = "";
          for (let i = 1; i <= 40; i++) {
            baselineLogs += `INFO: Log frame generation tracking index line item block #${i}\n`;
          }
          self.onmessage({ data: baselineLogs });
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
  await podsTabButton.click({ force: true });

  // open log terminal modal window
  const targetPodRow = page
    .locator("tr:has-text('scroll-test-pod-123')")
    .first();

  // locate and click logs button
  const openLogsButton = targetPodRow
    .locator("button:has-text('Logs')")
    .first();
  await expect(openLogsButton).toBeAttached({ timeout: 5000 });
  await openLogsButton.click({ force: true });

  const consoleStatus = page.locator("text=STREAMING ACTIVE");
  await expect(consoleStatus).toBeVisible({ timeout: 5000 });

  const scrollContainer = page.locator("div.overflow-y-auto").first();
  await expect(scrollContainer).toBeVisible();

  // check autoscroll
  await page.waitForTimeout(300);

  let scrollPositionData = await scrollContainer.evaluate((el) => {
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    };
  });

  let distanceFromBottom =
    scrollPositionData.scrollHeight -
    scrollPositionData.scrollTop -
    scrollPositionData.clientHeight;
  expect(distanceFromBottom).toBeLessThan(40);

  // manual scroll
  await scrollContainer.evaluate((el) => {
    el.scrollTop = 50;
    el.dispatchEvent(new Event("scroll"));
  });

  await page.waitForTimeout(100);

  await page.evaluate(() => {
    if (
      (window as any).mockLogSocket &&
      typeof (window as any).mockLogSocket.onmessage === "function"
    ) {
      (window as any).mockLogSocket.onmessage({
        data: "CRITICAL: Brand new incoming live event that shouldn't bounce the screen!\n",
      });
    }
  });

  await page.waitForTimeout(300);

  scrollPositionData = await scrollContainer.evaluate((el) => {
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    };
  });

  expect(scrollPositionData.scrollTop).toBeLessThan(100);

  await expect(
    page.locator("text=Brand new incoming live event"),
  ).toBeAttached();

  // scroll bacj to bottim manually
  await scrollContainer.evaluate((el) => {
    el.scrollTop = el.scrollHeight - el.clientHeight;
    el.dispatchEvent(new Event("scroll"));
  });

  await page.waitForTimeout(100);

  await page.evaluate(() => {
    (window as any).mockLogSocket.onmessage({
      data: "INFO: Final confirmation alignment string chunk.\n",
    });
  });

  await page.waitForTimeout(200);

  scrollPositionData = await scrollContainer.evaluate((el) => {
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    };
  });

  distanceFromBottom =
    scrollPositionData.scrollHeight -
    scrollPositionData.scrollTop -
    scrollPositionData.clientHeight;
  expect(distanceFromBottom).toBeLessThan(40);

  await electronApp.close();
});
