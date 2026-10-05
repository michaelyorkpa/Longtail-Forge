/* global window, document */
import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";
import { usesManagedServer } from "./support/e2e-env.mjs";

const managedTest = usesManagedServer ? test : test.skip;
managedTest("Notes save stays open for create, closes edit and Save and Close, and settles each host once", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const title = `Save ${testInfo.project.name}-${randomUUID()}`;
  /** @type {string[]} */ const noteIds = [];
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const editor = page.locator("[data-note-dialog]");
  /** @param {string} mode @param {string} [noteId] */
  async function open(mode, noteId = "") {
    await page.evaluate(({ mode, noteId, title }) => {
      const notes = window.LongtailForge?.notesDialog;
      if (!notes) throw new Error("Notes editor unavailable");
      for (const key of ["result", "complete", "complete-count", "cancel", "refresh", "failure"]) window.sessionStorage.removeItem(`save-proof-${key}`);
      const count = (/** @type {string} */ key) => window.sessionStorage.setItem(`save-proof-${key}`, String(Number(window.sessionStorage.getItem(`save-proof-${key}`)) + 1));
      void notes.openNoteEditor({ mode, noteId, title, bodyMarkdown: "Preserved note body" }, {
        trigger: document.querySelector("[data-note-create]"),
        refresh: () => count("refresh"),
        complete: (/** @type {unknown} */ detail) => { count("complete-count"); window.sessionStorage.setItem("save-proof-complete", JSON.stringify(detail)); },
        cancel: () => count("cancel"),
      }).then((result) => window.sessionStorage.setItem("save-proof-result", String(result)))
        .catch((error) => window.sessionStorage.setItem("save-proof-failure", String(error)));
    }, { mode, noteId, title });
    await expect(editor).toBeVisible();
  }
  /** @param {string} key */
  async function read(key) { return page.evaluate((key) => window.sessionStorage.getItem(`save-proof-${key}`), key); }
  /** @param {import("@playwright/test").Response} response */
  async function rememberCreated(response) {
    expect(response.status(), await response.text()).toBe(201);
    const note = (await response.json()).note;
    expect(typeof note.note_id).toBe("string"); expect(note.note_id.length).toBeGreaterThan(0); noteIds.push(note.note_id);
    return note.note_id;
  }
  try {
    await page.goto("/notes.html"); await open("add");
    await expect(editor.locator("[data-note-title]")).toBeFocused();
    const creating = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/notes" && r.request().method() === "POST");
    await editor.locator("[data-note-save]").click(); const firstId = await rememberCreated(await creating);
    await expect(editor.locator("[data-note-dialog-title]")).toHaveText("Edit Note");
    await expect(editor).toBeVisible(); await expect(editor.locator("[data-note-security]")).toBeDisabled();
    await expect(editor.locator("[data-copy-note-link]")).toBeEnabled();
    expect(await read("result")).toBeNull(); expect(await read("complete")).toBeNull(); expect(await read("cancel")).toBeNull();
    expect(await read("refresh")).toBe("1");
    const updatedTitle = `${title} updated`; await editor.locator("[data-note-title]").fill(updatedTitle);
    const updating = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/notes/${firstId}` && r.request().method() === "PUT");
    await editor.locator("[data-note-save]").click(); const updated = await updating; expect(updated.status(), await updated.text()).toBe(200);
    await expect(editor).toBeHidden(); await expect.poll(() => read("result")).toBe("complete");
    expect(JSON.parse((await read("complete")) || "null")).toEqual({ actionId: "notes.edit", recordId: firstId, title: updatedTitle });
    expect(await read("complete-count")).toBe("1"); expect(await read("cancel")).toBeNull(); expect(await read("refresh")).toBe("2");
    await expect(page.locator("[data-note-detail] h2")).toHaveText(updatedTitle);
    await expect(page.locator("[data-note-detail] .notes-rendered-body")).toHaveText("Preserved note body");
    await page.screenshot({ path: testInfo.outputPath("save-existing-closed.png"), fullPage: true });

    await open("add"); await editor.locator("[data-note-title]").fill(`${title} close`);
    const saveClosing = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/notes" && r.request().method() === "POST");
    await editor.locator("[data-note-save-close]").click(); const secondId = await rememberCreated(await saveClosing);
    await expect(editor).toBeHidden(); await expect.poll(() => read("result")).toBe("complete");
    expect(JSON.parse((await read("complete")) || "null")).toEqual({ actionId: "notes.add", recordId: secondId, title: `${title} close` });
    expect(await read("complete-count")).toBe("1"); expect(await read("cancel")).toBeNull(); expect(await read("refresh")).toBe("1");

    await open("edit", firstId); await expect(editor.locator("[data-note-title]")).toHaveValue(updatedTitle);
    await editor.locator("[data-note-cancel]").click(); await expect(editor).toBeHidden();
    await expect.poll(() => read("result")).toBe("cancel");
    expect(await read("cancel")).toBe("1"); expect(await read("complete")).toBeNull(); expect(await read("refresh")).toBeNull();

    await open("add");
    let rejectedWrites = 0;
    await page.route("**/api/notes", async (route) => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      rejectedWrites += 1; await route.fulfill({ status: 503, json: { error: "Fixture save rejected." } });
    });
    await editor.locator("[data-note-save]").click();
    await expect(editor.locator("[data-note-form-status]")).toHaveText("Fixture save rejected.");
    await editor.locator("[data-note-form-status]").scrollIntoViewIfNeeded();
    await expect(editor.locator("[data-note-form-status]")).toBeInViewport();
    await expect(editor).toBeVisible(); await expect(editor.locator("[data-note-save]")).toBeEnabled();
    await expect(editor.locator("[data-note-save-close]")).toBeEnabled();
    expect(rejectedWrites).toBe(1); expect(await read("result")).toBeNull(); expect(await read("complete")).toBeNull();
    expect(await read("cancel")).toBeNull(); expect(await read("refresh")).toBeNull(); expect(await read("failure")).toBeNull();
    await page.screenshot({ path: testInfo.outputPath("save-rejected-stays-open.png"), fullPage: true });
    await editor.locator("[data-note-cancel]").click(); await expect.poll(() => read("result")).toBe("cancel");
    expect(await read("cancel")).toBe("1"); await page.unroute("**/api/notes");
    expect((await (await api.get(`/api/notes/${firstId}`)).json()).note.title).toBe(updatedTitle);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); expect(errors).toEqual([]);
  } finally {
    for (const id of noteIds) {
      const removed = await api.post(`/api/notes/${id}/delete`, { data: {} }); expect(removed.status(), await removed.text()).toBe(200);
      expect((await removed.json()).note.status).toBe("deleted");
    }
  }
});
