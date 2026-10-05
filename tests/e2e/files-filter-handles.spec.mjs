import { expect, test } from "@playwright/test";

/**
 * The Files page's filter handles, exercised in a real browser.
 *
 * **Nothing exercised these before.** `view-shell-cold-load` proves the Files shell renders
 * `[data-file-list]`, which is a different claim: the shell can build perfectly while the handles
 * the page caches from it are empty. `0.33.33.43.5` narrowed nine of those handles with
 * `instanceof`, which is a runtime filter - a control the narrowing refuses becomes `null`, and
 * `readFilters` then reads nothing through it and sends no parameter.
 *
 * That is the failure `0.33.33.38.3.4` shipped once already: a narrowing refused a real control,
 * the page quietly stopped working, and the file compiled clean throughout. Source pins hold the
 * builders and the declarations together; only a browser proves the lookups actually find them.
 *
 * The filters are read on submit, so the assertion is on the request the page sends. No fixture is
 * needed: an empty result is a real answer, and what is being proved is that the values were read.
 */
test("Files filter handles resolve and reach the request", async ({ page }) => {
  const response = await page.goto("/files.html");
  if (!response) {
    throw new Error("page.goto(\"/files.html\") returned no response");
  }
  expect(response.status(), "Files should be served to the authenticated test account").toBe(200);

  // The shell is built before the handles are cached, so wait for the anatomy first.
  await expect(page.locator("[data-file-list]")).toBeAttached();

  const filename = page.locator("[data-file-filter-filename]");
  const status = page.locator("[data-file-filter-status]");

  // The filters mount inside the shared slide-out drawer, so they are present but hidden until it
  // is opened. Caching does not depend on that - `cacheFilesElements` runs at bootstrap - but
  // filling a control does.
  await expect(filename).toBeAttached();
  await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
  await expect(filename).toBeVisible();
  await expect(status).toBeVisible();

  // Both must be the elements their narrowings demand, in the real document rather than in source.
  expect(await filename.evaluate((node) => node.tagName)).toBe("INPUT");
  expect(await status.evaluate((node) => node.tagName)).toBe("SELECT");

  const query = page.waitForRequest((request) => request.url().includes("/api/files/attachments?")
    && request.url().includes("filename=narrowing-proof"));

  await filename.fill("narrowing-proof");
  await page.locator("[data-file-filters] button[type=submit]").click();

  // The filename only reaches the wire if `filenameFilter` survived its narrowing and its value
  // was read; a refused handle would send no filename at all.
  const sent = new URL((await query).url());
  expect(sent.searchParams.get("filename")).toBe("narrowing-proof");
  expect(sent.searchParams.get("status"), "the status select is read on the same submit").toBeTruthy();
});
