/* global window, document */
import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";
import { usesManagedServer } from "./support/e2e-env.mjs";

const managedTest = usesManagedServer ? test : test.skip;
managedTest("Notes preserve readable detail through revision restore, incomplete history and secure-row omission", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const title = `Revision ${testInfo.project.name}-${randomUUID()}`;
  let noteId = "";
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/notes.html");
    await expect(page.locator("[data-note-detail]")).toContainText("sidebar and select a note to view here.");
    await page.evaluate((title) => {
      const notes = window.LongtailForge?.notesDialog;
      if (!notes) throw new Error("Notes editor unavailable.");
      void notes.openNoteEditor({ mode: "add", title, bodyMarkdown: "Original readable body" });
    }, title);
    const editor = page.locator("[data-note-dialog]"); await expect(editor).toBeVisible();
    const creating = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/notes" && response.request().method() === "POST");
    await editor.locator("[data-note-save]").click(); const created = await creating;
    expect(created.status(), await created.text()).toBe(201);
    const saved = (await created.json()).note; expect(typeof saved.note_id).toBe("string"); expect(saved.note_id.length).toBeGreaterThan(0); noteId = saved.note_id;
    await expect(editor.locator("[data-note-dialog-title]")).toHaveText("Edit Note");
    await expect(editor.locator("[data-note-security]")).toBeDisabled();
    await expect(editor.locator("[data-copy-note-link]")).toBeEnabled();
    await editor.locator("[data-note-cancel]").click(); await expect(editor).toBeHidden();
    // The server deliberately hides a history containing only its original snapshot.
    // Two distinct edits establish a visible history without manufacturing rows.
    const intermediate = await api.put(`/api/notes/${noteId}`, { data: { title, bodyMarkdown: "Intermediate readable body" } });
    expect(intermediate.status(), await intermediate.text()).toBe(200);
    const initialHistory = await api.get(`/api/notes/${noteId}/revisions`); expect(initialHistory.status()).toBe(200);
    expect((await initialHistory.json()).revisions).toEqual([]);
    const changed = await api.put(`/api/notes/${noteId}`, { data: { title, bodyMarkdown: "Revised readable body" } });
    expect(changed.status(), await changed.text()).toBe(200);
    await page.reload();
    const detail = page.locator("[data-note-detail]"), panel = page.locator(".notes-revisions-panel"), list = panel.locator("[data-note-revisions-list]");
    await expect(detail.locator(".notes-rendered-body")).toHaveText("Revised readable body");
    await expect(panel).toHaveJSProperty("open", false); await panel.locator("summary").click();
    const history = await api.get(`/api/notes/${noteId}/revisions`); expect(history.status()).toBe(200);
    const revisions = (await history.json()).revisions; expect(revisions.length).toBeGreaterThanOrEqual(2);
    await expect(list.locator("article")).toHaveCount(revisions.length);
    const original = revisions.find((/** @type {{revision_number: number}} */ entry) => entry.revision_number === 1); expect(original).toBeTruthy();
    const originalRow = list.locator("article").filter({ has: page.getByText("Original", { exact: true }) });
    const restoring = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/notes/${noteId}/revisions/${original.note_revision_id}/restore`);
    await originalRow.getByRole("button", { name: "Restore", exact: true }).click(); const restored = await restoring;
    expect(restored.status(), await restored.text()).toBe(200);
    await expect(detail.locator(".notes-rendered-body")).toHaveText("Original readable body");
    expect((await (await api.get(`/api/notes/${noteId}`)).json()).note.body_markdown).toBe("Original readable body");
    const archived = await api.post(`/api/notes/${noteId}/archive`, { data: {} }); expect(archived.status()).toBe(200);
    await page.reload(); await expect(panel).toBeVisible(); await panel.locator("summary").click();
    await expect(list).toHaveAttribute("data-archived", "true"); await expect(list.locator("article").first()).toBeVisible();
    for (const button of await list.getByRole("button", { name: "Restore", includeHidden: true }).all()) await expect(button).toBeHidden();
    const active = await api.post(`/api/notes/${noteId}/restore`, { data: {} }); expect(active.status()).toBe(200);
    let mode = "one"; let expectedRows = 0; let delivered = 0;
    await page.route(`**/api/notes/${noteId}/revisions`, async (route) => {
      const response = await route.fetch(); expect(response.status(), await response.text()).toBe(200);
      const body = await response.json(); expect(body.revisions.length).toBeGreaterThan(0);
      const bad = { ...body.revisions[0], title: { marker: "SECRET UNREADABLE ROW" } };
      if (mode === "one") { expectedRows = body.revisions.length; body.revisions.splice(1, 0, bad); }
      if (mode === "all") { expectedRows = 0; body.revisions = [bad]; }
      if (mode === "secure") {
        expectedRows = 1;
        const secure = { ...body.revisions[0], security_mode: "secure", body_excerpt: null };
        delete secure.body_markdown; delete secure.secure_body_decrypted;
        body.revisions = [secure, { ...secure, body_excerpt: "SECRET SECURE BODY" }];
      }
      delivered += 1; await route.fulfill({ response, json: body });
    });
    for (mode of ["one", "all", "secure"]) {
      const before = delivered; await page.reload(); await expect(panel).toBeVisible(); await panel.locator("summary").click();
      await expect(list).toContainText("Some revisions could not be read. History is incomplete."); expect(delivered).toBeGreaterThan(before);
      await expect(list.locator("article")).toHaveCount(expectedRows); await expect(list).not.toContainText("No revisions."); await expect(list).not.toContainText("SECRET");
      await expect(detail.locator("h2")).toHaveText(title); await expect(detail.locator(".notes-rendered-body")).toHaveText("Original readable body");
      if (mode === "secure") await expect(list).toContainText("Secure revision body hidden from history.");
      await page.screenshot({ path: testInfo.outputPath(`revision-history-${mode}.png`), fullPage: true });
    }
    await page.unroute(`**/api/notes/${noteId}/revisions`);
    const unchanged = await api.get(`/api/notes/${noteId}/revisions`); expect(unchanged.status()).toBe(200);
    expect((await unchanged.json()).revisions.every((/** @type {{title: unknown}} */ row) => typeof row.title === "string")).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); expect(errors).toEqual([]);
  } finally {
    if (noteId) {
      const current = await api.get(`/api/notes/${noteId}`); expect(current.status()).toBe(200);
      if ((await current.json()).note.status === "archived") { const restored = await api.post(`/api/notes/${noteId}/restore`, { data: {} }); expect(restored.status()).toBe(200); }
      const deleted = await api.post(`/api/notes/${noteId}/delete`, { data: {} }); expect(deleted.status(), await deleted.text()).toBe(200);
      expect((await deleted.json()).note.status).toBe("deleted");
    }
  }
});
