// App-load smoke: the app shell renders at both named viewports with the
// right navigation affordance present and no fatal load error. Runs in the
// desktop and mobile projects; `isMobile` selects which affordance to assert.

import { expect, test } from "@playwright/test";
import { SHELL, SMOKE_SURFACES } from "./support/surfaces.mjs";

const dashboard = SMOKE_SURFACES.find((surface) => surface.name === "Dashboard");

test("app shell loads with primary navigation present", async ({ page, isMobile }) => {
  const response = await page.goto(dashboard.path);

  expect(response.status(), "the protected Dashboard view must be served to the seeded session").toBe(200);
  // The app shell rewrites the served title to "Dashboard | <workspace> | Longtail Forge"
  // once it loads; accept both so the assertion is not racing the shell script.
  await expect(page).toHaveTitle(/^Dashboard \|.*Longtail Forge$/);

  // Every protected view must carry the mobile-safe viewport meta so phones
  // render at device width instead of a zoomed-out desktop canvas.
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    "width=device-width, initial-scale=1",
  );

  // The shell script builds and prepends the header; its presence proves the
  // shell executed rather than dying on a fatal load error.
  await expect(page.locator(SHELL.primaryNav)).toBeVisible();

  if (isMobile) {
    // Mobile: the navigation affordance is the collapsed menu toggle, and the
    // shell-level tap-target floor (44px) applies to rendered controls.
    await expect(page.locator(SHELL.navToggle)).toBeVisible();
    await expect(page.locator(SHELL.navToggle)).toHaveAttribute("aria-expanded", "false");

    const toggleBox = await page.locator(SHELL.navToggle).boundingBox();

    expect(toggleBox?.height, "the nav toggle must render at least 44px tall on mobile").toBeGreaterThanOrEqual(44);
    expect(toggleBox?.width, "the nav toggle must render at least 44px wide on mobile").toBeGreaterThanOrEqual(44);
  } else {
    // Desktop: the primary menu links render inline (no toggle needed).
    await expect(page.locator(SHELL.primaryMenu)).toBeVisible();
    await expect(page.locator(`${SHELL.primaryMenu} a[href="dashboard.html"]`)).toBeVisible();
    await expect(page.locator(`${SHELL.primaryMenu} a[href="workbench.html"]`)).toBeVisible();
  }

  // The surface's module host mounted.
  await expect(page.locator(dashboard.host)).toBeVisible();
});
