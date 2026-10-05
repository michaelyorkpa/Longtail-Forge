/* global document, window */
import { expect, test } from "@playwright/test";

test("Notes sends server-owned filters and renders ordered cursor pages and the empty state", async ({ page, request }, testInfo) => {
  const prefix = `List ${testInfo.project.name}-${testInfo.workerIndex}`;
  const collectionResponse = await request.post("/api/notes/collections", { data: { title: prefix, libraryBucket: "reference" } });
  expect(collectionResponse.status()).toBe(201);
  const collection = (await collectionResponse.json()).collection.note_library_collection_id;
  expect(typeof collection).toBe("string");
  const titles = Array.from({ length: 13 }, (_, index) => `${prefix} ${String(index + 1).padStart(2, "0")}`);
  for (const title of [...titles].reverse()) {
    const created = await request.post("/api/notes", { data: { title, bodyMarkdown: "List fixture", noteCollectionId: collection, noteType: "general" } });
    expect(created.status(), await created.text()).toBe(201);
  }
  /** @type {URLSearchParams[]} */
  const queries = [];
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { const url = new URL(request.url()); if (url.pathname === "/api/notes" && request.method() === "GET") queries.push(url.searchParams); });
  await page.goto(`/notes.html?collection=${encodeURIComponent(collection)}`);
  await expect(page.locator("[data-note-create]")).toBeVisible();
  await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
  await page.locator("[data-note-sort]").selectOption("title_asc");
  const rows = page.locator("[data-notes-list] .notes-list-item strong");
  await expect(rows).toHaveText(titles.slice(0, 12));
  await expect(page.locator("[data-notes-page]")).toHaveText("Page 1");
  await expect(page.locator("[data-notes-prev]")).toBeDisabled();
  await expect(page.locator("[data-notes-next]")).toBeEnabled();
  expect(Object.fromEntries(queries.at(-1) || [])).toMatchObject({ collection, limit: "12", sort: "title_asc", status: "active" });
  await page.locator("[data-notes-next]").click();
  await expect(rows).toHaveText(titles.slice(12));
  await expect(page.locator("[data-notes-page]")).toHaveText("Page 2");
  await expect(page.locator("[data-notes-next]")).toBeDisabled();
  expect(queries.at(-1)?.get("cursor")).toBeTruthy();
  await page.locator("[data-notes-prev]").click();
  await expect(rows).toHaveText(titles.slice(0, 12));
  expect(queries.at(-1)?.has("cursor")).toBe(false);
  await page.locator(".notes-filters-panel summary").first().click();
  await page.locator("[data-note-filter-security]").selectOption("secure");
  await expect(page.locator("[data-notes-list]")).toHaveText("No notes match the current filters.");
  expect(queries.at(-1)?.get("security")).toBe("secure");
  await expect(page.locator("[data-notes-prev]")).toBeDisabled(); await expect(page.locator("[data-notes-next]")).toBeDisabled();
  await page.locator("[data-note-filter-security]").selectOption("all");
  await expect(rows).toHaveText(titles.slice(0, 12));
  expect(queries.at(-1)?.has("security")).toBe(false);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Notes previews complete Markdown and preserves empty, unreadable, and hidden states", async ({ page }) => {
  let malformed = false;
  let requests = 0;
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/notes/preview", async (route) => {
    requests += 1;
    if (malformed) await route.fulfill({ json: { bodyHtml: "Unvalidated response" } });
    else await route.continue();
  });
  await page.goto("/notes.html");
  await expect(page.locator("[data-note-create]")).toBeVisible();
  await page.evaluate(() => {
    const dialog = window.LongtailForge?.notesDialog;
    if (!dialog) throw new Error("Notes dialog unavailable.");
    void dialog.openNoteEditor({ mode: "add", title: "Preview fixture" });
  });
  const editor = page.locator("[data-note-dialog]");
  await expect(editor).toBeVisible();
  const body = editor.locator("[data-note-body]");
  const preview = editor.locator("[data-note-preview]");
  const toggle = editor.locator("[data-note-preview-toggle]");
  await body.fill(`# Full preview\n\n${"Long text ".repeat(300)}\n\n**End marker**`);
  expect(requests).toBe(0);
  await toggle.click();
  await expect(preview.locator("h1")).toHaveText("Full preview");
  await expect(preview.locator("strong")).toHaveText("End marker");
  expect((await preview.textContent())?.length).toBeGreaterThan(3000);
  await body.fill("");
  await expect(preview).toHaveText("No preview.");
  malformed = true;
  await body.fill("Trigger unreadable preview");
  await expect(preview).toHaveText("The Markdown preview could not be read.");
  await expect(preview).not.toContainText("Unvalidated response");
  await toggle.click(); await expect(preview).toBeHidden();
  const before = requests; await body.fill("Hidden draft"); expect(requests).toBe(before);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await editor.locator("[data-note-cancel]").click(); await expect(editor).toBeHidden();
});
