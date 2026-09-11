/* global document, window */
import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";
import { usesManagedServer } from "./support/e2e-env.mjs";

// This fixture provisions an account; use the shared support's managed-server convention.
const managedServerTest = usesManagedServer ? test : test.skip;
managedServerTest("Notes primary IDs survive aliases, directory paging and saves with business-only client scope", async ({ isolatedWorkspace }, testInfo) => {
  test.setTimeout(90000);
  const { api, page, workspaceType } = isolatedWorkspace;
  expect(workspaceType).toBe("business");
  const suffix = `${testInfo.project.name}-${testInfo.retry}-${randomUUID()}`;
  /** @type {Array<() => Promise<void>>} */ const cleanup = [];
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    /** @param {string} path @param {Record<string, string>} data @param {string} member */
    async function createContext(path, data, member) {
      const response = await api.post(path, { data });
      expect(response.status(), await response.text()).toBe(201);
      const id = readIdentity(await response.json(), member, "id");
      cleanup.unshift(async () => {
        const removed = await api.delete(`/api/${member}s/${id}`);
        expect(removed.status(), await removed.text()).toBe(200);
      });
      return id;
    }
    const clientId = await createContext("/api/clients", { name: `Active ${suffix}`, status: "Active" }, "client");
    const inactiveId = await createContext("/api/clients", { name: `Inactive ${suffix}`, status: "Inactive" }, "client");
    const projectId = await createContext(`/api/clients/${clientId}/projects`, { name: `Project ${suffix}` }, "project");
    const workspaceProjectId = await createContext("/api/projects", { name: `Workspace project ${suffix}` }, "project");
    const created = await api.post("/api/notes", { data: {
      title: `Primary pins ${suffix}`, body_markdown: "Primary Context fixture", client_id: clientId, project_id: projectId,
    } });
    expect(created.status(), await created.text()).toBe(201);
    const noteId = readIdentity(await created.json(), "note", "note_id");
    cleanup.unshift(async () => {
      const deleted = await api.post(`/api/notes/${noteId}/delete`);
      expect(deleted.status(), await deleted.text()).toBe(200);
      const removed = (await deleted.json()).note;
      expect(removed.note_id).toBe(noteId); expect(removed.status).toBe("deleted");
      expect(typeof removed.deleted_at).toBe("string"); expect(removed.deleted_at.length).toBeGreaterThan(0);
    });
    let pagedOut = false;
    await page.route("**/api/notes/link-targets?*", async (route) => {
      const response = await route.fetch();
      expect(response.status(), await response.text()).toBe(200);
      const body = await response.json();
      // Omit only this test's saved identities to exercise real linked_context fallbacks.
      if (pagedOut) body.targets = body.targets.filter((/** @type {{targetId: string}} */ target) => ![clientId, projectId].includes(target.targetId));
      await route.fulfill({ response, json: body });
    });
    const editor = page.locator("[data-note-dialog]");
    const client = editor.locator("[data-note-client-id]");
    const project = editor.locator("[data-note-project-id]");
    /** @param {string} alias */
    async function open(alias) {
      await page.evaluate(({ noteId, alias }) => {
        const dialog = window.LongtailForge?.notesDialog;
        if (!dialog) throw new Error("Notes editor unavailable.");
        void dialog.openNoteEditor({ mode: "edit", [alias]: noteId });
      }, { noteId, alias });
      await expect(editor).toBeVisible();
      await editor.locator("[data-note-details-group] > summary").click();
      await expect(project).toBeEnabled(); await expect(project).toBeVisible();
    }
    /** @param {string | null} expectedClient @param {string | null} expectedProject */
    async function save(expectedClient, expectedProject) {
      const waiting = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/notes/${noteId}` && response.request().method() === "PUT");
      await editor.locator("[data-note-save]").click();
      const response = await waiting;
      expect(response.request().postDataJSON().client_id).toBe(expectedClient);
      expect(response.request().postDataJSON().project_id).toBe(expectedProject);
      expect(response.status(), await response.text()).toBe(200);
      await expect(editor).toBeHidden();
      const detail = await api.get(`/api/notes/${noteId}`);
      expect(detail.status(), await detail.text()).toBe(200);
      const saved = (await detail.json()).note;
      expect(saved.note_id).toBe(noteId); expect(saved.client_id).toBe(expectedClient); expect(saved.project_id).toBe(expectedProject);
    }
    await page.goto("/notes.html"); await expect(page.locator("[data-note-create]")).toBeVisible();
    for (const [index, alias] of ["noteId", "note_id", "recordId", "id"].entries()) {
      pagedOut = index % 2 === 1;
      await open(alias);
      await expect(client).toBeVisible(); await expect(client).toBeEnabled();
      await expect(client).toHaveValue(clientId); await expect(project).toHaveValue(projectId);
      await expect(client.locator(`option[value="${inactiveId}"]`)).toHaveCount(0);
      if (pagedOut) {
        await expect(client.locator(`option[value="${clientId}"]`)).toHaveAttribute("data-primary-context-fallback", "");
        await expect(project.locator(`option[value="${projectId}"]`)).toHaveAttribute("data-primary-context-fallback", "");
      }
      if (index === 1) {
        await project.evaluate((element) => element.scrollIntoView({ block: "center" }));
        await page.screenshot({ path: testInfo.outputPath("primary-context-fallback.png") });
      }
      await save(clientId, projectId);
    }
    pagedOut = false;
    await open("noteId");
    await client.selectOption(""); await project.selectOption("");
    await save(null, null);
    const assigned = await api.put(`/api/notes/${noteId}`, { data: { project_id: workspaceProjectId } });
    expect(assigned.status(), await assigned.text()).toBe(200);
    // Change only this page's offered workspace context; real writes retain a real workspace project.
    for (const scope of ["family", "personal", "business-without-client-tools"]) {
      await page.route("**/api/app-shell/bootstrap", async (route) => {
        const response = await route.fetch(); expect(response.status(), await response.text()).toBe(200);
        const body = await response.json();
        body.workspaceContext.workspaceType = scope === "business-without-client-tools" ? "business" : scope;
        if (scope === "business-without-client-tools") body.workspaceContext.workspaceCapabilities.availableTools = [];
        await route.fulfill({ response, json: body });
      });
      await page.goto("/notes.html"); await expect(page.locator("[data-note-create]")).toBeVisible();
      await open("recordId");
      await expect(client).toBeHidden(); await expect(client).toBeDisabled(); await expect(client).toHaveValue("");
      await expect(project).toHaveValue(workspaceProjectId);
      if (scope === "personal") {
        await project.evaluate((element) => element.scrollIntoView({ block: "center" }));
        await page.screenshot({ path: testInfo.outputPath("primary-context-personal.png") });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await save(null, workspaceProjectId);
      await page.unroute("**/api/app-shell/bootstrap");
    }
    expect(errors).toEqual([]);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    // Attempt every cleanup step, even after a failed assertion or another cleanup failure.
    const failures = [];
    for (const step of cleanup) { try { await step(); } catch (error) { failures.push(error); } }
    expect(failures).toEqual([]);
  }
});

/** @param {unknown} body @param {string} member @param {string} field */
function readIdentity(body, member, field) {
  if (!body || typeof body !== "object" || !(member in body)) throw new Error(`Missing ${member} fixture`);
  const record = Reflect.get(body, member);
  if (!record || typeof record !== "object" || !(field in record)) throw new Error(`Missing ${member} identity`);
  const id = Reflect.get(record, field);
  if (typeof id !== "string" || !id) throw new Error(`Invalid ${member} identity`);
  return id;
}
