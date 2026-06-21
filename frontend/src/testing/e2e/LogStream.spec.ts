import { test, expect, _electron as electron } from "@playwright/test";
import * as fs from "fs";

test("Verify live log stream", async () => {
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

  await page.route("**/api/cluster/pods*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pods: [
          {
            name: "auth-service-v1-7f4c",
            namespace: "production",
            status: "Running",
            image: "nginx:latest",
            restart_count: 0,
            age_seconds: 3600,
            linked_configs: [
              "configmap:app-feature-flags",
              "secret:database-credentials",
            ],
          },
        ],
      }),
    });
  });

  await page.route("**/api/cluster/config*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          name: "app-feature-flags",
          type: "configmap",
          data: {
            ENABLE_NEW_DASHBOARD: "true",
            API_TIMEOUT_MS: "3000",
          },
        },
      ]),
    });
  });

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
          if (typeof self.onclose === "function") {
            self.onclose();
          }
        },
      };

      (window as any).mockLogSocket = self;

      setTimeout(() => {
        self.readyState = 1; // OPEN
        if (typeof self.onopen === "function") {
          self.onopen();
        }

        if (typeof self.onmessage === "function") {
          self.onmessage({
            data: "INFO: Initializing container runtime engine.\nINFO: Core systems online.\n",
          });
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

  // locate pod row
  const targetPodRow = page
    .locator("tr:has-text('auth-service-v1-7f4c')")
    .first();
  await expect(targetPodRow).toBeVisible({ timeout: 10000 });

  // locate and click logs button
  const openLogsButton = targetPodRow
    .locator("button:has-text('Logs')")
    .first();
  await expect(openLogsButton).toBeAttached({ timeout: 5000 });
  await openLogsButton.click({ force: true });

  const consoleStatus = page.locator("text=STREAMING ACTIVE");
  await expect(consoleStatus).toBeVisible({ timeout: 5000 });
  await expect(page.locator("text=Buffer Limit: 2 loaded")).toBeVisible();

  // trigger telemetry pipeline mock injects
  await page.evaluate(() => {
    if (
      (window as any).mockLogSocket &&
      typeof (window as any).mockLogSocket.onmessage === "function"
    ) {
      (window as any).mockLogSocket.onmessage({
        data: "WARN: Out of memory threshold warnings detected.\nERROR: NullPointerException crash dumped safely.\n",
      });
    }
  });

  const warnLogLine = page
    .locator("div", { hasText: "WARN: Out of memory" })
    .last();
  const errorLogLine = page
    .locator("div", { hasText: "ERROR: NullPointer" })
    .last();

  // search filter processing checks
  const filterInput = page.locator(
    "input[placeholder='Filter output logs...']",
  );
  await filterInput.fill("NullPointer");

  await expect(page.locator("text=Filtered Matches: 1 matching")).toBeVisible();
  await expect(warnLogLine).toBeHidden();

  const textHighlightMarker = errorLogLine.locator("mark");
  await expect(textHighlightMarker).toBeVisible();
  await expect(textHighlightMarker).toHaveClass(/bg-yellow-400/);
  await expect(textHighlightMarker).toContainText("NullPointer");

  await page.locator("button:has-text('✕')").click({ force: true });
  await expect(warnLogLine).toBeVisible();

  // pause button
  const pauseToggleButton = page.locator("button:has-text('Pause')");
  await pauseToggleButton.click({ force: true });
  await expect(page.locator("text=CONSOLE BUFFER FROZEN")).toBeVisible();

  await page.evaluate(() => {
    if ((window as any).mockLogSocket) {
      (window as any).mockLogSocket.onmessage({
        data: "INFO: This entry should drop entirely during freeze mode.\n",
      });
    }
  });

  await expect(
    page.locator("text=This entry should drop entirely"),
  ).toBeHidden();

  await page.locator("button:has-text('Resume')").click({ force: true });
  await expect(consoleStatus).toBeVisible();

  // clear output and close actions
  await page.locator("button:has-text('Clear Output')").click({ force: true });
  await expect(page.locator("text=Buffer Limit: 0 loaded")).toBeVisible();
  await expect(
    page.locator("text=Waiting for incoming live infrastructure stream"),
  ).toBeVisible();

  await page.locator("button:has-text('x')").last().click({ force: true });
  await expect(consoleStatus).toBeHidden({ timeout: 4000 });

  await electronApp.close();
});
