import { expect, test } from "@playwright/test";

test("User Settings uses universal dirty, revert, and navigation-guard actions", async ({ page }) => {
  let userSettingsSaves = 0;
  let notificationSaves = 0;
  let userSettingsPayload = null;
  await page.route("**/api/user/settings", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    userSettingsSaves += 1;
    userSettingsPayload = route.request().postDataJSON();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(route.request().postDataJSON()) });
  });
  await page.route("**/api/notifications/preferences", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    notificationSaves += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.goto("/user-settings.html");
  const saves = page.locator("[data-settings-page-save]");
  const reverts = page.locator("[data-settings-page-revert]");
  await expect(saves).toHaveCount(2);
  await expect(reverts).toHaveCount(2);
  await expect(page.locator("[data-settings-save]")).toHaveCount(0);
  await expect(saves.first()).toBeDisabled();
  await expect(reverts.first()).toBeDisabled();

  await expect(page.getByText("User App Preferences", { exact: true })).toBeVisible();
  await expect(page.locator("[data-preferred-login-landing] option")).toHaveText([
    "Dashboard", "Workbench", "Actions: Tasks", "Actions: Notes", "Actions: Lists",
  ]);
  await expect(page.locator("[data-preferred-workspace-switch-landing] option")).toHaveText([
    "Dashboard", "Workbench", "Actions: Tasks", "Actions: Notes", "Actions: Lists",
  ]);

  const light = page.locator('[data-theme-mode-option][value="light"]');
  const dark = page.locator('[data-theme-mode-option][value="dark"]');
  const initialDark = await dark.isChecked();
  await (initialDark ? light : dark).check();
  await expect(saves.first()).toBeEnabled();
  await expect(reverts.first()).toBeEnabled();
  await expect(saves.first()).toHaveClass(/is-unsaved-flash/);

  await reverts.first().click();
  await expect(initialDark ? dark : light).toBeChecked();
  await expect(saves.first()).toBeDisabled();

  await page.locator("[data-current-password]").fill("lifecycle-action-only");
  await page.locator("[data-current-password]").blur();
  await expect(saves.first()).toBeDisabled();

  const displayName = page.locator("[data-profile-display-name]");
  await displayName.fill(`${await displayName.inputValue()} pending`);
  await displayName.blur();
  await expect(saves.first()).toBeEnabled();
  const navigationLink = page.locator('a[href]:not([target="_blank"])').filter({ hasNotText: "User Settings" }).first();
  await navigationLink.click();
  await expect(page.locator("[data-settings-unsaved-dialog]")).toBeVisible();
  await page.locator("[data-settings-unsaved-cancel]").click();
  await expect(page).toHaveURL(/user-settings\.html/);
  await saves.first().click();
  await expect.poll(() => userSettingsSaves).toBe(1);
  await expect.poll(() => notificationSaves).toBe(1);
  expect(userSettingsPayload.preferredLoginLanding).toBe("dashboard");
  expect(userSettingsPayload.preferredWorkspaceSwitchLanding).toBe("dashboard");
  await expect(saves.first()).toBeDisabled();
});

test("all protected Settings hosts render exactly two universal action pairs", async ({ page }) => {
  for (const path of [
    "/workspace-settings.html",
    "/tasks-settings.html",
    "/time-tracking-settings.html",
    "/files-settings.html",
  ]) {
    await page.goto(path);
    await expect(page.locator("[data-settings-page-save]"), path).toHaveCount(2);
    await expect(page.locator("[data-settings-page-revert]"), path).toHaveCount(2);
    await expect(page.locator("[data-settings-save]"), path).toHaveCount(0);
    await expect(page.locator(".settings-page-status:empty"), path).toBeHidden();
  }
});
