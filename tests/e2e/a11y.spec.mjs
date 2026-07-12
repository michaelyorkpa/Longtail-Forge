// Automated WCAG A/AA smoke: axe scans of the primary surfaces and their
// meaningful rendered states at both named viewports. The shared app shell
// (header, navigation, notifications, global search) loads with every surface,
// so shell coverage rides along with each scan. Scans wait for the same
// stable state a user can interact with before analysis.
//
// A clean scan is NOT WCAG conformance: axe catches only automatically
// detectable failures. Keyboard/focus behavior is asserted separately in
// a11y-keyboard.spec.mjs, and docs/accessibility.md lists the manual
// assessment that remains required.

import { expect, test } from "@playwright/test";
import { expectNoWcagViolations } from "./support/axe.mjs";
import { SHELL, SMOKE_SURFACES } from "./support/surfaces.mjs";

const SCANNED_SURFACES = ["Dashboard", "Workbench", "Tasks"];

for (const name of SCANNED_SURFACES) {
  const surface = SMOKE_SURFACES.find((candidate) => candidate.name === name);

  test(`${surface.name} default state passes the WCAG scan`, async ({ page }, testInfo) => {
    await page.goto(surface.path);
    await expect(page.locator(surface.host)).toBeVisible();
    await page.waitForLoadState("networkidle");

    await expectNoWcagViolations(page, testInfo, `${surface.name.toLowerCase()}-default`);
  });
}

test("Tasks filter sidebar open state passes the WCAG scan", async ({ page }, testInfo) => {
  await page.goto("/tasks.html");
  await page.waitForLoadState("networkidle");

  await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
  await expect(page.locator(".view-slideout-sidebar-drawer.is-open")).toBeVisible();

  await expectNoWcagViolations(page, testInfo, "tasks-sidebar-open");
});

test("Add Task modal state passes the WCAG scan", async ({ page }, testInfo) => {
  await page.goto("/tasks.html");
  await page.waitForLoadState("networkidle");

  await page.locator("button[data-add-task]").click();
  await expect(page.locator("dialog[open]").last()).toBeVisible();

  await expectNoWcagViolations(page, testInfo, "add-task-modal");
});

test("Add Task validation-error state passes the WCAG scan", async ({ page }, testInfo) => {
  await page.goto("/tasks.html");
  await page.waitForLoadState("networkidle");

  await page.locator("button[data-add-task]").click();
  await expect(page.locator("dialog[open]").last()).toBeVisible();

  // A whitespace-only title passes native `required` but fails the server
  // contract, so the real route-error status renders before the scan.
  await page.locator("dialog[open] input[data-task-title]").fill("   ");
  await page.locator("dialog[open] button[data-save-task]").click();
  await expect(page.getByText("Task title is required.")).toBeVisible();

  await expectNoWcagViolations(page, testInfo, "add-task-validation-error");
});

test("stacked tags child dialog state passes the WCAG scan", async ({ page }, testInfo) => {
  await page.goto("/tasks.html");
  await page.waitForLoadState("networkidle");

  await page.locator("button[data-add-task]").click();
  await expect(page.locator("dialog[open]").last()).toBeVisible();

  await page.locator("dialog[open] button[data-task-tags-toggle]").first().click();
  await expect(page.locator("dialog[open]")).toHaveCount(2);

  await expectNoWcagViolations(page, testInfo, "stacked-tags-dialog");
});

test("open mobile navigation drawer passes the WCAG scan", async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, "the nav drawer only exists at the mobile viewport");

  await page.goto("/dashboard.html");
  await page.waitForLoadState("networkidle");

  await page.locator(SHELL.navToggle).click();
  await expect(page.locator(SHELL.primaryMenu)).toBeVisible();

  await expectNoWcagViolations(page, testInfo, "mobile-nav-drawer-open");
});
