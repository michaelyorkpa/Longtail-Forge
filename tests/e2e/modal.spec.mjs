/* global document */
// The page.evaluate callback below runs in the browser, not Node.

// Modal smoke: the highest-traffic modal (the Tasks Add Task dialog) must fit
// entirely inside the viewport at both named viewports, must not force page
// horizontal scroll while open, and must open without console errors. The
// trigger is the stable framework anatomy hook the Tasks page-header primary
// action renders (`data-add-task`).

import { expect, test } from "@playwright/test";
import { SMOKE_SURFACES } from "./support/surfaces.mjs";

const tasks = SMOKE_SURFACES.find((surface) => surface.name === "Tasks");

test("the Add Task modal fits the viewport without overflow or console errors", async ({ page }) => {
  const violations = [];

  page.on("pageerror", (error) => {
    violations.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      violations.push(`console.error: ${message.text()}`);
    }
  });

  await page.goto(tasks.path);
  await expect(page.locator(tasks.host)).toBeVisible();
  await page.waitForLoadState("networkidle");

  await page.locator("button[data-add-task]").click();

  const dialog = page.locator("dialog[open]").last();

  await expect(dialog).toBeVisible();

  const measured = await page.evaluate(() => {
    const root = document.scrollingElement || document.documentElement;
    const openDialogs = document.querySelectorAll("dialog[open]");
    const rect = openDialogs[openDialogs.length - 1].getBoundingClientRect();

    return {
      dialog: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom },
      viewport: { width: root.clientWidth, height: root.clientHeight },
      scrollWidth: root.scrollWidth,
    };
  });

  expect(measured.dialog.left, "the modal must not start left of the viewport").toBeGreaterThanOrEqual(0);
  expect(measured.dialog.top, "the modal must not start above the viewport").toBeGreaterThanOrEqual(0);
  expect(measured.dialog.right, "the modal must not extend past the right viewport edge").toBeLessThanOrEqual(measured.viewport.width);
  expect(measured.dialog.bottom, "the modal must not extend past the bottom viewport edge").toBeLessThanOrEqual(measured.viewport.height);
  expect(
    measured.scrollWidth,
    "the page must not scroll horizontally while the modal is open",
  ).toBeLessThanOrEqual(measured.viewport.width);

  expect(violations, "opening the Add Task modal produced console errors").toEqual([]);
});
