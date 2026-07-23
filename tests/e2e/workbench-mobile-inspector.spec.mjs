import { expect, test } from "@playwright/test";

test("mobile Workbench opens the existing Inspector as a focus-contained slide-out", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "the Inspector slide-out is mobile-only");

  await page.goto("/workbench.html");
  const header = page.locator(".view-page-header");
  const inspectorButton = header.getByRole("button", { name: "Open Inspector" });
  const changeFocusButton = header.getByRole("button", { name: "Change Focus" });
  const headerActions = header.locator(".view-page-header-actions > button");
  const inspector = page.locator("[data-workbench-inspector]");
  const closeButton = inspector.getByRole("button", { name: "Close Inspector" });

  await expect(header.getByRole("heading", { name: "Workbench" })).toBeVisible();
  await expect(headerActions).toHaveCount(2);
  await expect(headerActions.nth(0)).toHaveAccessibleName("Open Inspector");
  await expect(headerActions.nth(1)).toHaveAccessibleName("Change Focus");
  await expect(inspectorButton).toBeVisible();
  await expect(inspectorButton.locator("svg.icon")).toBeVisible();
  await expect(inspectorButton.locator("svg.icon path")).toHaveCount(4);
  await expect(changeFocusButton).toBeVisible();
  await expect(inspector).toHaveAttribute("aria-hidden", "true");

  await inspectorButton.click();
  await expect(inspector).toBeVisible();
  await expect(inspector).toHaveClass(/view-slideout-sidebar-drawer/);
  await expect(inspector).toHaveClass(/is-open/);
  await expect(inspector).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("body")).toHaveClass(/view-slideout-sidebar-lock/);
  await expect(closeButton).toBeFocused();
  await expect(inspector.locator("#workbench-inspector-related-context-list")).toBeVisible();

  const focusTargets = inspector.locator("button:not([hidden]):not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])");
  const focusTargetCount = await focusTargets.count();
  await focusTargets.nth(focusTargetCount - 1).focus();
  await page.keyboard.press("Tab");
  await expect(closeButton).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(inspector).toHaveAttribute("aria-hidden", "true");
  await expect(inspectorButton).toBeFocused();
  await expect(page.locator("body")).not.toHaveClass(/view-slideout-sidebar-lock/);

  await inspectorButton.click();
  await closeButton.click();
  await expect(inspector).toHaveAttribute("aria-hidden", "true");
  await expect(inspectorButton).toBeFocused();
});

test("desktop Workbench keeps the Inspector as its unchanged side column", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop layout is covered once at the named desktop viewport");

  await page.goto("/workbench.html");
  const header = page.locator(".view-page-header");
  const inspector = page.locator("[data-workbench-inspector]");

  await expect(header.getByRole("button", { name: "Open Inspector" })).toBeHidden();
  await expect(header.getByRole("button", { name: "Change Focus" })).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect(inspector).not.toHaveAttribute("aria-hidden", "true");
  await expect(inspector).not.toHaveClass(/view-slideout-sidebar-drawer/);
  await expect(inspector.getByText("Inspector", { exact: true })).toBeVisible();
  await expect(inspector.locator("#workbench-inspector-related-context-list")).toBeVisible();

  const mainColumnBox = await page.locator(".workbench-main-column").boundingBox();
  const inspectorBox = await inspector.boundingBox();
  expect(inspectorBox.x).toBeGreaterThan(mainColumnBox.x + mainColumnBox.width - 2);
});
