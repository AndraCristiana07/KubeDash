import { test, expect, _electron as electron } from "@playwright/test";

test("Verify configuration quick view modal", async () => {
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

  // mock API route getting pods
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

  // mock API route getting configs
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

        {
          name: "configmap:app-feature-flags",
          type: "configmap",
          data: {
            ENABLE_NEW_DASHBOARD: "true",
            API_TIMEOUT_MS: "3000",
          },
        },
        {
          name: "database-credentials",
          type: "secret",
          data: {
            POSTGRES_PASSWORD: "super-secret-password-123",
          },
        },
      ]),
    });
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body");

  // go to pods management page
  const podsTabButton = page.locator("button:has-text('Pods')").first();
  await expect(podsTabButton).toBeAttached({ timeout: 5000 });
  await podsTabButton.click({ force: true });

  // locate pod row
  const targetPodRow = page
    .locator("tr:has-text('auth-service-v1-7f4c')")
    .first();
  await expect(targetPodRow).toBeAttached({ timeout: 10000 });

  // check configMap
  // click buttom for the configmap item
  const configmapBadge = targetPodRow.locator("text=app-feature-flags").first();
  await expect(configmapBadge).toBeAttached();
  await configmapBadge.click({ force: true });

  // check modal opened
  const modalContainer = page.locator(".fixed.inset-0").first();
  await expect(modalContainer).toBeAttached({ timeout: 5000 });

  await expect(modalContainer.locator("h3")).toContainText("⚙️");
  await expect(modalContainer.locator("h3")).toContainText("app-feature-flags");

  // check configMap key-value pair exists
  const keyElement = modalContainer.locator("text=ENABLE_NEW_DASHBOARD:");
  const valueElement = modalContainer.locator("text=true");
  await expect(keyElement).toBeVisible();
  await expect(valueElement).toBeVisible();

  // close modal
  const closePanelButton = modalContainer.locator(
    "button:has-text('Close Panel')",
  );
  await expect(closePanelButton).toBeAttached();
  await closePanelButton.click({ force: true });
  await expect(modalContainer).toBeHidden({ timeout: 5000 });

  // check secret
  // click button for the  secret item
  const secretBadge = targetPodRow.locator("text=database-credentials").first();
  await expect(secretBadge).toBeAttached();
  await secretBadge.click({ force: true });

  // check modal opened
  await expect(modalContainer).toBeAttached({ timeout: 5000 });
  await expect(modalContainer.locator("h3")).toContainText("🔒");
  await expect(modalContainer.locator("h3")).toContainText(
    "database-credentials",
  );

  // checj key-value pair exists but secret is not visible
  await expect(modalContainer.locator("text=POSTGRES_PASSWORD:")).toBeVisible();

  const maskedValueElement = modalContainer.locator(
    "text=•••••••• (Encrypted Secret)",
  );
  await expect(maskedValueElement).toBeVisible();

  // check actaul secret exists
  const leakCheckElement = modalContainer.locator(
    "text=super-secret-password-123",
  );
  await expect(leakCheckElement).toBeHidden();
  // close modal
  const exitIconButton = modalContainer.locator("button:has-text('✕')");
  await expect(exitIconButton).toBeAttached();
  await exitIconButton.click({ force: true });

  await expect(modalContainer).toBeHidden({ timeout: 5000 });

  await electronApp.close();
});
