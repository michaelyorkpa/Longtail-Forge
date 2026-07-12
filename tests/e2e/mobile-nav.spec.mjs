// Mobile-navigation smoke: at the mobile viewport the nav toggle opens the
// collapsed primary menu, closing it hides the menu again, and focus stays on
// a visible control (the toggle) rather than being lost into hidden content.

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
