import {
  test,
  expect,
  _electron as electron,
  ElectronApplication,
  Page,
} from "@playwright/test";

test.describe("OverviewTabContent Component Integration Suite", () => {
  let electronApp: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    electronApp = await electron.launch({ args: ["."] });
    window = await electronApp.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await window.waitForSelector("body");
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test("renders layout panels and dynamically handles cluster status metrics", async () => {
    const clusterStateHeader = window.locator("text=/cluster state/i");
    await expect(clusterStateHeader).toBeAttached({ timeout: 15000 });

    await expect(window.locator("text=/active nodes/i")).toBeAttached();
    await expect(window.locator("text=/total workloads/i")).toBeAttached();
    await expect(
      window.locator("text=/cluster quick actions/i"),
    ).toBeAttached();

    const outerCard = window.locator("text=/cluster state/i >> xpath=..");
    const actualStatusText = await outerCard.innerText();

    const colorContainer = outerCard.locator(".font-black");

    const classList = (await colorContainer.getAttribute("class")) || "";

    if (actualStatusText.toLowerCase().includes("healthy")) {
      expect(classList).toContain("text-[#5BB450]");
    } else {
      expect(classList).toContain("text-[#B32626]");
    }
  });
});
