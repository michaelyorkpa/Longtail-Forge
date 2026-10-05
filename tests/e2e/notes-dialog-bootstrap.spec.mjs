/* global window */
import { test, expect } from "./support/isolated-workspace.mjs";

test("a non-Notes page lazily imports and opens the Notes viewer", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const created = await api.post("/api/notes", { data: { title: "Lazy Notes viewer", bodyMarkdown: "**Imported note**" } });
  expect(created.status(), await created.text()).toBe(201);
  const noteId = (await created.json()).note.note_id;
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/workbench.html");
  await expect(page.locator("[data-notes-host]")).toHaveCount(0);
  await page.evaluate(async () => {
    const actions = window.LongtailForge?.moduleActions;
    if (!actions) throw new Error("Module actions unavailable.");
    await actions.ensureDependencies("notes.view");
    if (typeof window.LongtailForge?.notesDialog?.openNoteViewer !== "function") {
      throw new Error("Notes viewer was not published by its import.");
    }
  });
  await expect(page.locator("[data-note-dialog]")).toHaveCount(1);
  await expect(page.locator("[data-note-tags-dialog]")).toHaveCount(1);
  await expect(page.locator("[data-note-files-dialog]")).toHaveCount(1);
  await page.evaluate(noteId => {
    const actions = window.LongtailForge?.moduleActions;
    if (!actions) throw new Error("Module actions unavailable.");
    void actions.open("notes.view", { noteId }).then(result => {
      window.sessionStorage.setItem("notes-bootstrap-result", JSON.stringify(result));
    });
  }, noteId);
  const viewer = page.locator("[data-note-view-dialog]");
  await expect(viewer).toBeVisible();
  await expect(viewer.locator(".notes-view-rendered-body strong")).toHaveText("Imported note");
  await expect(page.locator("[data-note-dialog]")).not.toBeVisible();
  await viewer.locator('[data-note-view-action="close"]').click();
  await expect(viewer).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("notes-bootstrap-result"))).toContain('"completed":false');
  await expect(page).toHaveURL(/\/workbench\.html$/);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("notes-import.png"), fullPage: true });
});
