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
  const sequence = await captureNotesLinkSequence(page, testInfo);
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
    await test.step("Wait for the requested note search and its rendered result", async () => {
      const searched = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === "/api/notes/link-targets" && url.searchParams.get("targetType") === "note"
          && url.searchParams.get("q") === targetTitle && response.request().method() === "GET";
      });
      await panel.locator("[data-note-link-target-type]").selectOption("note"); await search.fill(targetTitle);
      const response = await searched; expect(response.status(), await response.text()).toBe(200); await response.finished();
      // This UUID search has one result; the earlier unsearched response has two.
      // Both readiness and its actual projection must precede choosing the option.
      await expect(results.locator("option")).toHaveCount(1);
      await expect(results.locator(`option[value="${targetId}"]`)).toHaveAttribute("title", `${targetTitle} - Reference Library`);
      await expect(results).toBeEnabled();
    });
    // notes.service truncates picker titles to 20 characters; the title/aria label
    // retain the full name. Prove both outputs instead of assuming the option is unabridged.
    await expect(results.locator(`option[value="${targetId}"]`)).toHaveText(`${targetTitle.slice(0, 17).trimEnd()}...`);
    await expect(results.locator(`option[value="${targetId}"]`)).toHaveAttribute("title", `${targetTitle} - Reference Library`);
    await expect(results.locator(`option[value="${targetId}"]`)).toHaveAttribute("aria-label", `${targetTitle} - Reference Library`);
    await results.selectOption(targetId); await expect(results).toHaveValue(targetId);
    const directoryTarget = await results.locator(`option[value="${targetId}"]`).getAttribute("data-target");
    expect(directoryTarget).toBeTruthy(); const target = JSON.parse(directoryTarget || "{}");
    expect(target.targetType).toBe("note"); expect(target.targetId).toBe(targetId);
    const write = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/notes/${noteId}/links` && response.request().method() === "POST");
    const added = await test.step("Activate Add and await the already-installed link response wait", async () => {
      await panel.locator("[data-note-link-add]").click(); return await write;
    });
    expect(added.status(), await added.text()).toBe(201);
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
    await test.step("Wait for the requested note search and its rendered result", async () => {
      const searched = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === "/api/notes/link-targets" && url.searchParams.get("targetType") === "note"
          && url.searchParams.get("q") === targetTitle && response.request().method() === "GET";
      });
      await panel.locator("[data-note-link-target-type]").selectOption("note"); await search.fill(targetTitle);
      const response = await searched; expect(response.status(), await response.text()).toBe(200); await response.finished();
      // This UUID search has one result; the earlier unsearched response has two.
      // Both readiness and its actual projection must precede choosing the option.
      await expect(results.locator("option")).toHaveCount(1);
      await expect(results.locator(`option[value="${targetId}"]`)).toHaveAttribute("title", `${targetTitle} - Reference Library`);
      await expect(results).toBeEnabled();
    });
    await expect(results.locator(`option[value="${targetId}"]`)).toHaveAttribute("title", `${targetTitle} - Reference Library`);
    await results.selectOption(targetId); await expect(results).toHaveValue(targetId); await expect(panel.locator("[data-note-link-add]")).toBeEnabled();
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
    await sequence.finish();
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


// Local evidence for this Notes workflow: requests, completions, native form
// activation and each result replacement use test-runner receipt time; the
// controlled browser clock may be paused while real network work completes.
/** @param {import("@playwright/test").Page} page @param {import("@playwright/test").TestInfo} info */
async function captureNotesLinkSequence(page, info) {
  const started = Date.now();
  /** @type {Array<{ at: number, kind: string, data: unknown }>} */ const timeline = [];
  /** @param {string} kind @param {unknown} data */
  const record = (kind, data) => { timeline.push({ at: Date.now(), kind, data }); };
  /** @param {import("@playwright/test").Request} request */
  const tracked = (request) => /\/api\/notes\/(?:link-targets|[^/]+\/links)(?:\?|$)/.test(request.url());
  page.on("request", (request) => { if (tracked(request)) record("request-start", { url: request.url(), method: request.method(), body: request.postData() }); });
  page.on("response", (response) => { if (tracked(response.request())) record("response", { url: response.url(), status: response.status() }); });
  page.on("requestfinished", (request) => { if (tracked(request)) record("request-finished", { url: request.url() }); });
  page.on("requestfailed", (request) => { if (tracked(request)) record("request-failed", { url: request.url(), failure: request.failure() }); });
  page.on("console", (message) => {
    const text = message.text();
    if (text.startsWith("NOTES_LINK_SEQUENCE ")) {
      const row = JSON.parse(text.slice("NOTES_LINK_SEQUENCE ".length));
      timeline.push({ ...row, at: Date.now() });
    }
  });
  await page.addInitScript(() => {
    /** @param {string} event */
    const snapshot = (event) => {
      const panel = document.querySelector("[data-note-links-panel]");
      if (!panel) return;
      const select = panel.querySelector("[data-note-link-results]");
      const search = panel.querySelector("[data-note-link-search]");
      const type = panel.querySelector("[data-note-link-target-type]");
      const add = panel.querySelector("[data-note-link-add]");
      if (!(select instanceof window.HTMLSelectElement)) return;
      console.debug("NOTES_LINK_SEQUENCE " + JSON.stringify({ at: Date.now(), kind: "dom", data: {
        event, value: select.value, disabled: select.disabled,
        loading: select.textContent?.includes("Loading records..."),
        query: search instanceof window.HTMLInputElement ? search.value : null,
        type: type instanceof window.HTMLSelectElement ? type.value : null,
        addDisabled: add instanceof window.HTMLButtonElement ? add.disabled : null,
        options: [...select.options].map((option) => ({ value: option.value, label: option.textContent })),
      } }));
    };
    for (const name of ["input", "change", "click", "submit", "invalid"]) {
      document.addEventListener(name, (event) => {
        if (event.target instanceof window.Element && event.target.closest("[data-note-links-panel]")) snapshot(name);
      }, true);
    }
    document.addEventListener("DOMContentLoaded", () => {
      new window.MutationObserver((records) => {
        if (records.some((record) => {
          const element = record.target instanceof window.Element ? record.target : record.target.parentElement;
          return element?.closest("[data-note-links-panel]") || [...record.addedNodes].some((node) => node instanceof window.Element && (node.matches("[data-note-links-panel]") || node.querySelector("[data-note-links-panel]")));
        })) snapshot("results-or-state-change");
      }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["disabled"] });
    });
  });
  return {
    record,
    finish: async () => {
      timeline.sort((a, b) => a.at - b.at);
      await info.attach("notes-link-sequence", { body: JSON.stringify({ durationMs: Date.now() - started, timeline: timeline.map((row) => ({ ...row, elapsedMs: row.at - started })) }, null, 2), contentType: "application/json" });
    },
  };
}

managedServerTest("Notes link picker retains the searched selection when older real directory responses finish last", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const sequence = await captureNotesLinkSequence(page, testInfo);
  const suffix = randomUUID();
  /** @type {string[]} */ const ids = [];
  /** @type {Array<{ query: string, type: string, release: () => void, ready: boolean, delivered: boolean, fail: boolean }>} */ const held = [];
  let releaseAll = false, holdSearches = false, clockPaused = false;
  /** @type {unknown[]} */ const writes = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\/notes\/[^/]+\/links$/.test(new URL(request.url()).pathname)) writes.push(request.postDataJSON());
  });
  await page.clock.install({ time: new Date("2026-09-14T12:00:00Z") });
  try {
    const createdIds = await test.step("Create isolated real notes", async () => {
      for (const title of [`A source ${suffix}`, `Z target ${suffix}`]) {
        const response = await api.post("/api/notes", { data: { title, bodyMarkdown: "Directory ordering proof" } });
        expect(response.status(), await response.text()).toBe(201);
        ids.push(identity(await response.json(), "note", "note_id"));
      }
      return ids;
    });
    const [noteId, targetId] = createdIds, targetTitle = `Z target ${suffix}`;
    await page.route("**/api/notes/link-targets?*", async (route) => {
      const url = new URL(route.request().url());
      /** @type {() => void} */ let release = () => {};
      const pending = new Promise((done) => { release = () => done(undefined); });
      const entry = { type: url.searchParams.get("targetType") || "", query: url.searchParams.get("q") || "", release: () => release(), ready: false, delivered: false, fail: false };
      held.push(entry);
      const response = await route.fetch(); expect(response.status(), await response.text()).toBe(200);
      entry.ready = true; sequence.record("real-response-held", { type: entry.type, query: entry.query, status: response.status() });
      if (!releaseAll && (!entry.query || holdSearches)) await pending;
      if (entry.fail) await route.abort("failed");
      else await route.fulfill({ response });
      entry.delivered = true; sequence.record("real-response-delivered", { type: entry.type, query: entry.query });
    });
    await page.goto(`/notes.html?note=${noteId}`);
    const panel = page.locator("[data-note-links-panel]"), results = panel.locator("[data-note-link-results]");
    await expect(panel).toBeVisible(); await panel.locator(":scope > summary").click();
    await expect.poll(() => held.some((entry) => entry.type === "project" && entry.ready)).toBe(true);
    await test.step("Overlap initial, changed-type and searched requests", async () => {
      await panel.locator("[data-note-link-target-type]").selectOption("note");
      await expect.poll(() => held.some((entry) => entry.type === "note" && !entry.query && entry.ready)).toBe(true);
      await panel.locator("[data-note-link-search]").fill(targetTitle);
      await expect.poll(() => held.some((entry) => entry.query === targetTitle && entry.delivered)).toBe(true);
      await expect(results.locator(`option[value="${targetId}"]`)).toHaveAttribute("title", `${targetTitle} - Reference Library`);
      await expect(results).toBeEnabled(); await results.selectOption(targetId); await expect(results).toHaveValue(targetId);
    });
    /** @param {(typeof held)[number]} entry */
    const finish = async (entry) => {
      const matches = (/** @type {import("@playwright/test").Request} */ request) => {
        const url = new URL(request.url());
        return url.pathname === "/api/notes/link-targets" && url.searchParams.get("targetType") === entry.type && (url.searchParams.get("q") || "") === entry.query;
      };
      const completed = entry.fail
        ? page.waitForEvent("requestfailed", { predicate: matches })
        : page.waitForResponse((response) => matches(response.request())).then((response) => response.finished());
      entry.release(); await completed;
      await expect.poll(() => entry.delivered).toBe(true);
      // A bounded render boundary after the real response body (or transport failure).
      if (clockPaused) await page.clock.runFor(32);
      else await page.evaluate(() => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve(undefined)))));
    };
    const add = panel.locator("[data-note-link-add]"), search = panel.locator("[data-note-link-search]");
    await test.step("Finish the older note and initial project responses after selection", async () => {
      for (const type of ["note", "project"]) {
        const entry = held.find((item) => item.type === type && !item.query); expect(entry).toBeTruthy();
        if (!entry) throw new Error("Missing held real directory response.");
        await finish(entry);
        // The baseline artifact records two options, then none here: both were stale overwrites.
        await expect(results.locator("option")).toHaveCount(1);
        await expect(results).toHaveValue(targetId); await expect(results).toBeEnabled(); await expect(add).toBeEnabled();
        sequence.record(`after-older-${type}`, { value: await results.inputValue(), addDisabled: await add.isDisabled() });
      }
    });
    holdSearches = true;
    await page.clock.pauseAt(new Date("2026-09-14T12:10:00Z")); clockPaused = true;
    /** @param {string} query */
    const startQuery = async (query) => {
      const previousCount = held.length;
      await search.fill(query); await expect(results).toBeDisabled(); await expect(add).toBeDisabled();
      await page.clock.runFor(180);
      await expect.poll(() => held.slice(previousCount).some((entry) => entry.query === query && entry.ready)).toBe(true);
      const entry = held.slice(previousCount).find((item) => item.query === query);
      if (!entry) throw new Error("Missing requested real response.");
      return entry;
    };
    const loading = async () => {
      await expect(results).toBeDisabled(); await expect(results.locator("option")).toHaveText(["Loading records..."]); await expect(add).toBeDisabled();
      await search.press("Enter"); // Native form activation must not submit an obsolete selection.
      expect(writes).toEqual([]);
    };
    await test.step("Refuse an older response during the next query's debounce interval", async () => {
      const older = await startQuery(`target ${suffix}`);
      await search.fill(`source ${suffix}`);
      await finish(older); // Only 32ms of the real 180ms debounce have elapsed.
      expect(held.some((entry) => entry.query === `source ${suffix}`)).toBe(false);
      await loading();
      await page.clock.runFor(148);
      await expect.poll(() => held.some((entry) => entry.query === `source ${suffix}` && entry.ready)).toBe(true);
    });
    await test.step("Ignore obsolete failures and finally blocks while the current query loads", async () => {
      const older = held.find((entry) => entry.query === `source ${suffix}`);
      if (!older) throw new Error("Missing obsolete response.");
      const current = await startQuery(`missing ${suffix}`);
      older.fail = true; await finish(older); await loading();
      // The current transport failure is distinct from a successful empty directory.
      current.fail = true; await finish(current);
      await expect(results).toBeEnabled(); await expect(results.locator("option")).toHaveText(["No records available"]); await expect(add).toBeDisabled();
      await search.press("Enter"); expect(writes).toEqual([]);
    });
    await test.step("Recover from a current failure and a real valid-empty result", async () => {
      const recovered = await startQuery(`Z target ${suffix}`);
      await finish(recovered);
      await expect(results).toHaveValue(targetId); await expect(add).toBeEnabled();
      const empty = await startQuery(`no-match-${suffix}`); await finish(empty);
      await expect(results).toBeEnabled(); await expect(results.locator("option")).toHaveCount(0); await expect(add).toBeDisabled();
      await search.press("Enter"); expect(writes).toEqual([]);
      const success = await startQuery(suffix); await finish(success);
      await expect(results.locator(`option[value="${targetId}"]`)).toHaveCount(1);
      await results.selectOption(targetId); await expect(results).toHaveValue(targetId); await expect(add).toBeEnabled();
    });
    await page.clock.resume(); clockPaused = false;
    const outcome = await test.step("Activate Add with its response wait already installed", async () => {
      const write = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/notes/${noteId}/links` && response.request().method() === "POST")
        .then(async (response) => ({ kind: "response", status: response.status(), payload: response.request().postDataJSON(), body: await response.text() }))
        .catch((error) => ({ kind: "no-response", error: String(error) }));
      await panel.locator("[data-note-link-add]").click();
      return await write;
    });
    sequence.record("write-outcome", outcome);
    expect(outcome.kind, JSON.stringify(outcome)).toBe("response");
    if ("status" in outcome) {
      expect(outcome.status, outcome.body).toBe(201);
      expect(outcome.payload).toEqual({ moduleId: "notes", targetType: "note", targetId });
      expect(writes).toEqual([{ moduleId: "notes", targetType: "note", targetId }]);
      await expect(panel.locator(".notes-link-item")).toHaveCount(1);
      await panel.locator(":scope > summary").click();
      await expect(panel.locator(".notes-link-item a")).toHaveText(targetTitle);
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath("after-controlled-overlap.png") });
    }
  } finally {
    releaseAll = true; for (const entry of held) entry.release();
    await sequence.finish();
    for (const id of ids.reverse()) {
      const response = await api.post(`/api/notes/${id}/delete`); expect(response.status(), await response.text()).toBe(200);
    }
  }
});
