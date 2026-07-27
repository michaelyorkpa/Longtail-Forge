/* global getComputedStyle */
// Rendered Appearance coverage: Theme mode remains a bounded segmented radio
// group while Auto source appears as a separate subordinate control.

import { expect, test } from "@playwright/test";

test("Appearance keeps Theme mode bounded in every rendered state", async ({ page }) => {
  await page.route("**/api/user/settings", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }

    const payload = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        themeMode: payload.themeMode,
        themeAutoSource: payload.themeAutoSource || "system",
      }),
    });
  });

  const response = await page.goto("/user-settings.html");
  expect(response.status()).toBe(200);

  const modeField = page.locator('[data-view-field="themeMode"]');
  const modeControl = modeField.locator(":scope > .theme-mode-control");
  const autoField = page.locator('[data-view-field="themeAutoSource"]');
  const autoControl = autoField.locator(":scope > .theme-auto-source-options");
  const modeInput = (value) => modeField.locator(`input[value="${value}"]`);

  await expect(modeControl).toBeVisible();
  await expect(modeControl.locator("label.settings-segmented-option")).toHaveCount(3);
  await expect(autoControl.locator("label.settings-segmented-option")).toHaveCount(1);

  await modeInput("light").check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(autoField).toBeHidden();
  await assertBoundedControl(modeControl);

  await modeInput("dark").check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(autoField).toBeHidden();
  await assertBoundedControl(modeControl);

  await page.emulateMedia({ colorScheme: "light" });
  await modeInput("auto").check();
  await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "auto");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(autoField).toBeVisible();
  await expect(autoControl).toBeVisible();
  await assertBoundedControl(modeControl);
  await assertBoundedControl(autoControl);

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await assertBoundedControl(modeControl);
  await assertBoundedControl(autoControl);

  await modeInput("light").focus();
  await page.keyboard.press("ArrowRight");
  await expect(modeInput("auto")).toBeChecked();
  await expect(autoField).toBeVisible();
});

test("User Settings lays out profile, notifications, workspace lifecycle, and complete timezone choices", async ({ page }) => {
  const response = await page.goto("/user-settings.html");
  expect(response.status()).toBe(200);

  const grid = page.locator(".user-settings-grid");
  const primaryColumn = grid.locator(":scope > .user-settings-column").first();
  const appearance = primaryColumn.locator(".view-settings-section").filter({ hasText: "Appearance" }).first();
  const profile = primaryColumn.locator(".view-settings-section").filter({ hasText: "Profile" }).first();
  await expect(appearance).toBeVisible();
  await expect(profile).toBeVisible();
  expect(await appearance.evaluate((element) => element.closest("form")?.nextElementSibling?.querySelector("legend")?.textContent)).toBe("Profile");

  const notificationForm = page.locator("[data-user-notification-preferences-form]");
  const leaveForm = page.locator("[data-settings-action-form]").filter({ has: page.getByRole("button", { name: "Leave Workspace", exact: true }) });
  const workspaceCreation = page.locator("[data-workspace-creation-disclosure]");
  await expect(page.getByText("Calendar Subscription", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-calendar-subscription-form]")).toHaveCount(0);
  await expect(notificationForm).toBeVisible();
  await expect(notificationForm.getByText("Notification Grouping", { exact: true })).toBeVisible();
  const notificationFields = notificationForm.locator(".view-settings-section-fields > *");
  await expect(notificationFields.first().getByText("Notification Grouping", { exact: true })).toBeVisible();
  const notificationMatrices = notificationForm.locator(".notification-preference-matrix");
  await expect(notificationMatrices.first()).toBeVisible();
  expect(await notificationMatrices.evaluateAll((elements) => elements.every((element) => element.scrollWidth <= element.clientWidth + 1))).toBe(true);
  await expect(leaveForm).toBeVisible();
  await expect(workspaceCreation).not.toHaveAttribute("open", "");
  await expect(workspaceCreation.locator("summary")).toHaveText("Workspace Creation");

  const widths = await Promise.all([grid, notificationForm, leaveForm, workspaceCreation].map(async (locator) => {
    const box = await locator.boundingBox();
    return box?.width || 0;
  }));
  for (const width of widths.slice(1)) {
    expect(width).toBeGreaterThan(widths[0] * 0.95);
  }

  const gridChildren = grid.locator(":scope > *");
  expect(await gridChildren.last().getAttribute("data-workspace-creation-disclosure")).not.toBeNull();
  const caret = await workspaceCreation.locator("summary").evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return { borderLeftWidth: Number.parseFloat(style.borderLeftWidth), content: style.content };
  });
  expect(caret.borderLeftWidth).toBeGreaterThan(0);
  expect(caret.content).not.toBe("none");

  const timezoneOptions = page.locator("[data-profile-timezone] option");
  expect(await timezoneOptions.count()).toBeGreaterThan(300);
  const timezoneLabels = await timezoneOptions.allTextContents();
  expect(timezoneLabels.some((label) => label.startsWith("Africa/"))).toBe(true);
  expect(timezoneLabels.some((label) => label.startsWith("Asia/"))).toBe(true);
  expect(timezoneLabels.some((label) => label.startsWith("Europe/"))).toBe(true);
  for (const label of timezoneLabels) {
    expect(label).toMatch(/ \(UTC [+-]\d{2}:\d{2}\)$/);
  }

  const warning = "Leaving a workspace removes only your membership. The workspace and its data are not deleted. A Workspace Administrator or Super Admin must restore your access if you need to return.";
  await expect(leaveForm.locator(".workspace-membership-warning")).toHaveText(warning);
  await leaveForm.getByRole("button", { name: "Leave Workspace", exact: true }).click();
  const dialog = page.locator("[data-workspace-removal-dialog]");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".workspace-membership-warning")).toHaveText(warning);
});

async function assertBoundedControl(control) {
  const metrics = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const sectionRect = element.closest(".view-settings-section")?.getBoundingClientRect();

    return {
      borderStyle: style.borderStyle,
      borderWidth: Number.parseFloat(style.borderTopWidth),
      sectionWidth: sectionRect?.width || 0,
      width: rect.width,
    };
  });

  expect(metrics.borderStyle, "the segmented control must render a visible border").not.toBe("none");
  expect(metrics.borderWidth, "the segmented control border must be at least one CSS pixel").toBeGreaterThanOrEqual(1);
  expect(metrics.width, "the segmented control must remain narrower than its Appearance section").toBeLessThan(metrics.sectionWidth - 24);
}
