import { test, expect, _electron as electron } from "@playwright/test";

test("Verify YAML modal rendering, text input", async () => {
  const electronApp = await electron.launch({
    args: [
      ".",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--no-sandbox",
    ],
  });
  const window = await electronApp.firstWindow();

  await window.reload({ waitUntil: "domcontentloaded" });
  await window.waitForSelector("body");

  // open initial dialog
  const deployButton = window.locator("button:has-text('Deploy New Pod')");
  await expect(deployButton).toBeVisible({ timeout: 15000 });
  await deployButton.click();

  // click button to go to YAML modal
  const applyYamlButton = window.locator(
    "button:has-text('Apply YAML Manifest')",
  );
  await expect(applyYamlButton).toBeVisible({ timeout: 5000 });
  await applyYamlButton.click();

  // attached dynamic manifest deployment layout
  const modalHeader = window.locator("h3:has-text('Manifest Deployment')");
  await expect(modalHeader).toBeVisible({ timeout: 5000 });

  // verify typing manual code inside the editor
  const textarea = window.locator("textarea[placeholder*='apiVersion']");
  await expect(textarea).toBeVisible();

  const testYaml = "metadata:\n  name: user-pod";
  await textarea.fill(testYaml);
  await expect(textarea).toHaveValue(testYaml);

  // verify clicking Clear action button clears code out
  const clearButton = window.locator("button:has-text('Clear')");
  await expect(clearButton).toBeEnabled();
  await clearButton.click();
  await expect(textarea).toHaveValue("");

  // drag and drop event handling
  const dropZone = window.locator("text=/Drag & Drop YAML File Here/i");
  await dropZone.evaluate((node) => {
    const dataTransfer = new DataTransfer();
    const mockFile = new File(
      ["kind: Pod\nmetadata:\n  name: drop-pod"],
      "sample-manifest.yaml",
      { type: "text/yaml" },
    );
    dataTransfer.items.add(mockFile);

    const dropEvent = new DragEvent("drop", { bubbles: true, dataTransfer });
    node.dispatchEvent(dropEvent);
  });

  // verify toast text updates match state
  await expect(
    window.locator("text=/Loaded manifest configuration/i"),
  ).toBeVisible({ timeout: 5000 });

  await electronApp.close();
});
