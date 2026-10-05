/* global document, window */
import { expect, test } from "@playwright/test";

test("Notes picker keeps unavailable targets inert and preserves staged and saved link round trips", async ({ page, request }, testInfo) => {
  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}`;
  /** @param {string} title */
  async function createNote(title) {
    const response = await request.post("/api/notes", { data: { title, bodyMarkdown: "Linked reference" } });
    expect(response.status()).toBe(201);
    /** @type {unknown} */
    const body = await response.json();
    if (!body || typeof body !== "object" || !("note" in body) || !body.note || typeof body.note !== "object"
      || !("note_id" in body.note) || typeof body.note.note_id !== "string") throw new Error("Missing note fixture identity.");
    return body.note.note_id;
  }
  const targetTitle = `Link target ${suffix}`;
  const targetId = await createNote(targetTitle);
  const editId = await createNote(`Link editor ${suffix}`);
  const target = {
    ariaLabel: targetTitle, clientId: "", clientName: "", displayLabel: targetTitle,
    fullLabel: targetTitle, isAvailable: true, label: targetTitle, moduleId: "", projectId: "", projectName: "",
    secondaryLabel: "", sortKey: targetTitle, sourceUrl: "", subtitle: "", suggestedLibraryBucket: "reference",
    targetId, targetType: "note", title: targetTitle, workspaceName: "",
  };
  await page.route("**/api/notes/link-targets?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("targetType") !== "note") return route.continue();
    await route.fulfill({ json: { targets: [
      { ...target, targetId: "unavailable", displayLabel: "Unavailable target", isAvailable: false, sourceUrl: "notes.html?note=unavailable" },
      target,
    ] } });
  });
  /** @type {unknown[]} */
  const writes = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/links")) writes.push(request.postDataJSON());
  });
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/notes.html");
  await page.locator("[data-note-create]").click();
  const editor = page.locator("[data-note-dialog]");
  const results = editor.locator("[data-note-context-results]");
  const apply = editor.locator("[data-note-context-apply]");
  const rows = editor.locator("[data-note-context-list]");
  if (!await results.isVisible()) await editor.locator(".notes-context-panel > summary").click();
  await editor.locator("[data-note-context-target-type]").selectOption("note");
  const unavailable = results.locator('option[value="unavailable"]');
  await expect(unavailable).toHaveText("Unavailable target");
  await expect(unavailable).toHaveJSProperty("disabled", true);
  await expect(results.locator(`option[value="${targetId}"]`)).toHaveAttribute("data-module-id", "");
  await expect(results.locator(`option[value="${targetId}"]`)).toHaveAttribute("data-source-url", "");
  await results.selectOption(targetId);
  await apply.click();
  await expect(rows).toContainText(targetTitle);
  await apply.click();
  await expect(editor.locator("[data-note-form-status]")).toHaveText("Linked context is already staged.");
  await expect(rows.getByRole("button", { name: /remove/i })).toHaveCount(1);
  await rows.getByRole("button", { name: /remove/i }).click();
  await expect(rows).not.toContainText(targetTitle);
  expect(writes).toEqual([]);
  await editor.locator("[data-note-cancel]").click();

  await page.evaluate((noteId) => {
    const dialog = window.LongtailForge?.notesDialog;
    if (!dialog) throw new Error("Notes dialog is unavailable.");
    void dialog.openNoteEditor({ mode: "edit", note: { note_id: noteId } });
  }, editId);
  await expect(editor).toBeVisible();
  if (!await results.isVisible()) await editor.locator(".notes-context-panel > summary").click();
  await editor.locator("[data-note-context-target-type]").selectOption("note");
  await results.selectOption(targetId);
  await apply.click();
  await expect(rows).toContainText(targetTitle);
  expect(writes).toEqual([{ moduleId: "", targetType: "note", targetId }]);
  await apply.click();
  await expect(editor.locator("[data-note-form-status]")).toHaveText("Linked context is already added.");
  expect(writes).toHaveLength(1);
  await rows.getByRole("button", { name: /remove/i }).click();
  await expect(rows).not.toContainText(targetTitle);
  await expect(page).toHaveURL(/\/notes\.html$/);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await editor.locator("[data-note-cancel]").click();
});
