/* global document, window */
import { expect, test } from "@playwright/test";

test("Notes primary controls preserve provider labels, fallback context and workspace scope", async ({ page, request }, testInfo) => {
  test.setTimeout(60000);
  const created = await request.post("/api/notes", { data: { title: `Primary context ${testInfo.project.name}-${testInfo.workerIndex}`, bodyMarkdown: "Context" } });
  expect(created.status(), await created.text()).toBe(201);
  /** @type {unknown} */
  const createdBody = await created.json();
  if (!createdBody || typeof createdBody !== "object" || !("note" in createdBody) || !createdBody.note
    || typeof createdBody.note !== "object" || !("note_id" in createdBody.note)
    || typeof createdBody.note.note_id !== "string") throw new Error("Missing note fixture identity.");
  const noteId = createdBody.note.note_id;
  await page.route(`**/api/notes/${noteId}`, async (route) => {
    const response = await route.fetch();
    /** @type {unknown} */
    const body = await response.json();
    if (!body || typeof body !== "object" || !("note" in body) || !body.note || typeof body.note !== "object") {
      throw new Error("Missing note detail fixture.");
    }
    Object.assign(body.note, { client_id: "client", project_id: "project", linked_context: {
      client: { targetId: "client", label: "Directory client", status: "active" },
      project: { targetId: "project", label: "Directory project", clientName: "Directory client" },
    } });
    await route.fulfill({ response, json: body });
  });
  let workspaceType = "business";
  let populated = true;
  await page.route("**/api/app-shell/bootstrap", async (route) => {
    const response = await route.fetch();
    /** @type {unknown} */
    const body = await response.json();
    if (!body || typeof body !== "object" || !("workspaceContext" in body) || !body.workspaceContext || typeof body.workspaceContext !== "object") {
      throw new Error("Missing workspace context in bootstrap fixture.");
    }
    Object.assign(body.workspaceContext, { workspaceType });
    await route.fulfill({ response, json: body });
  });
  const common = { ariaLabel: "", clientId: "client", clientName: "Directory client", displayLabel: "", fullLabel: "",
    isAvailable: true, label: "", moduleId: "tasks", projectId: "project", projectName: "Directory project", secondaryLabel: "",
    sortKey: "", sourceUrl: "", subtitle: "", suggestedLibraryBucket: "active_work", title: "", workspaceName: "Directory workspace" };
  await page.route("**/api/notes/link-targets?*", async (route) => {
    const kind = new URL(route.request().url()).searchParams.get("targetType");
    const targets = kind === "task" ? [{ ...common, targetType: "task", targetId: "task", label: "Source task" }]
      : !populated ? []
      : kind === "client" ? [{ ...common, targetType: "client", targetId: "client", status: "active", displayLabel: "  Provider child client  ", label: "Plain client" }]
      : [{ ...common, targetType: "project", targetId: "project", displayLabel: "Provider project", label: "Plain project" }];
    await route.fulfill({ json: { targets } });
  });
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (workspaceType of ["business", "family", "personal"]) {
    for (populated of [true, false]) {
      await page.goto("/notes.html");
      await expect(page.locator("[data-note-create]")).toBeVisible();
      await page.evaluate(({ noteId }) => {
        const dialog = window.LongtailForge?.notesDialog;
        if (!dialog) throw new Error("Notes dialog is unavailable.");
        void dialog.openNoteEditor({ mode: "edit", noteId });
      }, { noteId });
      const editor = page.locator("[data-note-dialog]");
      const client = editor.locator("[data-note-client-id]");
      const project = editor.locator("[data-note-project-id]");
      await expect(editor).toBeVisible();
      await editor.locator("[data-note-details-group] > summary").click();
      await expect(project).toHaveValue("project");
      await expect(project).toBeVisible();
      await expect(project.locator('option[value="project"]')).toHaveJSProperty("textContent", populated
        ? "Provider project" : workspaceType === "business" ? "Directory project - Directory client" : "Directory project");
      if (workspaceType === "business") {
        await expect(client).toBeVisible();
        await expect(client).toBeEnabled();
        await expect(client).toHaveValue("client");
        await expect(client.locator('option[value="client"]')).toHaveJSProperty("textContent", populated ? "  Provider child client  " : "Directory client");
      } else {
        await expect(client).toBeHidden();
        await expect(client).toBeDisabled();
        await expect(client).toHaveValue("");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await editor.locator("[data-note-cancel]").click();
      await expect(editor).toBeHidden();
    }
  }
  expect(errors).toEqual([]);
});
