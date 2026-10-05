/* global document, window */
import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

test("Notes bulk controls, drawer selection and cached user context remain usable", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api, account, workspaceId } = isolatedWorkspace;
  /** @type {{note_id: string, title: string}[]} */ const notes = [];
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    for (const index of [1, 2]) {
      const created = await api.post("/api/notes", { data: { title: `DOM ${index} ${randomUUID()}`, bodyMarkdown: "DOM closeout context", linkedUserId: account.userId } });
      expect(created.status(), await created.text()).toBe(201);
      const note = (await created.json()).note; notes.push(note); expect(note.workspace_id).toBe(workspaceId);
    }
    await page.goto("/notes.html");
    const trigger = page.locator("[data-view-slideout-sidebar-trigger]").first();
    await trigger.click(); await expect(trigger).toHaveAttribute("aria-expanded", "true");
    for (const note of notes) await page.getByRole("checkbox", { name: `Select ${note.title} for bulk editing` }).check();
    await expect(page.locator("[data-view-bulk-selection-count]")).toHaveText("2 selected");
    await page.locator("[data-note-bulk-clear]").click();
    for (const note of notes) await expect(page.getByRole("checkbox", { name: `Select ${note.title} for bulk editing` })).not.toBeChecked();
    await expect(page.locator("[data-note-bulk-edit]")).toBeDisabled();
    for (const note of notes) await page.getByRole("checkbox", { name: `Select ${note.title} for bulk editing` }).check();
    await page.locator("[data-note-bulk-edit]").click();
    const bulk = page.locator("[data-note-bulk-dialog]"); await expect(bulk).toBeVisible();
    await expect(bulk.locator("[data-note-bulk-visibility]")).toBeVisible();
    await bulk.locator("[data-note-bulk-visibility]").selectOption("private");
    await bulk.locator("[data-note-bulk-type]").selectOption("meeting");
    const write = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/notes/bulk");
    await bulk.locator("[data-note-bulk-apply]").click();
    const response = await write; expect(response.status(), await response.text()).toBe(200);
    expect(response.request().postDataJSON()).toEqual({ noteIds: notes.map((note) => note.note_id), changes: { noteType: "meeting", visibility: "private" } });
    await expect(bulk).toBeHidden();
    for (const note of notes) {
      const saved = await api.get(`/api/notes/${note.note_id}`); expect(saved.status()).toBe(200);
      const record = (await saved.json()).note; expect(record.note_type).toBe("meeting"); expect(record.visibility).toBe("private");
    }
    await page.locator(".notes-list-item").filter({ hasText: notes[0].title }).click();
    await expect(page.locator("[data-note-detail]")).toContainText(notes[0].title);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.evaluate((noteId) => {
      const dialogs = window.LongtailForge?.notesDialog; if (!dialogs) throw new Error("Notes dialogs unavailable");
      void dialogs.openNoteEditor({ mode: "edit", noteId });
    }, notes[0].note_id);
    const editor = page.locator("[data-note-dialog]"); await expect(editor).toBeVisible();
    await expect(editor.locator("[data-note-user-id]")).toHaveValue(account.userId);
    const panel = editor.locator(".notes-context-panel");
    if (!(await panel.evaluate((node) => node.hasAttribute("open")))) await panel.locator(":scope > summary").click();
    // createNoteContextPanel emits the shared picker, not the legacy message hook.
    // Its optional-message branch is proved with a lifted fixture, not invented UI.
    await expect(editor.locator("[data-note-context-selected]")).toHaveCount(0);
    await expect(editor.locator("[data-note-context-list]")).toBeVisible();
    await expect(editor.locator("[data-note-context-list]")).toContainText("Primary Context");
    await expect(editor.locator("[data-note-library-suggestion]")).toHaveText("Suggested Library: Ongoing Areas");
    await page.screenshot({ path: testInfo.outputPath("notes-dom-context.png") });
    await editor.locator("[data-note-cancel]").click(); await expect(editor).toBeHidden();
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    for (const note of notes) {
      const removed = await api.post(`/api/notes/${note.note_id}/delete`); expect(removed.status(), await removed.text()).toBe(200);
      expect((await removed.json()).note.status).toBe("deleted");
    }
  }
});

test("Notes DOM guards distinguish native namespace matches without refusing the surrounding shell", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  // Expose a test-only event inside the delivered closure. Invoke the unchanged
  // production functions on real elements; restore each substituted dependency.
  await page.route(/\/js\/notes\.js(?:\?|$)/, async (route) => {
    const response = await route.fetch(); expect(response.status()).toBe(200);
    const source = await response.text(), end = source.lastIndexOf("})();"); expect(end).toBeGreaterThan(0);
    const probe = `
      document.addEventListener("notes-dom-proof", () => {
        const observations = { visibility: [], selection: null, drawer: [] };
        const originalRenderers = requireDescriptorRenderers;
        try {
          for (const [namespace, tag] of [["http://www.w3.org/1999/xhtml", "select"], ["http://www.w3.org/2000/svg", "svg"], ["http://www.w3.org/1998/Math/MathML", "math"], ["urn:notes-proof", "field"]]) {
            let control;
            requireDescriptorRenderers = () => ({
              ...originalRenderers(),
              renderDescriptorModalForm: (...args) => {
                const shell = originalRenderers().renderDescriptorModalForm(...args);
                const original = shell.viewParts.form.querySelector('[data-view-input="visibility"]');
                if (!original) throw new Error("Visibility producer missing");
                control = document.createElementNS(namespace, tag); control.setAttribute("data-view-input", "visibility");
                original.replaceWith(control); return shell;
              }
            });
            const shell = createNoteBulkDialogShell();
            try {
              observations.visibility.push({ namespace,
                inheritedDataset: "dataset" in control && !Object.hasOwn(control, "dataset"),
                decorated: control.getAttribute("data-note-bulk-visibility"),
                requiredControls: shell.querySelectorAll("[data-note-bulk-library], [data-note-bulk-collection], [data-note-bulk-type], [data-note-bulk-tag-action]").length,
                statusBeforeFooter: shell.viewParts.footer.previousElementSibling?.hasAttribute("data-note-bulk-form-status") === true,
                tags: shell.querySelectorAll("[data-note-bulk-tags]").length });
            } finally { shell.remove(); }
          }
        } finally { requireDescriptorRenderers = originalRenderers; }

        const originalList = notesList, originalIds = state.selectedNoteIds;
        try {
          notesList = document.createElement("div"); state.selectedNoteIds = new Set(["probe"]);
          const input = document.createElement("input"), div = document.createElement("div"), svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          let nonInputWrites = 0;
          for (const node of [input, div, svg]) { node.setAttribute("class", "notes-list-select"); notesList.append(node); }
          input.type = "checkbox"; input.checked = true;
          for (const node of [div, svg]) Object.defineProperty(node, "checked", { get: () => true, set: () => { nonInputWrites += 1; } });
          clearBulkSelection();
          observations.selection = { input: input.checked, div: div.checked, svg: svg.checked, nonInputWrites, count: state.selectedNoteIds.size };
        } finally { notesList = originalList; state.selectedNoteIds = originalIds; syncNotesBulkToolbar(); }

        const originalTrigger = document.querySelector("[data-view-slideout-sidebar-trigger]");
        if (!originalTrigger) throw new Error("Drawer trigger missing");
        for (const [namespace, tag] of [["http://www.w3.org/1999/xhtml", "button"], ["http://www.w3.org/1999/xhtml", "div"], ["http://www.w3.org/2000/svg", "svg"], ["urn:notes-proof", "field"]]) {
          const candidate = document.createElementNS(namespace, tag); let clicks = 0;
          candidate.setAttribute("data-view-slideout-sidebar-trigger", ""); candidate.setAttribute("aria-expanded", "true");
          if (candidate instanceof HTMLElement) candidate.addEventListener("click", () => { clicks += 1; });
          else Object.defineProperty(candidate, "click", { value: () => { clicks += 1; } });
          originalTrigger.replaceWith(candidate);
          try { closeNotesSlideOutDrawer(); observations.drawer.push({ namespace, tag, clicks }); }
          finally { candidate.replaceWith(originalTrigger); }
        }
        document.documentElement.dataset.notesDomProof = JSON.stringify(observations);
      });
    `;
    await route.fulfill({ response, body: source.slice(0, end) + probe + source.slice(end) });
  });
  await page.goto("/notes.html"); await expect(page.locator("[data-note-create]")).toBeVisible();
  const observed = await page.evaluate(() => {
    document.dispatchEvent(new window.Event("notes-dom-proof"));
    return JSON.parse(document.documentElement.dataset.notesDomProof || "null");
  });
  expect(observed).toEqual({
    visibility: [
      ...["http://www.w3.org/1999/xhtml", "http://www.w3.org/2000/svg", "http://www.w3.org/1998/Math/MathML"].map((namespace) => ({ namespace, inheritedDataset: true, decorated: "", requiredControls: 4, statusBeforeFooter: true, tags: 1 })),
      { namespace: "urn:notes-proof", inheritedDataset: false, decorated: null, requiredControls: 4, statusBeforeFooter: true, tags: 1 },
    ],
    selection: { input: false, div: true, svg: true, nonInputWrites: 0, count: 0 },
    drawer: [
      { namespace: "http://www.w3.org/1999/xhtml", tag: "button", clicks: 1 },
      { namespace: "http://www.w3.org/1999/xhtml", tag: "div", clicks: 1 },
      { namespace: "http://www.w3.org/2000/svg", tag: "svg", clicks: 0 },
      { namespace: "urn:notes-proof", tag: "field", clicks: 0 },
    ],
  });
});
