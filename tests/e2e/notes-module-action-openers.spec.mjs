/* global document, window */
import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

test("Notes registered actions preserve host completion, cancellation, refresh, error and focus channels", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api, workspaceId } = isolatedWorkspace;
  const title = `Notes action ${randomUUID()}`;
  /** @type {string[]} */ const ids = [];
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  /** @param {string} actionId @param {Record<string, unknown>} params @param {boolean} callableRefresh */
  async function openAction(actionId, params, callableRefresh) {
    await page.locator("[data-note-create]").focus();
    // Use the real shared dispatcher and its real host producer. Only the host's
    // observation channels are test-owned; no dialog or write is mocked.
    await page.evaluate(({ actionId, params, callableRefresh }) => {
      const actions = window.LongtailForge?.moduleActions;
      if (!actions) throw new Error("Module actions unavailable");
      /** @type {unknown[][]} */ const events = [];
      document.body.dataset.notes32Events = "[]"; delete document.body.dataset.notes32Outcome;
      const record = (/** @type {unknown[]} */ ...event) => {
        events.push(event); document.body.dataset.notes32Events = JSON.stringify(events);
      };
      void actions.open(actionId, params, {
        refresh: callableRefresh ? (/** @type {unknown} */ detail) => record("refresh", detail) : "opaque refresh value",
        onComplete: (/** @type {unknown} */ detail) => record("complete", detail),
        onCancel: (/** @type {unknown} */ detail) => record("cancel", detail),
        setStatus: (/** @type {unknown} */ message, /** @type {unknown} */ options) => record("status", message, options),
      }).then((outcome) => { document.body.dataset.notes32Outcome = JSON.stringify(outcome); })
        .catch((error) => { document.body.dataset.notes32Outcome = JSON.stringify({ error: String(error.message) }); });
    }, { actionId, params, callableRefresh });
  }
  async function settled() {
    await expect(page.locator("body")).toHaveAttribute("data-notes32-outcome", /.+/);
    return JSON.parse((await page.locator("body").getAttribute("data-notes32-outcome")) || "null");
  }
  async function events() { return JSON.parse((await page.locator("body").getAttribute("data-notes32-events")) || "null"); }
  try {
    await page.goto("/notes.html");
    const editor = page.locator("[data-note-dialog]"), viewer = page.locator("[data-note-view-dialog]");
    await expect(page.locator("[data-note-create]")).toBeVisible();
    await openAction("notes.add", { mode: "edit", title, bodyMarkdown: "Context from a registered opener" }, false);
    await expect(editor).toBeVisible(); await expect(editor.locator("[data-note-title]")).toHaveValue(title);
    const created = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/notes");
    await editor.locator("[data-note-save-close]").click();
    const createResponse = await created; expect(createResponse.status(), await createResponse.text()).toBe(201);
    const note = (await createResponse.json()).note; ids.push(note.note_id);
    expect(note.workspace_id).toBe(workspaceId);
    // Live evidence for the projection omitted by BrowserNoteRecord's declaration.
    expect(note.effective_security_mode).toBe("normal");
    await expect(editor).toBeHidden();
    expect(await settled()).toEqual({ actionId: "notes.add", completed: true, detail: { actionId: "notes.add", recordId: note.note_id, title } });
    expect((await events()).map((/** @type {unknown[]} */ event) => event[0])).toEqual(["complete"]);
    await expect(page.locator("[data-note-create]")).toBeFocused();

    await openAction("notes.edit", { mode: "add", noteId: note.note_id }, true);
    await expect(editor).toBeVisible(); await expect(editor.locator("[data-note-title]")).toHaveValue(title);
    await editor.locator("[data-note-title]").fill(`${title} edited`);
    const saved = page.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname === `/api/notes/${note.note_id}`);
    await editor.locator("[data-note-save-close]").click(); expect((await saved).status()).toBe(200);
    await expect(editor).toBeHidden();
    expect(await settled()).toEqual({ actionId: "notes.edit", completed: true, detail: { actionId: "notes.edit", recordId: note.note_id, title: `${title} edited` } });
    const editEvents = await events(); expect(editEvents.map((/** @type {unknown[]} */ event) => event[0])).toEqual(["refresh", "complete"]);
    expect(editEvents[0][1].note.note_id).toBe(note.note_id);
    await expect(page.locator("[data-note-create]")).toBeFocused();
    const persisted = await api.get(`/api/notes/${note.note_id}`); expect(persisted.status()).toBe(200);
    expect((await persisted.json()).note.title).toBe(`${title} edited`);

    await openAction("notes.view", { noteId: note.note_id }, true);
    await expect(viewer).toBeVisible(); await expect(viewer).toContainText("Context from a registered opener");
    await expect(viewer.locator("[data-note-title], [data-note-save-close]")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("notes-registered-viewer.png") });
    await viewer.locator('[data-note-view-action="close"]').click(); await expect(viewer).toBeHidden();
    expect(await settled()).toEqual({ actionId: "notes.view", completed: false, detail: { actionId: "notes.view", recordId: note.note_id } });
    expect((await events()).map((/** @type {unknown[]} */ event) => event[0])).toEqual(["cancel"]);
    await expect(page.locator("[data-note-create]")).toBeFocused();

    await openAction("notes.edit", {}, false);
    expect(await settled()).toEqual({ error: "Note ID is required." });
    expect(await events()).toEqual([["status", "Note ID is required.", { isError: true }]]);
    await expect(editor).toBeHidden(); expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    for (const id of ids) {
      const removed = await api.post(`/api/notes/${id}/delete`); expect(removed.status(), await removed.text()).toBe(200);
      const note = (await removed.json()).note; expect(note.note_id).toBe(id); expect(note.status).toBe("deleted"); expect(note.deleted_at).toBeTruthy();
    }
  }
});
