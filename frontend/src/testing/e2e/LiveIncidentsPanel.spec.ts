import { test, expect, _electron as electron } from "@playwright/test";

test("Verify live incident dashboard loads, populates rows and handles pagination", async () => {
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

  const fakeIncidents = Array.from({ length: 50 }, (_, i) => ({
    reason: "BackOff",
    namespace: "kube-system",
    pod_name: `e2e-pod-item-${i}`,
    message: `System panic string variant execution ${i}`,
    type: "Warning",
    timestamp: 1719100000,
  }));

  await page.route("**/api/cluster/incidents*", async (route) => {
    const url = new URL(route.request().url());
    const startId = url.searchParams.get("start_id");

    if (startId === "next-page-marker") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          incidents: [
            {
              reason: "Evicted",
              namespace: "default",
              pod_name: "eviction-target-pod",
              message: "The node was low on resource: memory.",
              type: "Warning",
              timestamp: 1719105000,
            },
          ],
          next_cursor: null,
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          incidents: fakeIncidents,
          next_cursor: "next-page-marker",
        }),
      });
    }
  });

  // navigate to audit panel
  const auditTabButton = page.locator("button:has-text('Audit')").first();
  await auditTabButton.scrollIntoViewIfNeeded();
  await auditTabButton.click({ force: true });

  // click tab for incidents
  const streamSubTab = page.locator("button:has-text('Live Incident')").first();
  await expect(streamSubTab).toBeVisible({ timeout: 5000 });
  await streamSubTab.click({ force: true });

  const telemetryBanner = page.locator(
    "text=Displaying 50 active telemetry warnings intercepted directly out of Redis memory stores.",
  );
  await expect(telemetryBanner).toBeVisible({ timeout: 10000 });

  // check logs are shown
  const rowTargetAlpha = page.locator("text=e2e-pod-item-0").first();
  const rowTargetOmega = page.locator("text=e2e-pod-item-49").first();
  await expect(rowTargetAlpha).toBeVisible({ timeout: 5000 });
  await expect(rowTargetOmega).toBeVisible({ timeout: 5000 });

  // check pagination
  const nextButton = page.locator("button:has-text('Next')");
  const prevButton = page.locator("button:has-text('Prev')");

  await expect(nextButton).not.toBeDisabled();
  await expect(prevButton).toBeDisabled();

  // navigate to next page
  await nextButton.click({ force: true });

  // check page 2 data loads and indicators show
  const secondaryRowTarget = page.locator("text=eviction-target-pod");
  await expect(secondaryRowTarget).toBeVisible({ timeout: 5000 });
  await expect(
    page.locator("text=Viewing historical log layer: 2"),
  ).toBeVisible();

  await expect(nextButton).toBeDisabled();
  await expect(prevButton).not.toBeDisabled();

  // going back
  await prevButton.click({ force: true });
  await expect(rowTargetAlpha).toBeVisible({ timeout: 5000 });

  await electronApp.close();
});
