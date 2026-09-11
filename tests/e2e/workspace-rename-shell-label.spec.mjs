/* global window */
import { expect, test } from "./support/isolated-workspace.mjs";
import { usesManagedServer } from "./support/e2e-env.mjs";

// Provisions its own account, so it needs the managed server - the same gate
// `settings-universal-actions.spec.mjs` already uses for its disposable account.
const managedServerTest = usesManagedServer ? test : test.skip;

/**
 * The shell's current workspace name, read from the checked option.
 *
 * The combobox is a `<select>` of every workspace the account belongs to, so its own text is the
 * concatenation of all of them. The seeded account has one workspace and hides that; an isolated
 * account has two. Reading the checked option is correct for both.
 * @param {import("@playwright/test").Page} page
 */
async function shellWorkspaceName(page) {
  const checked = page.getByRole("combobox", { name: "Active workspace" }).locator("option:checked");
  return (await checked.textContent() || "").trim();
}

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

// **Renames its own workspace, on its own account.** `0.33.33.44.16`: this test and
// `workspace-settings-rejected-save` both renamed the workspace the one seeded session pointed at,
// and `fullyParallel` with two workers let them overlap - whichever asserted second could observe
// the other's name or its restore. Isolating the *writers* also fixes the readers, because nothing
// renames the shared workspace any more.
managedServerTest("renaming a workspace repaints the app shell", async ({ isolatedWorkspace }) => {
  const page = isolatedWorkspace.page;
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
    await expect.poll(() => shellWorkspaceName(page)).toBe(renamed);
  } finally {
    await nameInput.fill(originalName);
    if (await save.isEnabled()) {
      await save.click();
      await expect.poll(() => shellWorkspaceName(page)).toBe(originalName);
    }
  }
});
