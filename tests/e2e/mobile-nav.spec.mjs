/* global document, window */
// The page.evaluate callbacks below run in the browser, not Node.

// Mobile-navigation smoke: at the mobile viewport the nav toggle opens the
// primary menu as a drawer, closing it hides the menu again, and focus stays
// on a visible control (the toggle) rather than being lost into hidden
// content. The drawer contract adds overlay/escape close affordances, focus
// moving into the open drawer, and a body scroll lock while it is open.

import { expect, test } from "@playwright/test";
import { SHELL, SMOKE_SURFACES } from "./support/surfaces.mjs";

const dashboard = SMOKE_SURFACES.find((surface) => surface.name === "Dashboard");

test("mobile nav toggle opens and closes the primary menu", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the collapsed nav toggle only exists at the mobile viewport");

  await page.goto(dashboard.path);

  const toggle = page.locator(SHELL.navToggle);
  const menu = page.locator(SHELL.primaryMenu);

  // Collapsed by default.
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeHidden();

  // Toggle opens the menu and exposes real navigation targets.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toBeVisible();
  await expect(menu.locator('a[href="workbench.html"]')).toBeVisible();

  // Toggle closes it again and focus stays on the visible toggle control.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeHidden();
  await expect(toggle, "focus must return to a visible control after closing the menu").toBeFocused();
});

test("mobile nav drawer provides overlay, escape, focus, and scroll-lock affordances", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the nav drawer only exists at the mobile viewport");

  await page.goto(dashboard.path);

  const toggle = page.locator(SHELL.navToggle);
  const menu = page.locator(SHELL.primaryMenu);
  const overlay = page.locator(SHELL.navDrawerOverlay);

  await expect(overlay).toBeHidden();

  // Opening shows the overlay, locks body scroll, and moves focus into the
  // drawer so keyboard users land on the navigation they just opened.
  await toggle.click();
  await expect(menu).toBeVisible();
  await expect(overlay).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.getComputedStyle(document.body).overflow), {
      message: "body scroll must lock while the drawer is open",
    })
    .toBe("hidden");
  await expect
    .poll(() => page.evaluate(() => document.getElementById("primary-menu")?.contains(document.activeElement) === true), {
      message: "focus must move into the open drawer",
    })
    .toBe(true);

  // Escape closes the drawer, releases the scroll lock, and returns focus to
  // the visible toggle control.
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(overlay).toBeHidden();
  await expect(toggle, "focus must return to the toggle after Escape").toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.getComputedStyle(document.body).overflow), {
      message: "body scroll must release when the drawer closes",
    })
    .not.toBe("hidden");

  // Clicking the overlay (outside the drawer panel) closes it too.
  await toggle.click();
  await expect(menu).toBeVisible();
  await overlay.click({ position: { x: 360, y: 400 } });
  await expect(menu).toBeHidden();
  await expect(overlay).toBeHidden();
  await expect(toggle, "focus must return to the toggle after an overlay click").toBeFocused();
});
