/* global document, window */
import { expect, test } from "@playwright/test";

test("Saved Notes viewer stays read-only and hands the same note to the editor", async ({ page, request }, testInfo) => {
  const title = `Viewer ${testInfo.project.name}-${testInfo.workerIndex}`;
  const created = await request.post("/api/notes", { data: { title, bodyMarkdown: "**Rendered note** [Reference](https://example.com)" } });
  expect(created.status(), await created.text()).toBe(201);
  /** @type {unknown} */
  const body = await created.json();
  if (!body || typeof body !== "object" || !("note" in body) || !body.note || typeof body.note !== "object"
    || !("note_id" in body.note) || typeof body.note.note_id !== "string") throw new Error("Missing note fixture identity.");
  const noteId = body.note.note_id;
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/notes.html?note=${encodeURIComponent(noteId)}`);
  await expect(page.locator("[data-note-detail]")).toContainText(title);
  const inlineMeta = await page.locator("[data-note-detail] .notes-detail-meta").textContent();
  let mode = "active";
  await page.route(`**/api/notes/${noteId}`, async (route) => {
    if (mode === "unavailable" || mode === "secure-error") {
      await route.fulfill({ status: 403, json: { error: mode === "secure-error" ? "secret crypto payload" : "private server path" } });
      return;
    }
    const response = await route.fetch();
    /** @type {unknown} */
    const body = await response.json();
    if (!body || typeof body !== "object" || !("note" in body) || !body.note || typeof body.note !== "object") throw new Error("Missing viewer detail.");
    if (mode === "archived") Object.assign(body.note, { status: "archived" });
    await route.fulfill({ response, json: body });
  });
  const viewer = page.locator("[data-note-view-dialog]");
  const editor = page.locator("[data-note-dialog]");
  for (mode of ["active", "archived", "unavailable", "secure-error"]) {
    await page.locator("[data-note-create]").focus();
    await page.evaluate(({ noteId }) => {
      const dialog = window.LongtailForge?.notesDialog;
      if (!dialog) throw new Error("Notes dialog unavailable.");
      window.sessionStorage.setItem("viewer-cancels", "[]");
      void dialog.openNoteViewer({ noteId, returnFocusTo: document.querySelector("[data-note-create]"), note: { title: "Untrusted action title" } }, {
        trigger: document.querySelector("[data-note-create]"),
        cancel: (/** @type {unknown} */ detail) => {
          const values = JSON.parse(window.sessionStorage.getItem("viewer-cancels") || "[]");
          values.push(detail); window.sessionStorage.setItem("viewer-cancels", JSON.stringify(values));
        },
      });
    }, { noteId });
    await expect(viewer).toBeVisible();
    await expect(editor).toBeHidden();
    await expect(viewer.locator("input,select,textarea,[contenteditable=true]")).toHaveCount(0);
    const edit = viewer.locator('[data-note-view-action="edit"]');
    if (mode === "active" || mode === "archived") {
      await expect(viewer).toContainText(title);
      await expect(viewer.locator(".notes-view-rendered-body strong")).toHaveText("Rendered note");
      await expect(viewer.locator(".notes-view-rendered-body a")).toHaveAttribute("href", "https://example.com");
      if (mode === "active") {
        await expect(viewer.locator(".notes-view-meta")).toHaveText(inlineMeta || "");
        await expect(edit).toBeEnabled();
        await edit.click();
        await expect(viewer).toHaveCount(0);
        await expect(editor).toBeVisible();
        await expect(editor.locator("[data-note-title]")).toHaveValue(title);
        await expect(editor.locator("[data-note-body]")).toHaveValue("**Rendered note** [Reference](https://example.com)");
        expect(await page.evaluate(() => window.sessionStorage.getItem("viewer-cancels"))).toBe("[]");
        await editor.locator("[data-note-cancel]").click();
      } else {
        await expect(edit).toBeDisabled();
        await expect(edit).toHaveAttribute("title", "Restore archived notes before editing.");
        await viewer.locator('[data-note-view-action="close"]').click();
      }
    } else {
      await expect(viewer).toContainText("Note unavailable");
      await expect(viewer).not.toContainText("secret crypto payload");
      await expect(viewer).not.toContainText("private server path");
      await expect(edit).toBeDisabled();
      await viewer.locator('[data-note-view-action="close"]').click();
    }
    await expect(viewer).toHaveCount(0);
    await expect(editor).toBeHidden();
    await expect(page.locator("[data-note-create]")).toBeFocused();
    const cancellations = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem("viewer-cancels") || "[]"));
    expect(cancellations).toEqual([{ actionId: mode === "active" ? "notes.edit" : "notes.view", recordId: noteId }]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});
