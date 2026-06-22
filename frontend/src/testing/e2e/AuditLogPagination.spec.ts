import { test, expect, _electron as electron } from "@playwright/test";

// mock to have 3 pages
const multiPageMock = {
  logs: [
    {
      id: 201,
      pod_name: "paginated-pod",
      namespace: "default",
      message: "working",
      level: "Normal",
      created_at: "2026-06-15T08:35:12Z",
    },
  ],
  total_items: 60,
  current_page: 1,
};

test("Verify pagination button clicks increment page ", async () => {
  const electronApp = await electron.launch({
    args: [
      ".",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--no-sandbox",
    ],
  });
  const window = await electronApp.firstWindow();
  await window.setViewportSize({ width: 1440, height: 900 });

  let targetPageQueried = "";

  await window.route("**/api/logs*", async (route) => {
    targetPageQueried = route.request().url();

    // grab the page the frontend component is asking for
    const urlObj = new URL(targetPageQueried);
    const pageNum = urlObj.searchParams.get("page") || "1";

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...multiPageMock,
        current_page: parseInt(pageNum),
      }),
    });
  });

  await window.reload({ waitUntil: "domcontentloaded" });
  await window.waitForSelector("body");

  //navigate to audit logs
  const navButton = window
    .locator(
      "button:has-text('Audit Logs'), a:has-text('Audit Logs'), [role='tab']:has-text('Logs')",
    )
    .first();
  await expect(navButton).toBeVisible({ timeout: 15000 });
  await navButton.click({ force: true });

  // select 25 limit per page
  await window.locator("select").nth(1).selectOption("25");

  // click Next button
  const nextButton = window.locator("button:has-text('Next')");
  const prevButton = window.locator("button:has-text('Prev')");

  await expect(prevButton).toBeDisabled(); // on page 1, prev should be blocked
  await nextButton.click({ force: true });

  // see if it went to page 2
  await expect.poll(() => targetPageQueried).toContain("page=2");
  await expect(window.locator("text=/Page 2 of 3/i")).toBeVisible();

  // click Prev to turn back
  await prevButton.click({ force: true });
  await expect.poll(() => targetPageQueried).toContain("page=1");
  await expect(window.locator("text=/Page 1 of 3/i")).toBeVisible();

  await electronApp.close();
});
