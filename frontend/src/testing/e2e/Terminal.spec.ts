import { test, expect, _electron as electron } from "@playwright/test";

interface MockTerminalSocket {
  url: string;
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send: (data: string | ArrayBufferView | Blob | ArrayBuffer) => void;
  close: () => void;
}

interface CustomTerminalWindow extends Omit<Window, "WebSocket"> {
  currentMockSocket: MockTerminalSocket;
  WebSocket: (url: string) => MockTerminalSocket;
}

test("Verify navigation to Pods view, launching interactive shell, and streaming raw inputs", async () => {
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
    (window as unknown as CustomTerminalWindow).WebSocket = function (
      url: string,
    ) {
      const self: MockTerminalSocket = {
        url: url,
        readyState: 0, // CONNECTING
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,

        send: function (data: string | ArrayBufferView | Blob | ArrayBuffer) {
          (window as unknown as CustomTerminalWindow).currentMockSocket = self;
          setTimeout(() => {
            if (typeof self.onmessage === "function") {
              self.onmessage({ data: data.toString() });
            }
          }, 10);
        },

        close: function () {
          self.readyState = 3; // CLOSED
          if (typeof self.onclose === "function") {
            self.onclose();
          }
        },
      };

      setTimeout(() => {
        self.readyState = 1; // OPEN
        if (typeof self.onopen === "function") {
          self.onopen();
        }

        if (typeof self.onmessage === "function") {
          self.onmessage({
            data: "\r\nConnected to [production] auth-service-v1-7f4c. Type exit to detach.\r\n",
          });
          self.onmessage({
            data: "root@auth-service-v1-7f4c:/# ",
          });
        }
        (window as unknown as CustomTerminalWindow).currentMockSocket = self;
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

  // loacte abd click terminal button
  const termIconButton = targetPodRow
    .locator("button:has-text('Term')")
    .first();
  await expect(termIconButton).toBeVisible({ timeout: 5000 });
  await termIconButton.click({ force: true });

  // check terminal opened
  const modalHeaderTitle = page
    .locator(
      "span:has-text('Interactive Container Shell'), div:has-text('Interactive Container Shell')",
    )
    .first();
  await expect(modalHeaderTitle).toBeVisible({ timeout: 5000 });

  const terminalRowsContainer = page.locator(".xterm-rows");
  await expect(terminalRowsContainer).toContainText("Connected to", {
    timeout: 7000,
  });
  await expect(terminalRowsContainer).toContainText(
    "root@auth-service-v1-7f4c",
    { timeout: 7000 },
  );

  // check terminal works
  await page.evaluate(() => {
    const ws = (window as unknown as CustomTerminalWindow).currentMockSocket;
    if (ws && typeof ws.onmessage === "function") {
      ws.onmessage({ data: "uname -a\r\n" });
    }
  });

  await expect(terminalRowsContainer).toContainText("uname -a", {
    timeout: 5000,
  });

  // close terminal
  const closeTerminalButton = page
    .locator("button:has-text('Close Terminal'), button:has-text('Close')")
    .first();
  await closeTerminalButton.click({ force: true });

  await expect(modalHeaderTitle).toBeHidden({ timeout: 4000 });
  await electronApp.close();
});
