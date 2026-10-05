import { expect, test } from "@playwright/test";

/**
 * The tag management page's controls, exercised in a real browser.
 *
 * **This page had no runtime coverage at all.** The other tag specs drive the shared picker and
 * the API; none of them loads `tags.html`, so nothing proved this controller still starts.
 * `0.33.33.38.3.7` narrowed its nine control lookups with `instanceof`, which is a runtime filter:
 * a binding whose element is not the subtype the narrowing demands becomes `null` and the page
 * skips it silently. Source pins check each narrowing against the markup, but only a browser
 * proves the narrowing accepts the elements the page actually renders.
 *
 * That is the check `0.33.33.38.3.4` paid for the hard way, when a control narrowed to
 * `HTMLInputElement` turned out to be a `textarea` and a page stopped working in silence.
 */
test("Tag management controls survive their narrowing and drive a real edit", async ({ page, request }, testInfo) => {
  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}`;
  const tagName = `Narrowing Proof ${suffix}`;
  const tagDescription = `Described by ${suffix}`;

  const created = await request.post("/api/tags", {
    data: { color: "#123456", description: tagDescription, name: tagName },
  });
  expect(created.status(), "the proof tag should be created").toBe(201);
  const tag = (await created.json()).tag;

  const response = await page.goto("/tags.html");
  if (!response) {
    throw new Error("page.goto(\"/tags.html\") returned no response");
  }
  expect(response.status(), "Tags should be served to the authenticated test account").toBe(200);

  // `tagList` renders, which means loadTags() completed and the catalogue was readable.
  const row = page.locator(".tag-row", { hasText: tagName });
  await expect(row).toBeVisible();

  const nameInput = page.locator("[data-tag-name]");
  const slugInput = page.locator("[data-tag-slug]");

  // Narrow the catalogue to this worker's own tag through the page's search, which is itself one
  // of the narrowed bindings. This is not cosmetic: the suite's workers share one catalogue, so
  // the list is long, and a row deep in it sits under the editor form on the mobile viewport.
  // Filtering puts the target row at the top, where it is reachable without scrolling.
  await page.locator("[data-tag-search]").fill(tagName);
  await expect(page.locator(".tag-row")).toHaveCount(1);

  // editTag writes through all six narrowed inputs, including the colour field and the
  // description field that reads like a textarea and is an input.
  await row.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator("[data-tag-id]")).toHaveValue(tag.tag_id);
  await expect(nameInput).toHaveValue(tagName);
  await expect(slugInput).toHaveValue(tag.slug);
  await expect(page.locator("[data-tag-color]")).toHaveValue("#123456");
  await expect(page.locator("[data-tag-description]")).toHaveValue(tagDescription);

  // resetForm() calls tagForm.reset(), which only exists on the HTMLFormElement narrowing.
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.locator("[data-tag-id]")).toHaveValue("");
  await expect(nameInput).toHaveValue("");
  await expect(page.locator("[data-tag-color]")).toHaveValue("#2f6fed");

  // The slug derivation reads tagIdInput, tagSlugInput and tagNameInput in one listener, and
  // only fires while the editor carries no tag id - which the reset above has just guaranteed.
  // If any of the three narrowings refused its control, the slug would never be filled.
  await nameInput.fill(`Derived Slug ${suffix}`);
  await expect(slugInput).not.toHaveValue("");

  // The status filters are read through `button.dataset`, so the HTMLElement filter must keep
  // them. An empty list would leave the catalogue showing active tags forever. The search filter
  // is outside the form, so the reset above left it in place and these stay scoped to this tag.
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(page.locator(".tag-row", { hasText: tagName })).toHaveCount(0);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.locator(".tag-row", { hasText: tagName })).toBeVisible();
});
