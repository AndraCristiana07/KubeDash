import { test, expect, _electron as electron } from "@playwright/test";

test("Verify dashboard layout panels and cluster metrics load cleanly", async () => {
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

  await window.reload({ waitUntil: "domcontentloaded" });
  await window.waitForSelector("body");

  // verify elements are attached
  const clusterStateHeader = window.locator("text=/cluster state/i");
  await expect(clusterStateHeader).toBeAttached({ timeout: 15000 });

  await expect(window.locator("text=/active nodes/i")).toBeAttached();
  await expect(window.locator("text=/total workloads/i")).toBeAttached();
  await expect(window.locator("text=/cluster quick actions/i")).toBeAttached();

  const outerCard = window.locator("text=/cluster state/i >> xpath=..");
  const actualStatusText = await outerCard.innerText();
  const colorContainer = outerCard.locator(".font-black");
  const classList = (await colorContainer.getAttribute("class")) || "";

  // verify text color based on status
  if (actualStatusText.toLowerCase().includes("healthy")) {
    expect(classList).toContain("text-[#5BB450]");
  } else {
    expect(classList).toContain("text-[#B32626]");
  }

  await electronApp.close();
});
