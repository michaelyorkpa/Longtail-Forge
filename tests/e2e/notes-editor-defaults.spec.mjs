/* global document, window */
import { expect, test } from "@playwright/test";

test("Notes normalizes hostile defaults and preserves workspace and secure defaults", async ({ page }) => {
  let workspaceType = "business";
  await page.route("**/api/app-shell/bootstrap", async (route) => {
    const response = await route.fetch();
    /** @type {unknown} */
    const body = await response.json();
    if (!body || typeof body !== "object" || !("workspaceContext" in body) || !body.workspaceContext || typeof body.workspaceContext !== "object") throw new Error("Missing workspace context.");
    Object.assign(body.workspaceContext, { workspaceType });
    await route.fulfill({ response, json: body });
  });
  for (workspaceType of ["business", "family", "personal"]) {
    await page.goto("/notes.html");
    await expect(page.locator("[data-note-create]")).toBeVisible();
    for (const securityMode of ["normal", "secure"]) {
      await page.evaluate(({ securityMode }) => {
        const dialog = window.LongtailForge?.notesDialog;
        if (!dialog) throw new Error("Notes editor unavailable.");
        void dialog.openNoteEditor({ mode: "add", title: { hostile: true }, body_markdown: ["invalid"], bodyMarkdown: "  Seeded body  ",
          library_bucket: 99, libraryBucket: "reference", note_type: {}, noteType: "meeting", security_mode: true, securityMode,
          client_id: {}, project_id: [], context: { clientId: false, projectId: 123 }, visibility: "client_visible" });
      }, { securityMode });
      const editor = page.locator("[data-note-dialog]");
      await expect(editor).toBeVisible();
      await expect(editor.locator("[data-note-title]")).toHaveValue("");
      await expect(editor.locator("[data-note-body]")).toHaveValue("  Seeded body  ");
      await expect(editor.locator("[data-note-library]")).toHaveValue("reference");
      await expect(editor.locator("[data-note-type]")).toHaveValue("meeting");
      await expect(editor.locator("[data-note-security]")).toHaveValue(securityMode);
      await expect(editor.locator("[data-note-project-id]")).toHaveValue("");
      if (workspaceType === "personal") await expect(editor.locator("[data-note-visibility]")).toHaveCount(0);
      else await expect(editor.locator("[data-note-visibility]")).toHaveValue(workspaceType === "business" && securityMode === "normal" ? "client_visible" : "internal");
      if (securityMode === "secure") await expect(editor.locator("[data-note-secure-warning]")).toBeVisible();
      else await expect(editor.locator("[data-note-secure-warning]")).toBeHidden();
      await editor.locator("[data-note-cancel]").click();
      await expect(editor).toBeHidden();
    }
  }
});

test("Notes creates once, continues editing, retains a failed update, and retries Save & Close", async ({ page, request }, testInfo) => {
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // The standard managed fixture has no key; a fixture-only key exercises real secure persistence.
  const health = await request.get("/api/notes/secure/health");
  expect(health.ok()).toBe(true);
  const secureHealth = (await health.json()).secureNotes;
  expect(typeof secureHealth.configured).toBe("boolean");
  const secureConfigured = secureHealth.configured === true;
  let failNextUpdate = false;
  let creates = 0;
  let updates = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/notes" && request.method() === "POST") creates += 1;
  });
  await page.route("**/api/notes/*", async (route) => {
    if (route.request().method() === "PUT") {
      updates += 1;
      if (failNextUpdate) {
        failNextUpdate = false;
        await route.fulfill({ status: 503, json: { error: "Fixture update refused." } });
        return;
      }
    }
    await route.continue();
  });
  for (const securityMode of ["normal", "secure"]) {
    const title = `Defaults ${testInfo.project.name}-${testInfo.workerIndex}-${securityMode}`;
    await page.goto("/notes.html");
    await expect(page.locator("[data-note-create]")).toBeVisible();
    await page.evaluate(({ title, securityMode }) => {
      const dialog = window.LongtailForge?.notesDialog;
      if (!dialog) throw new Error("Notes editor unavailable.");
      void dialog.openNoteEditor({ mode: "add", title, bodyMarkdown: "Original body", visibility: "private", securityMode });
    }, { title, securityMode });
    const editor = page.locator("[data-note-dialog]");
    await expect(editor).toBeVisible();
    const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/notes" && response.request().method() === "POST");
    await editor.locator("[data-note-save]").click();
    const response = await responsePromise;
    if (securityMode === "secure" && !secureConfigured) {
      expect(secureHealth.reason).toBe("SECURE_NOTES_NOT_CONFIGURED");
      expect(response.status()).toBe(503);
      expect((await response.json()).error.code).toBe("service_unavailable");
      await expect(editor.locator("[data-note-form-status]")).toHaveText("The service is temporarily unavailable.");
      await expect(editor.locator("[data-note-title]")).toHaveValue(title);
      await expect(editor.locator("[data-note-body]")).toHaveValue("Original body");
      await expect(editor.locator("[data-note-security]")).toBeEnabled();
      await expect(editor.locator("[data-note-security]")).toHaveValue("secure");
      await expect(editor.locator("[data-note-save]")).toBeEnabled();
      await expect(editor.locator("[data-note-save-close]")).toBeEnabled();
      await editor.locator("[data-note-cancel]").click();
      await expect(editor).toBeHidden();
      continue;
    }
    expect(response.status(), await response.text()).toBe(201);
    /** @type {unknown} */
    const body = await response.json();
    if (!body || typeof body !== "object" || !("note" in body) || !body.note || typeof body.note !== "object"
      || !("note_id" in body.note) || typeof body.note.note_id !== "string") throw new Error("Missing created note identity.");
    const noteId = body.note.note_id;
    expect(Object.hasOwn(body.note, "secure_payload")).toBe(false);
    await expect(editor.locator("[data-note-form-status]")).toHaveText("Note saved. Continue editing or choose Save & Close.");
    await expect(editor).toBeVisible();
    await expect(editor.locator("[data-note-dialog-title]")).toHaveText("Edit Note");
    await expect(editor.locator("[data-note-security]")).toBeDisabled();
    await expect(editor.locator("[data-note-security]")).toHaveValue(securityMode);
    await editor.locator("[data-note-title]").fill(`${title} revised`);
    await editor.locator("[data-note-body]").fill("Updated body");
    failNextUpdate = true;
    await editor.locator("[data-note-save-close]").click();
    await expect(editor.locator("[data-note-form-status]")).toContainText("Fixture update refused.");
    await expect(editor.locator("[data-note-save]")).toBeEnabled();
    await expect(editor.locator("[data-note-save-close]")).toBeEnabled();
    await expect(editor.locator("[data-note-title]")).toHaveValue(`${title} revised`);
    await expect(editor).toBeVisible();
    await editor.locator("[data-note-save-close]").click();
    await expect(editor).toBeHidden();
    const saved = await request.get(`/api/notes/${noteId}`);
    expect(saved.ok()).toBe(true);
    const detail = (await saved.json()).note;
    expect(detail.title).toBe(`${title} revised`);
    expect(detail.security_mode).toBe(securityMode);
    expect(detail.visibility).toBe("private");
    expect(Object.hasOwn(detail, "secure_payload")).toBe(false);
  }
  expect(creates).toBe(2); expect(updates).toBe(secureConfigured ? 4 : 2);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
