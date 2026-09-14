/* global document, window */
import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";
import { usesManagedServer } from "./support/e2e-env.mjs";
const managedTest = usesManagedServer ? test : test.skip;

managedTest("Notes decorates the delivered workspace and its filters remain usable", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api, workspaceId } = isolatedWorkspace;
  const title = `Surface hooks ${randomUUID()}`;
  const created = await api.post("/api/notes", { data: { title, bodyMarkdown: "Readable decorated detail" } });
  expect(created.status(), await created.text()).toBe(201);
  const note = (await created.json()).note; expect(note.workspace_id).toBe(workspaceId);
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`/notes.html?note=${note.note_id}`);
    await expect(page.locator("[data-note-detail]")).toContainText(title);
    await expect(page.locator(".view-page-header + [data-notes-status]")).toHaveCount(1);
    await page.locator("[data-note-create]").click();
    await expect(page.locator("[data-note-dialog]")).toBeVisible(); await page.locator("[data-note-cancel]").click();
    await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
    await expect(page.locator(".notes-index-panel .view-collapsible-index-title")).toHaveText("Notes List");
    await expect(page.locator(".notes-list-panel-footer")).toHaveCount(1);
    await page.locator(".notes-filters-panel summary").first().click();
    for (const hook of ["status", "visibility", "security", "type", "context", "owner", "tags", "updated"]) {
      await expect(page.locator(`[data-notes-filters] [data-note-filter-${hook}]`)).toHaveCount(1);
    }
    const rows = page.locator("[data-notes-list]"), status = page.locator("[data-note-filter-status]");
    const archived = page.waitForResponse((response) => {
      const url = new URL(response.url()); return response.request().method() === "GET" && url.pathname === "/api/notes" && url.searchParams.get("status") === "archived";
    });
    await status.selectOption("archived"); expect((await archived).status()).toBe(200);
    await expect(rows).toHaveText("No notes match the current filters.");
    await status.selectOption("active"); await expect(rows).toContainText(title);
    await page.screenshot({ path: testInfo.outputPath("decorated-notes-filter.png") });
    expect(errors).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    const removed = await api.post(`/api/notes/${note.note_id}/delete`); expect(removed.status(), await removed.text()).toBe(200);
  }
});

managedTest("Notes hooks preserve native HTML SVG and MathML datasets and refuse only a missing bag", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  // Invoke the actual private functions in the delivered controller on real native
  // elements. This changes neither function body nor production namespace exports.
  await page.route(/\/js\/notes\.js(?:\?|$)/, async (route) => {
    const response = await route.fetch(); expect(response.status()).toBe(200);
    const source = await response.text(), end = source.lastIndexOf("})();"); expect(end).toBeGreaterThan(0);
    const probe = `
      document.addEventListener("notes-surface-proof", () => {
        const observations = [];
        for (const [namespace, tag] of [["http://www.w3.org/1999/xhtml", "div"], ["http://www.w3.org/2000/svg", "svg"], ["http://www.w3.org/1998/Math/MathML", "math"], ["urn:notes-proof", "field"]]) {
          const surface = document.createElement("section"), header = document.createElement("header"); header.className = "view-page-header";
          const action = document.createElementNS(namespace, tag); action.setAttribute("data-surface-action", "notes.create");
          const form = document.createElementNS(namespace, tag); form.setAttribute("data-view-filter-form", "");
          const wrapper = document.createElement("label"); wrapper.dataset.viewField = "status";
          const control = document.createElementNS(namespace, tag); control.setAttribute("data-view-input", "status"); wrapper.append(control); form.append(wrapper);
          const detail = document.createElementNS(namespace, tag); detail.setAttribute("class", "view-slideout-sidebar-main"); detail.textContent = "Previous detail";
          surface.append(header, action, form, detail); document.body.append(surface);
          decorateNotesDeclarativeSurface(surface);
          observations.push({ namespace, prototypeDataset: "dataset" in control && !Object.hasOwn(control, "dataset"),
            action: action.getAttribute("data-note-create"), filter: control.getAttribute("data-note-filter-status"), form: form.getAttribute("data-notes-filters"),
            detail: detail.getAttribute("data-note-detail"), detailText: detail.textContent,
            statusInserted: header.nextElementSibling?.matches("[data-notes-status]") === true });
          surface.remove();
        }
        document.documentElement.dataset.notesSurfaceProof = JSON.stringify(observations);
      });
    `;
    await route.fulfill({ response, body: source.slice(0, end) + probe + source.slice(end) });
  });
  await page.goto("/notes.html"); await expect(page.locator("[data-note-create]")).toBeVisible();
  const result = await page.evaluate(() => {
    document.dispatchEvent(new window.Event("notes-surface-proof"));
    return JSON.parse(document.documentElement.dataset.notesSurfaceProof || "null");
  });
  expect(result).toEqual([
    ...["http://www.w3.org/1999/xhtml", "http://www.w3.org/2000/svg", "http://www.w3.org/1998/Math/MathML"].map((namespace) => ({ namespace, prototypeDataset: true, action: "", filter: "", form: "", detail: "", detailText: "", statusInserted: true })),
    { namespace: "urn:notes-proof", prototypeDataset: false, action: null, filter: null, form: null, detail: null, detailText: "Previous detail", statusInserted: true },
  ]);
});
