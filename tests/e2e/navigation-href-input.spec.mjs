/* global document, window */

import { expect, test } from "@playwright/test";

/**
 * The shipped navigation controller's raw `href` input, in Chromium (`0.33.33.38.2.11`).
 *
 * `navigate` accepts the destination a caller holds and converts it inside the controller, after
 * reading the document's base. These cases drive `LongtailForge.navigationIntent` on a real page,
 * with a real `<base>` element and Chromium's own URL constructor, and pin where each destination
 * lands. The unit suite compares the same controller against its `75533ba8` version.
 */

/**
 * The dashboard with a non-root `<base>`, and every navigation under it answered by a stub page.
 * @param {import("@playwright/test").Page} page
 */
async function dashboardUnderAppBase(page) {
  /** @type {string[]} */
  const landed = [];
  await page.route("**/app/**", async (route) => {
    landed.push(new URL(route.request().url()).pathname);
    await route.fulfill({ body: "<!doctype html><title>Landed</title>", contentType: "text/html" });
  });
  const response = await page.goto("/dashboard.html");
  if (!response) {
    throw new Error("page.goto(\"/dashboard.html\") returned no response");
  }
  expect(response.status()).toBe(200);
  await page.waitForFunction(() => Boolean(window.LongtailForge?.navigationIntent));
  await page.evaluate(() => {
    const base = document.createElement("base");
    base.href = "/app/workbench.html";
    document.head.prepend(base);
  });
  return landed;
}

test("a numeric destination resolves against a non-root base", async ({ page }) => {
  await dashboardUnderAppBase(page);
  await Promise.all([
    page.waitForURL("**/app/7"),
    page.evaluate(() => { void window.LongtailForge?.navigationIntent?.navigate(7, { kind: "probe" }); }),
  ]);
});

test("a conversion that moves the base resolves against the base already read", async ({ page }) => {
  await dashboardUnderAppBase(page);
  await Promise.all([
    page.waitForURL("**/app/moved.html"),
    page.evaluate(() => {
      const destination = {
        toString() {
          document.querySelector("base")?.setAttribute("href", "/other/");
          return "moved.html";
        },
      };
      void window.LongtailForge?.navigationIntent?.navigate(destination, { kind: "probe" });
    }),
  ]);
});

test("a truthy value that converts to empty text navigates to the base itself", async ({ page }) => {
  await dashboardUnderAppBase(page);
  await Promise.all([
    page.waitForURL("**/app/workbench.html"),
    page.evaluate(() => {
      void window.LongtailForge?.navigationIntent?.navigate({ toString: () => "" }, { kind: "probe" });
    }),
  ]);
});

test("a symbol throws synchronously, and a falsy destination navigates nowhere", async ({ page }) => {
  const landed = await dashboardUnderAppBase(page);
  const outcome = await page.evaluate(async () => {
    const intent = window.LongtailForge?.navigationIntent;
    let thrown = null;
    let returned = null;
    try {
      returned = intent?.navigate(Symbol("destination"), { kind: "probe" });
    } catch (error) {
      thrown = error instanceof TypeError ? error.message : "not a TypeError";
    }
    const falsy = await intent?.navigate(0, { kind: "probe" });
    return { falsy: falsy === undefined, returned: returned === null, thrown, url: window.location.pathname };
  });
  // The message no longer carries Chromium's "Failed to construct 'URL':" prefix: the conversion
  // now happens before the constructor rather than inside it. It is still a synchronous TypeError.
  expect(outcome).toEqual({
    falsy: true,
    returned: true,
    thrown: "Cannot convert a Symbol value to a string",
    url: "/dashboard.html",
  });
  expect(landed).toEqual([]);
});
