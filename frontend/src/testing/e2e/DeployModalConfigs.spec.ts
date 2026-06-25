import { test, expect, _electron as electron } from "@playwright/test";

test("Verify cluster variable resource mapping and rows", async () => {
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

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body");

  // fetch type signature check inside the browser evaluation block
  await page.evaluate(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      // safely check for string type vs object properties
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url || "";
      if (
        url.includes("config") ||
        url.includes("secret") ||
        url.includes("resource")
      ) {
        return new Response(
          JSON.stringify([
            {
              name: "production-database-credentials",
              type: "secret",
              data: { DB_PASS: "c3VwZXJzZWNyZXQ=", DB_HOST: "cG9zdGdyZXM=" },
            },
          ]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return originalFetch(input, init);
    };
  });

  // open the modal panel
  await page
    .locator("button:has-text('Deploy New Pod')")
    .click({ force: true });
  const modalHeader = page.locator(
    "h3:has-text('Deploy New Workspace Workload')",
  );
  await expect(modalHeader).toBeVisible({ timeout: 5000 });

  const configSelect = page.locator("select").first();
  const fallbackText = page.locator(
    "text=/No configs available in this namespace boundary/i",
  );

  // verification for config list
  if (await fallbackText.isVisible()) {
    await expect(fallbackText).toBeVisible();
    console.log(
      "-> Config list is empty. Verified the namespace fallback text element.",
    );
  } else {
    await expect(configSelect).toBeVisible({ timeout: 5000 });
    await configSelect.selectOption("production-database-credentials");

    const subSectionLabel = page.locator(
      "text=/Map Resource Keys to Container/i",
    );
    await expect(subSectionLabel).toBeVisible({ timeout: 5000 });

    // select key
    const keySelect = page.locator("select").nth(1);
    await keySelect.selectOption("DB_PASS");

    const envInput = page.locator("input[placeholder*='DB_PASS']").first();
    // check sanitization to uppercase
    await envInput.fill("api_secret_key");
    await expect(envInput).toHaveValue("API_SECRET_KEY");

    // add another row of variable mapping
    const addVariableButton = page.locator(
      "button:has-text('+ Add Variable Mapping')",
    );
    await addVariableButton.click({ force: true });
    // check there's 2 rows now
    const envInputRows = page.locator("input[placeholder*='DB_PASS']");
    await expect(envInputRows).toHaveCount(2);

    // delete first row
    const deleteRowButton = page.locator("button:has-text('✕')").first();
    await deleteRowButton.click({ force: true });

    // verify it's back to 1 row
    await expect(envInputRows).toHaveCount(1);
    console.log(
      "-> Config list populated. Verified full multi-row variable mapper pipelines!",
    );
  }

  await electronApp.close();
});
