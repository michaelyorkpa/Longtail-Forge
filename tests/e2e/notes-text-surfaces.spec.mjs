/* global document, window */
import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";
import { usesManagedServer } from "./support/e2e-env.mjs";

const managedTest = usesManagedServer ? test : test.skip;
const literal = '<strong data-text-proof="yes">Working & reference</strong>';
managedTest("Notes text helpers preserve editor labels, save recovery and bulk status", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api, workspaceId } = isolatedWorkspace;
  const title = `Text surface ${randomUUID()}`;
  let noteId = "";
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/notes.html");
    await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
    await expect(page.locator("[data-notes-list] .notes-empty-state")).toBeVisible();
    await expect(page.locator("[data-notes-list]")).toHaveText("No notes match the current filters.");
    await page.keyboard.press("Escape");
    await page.locator("[data-note-create]").click();
    const editor = page.locator("[data-note-dialog]"), status = editor.locator("[data-note-form-status]");
    await expect(editor).toBeVisible();
    const titleInput = editor.getByLabel("Title", { exact: true });
    await titleInput.fill(title); await expect(editor.locator("[data-note-title]")).toHaveValue(title);
    await expect(editor.locator("[data-note-type] option")).toHaveText(["General", "Meeting", "Research", "Decision", "Procedure", "Reference", "Idea", "Log"]);
    await editor.locator("[data-note-body]").fill("Readable saved text");
    await page.route("**/api/notes", async (route) => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      await route.fulfill({ status: 422, json: { error: literal } });
    });
    await editor.locator("[data-note-save]").click();
    await expect(status).toHaveText(literal); await expect(status).toHaveClass(/error-text/);
    await expect(status.locator("strong, [data-text-proof]")).toHaveCount(0);
    // Center the message in the scrollable dialog body; mere viewport intersection
    // can leave it behind the sticky action footer on mobile.
    await status.evaluate((node) => node.scrollIntoView({ block: "center" }));
    await expect(status).toBeInViewport();
    expect(await status.evaluate((node) => {
      const box = node.getBoundingClientRect(), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return hit === node || node.contains(hit);
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("editor-literal-error.png") });
    await page.unroute("**/api/notes");
    const creating = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/notes" && r.request().method() === "POST");
    await editor.locator("[data-note-save]").click(); const created = await creating;
    expect(created.status(), await created.text()).toBe(201);
    const note = (await created.json()).note; noteId = note.note_id;
    expect(typeof noteId).toBe("string"); expect(noteId).not.toBe(""); expect(note.workspace_id).toBe(workspaceId);
    await expect(status).toHaveText("Note saved. Continue editing or choose Save & Close.");
    await expect(status).not.toHaveClass(/error-text/);
    await editor.locator("[data-note-cancel]").click(); await expect(editor).toBeHidden();
    await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
    await page.getByRole("checkbox", { name: `Select ${title} for bulk editing` }).check();
    await expect(page.locator("[data-notes-list] .notes-empty-state")).toHaveCount(0);
    await page.locator("[data-note-bulk-edit]").click();
    const bulk = page.locator("[data-note-bulk-dialog]"), bulkStatus = bulk.locator("[data-note-bulk-form-status]");
    await expect(bulkStatus).toHaveText("1 notes selected."); await expect(bulkStatus).not.toHaveClass(/error-text/);
    await bulk.locator("[data-note-bulk-apply]").click();
    await expect(bulkStatus).toHaveText("Choose at least one field to update."); await expect(bulkStatus).toHaveClass(/error-text/);
    await bulk.locator("[data-note-bulk-type]").selectOption("meeting");
    await bulk.locator("[data-note-bulk-apply]").click(); await expect(bulk).toBeHidden();
    await expect(page.locator("[data-notes-status]")).toHaveText("Updated 1 notes.");
    await expect(page.locator("[data-notes-status]")).not.toHaveClass(/error-text/);
    const saved = await api.get(`/api/notes/${noteId}`); expect(saved.status()).toBe(200);
    expect((await saved.json()).note.note_type).toBe("meeting");
    await page.keyboard.press("Escape"); await page.screenshot({ path: testInfo.outputPath("page-status-recovered.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    if (noteId) {
      const removed = await api.post(`/api/notes/${noteId}/delete`, { data: {} }); expect(removed.status(), await removed.text()).toBe(200);
      expect((await removed.json()).note.status).toBe("deleted");
    }
  }
});

managedTest("Notes native text projections preserve literal content and required Element semantics", async ({ isolatedWorkspace }, testInfo) => {
  const { page } = isolatedWorkspace;
  // These private helpers have no UI entry point for arbitrary literal messages or
  // a missing required mount. Invoke them inside the delivered controller closure;
  // keep their bodies, the shared builder and the native DOM implementations real.
  await page.route(/\/js\/notes\.js(?:\?|$)/, async (route) => {
    const response = await route.fetch(); expect(response.status()).toBe(200);
    const source = await response.text(), end = source.lastIndexOf("})();"); expect(end).toBeGreaterThan(0);
    const probe = `
      document.addEventListener("notes-text-proof", (event) => {
        if (!(event instanceof CustomEvent)) return;
        const { action, text } = event.detail;
        if (action === "display") {
          detailPanel.replaceChildren(emptyText(text), lockedNotice(text), statusBadge(text));
        } else if (action === "list") {
          renderEmptyList(text);
        } else if (action === "svg-status") {
          const original = statusMessage;
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          const textNode = document.createElementNS(svg.namespaceURI, "text");
          textNode.setAttribute("x", "0"); textNode.setAttribute("y", "20");
          svg.append(textNode); detailPanel.append(svg); statusMessage = textNode;
          try { setStatus(text, true); } finally { statusMessage = original; }
        } else if (action === "absent-list") {
          const original = notesList; notesList = null;
          try { renderEmptyList(text); } catch (error) {
            if (!(error instanceof TypeError)) throw error;
            document.documentElement.dataset.textProofRefusal = error.message;
          } finally { notesList = original; }
        }
      });
    `;
    await route.fulfill({ response, body: source.slice(0, end) + probe + source.slice(end) });
  });
  await page.goto("/notes.html");
  await expect(page.locator("[data-note-detail]")).toContainText("sidebar and select a note");
  await page.evaluate((text) => document.dispatchEvent(new window.CustomEvent("notes-text-proof", { detail: { action: "display", text } })), literal);
  const detail = page.locator("[data-note-detail]");
  for (const selector of ["p.notes-empty-state", "p.notes-locked-state", "span.notes-status-badge"]) {
    await expect(detail.locator(selector)).toBeVisible(); await expect(detail.locator(selector)).toHaveText(literal);
    await expect(detail.locator(selector).locator("*")).toHaveCount(0);
  }
  await page.screenshot({ path: testInfo.outputPath("native-literal-projections.png") });
  await page.evaluate(() => document.dispatchEvent(new window.CustomEvent("notes-text-proof", { detail: { action: "svg-status", text: "SVG status" } })));
  await expect(detail.locator("svg text")).toHaveText("SVG status"); await expect(detail.locator("svg text")).toHaveClass(/error-text/);
  await expect(detail.locator("svg text")).toBeVisible();
  await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
  await page.evaluate((text) => document.dispatchEvent(new window.CustomEvent("notes-text-proof", { detail: { action: "list", text } })), literal);
  const list = page.locator("[data-notes-list]");
  await expect(list).toHaveText(literal); await expect(list.locator("p")).toBeVisible();
  await expect(list.locator("p").locator("*")).toHaveCount(0);
  await page.evaluate(() => document.dispatchEvent(new window.CustomEvent("notes-text-proof", { detail: { action: "absent-list", text: "Must not replace existing list" } })));
  await expect(page.locator("html")).toHaveAttribute("data-text-proof-refusal", "Required Notes value is unavailable.");
  await expect(list).toHaveText(literal);
  await page.screenshot({ path: testInfo.outputPath("literal-list-preserved.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
