import { expect, test } from "@playwright/test";

/**
 * The notifications page's filter controls, exercised in a real browser.
 *
 * **This page had no runtime coverage.** `0.33.33.38.3.8` narrowed its module filter to
 * `HTMLSelectElement` and filtered its status buttons to `HTMLElement`, and both are runtime
 * filters: a control the narrowing refuses becomes `null`, or drops out of the list, and the page
 * then skips it in silence. Source pins check each narrowing against the markup, but only a
 * browser proves the narrowing accepts the elements the page actually renders.
 *
 * That is the check `0.33.33.38.3.4` paid for the hard way, when a control narrowed to
 * `HTMLInputElement` turned out to be a `textarea` and a page stopped working without saying so.
 *
 * No notification is seeded: the controls answer on their own, and an empty catalogue is a real
 * state this page renders. What is being proved is that the controls were found, not what they
 * filter.
 */
test("Notification filter controls survive their narrowing", async ({ page }) => {
  const response = await page.goto("/notifications.html");
  if (!response) {
    throw new Error("page.goto(\"/notifications.html\") returned no response");
  }
  expect(response.status(), "Notifications should be served to the authenticated test account").toBe(200);

  // The controller reached its end, so the captures above it ran.
  await expect
    .poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.notificationsPageReady)))
    .toBe(true);

  // The module filter is read through `moduleFilter?.value`. If the HTMLSelectElement narrowing
  // had refused it, renderModuleFilterOptions would return early and leave it without its option.
  const moduleFilter = page.locator("[data-notification-module-filter]");
  await expect(moduleFilter).toBeVisible();
  await expect(moduleFilter.locator("option")).not.toHaveCount(0);
  await expect(moduleFilter).toHaveValue("");

  // The status filters are read through `button.dataset`, so the HTMLElement filter must keep all
  // four. An emptied list would leave every button's pressed state frozen at its markup default.
  const active = page.getByRole("button", { name: "Active", exact: true });
  const unread = page.getByRole("button", { name: "Unread", exact: true });
  await expect(active).toHaveAttribute("aria-pressed", "true");
  await expect(unread).toHaveAttribute("aria-pressed", "false");

  await unread.click();
  await expect(unread).toHaveAttribute("aria-pressed", "true");
  await expect(active).toHaveAttribute("aria-pressed", "false");

  // Back again, so the proof is that the state follows the click rather than landing once.
  await active.click();
  await expect(active).toHaveAttribute("aria-pressed", "true");
  await expect(unread).toHaveAttribute("aria-pressed", "false");
});
