/* global document, window */
import { expect, test } from "@playwright/test";

test("Notes editor defaults, cancellation, and secure visibility follow workspace scope", async ({ page }) => {
  let workspaceType = "business";
  await page.route("**/api/app-shell/bootstrap", async (route) => {
    const response = await route.fetch();
    /** @type {unknown} */
    const body = await response.json();
    if (!body || typeof body !== "object" || !("workspaceContext" in body)
      || !body.workspaceContext || typeof body.workspaceContext !== "object") {
      throw new Error("Missing workspace context in bootstrap fixture.");
    }
    Object.assign(body.workspaceContext, { workspaceType });
    await route.fulfill({ response, json: body });
  });

  for (workspaceType of ["business", "family", "personal"]) {
    await page.goto("/notes.html");
    const create = page.locator("[data-note-create]");
    await expect(create).toBeVisible();
    await create.focus();
    await page.evaluate(() => {
      const dialog = window.LongtailForge?.notesDialog;
      if (!dialog) throw new Error("Notes dialog is unavailable.");
      window.sessionStorage.removeItem("notes-editor-result");
      window.sessionStorage.setItem("notes-editor-cancels", "0");
      void dialog.openNoteEditor({
        mode: "add", title: "Seeded draft", bodyMarkdown: "Retained body", libraryBucket: "ongoing_area",
        visibility: "client_visible", securityMode: "normal",
      }, {
        trigger: document.querySelector("[data-note-create]"),
        cancel: () => window.sessionStorage.setItem("notes-editor-cancels",
          String(Number(window.sessionStorage.getItem("notes-editor-cancels")) + 1)),
      }).then((result) => window.sessionStorage.setItem("notes-editor-result", String(result)));
    });
    const editor = page.locator("[data-note-dialog]");
    const details = editor.locator("[data-note-details-group]");
    const title = editor.locator("[data-note-title]");
    const visibility = editor.locator("[data-note-visibility]");
    const security = editor.locator("[data-note-security]");
    await expect(editor).toBeVisible();
    await expect(title).toBeFocused();
    await expect(title).toHaveValue("Seeded draft");
    await expect(editor.locator("[data-note-body]")).toHaveValue("Retained body");
    await expect(editor.locator("[data-note-library]")).toHaveValue("ongoing_area");
    await expect(details).toHaveAttribute("open", "");
    await expect(security).toBeEnabled();
    await expect(editor.locator("[data-note-secure-warning]")).toBeHidden();
    await expect(editor.locator("[data-note-preview]")).toBeHidden();
    if (workspaceType === "personal") {
      await expect(visibility).toHaveCount(0);
    } else {
      await expect(visibility).toHaveValue(workspaceType === "business" ? "client_visible" : "internal");
      await expect(visibility.locator('option[value="client_visible"]')).toHaveCount(workspaceType === "business" ? 1 : 0);
    }
    await security.selectOption("secure");
    await expect(editor.locator("[data-note-secure-warning]")).toBeVisible();
    if (workspaceType !== "personal") await expect(visibility).toHaveValue("internal");
    if (workspaceType === "business") {
      await expect(visibility.locator('option[value="client_visible"]')).toHaveJSProperty("disabled", true);
    }
    await security.selectOption("normal");
    await expect(editor.locator("[data-note-secure-warning]")).toBeHidden();
    if (workspaceType === "business") {
      await expect(visibility.locator('option[value="client_visible"]')).toHaveJSProperty("disabled", false);
      await expect(visibility).toHaveValue("internal");
    }
    await editor.locator("[data-note-cancel]").click();
    await expect(editor).toBeHidden();
    await expect(create).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("notes-editor-result"))).toBe("cancel");
    expect(await page.evaluate(() => window.sessionStorage.getItem("notes-editor-cancels"))).toBe("1");
    await create.click();
    await expect(title).toHaveValue("");
    await expect(editor.locator("[data-note-body]")).toHaveValue("");
    await expect(editor.locator("[data-note-library]")).toHaveValue("reference");
    await expect(security).toHaveValue("normal");
    await page.keyboard.press("Escape");
    await expect(editor).toBeHidden();
    expect(await page.evaluate(() => window.sessionStorage.getItem("notes-editor-cancels"))).toBe("1");
  }
});

test("Notes editor refreshes saved detail and retains partial input when hydration fails", async ({ page, request }, testInfo) => {
  const title = `Lifecycle ${testInfo.project.name}-${testInfo.workerIndex}`;
  const created = await request.post("/api/notes", { data: { title, bodyMarkdown: "Authoritative body" } });
  expect(created.status()).toBe(201);
  /** @type {unknown} */
  const body = await created.json();
  if (!body || typeof body !== "object" || !("note" in body) || !body.note || typeof body.note !== "object"
    || !("note_id" in body.note) || typeof body.note.note_id !== "string") throw new Error("Missing note fixture identity.");
  const noteId = body.note.note_id;
  await page.goto(`/notes.html?note=${encodeURIComponent(noteId)}`);
  await expect(page.locator("[data-note-detail]")).toContainText(title);
  await page.evaluate(({ noteId }) => {
    const dialog = window.LongtailForge?.notesDialog;
    if (!dialog) throw new Error("Notes dialog is unavailable.");
    void dialog.openNoteEditor({ mode: "edit", note: { note_id: noteId, title: "Stale title", body_markdown: "Stale body" } });
  }, { noteId });
  const editor = page.locator("[data-note-dialog]");
  await expect(editor.locator("[data-note-title]")).toHaveValue(title);
  await expect(editor.locator("[data-note-body]")).toHaveValue("Authoritative body");
  await expect(editor.locator("[data-note-details-group]")).not.toHaveAttribute("open");
  await editor.locator("[data-note-details-group] > summary").click();
  await expect(editor.locator("[data-note-security]")).toBeDisabled();
  await editor.locator("[data-note-cancel]").click();
  await expect(editor).toBeHidden();

  await page.route(`**/api/notes/${noteId}`, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Unavailable detail" }) }));
  for (const withContent of [true, false]) {
    await page.evaluate(({ noteId, withContent }) => {
      const dialog = window.LongtailForge?.notesDialog;
      if (!dialog) throw new Error("Notes dialog is unavailable.");
      void dialog.openNoteEditor({ mode: "edit", note: {
        note_id: noteId, ...(withContent ? { title: "Fallback title", body_markdown: "Fallback body" } : {}),
      } });
    }, { noteId, withContent });
    await expect(editor).toBeVisible();
    await expect(editor.locator("[data-note-title]")).toHaveValue(withContent ? "Fallback title" : "");
    await expect(editor.locator("[data-note-body]")).toHaveValue(withContent ? "Fallback body" : "");
    await expect(editor.locator("[data-note-dialog-title]")).toHaveText("Edit Note");
    await editor.locator("[data-note-cancel]").click();
    await expect(editor).toBeHidden();
    await expect(page.locator("[data-note-detail]")).toContainText(title);
  }
});
