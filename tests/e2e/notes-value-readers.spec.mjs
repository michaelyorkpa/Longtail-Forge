/* global document, window */
import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";
import { usesManagedServer } from "./support/e2e-env.mjs";
const managedTest = usesManagedServer ? test : test.skip;

managedTest("Notes status selection and Archive library send the intended query and recover the active list", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api, workspaceId } = isolatedWorkspace;
  const prefix = `Value readers ${randomUUID()}`;
  /** @type {string[]} */ const ids = [];
  /** @type {URLSearchParams[]} */ const queries = [];
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/notes" && request.method() === "GET") queries.push(url.searchParams);
  });
  try {
    for (const status of ["active", "archived"]) {
      const created = await api.post("/api/notes", { data: { title: `${prefix} ${status}`, bodyMarkdown: "Readable query fixture" } });
      expect(created.status(), await created.text()).toBe(201);
      const note = (await created.json()).note; expect(note.workspace_id).toBe(workspaceId);
      expect(typeof note.note_id).toBe("string"); expect(note.note_id).not.toBe(""); ids.push(note.note_id);
      if (status === "archived") {
        const archived = await api.post(`/api/notes/${note.note_id}/archive`, { data: {} }); expect(archived.status(), await archived.text()).toBe(200);
      }
    }
    await page.goto("/notes.html"); await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
    const rows = page.locator("[data-notes-list] .notes-list-item strong");
    await expect(rows).toHaveText([`${prefix} active`]); expect(queries.at(-1)?.get("status")).toBe("active");
    await page.locator(".notes-filters-panel summary").first().click();
    const status = page.locator("[data-note-filter-status]"); await expect(status).toBeVisible();
    await status.selectOption("archived"); await expect(rows).toHaveText([`${prefix} archived`]);
    expect(queries.at(-1)?.get("status")).toBe("archived");
    const library = page.locator("[data-note-collection-library-filter]"); await library.selectOption("archive");
    await status.selectOption("active"); await expect(status).toHaveValue("active");
    await expect.poll(() => queries.at(-1)?.get("status")).toBe("archived");
    expect(queries.at(-1)?.has("libraryBucket")).toBe(false);
    await expect(rows).toHaveText([`${prefix} archived`]);
    await page.screenshot({ path: testInfo.outputPath("archive-overrides-status.png") });
    await library.selectOption("all"); await expect(rows).toHaveText([`${prefix} active`]);
    expect(queries.at(-1)?.get("status")).toBe("active"); expect(queries.at(-1)?.has("libraryBucket")).toBe(false);
    await page.screenshot({ path: testInfo.outputPath("active-list-restored.png") });
    expect(errors).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    for (const id of ids) {
      const current = await api.get(`/api/notes/${id}`); expect(current.status()).toBe(200);
      if ((await current.json()).note.status === "archived") {
        const restored = await api.post(`/api/notes/${id}/restore`, { data: {} }); expect(restored.status(), await restored.text()).toBe(200);
      }
      const deleted = await api.post(`/api/notes/${id}/delete`, { data: {} }); expect(deleted.status(), await deleted.text()).toBe(200);
      expect((await deleted.json()).note.status).toBe("deleted");
    }
  }
});

managedTest("Notes checked status reader rejects real non-select controls while native option readers preserve identity", async ({ isolatedWorkspace }, testInfo) => {
  const { page } = isolatedWorkspace;
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Invoke the private readers inside the delivered controller; their bodies and
  // native elements stay real. This is the changed narrowing, not a spelling pin.
  await page.route(/\/js\/notes\.js(?:\?|$)/, async (route) => {
    const response = await route.fetch(); expect(response.status()).toBe(200);
    const source = await response.text(), end = source.lastIndexOf("})();"); expect(end).toBeGreaterThan(0);
    const probe = `
      let valueProofOriginalStatus = null;
      let valueProofStatusParent = null;
      document.addEventListener("notes-value-proof", (event) => {
        if (!(event instanceof CustomEvent)) return;
        const { kind, bucket = "all" } = event.detail;
        if (kind === "options") {
          const select = document.createElement("select"); select.dataset.valueProofSelect = "";
          select.append(new window.Option("  First <b>literal</b>  ", "same"), new window.Option("Second", "same"), new window.Option("   ", "blank"));
          select.selectedIndex = 1;
          const output = document.createElement("p"); output.dataset.valueProofLabel = "";
          output.textContent = selectedOptionText(select, "Fallback");
          const result = {
            found: optionListHasValue([...select.options], "same"),
            exact: optionListHasValue([...select.options], " same "),
            empty: optionListHasValue(),
            index: select.selectedIndex,
            selectedText: select.selectedOptions[0].textContent,
          };
          select.addEventListener("change", () => { output.textContent = selectedOptionText(select, "Fallback"); });
          detailPanel.replaceChildren(noteFieldLabel("Native options", select), output);
          document.documentElement.dataset.valueProofOptions = JSON.stringify(result);
          return;
        }
        if (!valueProofOriginalStatus) { valueProofOriginalStatus = statusFilter; valueProofStatusParent = statusFilter.parentElement; }
        const current = document.querySelector("[data-note-filter-status]");
        current?.remove();
        if (kind === "select") {
          valueProofStatusParent.append(valueProofOriginalStatus); valueProofOriginalStatus.value = "all";
        } else if (kind !== "absent") {
          const replacement = kind === "svg" ? document.createElementNS("http://www.w3.org/2000/svg", "svg") : document.createElement("input");
          replacement.setAttribute("data-note-filter-status", "");
          Object.defineProperty(replacement, "value", { value: "deleted" });
          valueProofStatusParent.append(replacement);
        }
        cacheNotesElements(); state.activeBucket = bucket;
        document.documentElement.dataset.valueProofStatus = JSON.stringify({
          cached: statusFilter === valueProofOriginalStatus,
          absent: statusFilter === null,
          status: activeStatusFilter(), query: buildNotesListQuery().get("status"),
        });
      });
    `;
    await route.fulfill({ response, body: source.slice(0, end) + probe + source.slice(end) });
  });
  await page.goto("/notes.html"); await expect(page.locator("[data-note-create]")).toBeVisible();
  for (const kind of ["input", "svg", "absent", "select"]) {
    for (const bucket of ["all", "archive"]) {
      await page.evaluate((detail) => document.dispatchEvent(new window.CustomEvent("notes-value-proof", { detail })), { kind, bucket });
      const expected = bucket === "archive" ? "archived" : kind === "select" ? "all" : "active";
      const result = JSON.parse((await page.locator("html").getAttribute("data-value-proof-status")) || "null");
      expect(result).toEqual({ cached: kind === "select", absent: kind !== "select", status: expected, query: expected });
    }
  }
  await page.evaluate(() => document.dispatchEvent(new window.CustomEvent("notes-value-proof", { detail: { kind: "select", bucket: "all" } })));
  await page.evaluate(() => document.dispatchEvent(new window.CustomEvent("notes-value-proof", { detail: { kind: "options" } })));
  // The implicit label wraps option text too; getByLabel matches that full text.
  // Use the actual accessibility name, which the browser exposes as Native options.
  const select = page.getByRole("combobox", { name: "Native options", exact: true }), output = page.locator("[data-value-proof-label]");
  await expect(select).toBeVisible(); await expect(output).toHaveText("First <b>literal</b>"); await expect(output.locator("b")).toHaveCount(0);
  expect(JSON.parse((await page.locator("html").getAttribute("data-value-proof-options")) || "null")).toEqual({ found: true, exact: false, empty: false, index: 1, selectedText: "Second" });
  await select.selectOption("blank"); await expect(output).toHaveText("Fallback");
  await select.selectOption({ index: 0 }); await expect(output).toHaveText("First <b>literal</b>");
  await page.screenshot({ path: testInfo.outputPath("native-options-and-fallback.png") });
  expect(errors).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
