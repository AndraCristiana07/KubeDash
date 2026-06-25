import { test, expect, _electron as electron } from "@playwright/test";

test("Verify high-density data tables handle rapid search filtering and structural layouts cleanly", async () => {
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

  const mockHighDensityPods = [
    ...Array.from({ length: 30 }, (_, i) => ({
      name: `kube-system-worker-node-${i + 1}`,
      namespace: "kube-system",
      status: "Running",
      image: "k8s.gcr.io/pause:3.6",
      restart_count: 0,
      age_seconds: 86400,
      linked_configs: [],
    })),
    {
      name: `auth-broker-service-pod`,
      namespace: "production",
      status: "Running",
      image: "redis:alpine",
      restart_count: 3,
      age_seconds: 5000,
      linked_configs: [],
    },
    {
      name: `telemetry-database-pod`,
      namespace: "production",
      status: "Failed",
      image: "postgres:15",
      restart_count: 12,
      age_seconds: 12000,
      linked_configs: [],
    },
  ];

  // mock API routes
  await page.route(/\/api\/cluster\/pods/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ pods: mockHighDensityPods }),
    });
  });

  await page.route(/\/api\/cluster\/summary/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        podsCount: 32,
        nodesTotal: 4,
        clusterStatus: "Warning",
      }),
    });
  });

  // mock websocket
  await page.addInitScript(() => {
    (window as unknown as { WebSocket: unknown }).WebSocket = function (
      url: string,
    ) {
      return {
        url: url,
        readyState: 0,
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        send: function () {},
        close: function () {},
      };
    };
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body");

  // go to pods page
  const podsTabButton = page.locator("button:has-text('Pods')").first();
  await podsTabButton.click({ force: true });

  // locate pod row
  const podRow = page
    .locator("tr")
    .filter({ hasText: "kube-system-worker-node-1" })
    .first();
  await expect(podRow).toBeVisible({ timeout: 5000 });

  // locate search input
  const searchInput = page
    .locator(
      "input[placeholder*='Search'], input[placeholder*='filter'], input[type='text']",
    )
    .first();
  await expect(searchInput).toBeVisible();

  await searchInput.click({ force: true });
  await searchInput.fill("");
  await page.waitForTimeout(150);

  // search pod
  await searchInput.click({ force: true });
  await searchInput.fill("kube-system-worker-node");
  await page.waitForTimeout(200);

  // check the row appears
  const workerPodRow = page
    .locator("tr")
    .filter({ hasText: "kube-system-worker-node-1" })
    .first();
  await expect(workerPodRow).toBeVisible({ timeout: 3000 });

  // ccheck not matching row is hidden
  const nonMatchingPodRow = page
    .locator("tr")
    .filter({ hasText: "auth-broker-service-pod" })
    .first();
  await expect(nonMatchingPodRow).toBeHidden({ timeout: 3000 });

  await searchInput.fill("auth-broker");
  await page.waitForTimeout(200);

  const nextPageButton = page
    .locator("button:has-text('Next'), button[title*='Next Page']")
    .first();

  if (await nextPageButton.isVisible()) {
    const isButtonDisabled = await nextPageButton.isDisabled();

    if (!isButtonDisabled) {
      await expect(nextPageButton).toBeHidden();
    } else {
      expect(isButtonDisabled).toBe(true);
    }

    console.log(
      "Successfully verified that search filter query overrides and updates pagination controls!",
    );
  } else {
    console.log(
      "Pagination controls naturally unmounted because search results fit onto a single view frame.",
    );
  }

  await electronApp.close();
});
