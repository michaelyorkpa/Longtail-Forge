/* global document */
// The page.evaluate callback below runs in the browser, not Node.

// Horizontal-overflow smoke: the Dashboard and Workbench must not force a
// horizontal scroll at either named viewport. The check measures the real
// rendered document width (`document.scrollingElement`), not CSS strings —
// this is exactly the signal the static regression suite cannot see.

import { expect, test } from "@playwright/test";
import { SMOKE_SURFACES } from "./support/surfaces.mjs";

for (const surface of SMOKE_SURFACES) {
  test(`${surface.name} has no horizontal overflow`, async ({ page }) => {
    await page.goto(surface.path);
    await expect(page.locator(surface.host)).toBeVisible();
    // Let module data loads land so late-rendering content is measured too.
    await page.waitForLoadState("networkidle");

    const measured = await page.evaluate(() => {
      const root = document.scrollingElement || document.documentElement;

      return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
    });

    expect(
      measured.scrollWidth,
      `${surface.name} rendered ${measured.scrollWidth}px wide in a ${measured.clientWidth}px viewport (horizontal scroll)`,
    ).toBeLessThanOrEqual(measured.clientWidth);
  });
}
