import { expect, test } from "./support/isolated-workspace.mjs";
import { usesManagedServer } from "./support/e2e-env.mjs";

// Provisions its own account, so it needs the managed server - the same gate
// `settings-universal-actions.spec.mjs` already uses for its disposable account.
const managedServerTest = usesManagedServer ? test : test.skip;

/**
 * The shell's current workspace name, read from the checked option.
 *
 * The combobox is a `<select>` of every workspace the account belongs to, so its own text is the
 * concatenation of all of them. The seeded account has one and hides that; an isolated account has
 * two. Reading the checked option is correct for both.
 * @param {import("@playwright/test").Page} page
 */
async function shellWorkspaceName(page) {
  const checked = page.getByRole("combobox", { name: "Active workspace" }).locator("option:checked");
  return (await checked.textContent() || "").trim();
}

/**
 * A rejected Workspace Settings save must leave the form dirty.
 *
 * **Driven through the real controller Save action**, not a direct call to `saveSettings`, because
 * the defect lives in the contract *between* the two: `settingsPageController` runs
 * `const saved = await options.onSave?.(); if (saved !== false) setClean();`, and the page's
 * workspace-name rejection exited with a bare `return`. `undefined !== false`, so the controller
 * marked a form clean that had never been saved - and `setClean` re-snapshots the current control
 * values, making the rejected value the new "saved" baseline that Revert restores.
 *
 * The input is **whitespace-only** on purpose. It satisfies the control's native `required`
 * attribute, so nothing stops the submit before the page's own check, and `normalizeSettings`
 * trims it to `""`. That is the narrowest input that reaches the defective exit.
 */

const NAME_INPUT = "[data-workspace-name-input]";
const STATUS = "[data-workspace-settings-status]";

// **Renames its own workspace, on its own account.** `0.33.33.44.16`: this test and
// `workspace-rename-shell-label` both renamed the workspace the one seeded session pointed at, and
// `fullyParallel` with two workers let them overlap.
managedServerTest("a rejected workspace name leaves the form dirty and keeps the saved baseline", async ({ isolatedWorkspace }) => {
  const page = isolatedWorkspace.page;
  const response = await page.goto("/workspace-settings.html");
  if (!response) {
    throw new Error("Navigation to /workspace-settings.html returned no response");
  }
  expect(response.status()).toBe(200);

  const nameInput = page.locator(NAME_INPUT);
  await expect(nameInput).toBeVisible();
  const savedName = await nameInput.inputValue();
  expect(savedName.trim().length).toBeGreaterThan(0);

  const save = page.locator("[data-settings-page-save]").first();
  const revert = page.locator("[data-settings-page-revert]").first();

  /** @type {string[]} */
  const settingsWrites = [];
  page.on("request", (request) => {
    if (request.method() === "PUT" && request.url().includes("/api/settings")) {
      settingsWrites.push(request.url());
    }
  });

  try {
    await nameInput.fill("   ");
    await expect(save).toBeEnabled();

    await save.click();

    // The rejection itself is unchanged behaviour and must stay.
    await expect(page.locator(STATUS)).toContainText("Workspace name is required.");
    expect(settingsWrites, "a rejected name must not reach the server").toEqual([]);

    // The regression: the edit is still unsaved, so the controller must still consider it dirty.
    await expect(save, "a rejected save leaves the form dirty").toBeEnabled();
    await expect(revert, "so Revert is still offered").toBeEnabled();

    // And the baseline must still be the last genuinely saved name, not the rejected one.
    await revert.click();
    await expect(nameInput, "Revert restores the last saved name, not the rejected value")
      .toHaveValue(savedName);
    expect(settingsWrites, "reverting still writes nothing").toEqual([]);

    // A later valid save must still work and must move the baseline.
    const renamed = `${savedName} Checked`;
    await nameInput.fill(renamed);
    await expect(save).toBeEnabled();
    await save.click();
    await expect.poll(() => shellWorkspaceName(page)).toBe(renamed);
    expect(settingsWrites.length, "the valid save is the only write").toBe(1);
    await expect(save, "a successful save cleans the form").toBeDisabled();
  } finally {
    if (await nameInput.inputValue() !== savedName) {
      await nameInput.fill(savedName);
      if (await save.isEnabled()) {
        await save.click();
        await expect.poll(() => shellWorkspaceName(page)).toBe(savedName);
      }
    }
  }
});
