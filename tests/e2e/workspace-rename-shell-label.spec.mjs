/* global window */
import { expect, test } from "@playwright/test";

// `0.33.33.33.1` scoped the app-shell navigation script and `0.33.33.33.3` scoped the
// Workspace Settings controller. Renaming a workspace is the only path that crosses
// between them, and `0.33.33.33.3` moved the surface that repaints the shell from a
// bare `window.*` global to `window.LongtailForge.applyWorkspaceName`.
//
// The surface is asserted directly rather than only through the rename. A rename also
// calls `refreshAppShell`, which repaints the same label, so a rename-only assertion
// still passes when the surface is withdrawn entirely - it proves the shell updates,
// not that this surface exists. Both halves are kept: the contract, and the flow that
// depends on it.
test("navigation publishes the workspace-name surface the settings controller calls", async ({ page }) => {
  const response = await page.goto("/workspace-settings.html");
  if (!response) {
    throw new Error("Navigation to /workspace-settings.html returned no response");
  }
  expect(response.status()).toBe(200);

  const published = await page.evaluate(() => typeof window.LongtailForge?.applyWorkspaceName);
  expect(published).toBe("function");

  // Calling it repaints the shell label, which is what the settings controller relies on.
  await page.evaluate(() => window.LongtailForge?.applyWorkspaceName?.("Surface Probe Workspace"));
  await expect(page.getByRole("combobox", { name: "Active workspace" })).toHaveText("Surface Probe Workspace");
});

test("renaming a workspace repaints the app shell", async ({ page }) => {
  const response = await page.goto("/workspace-settings.html");
  if (!response) {
    throw new Error("Navigation to /workspace-settings.html returned no response");
  }
  expect(response.status()).toBe(200);

  const nameInput = page.locator("[data-workspace-name-input]");
  await expect(nameInput).toBeVisible();
  const originalName = await nameInput.inputValue();
  expect(originalName.length).toBeGreaterThan(0);

  const renamed = `${originalName} Renamed`;
  const save = page.locator("[data-settings-page-save]").first();

  try {
    await nameInput.fill(renamed);
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByRole("combobox", { name: "Active workspace" })).toHaveText(renamed);
  } finally {
    await nameInput.fill(originalName);
    if (await save.isEnabled()) {
      await save.click();
      await expect(page.getByRole("combobox", { name: "Active workspace" })).toHaveText(originalName);
    }
  }
});
