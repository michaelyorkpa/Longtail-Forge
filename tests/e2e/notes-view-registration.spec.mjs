/* global document, window */
import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";
import { usesManagedServer } from "./support/e2e-env.mjs";

const managedServerTest = usesManagedServer ? test : test.skip;

managedServerTest("Notes registered workflows dispatch through the shared view", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const title = `View registration ${testInfo.project.name}-${testInfo.retry}-${randomUUID()}`;
  let noteId = "";
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const created = await api.post("/api/notes", { data: { title, bodyMarkdown: "**Saved context**" } });
    expect(created.status(), await created.text()).toBe(201);
    /** @type {unknown} */ const body = await created.json();
    if (!body || typeof body !== "object" || !("note" in body) || !body.note || typeof body.note !== "object"
      || !("note_id" in body.note) || typeof body.note.note_id !== "string") throw new Error("Missing note fixture identity.");
    noteId = body.note.note_id;
    await page.goto(`/notes.html?note=${encodeURIComponent(noteId)}`);
    await expect(page.locator("[data-note-detail]")).toContainText(title);

    // Public renderer entry point, real registered Notes callbacks, real selected-note
    // fallback and real writes. These probe surfaces do not manufacture a record.
    await page.evaluate(() => {
      const view = window.LongtailForge?.view;
      if (!view || typeof view.renderSurface !== "function") throw new Error("View renderer unavailable.");
      const host = document.createElement("section"); host.dataset.workflowProof = "";
      document.body.appendChild(host);
      for (const action of ["edit", "archive", "restore"]) {
        const container = document.createElement("div"); host.appendChild(container);
        view.renderSurface({ id: `notes-workflow-proof-${action}`, layout: "single-column", dataSource: null,
          pageHeader: { title: "Workflow proof", primaryAction: { id: `proof-${action}`, label: `Proof ${action}`, behavior: `notes.workflow.${action}` } },
        }, container);
      }
    });
    const editor = page.locator("[data-note-dialog]");
    await page.getByRole("button", { name: "Proof edit", exact: true }).click();
    await expect(editor).toBeVisible();
    await expect(editor.locator("[data-note-title]")).toHaveValue(title);
    await expect(editor.locator("[data-note-body]")).toHaveValue("**Saved context**");
    await page.screenshot({ path: testInfo.outputPath("registered-edit.png") });
    await editor.locator("[data-note-cancel]").click(); await expect(editor).toBeHidden();

    for (const [action, status] of [["archive", "archived"], ["restore", "active"]]) {
      const write = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/notes/${noteId}/${action}` && response.request().method() === "POST");
      await page.getByRole("button", { name: `Proof ${action}`, exact: true }).click();
      const result = await write; expect(result.status(), await result.text()).toBe(200);
      const acknowledgment = (await result.json()).note;
      expect(acknowledgment.note_id).toBe(noteId); expect(acknowledgment.status).toBe(status);
      for (const key of ["tags", "links", "owner_display_name"]) expect(Object.hasOwn(acknowledgment, key)).toBe(false);
      await expect(page.locator(`[data-note-action="${action === "archive" ? "restore" : "archive"}-note"]`)).toHaveCount(1);
      const detail = await api.get(`/api/notes/${noteId}`);
      expect(detail.status(), await detail.text()).toBe(200);
      const authoritative = (await detail.json()).note;
      expect(authoritative.status).toBe(status);
      expect(Array.isArray(authoritative.tags)).toBe(true); expect(Array.isArray(authoritative.links)).toBe(true);
      expect(typeof authoritative.owner_display_name).toBe("string");
      await expect(page.locator("[data-note-detail]")).toContainText(title);
      const nextAction = page.locator(`[data-note-action="${action === "archive" ? "restore" : "archive"}-note"]`);
      const menu = page.locator("[data-note-detail] details").filter({ has: nextAction });
      await menu.locator("summary").click();
      await expect(nextAction).toBeVisible();
      const edit = menu.locator("[data-note-action='edit-note']");
      if (status === "archived") await expect(edit).toBeDisabled();
      else await expect(edit).toBeEnabled();
      await page.screenshot({ path: testInfo.outputPath(`${status}-actions.png`) });
      await menu.locator("summary").click();
    }
    // A real successful write followed by an unavailable detail read must remain a
    // committed write, with a visible refresh failure and no automatic POST replay.
    let archivePosts = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === `/api/notes/${noteId}/archive` && request.method() === "POST") archivePosts += 1;
    });
    await page.route(`**/api/notes/${noteId}`, (route) => route.fulfill({ status: 503, json: { error: "Fixture detail read unavailable" } }));
    const committed = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/notes/${noteId}/archive` && response.request().method() === "POST");
    await page.getByRole("button", { name: "Proof archive", exact: true }).click();
    expect((await committed).status()).toBe(200);
    await expect(page.getByText("Note was updated, but its details could not be refreshed. Reload Notes to check its current state.", { exact: true })).toBeVisible();
    expect(archivePosts).toBe(1);
    const persisted = await api.get(`/api/notes/${noteId}`);
    expect(persisted.status(), await persisted.text()).toBe(200);
    expect((await persisted.json()).note.status).toBe("archived");
    await expect(page.locator("[data-note-action]")).toHaveCount(0);
    await page.locator("[data-workflow-proof]").evaluate((element) => element.remove());

    expect(errors).toEqual([]);
  } finally {
    if (noteId) {
      // A failed archive assertion can leave an archived fixture. Restore only this
      // test's note before deletion; the product correctly forbids deleting archived notes.
      const current = await api.get(`/api/notes/${noteId}`);
      expect(current.status(), await current.text()).toBe(200);
      if ((await current.json()).note.status === "archived") {
        const restored = await api.post(`/api/notes/${noteId}/restore`);
        expect(restored.status(), await restored.text()).toBe(200);
      }
      const deleted = await api.post(`/api/notes/${noteId}/delete`);
      expect(deleted.status(), await deleted.text()).toBe(200);
      const note = (await deleted.json()).note;
      expect(note.status).toBe("deleted"); expect(note.deleted_at).toEqual(expect.any(String)); expect(note.deleted_at.length).toBeGreaterThan(0);
    }
  }
});

managedServerTest("Notes shared dialog retains its loading, read-only and close states", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const title = `View shell ${testInfo.project.name}-${testInfo.retry}-${randomUUID()}`;
  let noteId = "";
  let release = () => {};
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const created = await api.post("/api/notes", { data: { title, bodyMarkdown: "**Saved context**" } });
    expect(created.status(), await created.text()).toBe(201);
    /** @type {unknown} */ const body = await created.json();
    if (!body || typeof body !== "object" || !("note" in body) || !body.note || typeof body.note !== "object"
      || !("note_id" in body.note) || typeof body.note.note_id !== "string") throw new Error("Missing note fixture identity.");
    noteId = body.note.note_id;
    await page.goto(`/notes.html?note=${encodeURIComponent(noteId)}`);
    await expect(page.locator("[data-note-detail]")).toContainText(title);
    const editor = page.locator("[data-note-dialog]");
    const waiting = new Promise((done) => { release = () => done(undefined); });
    await page.route(`**/api/notes/${noteId}`, async (route) => { await waiting; await route.continue(); });
    await page.evaluate((noteId) => {
      const notes = window.LongtailForge?.notesDialog;
      if (!notes) throw new Error("Notes viewer unavailable.");
      void notes.openNoteViewer({ noteId });
    }, noteId);
    const viewer = page.locator("[data-note-view-dialog]");
    await expect(viewer).toBeVisible();
    await expect(viewer).toHaveAttribute("data-note-id", noteId);
    await expect(viewer.getByRole("heading", { name: "View Note", exact: true })).toBeVisible();
    await expect(viewer.locator("[data-note-view-body]")).toHaveAttribute("aria-live", "polite");
    await expect(viewer.locator("[data-note-view-body]")).toHaveText("Loading note...");
    await expect(viewer.locator("[data-note-view-action='edit']")).toBeDisabled();
    await expect(viewer.locator("[data-note-view-action='close']")).toBeEnabled();
    await expect(viewer.locator("input,select,textarea,form,[contenteditable=true]")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("viewer-loading.png") });
    release();
    await expect(viewer).toContainText(title);
    await expect(viewer.locator("[data-note-view-action='edit']")).toBeEnabled();
    await expect(viewer.locator("input,select,textarea,form,[contenteditable=true]")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("viewer-ready.png") });
    await viewer.locator("[data-note-view-action='close']").click();
    await expect(viewer).toHaveCount(0); await expect(editor).toBeHidden();

    expect(errors).toEqual([]);
  } finally {
    release();
    if (noteId) {
      const deleted = await api.post(`/api/notes/${noteId}/delete`);
      expect(deleted.status(), await deleted.text()).toBe(200);
      const note = (await deleted.json()).note;
      expect(note.status).toBe("deleted"); expect(note.deleted_at).toEqual(expect.any(String)); expect(note.deleted_at.length).toBeGreaterThan(0);
    }
  }
});
