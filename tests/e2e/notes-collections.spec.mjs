import { expect, test } from "@playwright/test";

test("Notes collection hierarchy, dialogs, and mutation recovery preserve context", async ({ page, request }, testInfo) => {
  test.setTimeout(90000);
  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}`;
  const rootTitle = `Collection Root ${suffix}`;
  /** @param {string} title @param {string | null} [parentCollectionId] @param {string} [libraryBucket] */
  async function createCollection(title, parentCollectionId = null, libraryBucket = "reference") {
    const response = await request.post("/api/notes/collections", { data: { title, parentCollectionId, libraryBucket } });
    expect(response.status()).toBe(201);
    /** @type {unknown} */
    const body = await response.json();
    if (!body || typeof body !== "object" || !("collection" in body)
      || !body.collection || typeof body.collection !== "object"
      || !("note_library_collection_id" in body.collection)
      || typeof body.collection.note_library_collection_id !== "string") {
      throw new Error("Collection fixture did not return its identifier.");
    }
    return body.collection.note_library_collection_id;
  }

  const root = await createCollection(rootTitle);
  const child = await createCollection(`Collection Child ${suffix}`, root);
  const grandchild = await createCollection(`Collection Grandchild ${suffix}`, child);
  const otherLibrary = await createCollection(`Other Library ${suffix}`, null, "active_work");
  const archived = await createCollection(`Archived Collection ${suffix}`);
  expect((await request.post(`/api/notes/collections/${archived}/archive`, { data: {} })).ok()).toBe(true);

  await page.goto("/notes.html");
  const drawer = page.locator("[data-view-slideout-sidebar-trigger]").first();
  await drawer.click();
  const filter = page.locator("[data-note-filter-collection]");
  await expect(filter.locator(`option[value="${grandchild}"]`)).toHaveText(`    - Collection Grandchild ${suffix}`);
  await filter.selectOption(root);
  const trigger = page.getByRole("button", { name: "Collection actions", exact: true });
  const actions = page.locator("[data-note-collection-actions-dialog]");
  const editor = page.locator("[data-note-collection-dialog]");
  await trigger.click();
  await expect(actions.getByRole("button", { name: "New collection", exact: true })).toBeFocused();
  await actions.getByRole("button", { name: "Close", exact: true }).click();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await actions.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(actions).toBeHidden();
  const title = editor.locator("[data-note-collection-title]");
  await expect(title).toBeFocused();
  await expect(title).toHaveValue(rootTitle);
  await expect(editor.locator("[data-note-collection-library]")).toBeDisabled();
  const parent = editor.locator("[data-note-collection-parent]");
  for (const excluded of [root, child, grandchild, otherLibrary, archived]) {
    await expect(parent.locator(`option[value="${excluded}"]`)).toHaveCount(0);
  }

  const save = editor.locator("[data-note-collection-save]");
  await title.fill(`${rootTitle} Renamed`);
  await page.route(`**/api/notes/collections/${root}`, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Collection update conflict." }) });
    } else await route.continue();
  });
  await save.click();
  await expect(editor.locator("[data-note-collection-form-status]")).toContainText("Collection update conflict.");
  await expect(save).toBeEnabled();
  await expect(title).toHaveValue(`${rootTitle} Renamed`);
  await page.unroute(`**/api/notes/collections/${root}`);
  await save.click();
  await expect(editor).toBeHidden();
  await expect(filter).toHaveValue(root);
  await expect(filter.locator(`option[value="${root}"]`)).toHaveText(`${rootTitle} Renamed`);

  await trigger.click();
  await actions.getByRole("button", { name: "New collection", exact: true }).click();
  await expect(parent).toHaveValue(root);
  await expect(editor.locator("[data-note-collection-library]")).toHaveValue("reference");
  await expect(editor.locator("[data-note-collection-library]")).toBeEnabled();
  const newTitle = `Created Through Dialog ${suffix}`;
  await title.fill(newTitle);
  await save.click();
  await expect(editor).toBeHidden();
  const createdOption = filter.locator("option").filter({ hasText: newTitle });
  await expect(createdOption).toHaveCount(1);
  const createdId = await createdOption.getAttribute("value");
  if (!createdId) throw new Error("Created collection is missing from the refreshed hierarchy.");

  // Cancel leaves the record readable; confirming deletes only the selected empty collection.
  await filter.selectOption(createdId);
  await trigger.click();
  await actions.getByRole("button", { name: "Delete Empty", exact: true }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete empty collection", exact: true });
  await deleteDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(filter.locator(`option[value="${createdId}"]`)).toHaveCount(1);
  await trigger.click();
  await actions.getByRole("button", { name: "Delete Empty", exact: true }).click();
  await deleteDialog.getByRole("button", { name: "Delete Empty", exact: true }).click();
  await expect(filter.locator(`option[value="${createdId}"]`)).toHaveCount(0);

  await filter.selectOption(child);
  await trigger.click();
  await actions.getByRole("button", { name: "Archive", exact: true }).click();
  const archiveDialog = page.getByRole("dialog", { name: "Archive collection", exact: true });
  await expect(archiveDialog).toContainText("Notes stay in the collection and are not archived.");
  await archiveDialog.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(filter.locator(`option[value="${child}"]`)).toHaveCount(0);
  await page.locator("[data-note-collection-library-filter]").selectOption("archive");
  await expect(filter.locator(`option[value="${child}"]`)).toHaveCount(1);
  await filter.selectOption(child);
  await trigger.click();
  for (const name of ["Edit", "Archive", "Delete Empty"]) {
    await expect(actions.getByRole("button", { name, exact: true })).toBeDisabled();
  }
});
