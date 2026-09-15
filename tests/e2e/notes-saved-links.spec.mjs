/* global document, window */
import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

test("Notes editor drops unreadable saved rows while keeping a real link removable and an empty seed usable", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api, workspaceId } = isolatedWorkspace;
  const suffix = randomUUID(), targetTitle = `Saved target ${suffix}`, title = `Saved links ${suffix}`;
  /** @type {string[]} */ const ids = [];
  /** @type {string[]} */ const errors = [];
  /** @type {string[]} */ const removals = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/links\/[^/]+\/remove$/.test(new URL(request.url()).pathname)) removals.push(new URL(request.url()).pathname);
  });
  try {
    for (const noteTitle of [targetTitle, title]) {
      const response = await api.post("/api/notes", { data: { title: noteTitle, bodyMarkdown: "Saved link context" } });
      expect(response.status(), await response.text()).toBe(201);
      const note = (await response.json()).note; ids.push(note.note_id); expect(note.workspace_id).toBe(workspaceId);
    }
    const [targetId, noteId] = ids;
    const linked = await api.post(`/api/notes/${noteId}/links`, { data: { moduleId: "notes", targetType: "note", targetId } });
    expect(linked.status(), await linked.text()).toBe(201);
    const detailRead = await api.get(`/api/notes/${noteId}`); expect(detailRead.status()).toBe(200);
    const savedLinks = (await detailRead.json()).note.links; expect(savedLinks).toHaveLength(1);
    const rowId = savedLinks[0].note_link_id; expect(typeof rowId).toBe("string");
    // Keep the authoritative response and real writes. Only unreadable display rows
    // are added, to exercise the unknown[] boundary a saved note actually supplies.
    await page.route(`**/api/notes/${noteId}`, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const response = await route.fetch(); expect(response.status()).toBe(200);
      const body = await response.json(); body.note.links = [null, { label: 42 }, ...body.note.links];
      await route.fulfill({ response, json: body });
    });
    await page.goto(`/notes.html?note=${noteId}`);
    const detail = page.locator("[data-note-detail]"); await expect(detail).toContainText(title);
    await detail.locator('details:has([data-note-action="edit-note"]) > summary').click();
    await detail.locator('[data-note-action="edit-note"]').click();
    const editor = page.locator("[data-note-dialog]"), rows = editor.locator("[data-note-context-list]");
    await expect(editor).toBeVisible();
    if (!await rows.isVisible()) await editor.locator(".notes-context-panel > summary").click();
    await expect(rows).toContainText(targetTitle); await expect(rows).toContainText("Primary Context");
    await expect(rows.getByRole("button", { name: /remove/i })).toHaveCount(1);
    const removed = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/notes/${noteId}/links/${rowId}/remove`);
    await rows.getByRole("button", { name: /remove/i }).click(); expect((await removed).status()).toBe(200);
    await expect(rows).not.toContainText(targetTitle); await expect(rows.getByRole("button", { name: /remove/i })).toHaveCount(0);
    await expect(editor.locator("[data-note-title]")).toHaveValue(title);
    await expect(rows).toContainText("Primary Context"); expect(removals).toEqual([`/api/notes/${noteId}/links/${rowId}/remove`]);
    const persisted = await api.get(`/api/notes/${noteId}`); expect(persisted.status()).toBe(200); expect((await persisted.json()).note.links).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("unreadable-links-editor.png") });
    await editor.locator("[data-note-cancel]").click(); await expect(editor).toBeHidden();
    await page.locator("[data-note-create]").click(); await expect(editor).toBeVisible();
    await expect(editor.locator("[data-note-title]")).toBeEditable();
    await expect(rows.getByRole("button", { name: /remove/i })).toHaveCount(0);
    await editor.locator("[data-note-cancel]").click();
    expect(errors).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    for (const id of ids) {
      const removed = await api.post(`/api/notes/${id}/delete`); expect(removed.status(), await removed.text()).toBe(200);
      const note = (await removed.json()).note; expect(note.note_id).toBe(id); expect(note.status).toBe("deleted"); expect(note.deleted_at).toBeTruthy();
    }
  }
});
