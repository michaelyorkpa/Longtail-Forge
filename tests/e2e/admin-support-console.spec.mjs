// Console smoke for the six administration and support controllers scoped by
// `0.33.33.33.4`. Wrapping a classic script in an IIFE cannot be proved by lint, by the
// type checker, or by a static consumer scan: all three pass while a page throws on
// load. Four of these six pages had no rendered coverage at all before this spec, so
// the wraps would otherwise have shipped unproven.
//
// A `pageerror` or a `console.error` fails the spec. There is no allowlist, because a
// clean load produces neither.

import { expect, test } from "@playwright/test";

/** @type {ReadonlyArray<{ name: string, path: string, anchor: string }>} */
const ADMIN_SUPPORT_SURFACES = [
  { name: "User Administration", path: "/user-admin.html", anchor: "main.user-admin-page" },
  { name: "Role Assignments", path: "/role-assignments.html", anchor: "main.delegated-role-assignments-page" },
  { name: "Audit Log", path: "/audit-log.html", anchor: "main.audit-log-page" },
  { name: "Support View", path: "/support-view.html", anchor: "main.support-view-entry-page" },
  { name: "Support View Audit", path: "/support-view-audit.html", anchor: "main.support-view-audit-page" },
  { name: "API Keys", path: "/api-keys.html", anchor: "main.settings-page" },
];

for (const surface of ADMIN_SUPPORT_SURFACES) {
  test(`${surface.name} loads scoped without console errors`, async ({ page }) => {
    /** @type {string[]} */
    const violations = [];
    page.on("pageerror", (error) => violations.push(`pageerror: ${error.stack || error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") violations.push(`console.error: ${message.text()}`);
    });

    const response = await page.goto(surface.path);
    if (!response) {
      throw new Error(`Navigation to ${surface.path} returned no response`);
    }
    expect(response.status()).toBe(200);
    await expect(page.locator(surface.anchor)).toBeVisible();

    // The controller runs inside an IIFE, so nothing it declares may reach the page's
    // global scope. This is the runtime half of the static isolation guard.
    const leakedController = await page.evaluate(() => (
      typeof (/** @type {Record<string, unknown>} */ (globalThis)).setStatus
    ));
    expect(leakedController).toBe("undefined");

    expect(violations, `${surface.name} produced console output on load`).toEqual([]);
  });
}
