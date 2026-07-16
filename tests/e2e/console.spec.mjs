// Console smoke: loading the app shell, Dashboard, and Workbench must not
// produce runtime page errors or console.error output. The shared app shell
// (header, navigation, notifications, global search) loads with every surface
// below, so shell coverage rides along with both loads.
//
// "No major console errors" means: every `pageerror` and `console.error`
// event fails the spec unless it matches the documented allowlist. Keep the
// allowlist small and explained — an unexplained entry is a smell, not a fix.

import { expect, test } from "@playwright/test";
import { SMOKE_SURFACES } from "./support/surfaces.mjs";

// Documented allowlist of known-benign console errors. Each entry needs a
// comment explaining why it is benign. Currently empty: a clean load produces
// no console errors, and it should stay that way.
const CONSOLE_ERROR_ALLOWLIST = [];

for (const surface of SMOKE_SURFACES) {
  test(`${surface.name} loads without major console errors`, async ({ page }) => {
    const violations = [];

    page.on("pageerror", (error) => {
      violations.push(`pageerror: ${error.stack || error.message}`);
    });
    page.on("console", (message) => {
      if (message.type() !== "error") {
        return;
      }

      const text = message.text();

      if (CONSOLE_ERROR_ALLOWLIST.some((pattern) => pattern.test(text))) {
        return;
      }

      violations.push(`console.error: ${text}`);
    });

    await page.goto(surface.path);
    await expect(page.locator(surface.host)).toBeVisible();
    // Let async module data loads finish so their failures are captured too.
    await page.waitForLoadState("networkidle");

    expect(
      violations,
      `${surface.name} produced console errors outside the documented allowlist`,
    ).toEqual([]);
  });
}
