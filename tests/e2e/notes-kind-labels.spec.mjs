/* global document, window */
import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";
import { usesManagedServer } from "./support/e2e-env.mjs";
const managedTest = usesManagedServer ? test : test.skip;

managedTest("Notes preserves legacy kind labels through edit and resets choices for a new note", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api, workspaceId } = isolatedWorkspace;
  const title = `Legacy kind ${randomUUID()}`;
  /** @type {string[]} */ const ids = [];
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const response = await api.post("/api/notes", { data: { title, bodyMarkdown: "Legacy kind proof", noteType: "task" } });
    expect(response.status(), await response.text()).toBe(201);
    const note = (await response.json()).note; ids.push(note.note_id);
    expect(note.workspace_id).toBe(workspaceId); expect(note.note_type).toBe("task");
    await page.goto(`/notes.html?note=${note.note_id}`);
    const detail = page.locator("[data-note-detail]"); await expect(detail).toContainText(title);
    await expect(detail.locator(".notes-detail-meta")).toContainText("Legacy task");
    const edit = detail.locator('[data-note-action="edit-note"]');
    await detail.locator('details:has([data-note-action="edit-note"]) > summary').click(); await edit.click();
    const dialog = page.locator("[data-note-dialog]"), kind = dialog.locator("[data-note-type]");
    await expect(dialog).toBeVisible(); await expect(kind).toHaveValue("task");
    await expect(kind.locator("option[data-legacy-note-kind='true']")).toHaveText(["Legacy task"]);
    const details = dialog.locator("[data-note-details-group]");
    if (!await kind.isVisible()) await details.locator(":scope > summary").click();
    await expect(kind).toBeVisible(); await expect(kind).toBeEnabled();
    await kind.selectOption("meeting"); await expect(kind).toHaveValue("meeting"); await kind.selectOption("task");
    const saved = page.waitForResponse((result) => result.request().method() === "PUT" && new URL(result.url()).pathname === `/api/notes/${note.note_id}`);
    await dialog.locator("[data-note-save-close]").click(); expect((await saved).status()).toBe(200);
    await expect(dialog).toBeHidden(); await expect(detail.locator(".notes-detail-meta")).toContainText("Legacy task");
    const persisted = await api.get(`/api/notes/${note.note_id}`); expect(persisted.status()).toBe(200); expect((await persisted.json()).note.note_type).toBe("task");
    await page.locator("[data-note-create]").click(); await expect(dialog).toBeVisible();
    await expect(kind).toHaveValue("general"); await expect(kind.locator("[data-legacy-note-kind]")).toHaveCount(0);
    await expect(kind.locator("option")).toHaveText(["General", "Meeting", "Research", "Decision", "Procedure", "Reference", "Idea", "Log"]);
    await page.screenshot({ path: testInfo.outputPath("new-note-kind-options.png") });
    await dialog.locator("[data-note-cancel]").click(); await expect(dialog).toBeHidden();
    expect(errors).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    for (const id of ids) {
      const removed = await api.post(`/api/notes/${id}/delete`); expect(removed.status(), await removed.text()).toBe(200);
      const note = (await removed.json()).note; expect(note.note_id).toBe(id); expect(note.status).toBe("deleted"); expect(note.deleted_at).toBeTruthy();
    }
  }
});
