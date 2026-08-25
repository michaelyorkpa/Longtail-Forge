// Console smoke and published-surface proof for the Reporting host scoped by
// `0.33.33.33.5`. `reporting.html` had no rendered coverage at all, and this owner is
// the one in the child that other code reaches into: `reporting.js` publishes
// `window.LongtailForge.reporting.registerRenderer`, and module-contributed renderer
// assets - loaded as ordinary classic scripts into the page - call it to register
// themselves. Scoping the host could withdraw that surface without any static check
// noticing, and the page would still parse.

import { expect, test } from "@playwright/test";

test("Reporting host loads scoped and keeps publishing its renderer registry", async ({ page }) => {
  /** @type {string[]} */
  const violations = [];
  page.on("pageerror", (error) => violations.push(`pageerror: ${error.stack || error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") violations.push(`console.error: ${message.text()}`);
  });

  const response = await page.goto("/reporting.html");
  if (!response) {
    throw new Error("Navigation to /reporting.html returned no response");
  }
  expect(response.status()).toBe(200);
  await expect(page.locator("main[data-reporting-host]")).toBeVisible();

  // The registry is the contract renderer assets depend on. It must survive the wrap.
  const registerRenderer = await page.evaluate(() => {
    const namespace = /** @type {{ reporting?: { registerRenderer?: unknown } }} */ (
      (/** @type {Record<string, unknown>} */ (globalThis)).LongtailForge
    );
    return typeof namespace?.reporting?.registerRenderer;
  });
  expect(registerRenderer).toBe("function");

  // The controller runs inside an IIFE, so nothing it declares reaches the page scope.
  const leaked = await page.evaluate(() => [
    typeof (/** @type {Record<string, unknown>} */ (globalThis)).reportRenderers,
    typeof (/** @type {Record<string, unknown>} */ (globalThis)).registerRenderer,
  ]);
  expect(leaked).toEqual(["undefined", "undefined"]);

  expect(violations, "Reporting produced console output on load").toEqual([]);
});
