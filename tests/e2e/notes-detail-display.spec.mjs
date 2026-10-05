/* global document, window */
import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";
import { usesManagedServer } from "./support/e2e-env.mjs";
const managedTest = usesManagedServer ? test : test.skip;
managedTest("Notes detail actions and partial viewer controls preserve readable content", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api, workspaceId } = isolatedWorkspace;
  expect(typeof workspaceId).toBe("string"); expect(workspaceId).not.toBe("");
  const session = await api.get("/api/session"); expect(session.status()).toBe(200);
  expect((await session.json()).user.active_workspace_id).toBe(workspaceId);
  const title = `Detail ${randomUUID()}`;
  const created = await api.post("/api/notes", { data: { title, bodyMarkdown: "**Readable body**" } });
  expect(created.status(), await created.text()).toBe(201);
  const note = (await created.json()).note;
  expect(note.workspace_id).toBe(workspaceId); expect(typeof note.note_id).toBe("string"); expect(note.note_id).not.toBe("");
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let mode = "detail", release = () => {};
  let gate = Promise.resolve();
  try {
    await page.route(`**/api/notes/${note.note_id}`, async (route) => {
      const phase = mode; await gate;
      if (phase === "error-without-edit") {
        await route.fulfill({ status: 503, json: { error: "private decrypt payload must not be exposed" } }); return;
      }
      const response = await route.fetch(); expect(response.status(), await response.text()).toBe(200);
      const body = await response.json();
      // The note envelope stays real. Only opaque display rows are hostile fixtures.
      body.note.links = [{ label: "Readable linked row", target_type: "note", source_url: "https://example.com/reference", note_link_id: "fixture-row" }, { label: 42 }];
      await route.fulfill({ response, json: body });
    });
    await page.goto(`/notes.html?note=${encodeURIComponent(note.note_id)}`);
    const detail = page.locator("[data-note-detail]");
    await expect(detail.locator("h2")).toHaveText(title);
    await expect(detail.locator(".notes-rendered-body strong")).toHaveText("Readable body");
    const links = detail.locator(".notes-links-panel");
    if (await links.count()) await links.locator(":scope > summary").click();
    const readable = detail.getByRole("link", { name: "Readable linked row" });
    if (!await readable.isVisible()) await detail.locator("details").filter({ has: readable }).locator(":scope > summary").click();
    await expect(readable).toBeVisible(); await expect(readable).toHaveAttribute("href", "https://example.com/reference");
    await expect(detail.locator(".notes-link-item")).toHaveCount(1);
    const menu = detail.locator(".view-detail-action-menu");
    await menu.locator("summary").click();
    await expect(page.locator('[data-note-action="edit-note"]')).toBeEnabled();
    await page.locator('[data-note-action="archive-note"]').click();
    await expect(page.locator('[data-note-action="restore-note"]')).toHaveCount(1);
    await menu.locator("summary").click();
    await expect(page.locator('[data-note-action="edit-note"]')).toBeDisabled();
    await expect(page.locator('[data-note-action="edit-note"]')).toHaveAttribute("title", "Restore archived notes before editing.");
    await page.locator('[data-note-action="restore-note"]').click();
    await expect(page.locator('[data-note-action="archive-note"]')).toHaveCount(1);
    await expect(detail.locator(".notes-rendered-body strong")).toHaveText("Readable body");
    const viewer = page.locator("[data-note-view-dialog]"), editor = page.locator("[data-note-dialog]");
    for (mode of ["active", "without-edit", "non-button-edit", "error-without-edit"]) {
      gate = new Promise((resolve) => { release = () => resolve(); });
      const requested = page.waitForRequest((request) => new URL(request.url()).pathname === `/api/notes/${note.note_id}`);
      await page.evaluate((noteId) => {
        const dialogs = window.LongtailForge?.notesDialog; if (!dialogs) throw new Error("Notes dialog unavailable");
        void dialogs.openNoteViewer({ noteId, returnFocusTo: document.querySelector("[data-note-create]") });
      }, note.note_id);
      await requested; await expect(viewer).toBeVisible();
      await expect(viewer.locator("[data-note-view-body]")).toHaveText("Loading note...");
      const edit = viewer.locator('[data-note-view-action="edit"]');
      if (mode === "non-button-edit") {
        await edit.evaluate((button) => {
          const marker = document.createElement("div"); marker.dataset.noteViewAction = "edit";
          marker.textContent = "Unavailable edit control"; button.replaceWith(marker);
        });
      } else if (mode !== "active") await edit.evaluate((button) => button.remove());
      release();
      if (mode === "error-without-edit") {
        await expect(viewer).toContainText("Note unavailable");
        await expect(viewer.locator("[data-note-view-body]")).toContainText(/Note is unavailable|Secure note is locked/);
        await expect(viewer).not.toContainText("private decrypt payload must not be exposed");
      } else {
        await expect(viewer).toContainText(title);
        await expect(viewer.locator(".notes-view-rendered-body strong")).toHaveText("Readable body");
      }
      await expect(editor).toBeHidden();
      await expect(viewer.locator("input,select,textarea,[contenteditable=true]")).toHaveCount(0);
      if (mode === "non-button-edit") expect(await edit.evaluate((node) => Object.hasOwn(node, "disabled"))).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`detail-${mode}.png`), fullPage: true });
      if (mode === "active") {
        await expect(edit).toBeEnabled(); await edit.click(); await expect(viewer).toHaveCount(0);
        await expect(editor).toBeVisible(); await expect(editor.locator("[data-note-title]")).toHaveValue(title);
        await editor.locator("[data-note-cancel]").click(); await expect(editor).toBeHidden();
      } else await viewer.locator('[data-note-view-action="close"]').click();
      await expect(viewer).toHaveCount(0);
    }
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    release(); await page.unrouteAll({ behavior: "wait" });
    const removed = await api.post(`/api/notes/${note.note_id}/delete`); expect(removed.status(), await removed.text()).toBe(200);
    const body = await removed.json(); expect(body.note.note_id).toBe(note.note_id); expect(body.note.status).toBe("deleted"); expect(body.note.deleted_at).toBeTruthy();
  }
});
