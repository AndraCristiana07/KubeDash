import { test, expect, _electron as electron } from "@playwright/test";

test("Verify environment map injection modal", async () => {
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
            linked_configs: ["configmap:app-feature-flags"],
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
          kind: "ConfigMap",
          data: {
            ENABLE_NEW_DASHBOARD: "true",
            MAX_RETRY_ATTEMPTS: "5",
          },
        },
      ]),
    });
  });

  const targetApiRoute = "**/api/cluster/pods/update-config";
  let interceptedPayload: any = null;

  await page.route(targetApiRoute, async (route) => {
    interceptedPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "OK",
    });
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body");

  // go to pods page
  const podsTabButton = page.locator("button:has-text('Pods')").first();
  await expect(podsTabButton).toBeAttached({ timeout: 5000 });
  await podsTabButton.click({ force: true });

  // look for target row
  const targetPodRow = page
    .locator("tr:has-text('auth-service-v1-7f4c')")
    .first();
  await expect(targetPodRow).toBeAttached({ timeout: 10000 });

  // click edit button
  const editButton = targetPodRow.locator("button:has-text('Edit')");
  await expect(editButton).toBeAttached();
  await editButton.click({ force: true });

  // check modal is open
  const modalContainer = page.locator(".fixed.inset-0").first();
  await expect(modalContainer).toBeAttached({ timeout: 5000 });

  // click select row and choose first
  const resourceDropdown = modalContainer.locator("select").nth(0);
  await expect(resourceDropdown).toBeAttached();
  await resourceDropdown.selectOption("configmap:app-feature-flags");

  const firstRowSelect = modalContainer.locator("select").nth(1);
  await expect(firstRowSelect).toBeAttached();
  await firstRowSelect.selectOption("ENABLE_NEW_DASHBOARD");

  // write in the input field
  const firstRowInput = modalContainer.locator("input[type='text']").nth(0);
  await expect(firstRowInput).toBeAttached();
  await firstRowInput.fill("test-lowercase-env-key!");
  await expect(firstRowInput).toHaveValue("TEST_LOWERCASE_ENV_KEY");

  // add new config row
  const addKeyRowButton = modalContainer.locator(
    "button:has-text('Add Key Row')",
  );

  await expect(addKeyRowButton).toBeAttached();
  await addKeyRowButton.click({ force: true });

  // check x buttons appeared
  const modalDeleteButtons = modalContainer.locator("button:has-text('✕')");
  await expect(modalDeleteButtons).toHaveCount(2, { timeout: 3000 });

  // select second option
  const secondRowSelect = modalContainer.locator("select").nth(2);
  await expect(secondRowSelect).toBeAttached();
  await secondRowSelect.selectOption("MAX_RETRY_ATTEMPTS");

  // check input
  const secondRowInput = modalContainer.locator("input[type='text']").nth(1);
  await expect(secondRowInput).toBeAttached();

  await expect(secondRowInput).toHaveValue("MAX_RETRY_ATTEMPTS", {
    timeout: 3000,
  });

  // click apply
  const applyButton = modalContainer.locator(
    "button:has-text('Apply & Recycle Pod')",
  );
  await applyButton.click({ force: true });

  await expect.poll(() => interceptedPayload).not.toBeNull();

  expect(interceptedPayload).toHaveProperty("pod_name", "auth-service-v1-7f4c");
  expect(interceptedPayload).toHaveProperty("namespace", "production");
  expect(interceptedPayload).toHaveProperty("config_name", "app-feature-flags");
  expect(interceptedPayload.mappings).toEqual([
    { source_key: "ENABLE_NEW_DASHBOARD", env_key: "TEST_LOWERCASE_ENV_KEY" },
    { source_key: "MAX_RETRY_ATTEMPTS", env_key: "MAX_RETRY_ATTEMPTS" },
  ]);

  await expect(modalContainer).toBeHidden({ timeout: 5000 });

  await electronApp.close();
});
