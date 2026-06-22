import { test, expect, _electron as electron } from "@playwright/test";

test("Verify Settings view allows modifying scrape intervals, toggling creation wizards, and saving updates", async () => {
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

  // mock API route for updating config
  await page.route("**/api/cluster/config/update", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "OK",
    });
  });

  // mock API route for creating config
  await page.route("**/api/cluster/config/create", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "OK",
    });
  });

  // mock API route for getting configs
  await page.route("**/api/cluster/config**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          name: "app-feature-flags",
          type: "configmap",
          bound_pods: ["auth-service"],
          data: { ENABLE_NEW_DASHBOARD: "true" },
        },
        {
          name: "vault-token-props",
          type: "secret",
          bound_pods: [],
          data: { JWT_SIGNING_KEY: "super-secret-key-string" },
        },
      ]),
    });
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body");

  // go to settings page
  const settingsTabButton = page.locator("button:has-text('Settings')").first();
  await expect(settingsTabButton).toBeAttached({ timeout: 5000 });
  await settingsTabButton.click({ force: true });

  // select 10 seconds for metric polling interval
  const pollingSelect = page.locator("select").first();
  await expect(pollingSelect).toBeAttached();
  await pollingSelect.selectOption("10000");
  await expect(pollingSelect).toHaveValue("10000");

  // change namespace
  const namespaceInput = page.locator("input[type='text']").first();
  await expect(namespaceInput).toBeAttached();
  await namespaceInput.clear();
  await namespaceInput.fill(" PRODUCTION ");
  await expect(namespaceInput).toHaveValue("production");

  // click button to add new config
  const newBlockButton = page.locator("button:has-text('New Block')");
  await expect(newBlockButton).toBeAttached();
  await newBlockButton.click({ force: true });

  const provisionForm = page.locator("form");
  await expect(provisionForm).toBeVisible();

  // click button to choose secret config
  const secretTypeButton = provisionForm.locator("button:has-text('Secret')");
  await secretTypeButton.click({ force: true });

  // name new config
  const resourceNameInput = provisionForm.locator(
    "input[placeholder*='e.g.,']",
  );
  await resourceNameInput.fill("redis-cluster-credentials");

  // locate and fill key-value fields
  const keyInput = provisionForm
    .locator("input[placeholder='DB_PASSWORD']")
    .first();
  const valueInput = provisionForm
    .locator("input[placeholder='secret-password']")
    .first();

  await keyInput.fill("REDIS_AUTH_PASSPHRASE!");
  await expect(keyInput).toHaveValue("REDIS_AUTH_PASSPHRASE");
  await valueInput.fill("redis-secure-token-value-99");

  // commit the new config
  const commitButton = provisionForm.locator("button[type='submit']");
  await commitButton.click({ force: true });

  await expect(provisionForm).toBeHidden({ timeout: 5000 });

  const loadingIndicator = page.locator(
    "text=Waiting for cluster configurations...",
  );
  await expect(loadingIndicator).toBeHidden({ timeout: 5000 });

  // check if config is now shown
  const secretConfigCard = page
    .locator("div[title='vault-token-props']")
    .first();
  await expect(secretConfigCard).toBeVisible({ timeout: 5000 });
  await secretConfigCard.click({ force: true });

  // click to edit config
  const editorHeader = page
    .locator("div:has-text('Editing Configuration Keys for:')")
    .last();
  await expect(editorHeader).toBeVisible({ timeout: 5000 });

  // check the fields from before exist
  const secretPropertyLabel = page
    .locator("label:has-text('JWT_SIGNING_KEY')")
    .first();
  await expect(secretPropertyLabel).toBeVisible({ timeout: 5000 });

  const secretDataInput = page
    .locator("input[type='password'], input[type='text']")
    .last();
  await expect(secretDataInput).toBeAttached({ timeout: 5000 });

  // click show button to reveal secret
  const revealButton = page.locator("button:has-text('Show')").first();
  if (await revealButton.isVisible()) {
    await revealButton.click({ force: true });
  }

  // update secret value
  await expect(secretDataInput).toHaveValue("super-secret-key-string");
  await secretDataInput.fill("updated-vault-key-string");

  // click save button
  const syncButton = page
    .locator("button:has-text('Save & Sync Properties')")
    .first();
  await syncButton.click({ force: true });

  // check success toast appears after saving
  await expect(
    page.locator(
      "text=/Configuration variables successfully synced with cluster!/i",
    ),
  ).toBeVisible({ timeout: 5000 });

  await expect(editorHeader).toBeHidden({ timeout: 5000 });
  // close
  await electronApp.close();
});
