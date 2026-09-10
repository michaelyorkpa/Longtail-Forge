/* global document, window */
import { expect, test } from "@playwright/test";

test("Notes offers, edits, bulk assigns and renders tags through the shared picker", async ({ page, request }, testInfo) => {
  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}`;
  const tags = [];
  for (const name of [`Tag Alpha ${suffix}`, `Tag Beta ${suffix}`]) {
    const result = await request.post("/api/tags", { data: { name, color: "#112233" } });
    expect(result.status(), await result.text()).toBe(201);
    tags.push((await result.json()).tag);
  }
  const notes = [];
  for (const title of [`Tag Note A ${suffix}`, `Tag Note B ${suffix}`]) {
    const result = await request.post("/api/notes", { data: { title, bodyMarkdown: "Tag surface fixture" } });
    expect(result.status(), await result.text()).toBe(201);
    notes.push((await result.json()).note);
  }
  const first = notes[0]; const alpha = tags[0];
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/notes.html");
  await expect(page.locator("[data-note-create]")).toBeVisible();
  await page.evaluate((noteId) => {
    const notesDialog = window.LongtailForge?.notesDialog;
    if (!notesDialog) throw new Error("Notes dialog unavailable.");
    void notesDialog.openNoteEditor({ mode: "edit", noteId });
  }, first.note_id);
  const editor = page.locator("[data-note-dialog]");
  const toggle = editor.locator("[data-note-tags-toggle]");
  await expect(editor).toBeVisible(); await toggle.click();
  const dialog = page.locator("[data-note-tags-dialog]");
  await expect(dialog).toBeVisible();
  const input = dialog.locator("[data-tag-picker-input]"); await expect(input).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  for (const tag of tags) {
    await input.fill(tag.name);
    await dialog.locator(`[data-tag-picker-suggestion="${tag.tag_id}"]`).click();
    await expect(dialog.locator(`[data-tag-picker-selected][value="${tag.tag_id}"]`)).toHaveCount(1);
  }
  await dialog.locator("[data-note-tags-dialog-close]").click();
  await expect(dialog).toBeHidden(); await expect(toggle).toBeFocused(); await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await editor.locator("[data-note-save-close]").click(); await expect(editor).toBeHidden();
  await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
  const row = page.locator(".notes-list-item").filter({ hasText: first.title });
  await expect(row.locator(".notes-tag-overflow")).toHaveAttribute("title", "1 more tag");
  await expect(row.locator(".notes-tag-list > .tag-chip")).toHaveCount(2);
  for (const note of notes) await page.getByRole("checkbox", { name: `Select ${note.title} for bulk editing` }).check();
  await page.locator("[data-note-bulk-edit]").click();
  const bulk = page.locator("[data-note-bulk-dialog]"); await expect(bulk).toBeVisible();
  await bulk.locator("[data-note-bulk-tag-action]").selectOption("add");
  await bulk.locator("[data-tag-picker-input]").fill(alpha.name);
  await bulk.locator(`[data-tag-picker-suggestion="${alpha.tag_id}"]`).click();
  await bulk.locator("[data-note-bulk-apply]").click(); await expect(bulk).toBeHidden();
  await expect(page.locator("[data-notes-status]")).toContainText("Updated 2 notes.");
  for (const note of notes) {
    const result = await request.get(`/api/tags/assignments?targetType=note&targetId=${encodeURIComponent(note.note_id)}`);
    expect(result.status()).toBe(200);
    const assigned = (await result.json()).directTags.map((/** @type {{tag_id: string}} */ tag) => tag.tag_id);
    expect(assigned).toContain(alpha.tag_id);
    if (note.note_id === first.note_id) expect(assigned).toContain(tags[1].tag_id);
  }
  await page.locator(".notes-filters-panel summary").click();
  const filter = page.locator("[data-note-filter-tags]"); await filter.fill(alpha.name);
  await expect(page.getByRole("option", { name: alpha.name, exact: true })).toBeVisible();
  await page.getByRole("option", { name: alpha.name, exact: true }).click();
  await expect(filter).toHaveValue(alpha.name);
  for (const note of notes) await expect(page.getByRole("checkbox", { name: `Select ${note.title} for bulk editing` })).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
