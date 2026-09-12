/* global document, window */
import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";
import { usesManagedServer } from "./support/e2e-env.mjs";

const managedServerTest = usesManagedServer ? test : test.skip;

managedServerTest("Notes editor and collection fields render both supported option vocabularies", async ({ isolatedWorkspace }, testInfo) => {
  const { page } = isolatedWorkspace;
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const vocabulary of ["tuple", "record"]) {
    let transformed = 0;
    // The real manifest emits tuples. Only this test's delivered field options are
    // converted to the supported record vocabulary; no note response or write is mocked.
    await page.route("**/api/app-shell/bootstrap", async (route) => {
      const response = await route.fetch(); expect(response.status(), await response.text()).toBe(200);
      const body = await response.json();
      if (vocabulary === "record") {
        const surface = body.viewSurfaces.find((/** @type {{id: string}} */ entry) => entry.id === "notes.workspace");
        expect(surface).toBeTruthy();
        for (const modal of surface.modals) for (const field of modal.fields || []) {
          if (!field.options) continue;
          field.options = field.options.map((/** @type {unknown} */ option) => {
            if (!Array.isArray(option) || typeof option[0] !== "string" || typeof option[1] !== "string") throw new Error("Unexpected manifest option producer.");
            transformed += 1; return { value: option[0], label: option[1] };
          });
        }
      }
      await route.fulfill({ response, json: body });
    });
    await page.goto("/notes.html");
    await page.locator("[data-note-create]").click();
    const editor = page.locator("[data-note-dialog]"); await expect(editor).toBeVisible();
    await expect(editor.locator("[data-note-title]")).toHaveCount(1);
    await expect(editor.locator("[data-note-title]")).toHaveJSProperty("required", true);
    await expect(editor.locator("[data-note-title]")).toHaveAttribute("type", "text");
    await expect(editor.locator("[data-note-body]")).toHaveJSProperty("rows", 14);
    await expect(editor.locator("[data-note-library] option")).toHaveText(["Active Work", "Ongoing Areas", "Reference Library"]);
    await expect(editor.locator("[data-note-type] option")).toHaveText(["General", "Meeting", "Research", "Decision", "Procedure", "Reference", "Idea", "Log"]);
    await expect(editor.locator("[data-note-security] option")).toHaveText(["Normal", "Secure"]);
    await expect(editor.locator("[data-note-library]")).toHaveValue("reference");
    await page.screenshot({ path: testInfo.outputPath(`${vocabulary}-editor-fields.png`) });
    await editor.locator("[data-note-cancel]").click(); await expect(editor).toBeHidden();
    await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
    await page.getByRole("button", { name: "Collection actions", exact: true }).click();
    await page.locator("[data-note-collection-actions-dialog]").getByRole("button", { name: "New collection", exact: true }).click();
    const collection = page.locator("[data-note-collection-dialog]"); await expect(collection).toBeVisible();
    await expect(collection.locator("[data-note-collection-title]")).toHaveCount(1);
    await expect(collection.locator("[data-note-collection-title]")).toHaveJSProperty("required", true);
    await expect(collection.locator("[data-note-collection-library] option")).toHaveText(["Active Work", "Ongoing Areas", "Reference Library"]);
    await expect(collection.locator("[data-note-collection-parent] option")).toHaveText(["Root collection"]);
    await expect(collection.locator("[data-note-collection-parent]")).toHaveValue("");
    await page.screenshot({ path: testInfo.outputPath(`${vocabulary}-collection-fields.png`) });
    await collection.locator("[data-note-collection-cancel]").click(); await expect(collection).toBeHidden();
    if (vocabulary === "record") expect(transformed).toBeGreaterThan(0);
    await page.unroute("**/api/app-shell/bootstrap");
  }
  expect(errors).toEqual([]);
});

managedServerTest("Notes links use real directory identities and authoritative primary and saved-link labels", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api, workspaceType } = isolatedWorkspace;
  expect(workspaceType).toBe("business");
  const suffix = `${testInfo.project.name}-${testInfo.retry}-${randomUUID()}`;
  /** @type {Array<() => Promise<void>>} */ const cleanup = [];
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const clientName = `Client ${suffix}`, projectName = `Project ${suffix}`, targetTitle = `Target ${suffix}`;
    const clientResponse = await api.post("/api/clients", { data: { name: clientName, status: "Active" } });
    expect(clientResponse.status(), await clientResponse.text()).toBe(201);
    const clientId = identity(await clientResponse.json(), "client", "id");
    cleanup.unshift(async () => { const response = await api.delete(`/api/clients/${clientId}`); expect(response.status(), await response.text()).toBe(200); });
    const projectResponse = await api.post(`/api/clients/${clientId}/projects`, { data: { name: projectName } });
    expect(projectResponse.status(), await projectResponse.text()).toBe(201);
    const projectId = identity(await projectResponse.json(), "project", "id");
    cleanup.unshift(async () => { const response = await api.delete(`/api/projects/${projectId}`); expect(response.status(), await response.text()).toBe(200); });
    /** @param {string} title @param {Record<string, string>} [context] */
    async function createNote(title, context = {}) {
      const response = await api.post("/api/notes", { data: { title, bodyMarkdown: "Linked context proof", ...context } });
      expect(response.status(), await response.text()).toBe(201);
      const id = identity(await response.json(), "note", "note_id");
      cleanup.unshift(async () => {
        const current = await api.get(`/api/notes/${id}`); expect(current.status(), await current.text()).toBe(200);
        if ((await current.json()).note.status === "archived") {
          const restored = await api.post(`/api/notes/${id}/restore`, { data: {} }); expect(restored.status(), await restored.text()).toBe(200);
          expect((await restored.json()).note.status).toBe("active");
        }
        const response = await api.post(`/api/notes/${id}/delete`); expect(response.status(), await response.text()).toBe(200);
        const note = (await response.json()).note; expect(note.note_id).toBe(id); expect(note.status).toBe("deleted"); expect(note.deleted_at.length).toBeGreaterThan(0);
      });
      return id;
    }
    const targetId = await createNote(targetTitle);
    const noteId = await createNote(`Linked note ${suffix}`, { client_id: clientId, project_id: projectId });
    await page.goto(`/notes.html?note=${noteId}`);
    const panel = page.locator("[data-note-links-panel]"); await expect(panel).toBeVisible();
    await expect(panel).toHaveJSProperty("open", false); await panel.locator(":scope > summary").click();
    const primary = panel.locator(".notes-primary-context-row");
    const form = panel.locator("[data-note-link-form]");
    await expect(form).toBeVisible();
    await expect(primary).toContainText(`Client: ${clientName} / Project: ${projectName}`);
    const search = panel.locator("[data-note-link-search]"), results = panel.locator("[data-note-link-results]");
    await expect(search).toHaveAttribute("type", "search"); await expect(search).toHaveAttribute("placeholder", "Search records");
    await expect(results).toHaveJSProperty("required", true);
    await panel.locator("[data-note-link-target-type]").selectOption("note"); await search.fill(targetTitle);
    // notes.service truncates picker titles to 20 characters; the title/aria label
    // retain the full name. Prove both outputs instead of assuming the option is unabridged.
    await expect(results.locator(`option[value="${targetId}"]`)).toHaveText(`${targetTitle.slice(0, 17).trimEnd()}...`);
    await expect(results.locator(`option[value="${targetId}"]`)).toHaveAttribute("title", `${targetTitle} - Reference Library`);
    await expect(results.locator(`option[value="${targetId}"]`)).toHaveAttribute("aria-label", `${targetTitle} - Reference Library`);
    await results.selectOption(targetId);
    const directoryTarget = await results.locator(`option[value="${targetId}"]`).getAttribute("data-target");
    expect(directoryTarget).toBeTruthy(); const target = JSON.parse(directoryTarget || "{}");
    expect(target.targetType).toBe("note"); expect(target.targetId).toBe(targetId);
    const write = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/notes/${noteId}/links` && response.request().method() === "POST");
    await panel.locator("[data-note-link-add]").click(); const added = await write; expect(added.status(), await added.text()).toBe(201);
    expect(added.request().postDataJSON()).toEqual({ moduleId: target.moduleId, targetType: "note", targetId });
    await expect(panel.locator(".notes-link-item")).toHaveCount(2);
    const detailResponse = await api.get(`/api/notes/${noteId}`); expect(detailResponse.status()).toBe(200);
    const detail = (await detailResponse.json()).note;
    expect(detail.linked_context.client.label).toBe(clientName); expect(detail.linked_context.project.label).toBe(projectName);
    expect(detail.links).toHaveLength(1); expect(detail.links[0].label).toBe(targetTitle);
    await panel.locator(":scope > summary").click();
    await expect(panel.locator(".notes-link-item").first()).toContainText("Primary Context");
    await expect(panel.getByRole("link", { name: targetTitle })).toHaveAttribute("href", detail.links[0].sourceUrl || detail.links[0].source_url);
    await page.screenshot({ path: testInfo.outputPath("linked-context-active.png") });
    const archived = await api.post(`/api/notes/${noteId}/archive`, { data: {} }); expect(archived.status()).toBe(200);
    await page.reload(); await expect(panel).toBeVisible(); await panel.locator(":scope > summary").click();
    await expect(panel.locator("[data-note-link-form]")).toBeHidden(); await expect(panel.locator("[data-note-link-remove]")).toBeHidden();
    await expect(primary).toContainText(projectName); await expect(panel.getByRole("link", { name: targetTitle })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("linked-context-archived.png") });
    const restored = await api.post(`/api/notes/${noteId}/restore`, { data: {} }); expect(restored.status()).toBe(200);
    await page.reload(); await expect(panel).toBeVisible(); await panel.locator(":scope > summary").click();
    await expect(form).toBeVisible(); await expect(search).toBeEnabled(); await expect(results).toBeEnabled();
    const remove = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/notes/${noteId}/links/${detail.links[0].noteLinkId || detail.links[0].note_link_id}/remove`);
    await panel.locator("[data-note-link-remove]").click(); const removed = await remove; expect(removed.status(), await removed.text()).toBe(200);
    await expect(panel.locator(".notes-link-item")).toHaveCount(1); await expect(primary).toContainText(projectName);
    expect((await (await api.get(`/api/notes/${noteId}`)).json()).note.links).toEqual([]);
    // A restored note must offer a working editing form, alongside its primary
    // context. Submit through it again to prove the CSS did not hide all forms.
    await panel.locator(":scope > summary").click(); await expect(form).toBeVisible();
    await panel.locator("[data-note-link-target-type]").selectOption("note"); await search.fill(targetTitle);
    await expect(results.locator(`option[value="${targetId}"]`)).toHaveAttribute("title", `${targetTitle} - Reference Library`);
    await results.selectOption(targetId); await expect(panel.locator("[data-note-link-add]")).toBeEnabled();
    const restoreWrite = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/notes/${noteId}/links` && response.request().method() === "POST");
    await panel.locator("[data-note-link-add]").click(); const restoredAdded = await restoreWrite;
    expect(restoredAdded.status(), await restoredAdded.text()).toBe(201);
    expect(restoredAdded.request().postDataJSON()).toEqual({ moduleId: target.moduleId, targetType: "note", targetId });
    await expect(panel.locator(".notes-link-item")).toHaveCount(2); await panel.locator(":scope > summary").click();
    await expect(form).toBeVisible(); await expect(primary).toContainText(projectName);
    await expect(panel.getByRole("link", { name: targetTitle })).toBeVisible();
    const restoredDetail = await api.get(`/api/notes/${noteId}`); expect(restoredDetail.status()).toBe(200);
    expect((await restoredDetail.json()).note.links.map((/** @type {{label: string}} */ link) => link.label)).toEqual([targetTitle]);
    await page.screenshot({ path: testInfo.outputPath("linked-context-restored.png") });
    // Corrupt only this page's delivered display data. The saved note, real link,
    // permissions and writes remain authoritative and unchanged on the server.
    let displayCase = "one-link";
    let delivered = 0;
    await page.route(`**/api/notes/${noteId}`, async (route) => {
      const response = await route.fetch(); expect(response.status(), await response.text()).toBe(200);
      const body = await response.json(); expect(body.note.note_id).toBe(noteId); expect(body.note.links).toHaveLength(1);
      const unreadable = { ...body.note.links[0], label: { privateMarker: "UNREADABLE LINK" } };
      if (displayCase === "one-link") body.note.links.push(unreadable);
      else {
        body.note.linked_context = "UNREADABLE PRIMARY CONTEXT";
        if (displayCase === "all-context") body.note.links = [unreadable];
      }
      delivered += 1; await route.fulfill({ response, json: body });
    });
    for (displayCase of ["one-link", "primary", "all-context"]) {
      const before = delivered;
      await page.reload(); await expect(panel).toBeVisible(); await panel.locator(":scope > summary").click();
      expect(delivered).toBeGreaterThan(before);
      await expect(page.locator("[data-note-detail] h2")).toHaveText(`Linked note ${suffix}`);
      await expect(page.locator("[data-note-detail] .notes-rendered-body")).toHaveText("Linked context proof");
      await expect(page.locator("[data-note-detail]")).not.toContainText("UNREADABLE");
      await expect(form).toBeVisible();
      await expect(panel.locator(".notes-link-item")).toHaveCount(displayCase === "one-link" ? 2 : displayCase === "primary" ? 1 : 0);
      if (displayCase === "one-link") await expect(primary).toContainText(projectName);
      else await expect(primary).toHaveCount(0);
      if (displayCase === "all-context") await expect(panel.locator(".notes-empty-state")).toHaveText("No linked context.");
      else await expect(panel.getByRole("link", { name: targetTitle })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`linked-context-degraded-${displayCase}.png`), fullPage: true });
    }
    await page.unroute(`**/api/notes/${noteId}`);
    const unchanged = await api.get(`/api/notes/${noteId}`); expect(unchanged.status()).toBe(200);
    const unchangedNote = (await unchanged.json()).note;
    expect(unchangedNote.links.map((/** @type {{label: string}} */ link) => link.label)).toEqual([targetTitle]);
    expect(unchangedNote.linked_context.project.label).toBe(projectName);
    expect(await page.evaluate(() => (document.scrollingElement?.scrollWidth || 0) <= window.innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    for (const dispose of cleanup) await dispose();
  }
});

/** @param {unknown} value @param {string} member @param {string} key */
function identity(value, member, key) {
  if (!value || typeof value !== "object" || !(member in value)) throw new Error("Missing fixture envelope.");
  const record = Reflect.get(value, member);
  if (!record || typeof record !== "object" || typeof record[key] !== "string" || !record[key]) throw new Error("Missing fixture identity.");
  return String(record[key]);
}
