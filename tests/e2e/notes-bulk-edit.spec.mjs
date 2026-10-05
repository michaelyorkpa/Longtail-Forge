/* global document, window */
import { expect, test } from "@playwright/test";

test("Notes bulk edit preserves successful writes and retains failures for retry", async ({ page, request }, testInfo) => {
  /** @type {{note_id: string, title: string}[]} */
  const notes = [];
  for (const index of [1, 2]) {
    const title = `Bulk ${testInfo.project.name}-${testInfo.workerIndex}-${index}`;
    const created = await request.post("/api/notes", { data: { title, bodyMarkdown: "Bulk fixture", noteType: "general" } });
    expect(created.status(), await created.text()).toBe(201);
    /** @type {unknown} */
    const body = await created.json();
    if (!body || typeof body !== "object" || !("note" in body) || !body.note || typeof body.note !== "object"
      || !("note_id" in body.note) || typeof body.note.note_id !== "string") throw new Error("Missing bulk note fixture.");
    notes.push({ note_id: body.note.note_id, title });
  }
  const [first, second] = notes;
  if (!first || !second) throw new Error("Two notes are required.");
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let mode = "partial";
  let writes = 0;
  await page.route("**/api/notes/bulk", async (route) => {
    writes += 1;
    expect(route.request().postDataJSON()).toEqual({ noteIds: mode === "partial" ? [first.note_id, second.note_id] : [second.note_id], changes: { noteType: "meeting" } });
    if (mode === "partial") {
      const response = await route.fetch({ postData: JSON.stringify({ noteIds: [first.note_id], changes: { noteType: "meeting" } }) });
      expect(response.ok()).toBe(true);
      /** @type {unknown} */
      const body = await response.json();
      if (!body || typeof body !== "object") throw new Error("Missing bulk response.");
      await route.fulfill({ response, json: { ...body, errors: [{ note_id: second.note_id, message: "Fixture update refused.", status: 403 }] } });
    } else {
      await route.fulfill({ json: { notes: [], errors: [{ note_id: second.note_id, message: "Fixture retry refused.", status: 403 }] } });
    }
  });
  await page.goto("/notes.html");
  await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
  for (const note of notes) await page.getByRole("checkbox", { name: `Select ${note.title} for bulk editing` }).check();
  const edit = page.locator("[data-note-bulk-edit]");
  await expect(page.locator("[data-note-bulk-toolbar] [data-view-bulk-selection-count]")).toHaveText("2 selected");
  await edit.click();
  const dialog = page.locator("[data-note-bulk-dialog]");
  const apply = dialog.locator("[data-note-bulk-apply]");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-note-bulk-library]")).toBeFocused();
  await apply.click();
  await expect(dialog.locator("[data-note-bulk-form-status]")).toHaveText("Choose at least one field to update.");
  expect(writes).toBe(0);
  await dialog.locator("[data-note-bulk-type]").selectOption("meeting");
  await apply.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("[data-notes-status]")).toHaveText("Updated 1 notes; 1 could not be fully updated.");
  await expect(page.getByRole("checkbox", { name: `Select ${first.title} for bulk editing` })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: `Select ${second.title} for bulk editing` })).toBeChecked();
  for (const [note, expectedType] of [[first, "meeting"], [second, "general"]]) {
    if (typeof note === "string" || !note) throw new Error("Missing fixture note.");
    const response = await request.get(`/api/notes/${note.note_id}`);
    expect((await response.json()).note.note_type).toBe(expectedType);
  }
  mode = "failed";
  await edit.click();
  await expect(dialog.locator("[data-note-bulk-type]")).toHaveValue("");
  await expect(dialog.locator("[data-note-bulk-form-status]")).toHaveText("1 notes selected.");
  await dialog.locator("[data-note-bulk-type]").selectOption("meeting");
  await apply.click();
  await expect(dialog.locator("[data-note-bulk-form-status]")).toHaveText("Fixture retry refused.");
  await expect(apply).toBeEnabled();
  await expect(dialog).toBeVisible();
  await dialog.locator("[data-note-bulk-cancel]").click();
  await expect(dialog).toBeHidden();
  await expect(edit).toBeFocused();
  await page.locator("[data-note-bulk-clear]").click();
  await expect(edit).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: `Select ${second.title} for bulk editing` })).not.toBeChecked();
  expect(writes).toBe(2);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
